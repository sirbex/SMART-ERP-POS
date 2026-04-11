/**
 * GR/IR Clearing Service
 * 
 * SAP-style Goods Receipt / Invoice Receipt clearing account for 3-way matching.
 * 
 * Flow:
 *   1. PO created → No GL impact yet
 *   2. Goods Receipt → DR Inventory, CR GR/IR Clearing (2150)
 *   3. Invoice Receipt → DR GR/IR Clearing (2150), CR Accounts Payable (2100)
 *   4. When matched → GR/IR Clearing nets to zero (balanced)
 *   5. Variance → Automatically posted to price variance account
 */

import { pool as globalPool } from '../../db/pool.js';
import type pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { Money } from '../../utils/money.js';
import { AccountingCore, JournalLine } from '../../services/accountingCore.js';
import { AccountCodes } from '../../services/glEntryService.js';
import { NotFoundError } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

const GRIR_CLEARING_ACCOUNT = '2150';

// =============================================================================
// TYPES
// =============================================================================

export interface GrirRecord {
  id: string;
  purchaseOrderId: string;
  goodsReceiptId: string | null;
  invoiceId: string | null;
  poAmount: number;
  grAmount: number | null;
  invoiceAmount: number | null;
  variance: number;
  status: 'OPEN' | 'PARTIALLY_MATCHED' | 'MATCHED' | 'VARIANCE';
  matchedAt: string | null;
  createdAt: string;
}

// =============================================================================
// SERVICE METHODS
// =============================================================================

/**
 * Record a Goods Receipt against a PO in the GR/IR clearing account.
 * GL: DR Inventory (1300), CR GR/IR Clearing (2150)
 */
export const recordGoodsReceipt = async (
  data: {
    purchaseOrderId: string;
    goodsReceiptId: string;
    amount: number;
    date: string;
    userId: string;
    description?: string;
  },
  client: pg.PoolClient
): Promise<GrirRecord> => {
  // Create or update GR/IR clearing record (data tracking only).
  // GL posting (DR Inventory, CR GR/IR Clearing) is handled by glEntryService.recordGoodsReceiptToGL()
  // which is called from the GR finalization workflow. We only track the clearing state here.
  const existingResult = await client.query(
    `SELECT * FROM grir_clearing WHERE purchase_order_id = $1`,
    [data.purchaseOrderId]
  );

  let record: GrirRecord;

  if (existingResult.rows.length > 0) {
    // Update existing
    const result = await client.query(
      `UPDATE grir_clearing
       SET goods_receipt_id = $1, gr_amount = $2,
           status = CASE 
             WHEN invoice_amount IS NOT NULL THEN 'PARTIALLY_MATCHED'
             ELSE 'OPEN'
           END,
           updated_at = NOW()
       WHERE purchase_order_id = $3
       RETURNING *`,
      [data.goodsReceiptId, data.amount, data.purchaseOrderId]
    );
    record = normalizeGrir(result.rows[0]);
  } else {
    // Fetch PO amount
    const poResult = await client.query(
      `SELECT total_amount FROM purchase_orders WHERE id = $1`,
      [data.purchaseOrderId]
    );
    const poAmount = poResult.rows[0] ? Number(poResult.rows[0].total_amount) : data.amount;

    const result = await client.query(
      `INSERT INTO grir_clearing (id, purchase_order_id, goods_receipt_id, po_amount, gr_amount, status)
       VALUES ($1, $2, $3, $4, $5, 'OPEN')
       RETURNING *`,
      [uuidv4(), data.purchaseOrderId, data.goodsReceiptId, poAmount, data.amount]
    );
    record = normalizeGrir(result.rows[0]);
  }

  logger.info('GR/IR clearing - goods receipt recorded', { purchaseOrderId: data.purchaseOrderId, amount: data.amount });
  return record;
};

/**
 * Record an Invoice Receipt against a PO in the GR/IR clearing account.
 * GL: DR GR/IR Clearing (2150), CR Accounts Payable (2100)
 */
export const recordInvoiceReceipt = async (
  data: {
    purchaseOrderId: string;
    invoiceId: string;
    amount: number;
    date: string;
    userId: string;
    description?: string;
  },
  client: pg.PoolClient
): Promise<GrirRecord> => {
  const existing = await client.query(
    `SELECT * FROM grir_clearing WHERE purchase_order_id = $1`,
    [data.purchaseOrderId]
  );

  if (existing.rows.length === 0) {
    throw new NotFoundError('GR/IR clearing record for this PO');
  }

  // Calculate variance
  const grAmount = existing.rows[0].gr_amount ? Number(existing.rows[0].gr_amount) : 0;
  const variance = Money.toNumber(Money.subtract(data.amount, grAmount));

  const status = Math.abs(variance) < 0.01 ? 'MATCHED' : 'VARIANCE';

  const result = await client.query(
    `UPDATE grir_clearing
     SET invoice_id = $1, invoice_amount = $2, variance = $3,
         status = $4, matched_at = CASE WHEN $4 = 'MATCHED' THEN NOW() ELSE NULL END,
         updated_at = NOW()
     WHERE purchase_order_id = $5
     RETURNING *`,
    [data.invoiceId, data.amount, variance, status, data.purchaseOrderId]
  );

  // Post GL: DR GR/IR Clearing (GR amount), CR AP (invoice amount)
  // If variance exists, post difference to Price Variance account (SAP standard)
  const lines: JournalLine[] = [
    {
      accountCode: GRIR_CLEARING_ACCOUNT,
      description: data.description || `Invoice for PO ${data.purchaseOrderId}`,
      debitAmount: grAmount,
      creditAmount: 0,
      entityType: 'INVOICE',
      entityId: data.invoiceId,
    },
    {
      accountCode: AccountCodes.ACCOUNTS_PAYABLE,
      description: data.description || `AP for invoice ${data.invoiceId}`,
      debitAmount: 0,
      creditAmount: data.amount,
      entityType: 'INVOICE',
      entityId: data.invoiceId,
    },
  ];

  // Post price variance if invoice amount differs from GR amount
  // Positive variance = invoice > GR → additional cost (debit Price Variance)
  // Negative variance = invoice < GR → cost reduction (credit Price Variance)
  if (Math.abs(variance) >= 0.01) {
    if (variance > 0) {
      lines.push({
        accountCode: AccountCodes.PRICE_VARIANCE,
        description: `Price variance on PO ${data.purchaseOrderId} (invoice > GR)`,
        debitAmount: Math.abs(variance),
        creditAmount: 0,
        entityType: 'INVOICE',
        entityId: data.invoiceId,
      });
    } else {
      lines.push({
        accountCode: AccountCodes.PRICE_VARIANCE,
        description: `Price variance on PO ${data.purchaseOrderId} (invoice < GR)`,
        debitAmount: 0,
        creditAmount: Math.abs(variance),
        entityType: 'INVOICE',
        entityId: data.invoiceId,
      });
    }
  }

  await AccountingCore.createJournalEntry({
    entryDate: data.date,
    description: `Invoice Receipt - GR/IR Clearing for PO ${data.purchaseOrderId}`,
    referenceType: 'INVOICE',
    referenceId: data.invoiceId,
    referenceNumber: `GRIR-INV-${data.invoiceId.slice(0, 8)}`,
    lines,
    userId: data.userId,
    idempotencyKey: `GRIR-INV-${data.invoiceId}`,
  }, undefined, client);

  logger.info('GR/IR clearing - invoice recorded', {
    purchaseOrderId: data.purchaseOrderId,
    amount: data.amount,
    variance,
    status,
  });

  return normalizeGrir(result.rows[0]);
};

/**
 * Get GR/IR clearing status for a PO
 */
export const getGrirStatus = async (
  purchaseOrderId: string,
  pool?: pg.Pool
): Promise<GrirRecord | null> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(
    `SELECT * FROM grir_clearing WHERE purchase_order_id = $1`,
    [purchaseOrderId]
  );
  return result.rows[0] ? normalizeGrir(result.rows[0]) : null;
};

// =============================================================================
// ODOO-STYLE OPEN ITEMS VIEW
// Queries real goods_receipts + purchase_orders + supplier_invoices to show
// GRs that haven't been fully matched with invoices.
// =============================================================================

export interface GrirOpenItem {
  id: string;
  poNumber: string | null;
  supplierName: string | null;
  supplierId: string | null;
  grDate: string | null;
  grAmount: number;
  invoiceDate: string | null;
  invoiceAmount: number | null;
  daysDifference: number | null;
  status: string;
}

/**
 * Get all goods receipts with their matching invoice status.
 * Odoo-style: queries real GR/PO/invoice data, not the grir_clearing table.
 * Links via PurchaseOrderId (both GR and Invoice reference the same PO).
 */
export const getOpenClearingItems = async (
  supplierId?: string,
  pool?: pg.Pool
): Promise<GrirOpenItem[]> => {
  const dbPool = pool || globalPool;
  const params: unknown[] = [];
  let supplierFilter = '';
  if (supplierId) {
    params.push(supplierId);
    supplierFilter = `AND po.supplier_id = $${params.length}`;
  }

  const result = await dbPool.query(
    `SELECT
       gr.id,
       po.order_number as po_number,
       s."CompanyName" as supplier_name,
       po.supplier_id,
       gr.received_date::date::text as gr_date,
       COALESCE(gr.total_value, 0) as gr_amount,
       si."InvoiceDate"::date::text as invoice_date,
       si."TotalAmount" as invoice_amount,
       si."Status" as invoice_status,
       gr.status as gr_status,
       CASE WHEN si."InvoiceDate" IS NOT NULL AND gr.received_date IS NOT NULL
            THEN EXTRACT(DAY FROM (si."InvoiceDate"::timestamp - gr.received_date::timestamp))::int
            ELSE NULL
       END as days_difference
     FROM goods_receipts gr
     LEFT JOIN purchase_orders po ON gr.purchase_order_id = po.id
     LEFT JOIN suppliers s ON po.supplier_id = s."Id"
     LEFT JOIN supplier_invoices si ON si."PurchaseOrderId" = gr.purchase_order_id
       AND si.deleted_at IS NULL
     WHERE gr.status = 'COMPLETED'
     ${supplierFilter}
     ORDER BY gr.received_date DESC`,
    params
  );

  return result.rows.map((row) => {
    const grAmt = Number(row.gr_amount || 0);
    const invAmt = row.invoice_amount != null ? Number(row.invoice_amount) : null;
    let status = 'UNMATCHED';
    if (invAmt != null) {
      const variance = Math.abs(grAmt - invAmt);
      if (variance < 0.01) status = 'MATCHED';
      else status = 'VARIANCE';
    }

    return {
      id: row.id,
      poNumber: row.po_number || null,
      supplierName: row.supplier_name || null,
      supplierId: row.supplier_id || null,
      grDate: row.gr_date ? String(row.gr_date).split('T')[0] : null,
      grAmount: grAmt,
      invoiceDate: row.invoice_date ? String(row.invoice_date).split('T')[0] : null,
      invoiceAmount: invAmt,
      daysDifference: row.days_difference != null ? Number(row.days_difference) : null,
      status,
    };
  });
};

/**
 * Get clearing summary — how many GRs are unmatched, total unmatched value, oldest.
 * Odoo-style: derived from real GR/invoice data via PO links.
 */
export const getClearingBalance = async (
  pool?: pg.Pool
): Promise<{ clearingBalance: number; outstandingItems: number; oldestItemDays: number | null }> => {
  const dbPool = pool || globalPool;

  // All completed GRs that don't have a fully matching invoice (linked via PO)
  const result = await dbPool.query(
    `SELECT
       COUNT(*) as outstanding_items,
       COALESCE(SUM(gr.total_value), 0) as total_gr_amount,
       COALESCE(SUM(CASE WHEN si."Id" IS NOT NULL THEN si."TotalAmount" ELSE 0 END), 0) as total_inv_amount,
       MAX(EXTRACT(DAY FROM (NOW() - gr.received_date))) as oldest_days
     FROM goods_receipts gr
     LEFT JOIN supplier_invoices si ON si."PurchaseOrderId" = gr.purchase_order_id
       AND si.deleted_at IS NULL
     WHERE gr.status = 'COMPLETED'
       AND (si."Id" IS NULL OR ABS(gr.total_value - si."TotalAmount") > 0.01)`
  );

  const row = result.rows[0];
  const totalGr = Number(row.total_gr_amount || 0);
  const totalInv = Number(row.total_inv_amount || 0);

  return {
    clearingBalance: totalGr - totalInv,
    outstandingItems: parseInt(row.outstanding_items || '0'),
    oldestItemDays: row.oldest_days != null ? Math.floor(Number(row.oldest_days)) : null,
  };
};

// =============================================================================
// NORMALIZER
// =============================================================================

function normalizeGrir(row: Record<string, unknown>): GrirRecord {
  return {
    id: row.id as string,
    purchaseOrderId: row.purchase_order_id as string,
    goodsReceiptId: row.goods_receipt_id as string | null,
    invoiceId: row.invoice_id as string | null,
    poAmount: Number(row.po_amount),
    grAmount: row.gr_amount != null ? Number(row.gr_amount) : null,
    invoiceAmount: row.invoice_amount != null ? Number(row.invoice_amount) : null,
    variance: Number(row.variance || 0),
    status: row.status as GrirRecord['status'],
    matchedAt: row.matched_at as string | null,
    createdAt: row.created_at as string,
  };
}
