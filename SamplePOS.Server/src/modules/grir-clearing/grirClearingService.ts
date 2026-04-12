/**
 * GR/IR Clearing Service
 *
 * SAP-style Goods Receipt / Invoice Receipt clearing account management.
 *
 * SAP Transactions Modelled:
 *   MR11  — GR/IR Account Maintenance (open items work list)
 *   F.13  — Automatic Clearing (auto-match GR↔Invoice)
 *   MR11N — Manual Clearing (match a specific GR to a specific invoice)
 *   FBL3N — Clearing Account Line Items (drill-down)
 *
 * 3-Way Match Flow:
 *   1. PO created  → No GL impact
 *   2. Goods Receipt completed → DR Inventory (1300), CR GR/IR Clearing (2150)
 *   3. Supplier Invoice posted  → DR GR/IR Clearing (2150), CR AP (2100)
 *   4. Clear: amounts match → GR/IR Clearing (2150) nets to zero
 *   5. Variance → Posted to Price Variance (5020) per SAP standard
 *
 * Write-Off (SAP MR11):
 *   Small remaining balances can be written off to a configurable
 *   expense account (default: 5020 Price Variance).
 */

import { pool as globalPool } from '../../db/pool.js';
import type pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { Money } from '../../utils/money.js';
import { AccountingCore, JournalLine } from '../../services/accountingCore.js';
import { AccountCodes } from '../../services/glEntryService.js';
import { NotFoundError, ValidationError, ConflictError } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';
import * as repo from './grirClearingRepository.js';
import { getBusinessDate } from '../../utils/dateRange.js';

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

export interface GrirOpenItem {
  id: string;
  grNumber: string;
  grDate: string | null;
  poId: string;
  poNumber: string;
  poStatus: string;
  supplierId: string;
  supplierName: string;
  supplierCode: string;
  grAmount: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  invoiceAmount: number | null;
  invoiceStatus: string | null;
  daysSinceGr: number | null;
  clearingStatus: string;
  variance: number | null;
}

export interface ClearingBalanceSummary {
  totalGrValue: number;
  totalInvoicedValue: number;
  clearingBalance: number;
  outstandingCount: number;
  partiallyMatchedCount: number;
  fullyMatchedCount: number;
  varianceCount: number;
  oldestUnmatchedDays: number | null;
  avgClearingDays: number | null;
}

export interface MatchCandidate {
  grId: string;
  grNumber: string;
  grDate: string | null;
  poId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  grAmount: number;
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  invoiceAmount: number;
  amountDiff: number;
  isExactMatch: boolean;
}

export interface ClearResult {
  clearingRecord: GrirRecord;
  variancePosted: boolean;
  varianceAmount: number;
}

export interface AutoMatchResult {
  matched: number;
  withVariance: number;
  skipped: number;
  details: Array<{
    grNumber: string;
    invoiceNumber: string;
    grAmount: number;
    invoiceAmount: number;
    variance: number;
    status: string;
  }>;
}

// =============================================================================
// OPEN ITEMS — SAP MR11 Work List
// =============================================================================

/**
 * Get open GR/IR clearing items with full filtering.
 * SAP equivalent: MR11 → Display GR/IR clearing items
 */
export async function getOpenClearingItems(
  filters: {
    supplierId?: string;
    poNumber?: string;
    grNumber?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  } = {},
  pool?: pg.Pool
): Promise<{ data: GrirOpenItem[]; total: number; page: number; limit: number; totalPages: number }> {
  const dbPool = pool || globalPool;
  const page = filters.page || 1;
  const limit = filters.limit || 50;
  const offset = (page - 1) * limit;

  const { rows, total } = await repo.getOpenItems(dbPool, {
    ...filters,
    limit,
    offset,
  });

  return {
    data: rows.map(normalizeOpenItem),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * SAP F4 search — find clearing items by PO/GR/supplier/invoice number.
 */
export async function searchClearingItems(
  query: string,
  pool?: pg.Pool
): Promise<GrirOpenItem[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }
  const dbPool = pool || globalPool;
  const rows = await repo.searchClearingItems(dbPool, query.trim(), 20);
  return rows.map(normalizeOpenItem);
}

// =============================================================================
// BALANCE SUMMARY — SAP FBL3N account 2150
// =============================================================================

/**
 * Get clearing account balance summary.
 */
export async function getClearingBalance(
  pool?: pg.Pool
): Promise<ClearingBalanceSummary> {
  const dbPool = pool || globalPool;
  const row = await repo.getBalanceSummary(dbPool);

  return {
    totalGrValue: Money.toNumber(Money.parseDb(row.total_gr_value)),
    totalInvoicedValue: Money.toNumber(Money.parseDb(row.total_invoiced_value)),
    clearingBalance: Money.toNumber(Money.parseDb(row.clearing_balance)),
    outstandingCount: parseInt(row.outstanding_count, 10),
    partiallyMatchedCount: parseInt(row.partially_matched_count, 10),
    fullyMatchedCount: parseInt(row.fully_matched_count, 10),
    varianceCount: parseInt(row.variance_count, 10),
    oldestUnmatchedDays: row.oldest_unmatched_days != null
      ? Math.floor(Number(row.oldest_unmatched_days))
      : null,
    avgClearingDays: row.avg_clearing_days != null
      ? Math.round(Number(row.avg_clearing_days))
      : null,
  };
}

// =============================================================================
// GR ITEM DRILL-DOWN — SAP 3-way match detail
// =============================================================================

/**
 * Get line-item details for a GR, comparing quantities and prices
 * against the original PO (SAP ME23N style).
 */
export async function getGrItemDetails(
  goodsReceiptId: string,
  pool?: pg.Pool
): Promise<Array<{
  productId: string;
  productName: string;
  sku: string;
  receivedQuantity: number;
  costPrice: number;
  lineTotal: number;
  poUnitPrice: number;
  poQuantity: number;
  priceVariance: number;
  quantityVariance: number;
}>> {
  const dbPool = pool || globalPool;
  const rows = await repo.getGrItemDetails(dbPool, goodsReceiptId);

  return rows.map((r) => ({
    productId: r.product_id,
    productName: r.product_name,
    sku: r.sku,
    receivedQuantity: Money.toNumber(Money.parseDb(r.received_quantity)),
    costPrice: Money.toNumber(Money.parseDb(r.cost_price)),
    lineTotal: Money.toNumber(Money.parseDb(r.line_total)),
    poUnitPrice: Money.toNumber(Money.parseDb(r.po_unit_price)),
    poQuantity: Money.toNumber(Money.parseDb(r.po_quantity)),
    priceVariance: Money.toNumber(Money.parseDb(r.price_variance)),
    quantityVariance: Money.toNumber(Money.parseDb(r.quantity_variance)),
  }));
}

// =============================================================================
// MANUAL CLEARING — SAP MR11N
// =============================================================================

/**
 * Manually clear a GR against an invoice.
 *
 * GL Posting:
 *   DR GR/IR Clearing 2150 (GR amount — reverses the credit from GR posting)
 *   CR Accounts Payable 2100 (invoice amount)
 *   DR/CR Price Variance 5020 (difference, if any)
 *
 * SAP Reference: Transaction MR11N — the user picks a GR and an invoice,
 * confirms the amounts, and the system clears and posts the variance.
 */
export async function clearItem(
  data: {
    grId: string;
    invoiceId: string;
    userId: string;
    date?: string;
  },
  pool?: pg.Pool
): Promise<ClearResult> {
  const dbPool = pool || globalPool;
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    // 1. Verify GR exists and get amount
    const grResult = await client.query(
      `SELECT gr.id, gr.receipt_number, gr.purchase_order_id, gr.status,
              po.order_number AS po_number,
              po.total_amount AS po_total,
              COALESCE(items.total, 0) AS gr_total
       FROM goods_receipts gr
       JOIN purchase_orders po ON gr.purchase_order_id = po.id
       LEFT JOIN (
         SELECT goods_receipt_id, SUM(received_quantity * cost_price) AS total
         FROM goods_receipt_items GROUP BY goods_receipt_id
       ) items ON items.goods_receipt_id = gr.id
       WHERE gr.id = $1`,
      [data.grId]
    );
    if (grResult.rows.length === 0) throw new NotFoundError('Goods receipt not found');
    const gr = grResult.rows[0];
    if (gr.status !== 'COMPLETED') throw new ValidationError('Goods receipt must be COMPLETED to clear');

    // 2. Verify invoice exists and get amount
    const invResult = await client.query(
      `SELECT "Id", "SupplierInvoiceNumber", "TotalAmount", "Status", "PurchaseOrderId"
       FROM supplier_invoices
       WHERE "Id" = $1 AND deleted_at IS NULL`,
      [data.invoiceId]
    );
    if (invResult.rows.length === 0) throw new NotFoundError('Supplier invoice not found');
    const inv = invResult.rows[0];
    if (inv.Status === 'CANCELLED') throw new ValidationError('Cannot clear against a cancelled invoice');

    // 3. Check not already cleared
    const existing = await repo.findClearingRecord(client, { grId: data.grId, invoiceId: data.invoiceId });
    if (existing && (existing.status === 'MATCHED' || existing.status === 'VARIANCE')) {
      throw new ConflictError('This GR-Invoice pair is already cleared');
    }

    // 4. Calculate amounts and variance
    const grAmount = Money.toNumber(Money.parseDb(String(gr.gr_total)));
    const invoiceAmount = Money.toNumber(Money.parseDb(String(inv.TotalAmount)));
    const poAmount = Money.toNumber(Money.parseDb(String(gr.po_total)));
    const variance = Money.toNumber(Money.subtract(grAmount, invoiceAmount));
    const isExactMatch = Math.abs(variance) < 0.01;
    const status = isExactMatch ? 'MATCHED' : 'VARIANCE';

    // 5. Create clearing record
    const clearingRecord = await repo.createClearingRecord(client, {
      id: existing?.id || uuidv4(),
      purchaseOrderId: gr.purchase_order_id,
      goodsReceiptId: data.grId,
      invoiceId: data.invoiceId,
      poAmount,
      grAmount,
      invoiceAmount,
      variance,
      status,
    });

    // 6. Post GL entries — SAP standard clearing journal
    const entryDate = data.date || getBusinessDate();
    const lines: JournalLine[] = [
      // Debit GR/IR Clearing (reverses the credit from GR posting)
      {
        accountCode: GRIR_CLEARING_ACCOUNT,
        description: `GR/IR Clear: ${gr.receipt_number} ↔ ${inv.SupplierInvoiceNumber || data.invoiceId.slice(0, 8)}`,
        debitAmount: grAmount,
        creditAmount: 0,
        entityType: 'GRIR_CLEARING',
        entityId: clearingRecord.id,
      },
      // Credit AP (recognise the payable from the invoice)
      {
        accountCode: AccountCodes.ACCOUNTS_PAYABLE,
        description: `AP: Invoice ${inv.SupplierInvoiceNumber || data.invoiceId.slice(0, 8)} for ${gr.po_number}`,
        debitAmount: 0,
        creditAmount: invoiceAmount,
        entityType: 'GRIR_CLEARING',
        entityId: clearingRecord.id,
      },
    ];

    // Price variance line (SAP posts to account 5020)
    if (!isExactMatch) {
      const absVariance = Math.abs(variance);
      if (variance > 0) {
        // GR > Invoice → credit Price Variance (cost reduction)
        lines.push({
          accountCode: AccountCodes.PRICE_VARIANCE,
          description: `Price variance (GR > Invoice) on ${gr.po_number}: ${variance.toFixed(2)}`,
          debitAmount: 0,
          creditAmount: absVariance,
          entityType: 'GRIR_CLEARING',
          entityId: clearingRecord.id,
        });
      } else {
        // Invoice > GR → debit Price Variance (additional cost)
        lines.push({
          accountCode: AccountCodes.PRICE_VARIANCE,
          description: `Price variance (Invoice > GR) on ${gr.po_number}: ${Math.abs(variance).toFixed(2)}`,
          debitAmount: absVariance,
          creditAmount: 0,
          entityType: 'GRIR_CLEARING',
          entityId: clearingRecord.id,
        });
      }
    }

    await AccountingCore.createJournalEntry({
      entryDate,
      description: `GR/IR Clearing: ${gr.receipt_number} ↔ ${inv.SupplierInvoiceNumber || 'INV'}`,
      referenceType: 'GRIR_CLEARING',
      referenceId: clearingRecord.id,
      referenceNumber: `GRIR-${gr.receipt_number}`,
      lines,
      userId: data.userId,
      idempotencyKey: `GRIR-CLEAR-${data.grId}-${data.invoiceId}`,
    }, undefined, client);

    await client.query('COMMIT');

    logger.info('GR/IR manual clearing completed', {
      grId: data.grId,
      invoiceId: data.invoiceId,
      grAmount,
      invoiceAmount,
      variance,
      status,
    });

    return {
      clearingRecord: normalizeClearingRow(clearingRecord),
      variancePosted: !isExactMatch,
      varianceAmount: variance,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// =============================================================================
// AUTO-MATCH — SAP F.13 Automatic Clearing
// =============================================================================

/**
 * Automatically match GRs to invoices on the same PO.
 * SAP F.13 logic: exact amount matches first, then within tolerance.
 *
 * Rules:
 *   1. Only match COMPLETED GRs with non-CANCELLED invoices.
 *   2. Must share the same PO reference.
 *   3. Skip pairs already cleared.
 *   4. Post GL for each match (including variance).
 */
export async function autoMatch(
  options: {
    supplierId?: string;
    tolerancePercent?: number;
    userId: string;
  },
  pool?: pg.Pool
): Promise<AutoMatchResult> {
  const dbPool = pool || globalPool;
  const tolerancePct = options.tolerancePercent ?? 5; // SAP default: 5% tolerance

  // Get unmatched candidates
  const candidates = await repo.getMatchCandidates(dbPool, {
    supplierId: options.supplierId,
    tolerancePercent: tolerancePct,
  });

  const result: AutoMatchResult = {
    matched: 0,
    withVariance: 0,
    skipped: 0,
    details: [],
  };

  for (const candidate of candidates) {
    const grAmount = Money.toNumber(Money.parseDb(candidate.gr_line_total));
    const invoiceAmount = Money.toNumber(Money.parseDb(candidate.invoice_total));
    const diff = Money.toNumber(Money.parseDb(candidate.amount_diff));

    // Check tolerance: skip if variance exceeds tolerance %
    if (grAmount > 0) {
      const variancePct = (diff / grAmount) * 100;
      if (variancePct > tolerancePct) {
        result.skipped++;
        continue;
      }
    }

    try {
      const clearResult = await clearItem({
        grId: candidate.gr_id,
        invoiceId: candidate.invoice_id,
        userId: options.userId,
      }, dbPool);

      if (clearResult.variancePosted) {
        result.withVariance++;
      } else {
        result.matched++;
      }

      result.details.push({
        grNumber: candidate.gr_number,
        invoiceNumber: candidate.invoice_number,
        grAmount,
        invoiceAmount,
        variance: clearResult.varianceAmount,
        status: clearResult.clearingRecord.status,
      });
    } catch (err) {
      // Skip individual match failures (already cleared, etc.)
      logger.warn('Auto-match skipped pair', {
        grId: candidate.gr_id,
        invoiceId: candidate.invoice_id,
        error: (err as Error).message,
      });
      result.skipped++;
    }
  }

  logger.info('GR/IR auto-match completed', {
    matched: result.matched,
    withVariance: result.withVariance,
    skipped: result.skipped,
  });

  return result;
}

// =============================================================================
// MATCH CANDIDATES — For UI suggestions
// =============================================================================

/**
 * Get GR↔Invoice match candidates for the auto-match UI preview.
 */
export async function getMatchCandidates(
  options: { supplierId?: string } = {},
  pool?: pg.Pool
): Promise<MatchCandidate[]> {
  const dbPool = pool || globalPool;
  const rows = await repo.getMatchCandidates(dbPool, options);

  return rows.map((r) => ({
    grId: r.gr_id,
    grNumber: r.gr_number,
    grDate: r.gr_date,
    poId: r.po_id,
    poNumber: r.po_number,
    supplierId: r.supplier_id,
    supplierName: r.supplier_name,
    grAmount: Money.toNumber(Money.parseDb(r.gr_line_total)),
    invoiceId: r.invoice_id,
    invoiceNumber: r.invoice_number,
    invoiceDate: r.invoice_date,
    invoiceAmount: Money.toNumber(Money.parseDb(r.invoice_total)),
    amountDiff: Money.toNumber(Money.parseDb(r.amount_diff)),
    isExactMatch: r.is_exact_match,
  }));
}

// =============================================================================
// PO STATUS — Legacy endpoint
// =============================================================================

/**
 * Get GR/IR clearing status for a PO (from the grir_clearing table).
 */
export async function getGrirStatus(
  purchaseOrderId: string,
  pool?: pg.Pool
): Promise<GrirRecord | null> {
  const dbPool = pool || globalPool;
  const row = await repo.findClearingRecord(dbPool, { poId: purchaseOrderId });
  return row ? normalizeClearingRow(row) : null;
}

/**
 * Get clearing history for a PO.
 */
export async function getClearingHistory(
  purchaseOrderId: string,
  pool?: pg.Pool
): Promise<GrirRecord[]> {
  const dbPool = pool || globalPool;
  const rows = await repo.getClearingHistory(dbPool, purchaseOrderId);
  return rows.map(normalizeClearingRow);
}

// =============================================================================
// NORMALIZERS
// =============================================================================

function normalizeOpenItem(row: repo.GrirOpenItemRow | repo.GrirSearchRow): GrirOpenItem {
  return {
    id: row.gr_id,
    grNumber: row.gr_number,
    grDate: row.gr_date,
    poId: row.po_id,
    poNumber: row.po_number,
    poStatus: row.po_status,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    supplierCode: row.supplier_code,
    grAmount: Money.toNumber(Money.parseDb(row.gr_line_total)),
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    invoiceAmount: row.invoice_total != null
      ? Money.toNumber(Money.parseDb(row.invoice_total))
      : null,
    invoiceStatus: row.invoice_status,
    daysSinceGr: row.days_since_gr,
    clearingStatus: row.clearing_status,
    variance: row.variance != null
      ? Money.toNumber(Money.parseDb(row.variance))
      : null,
  };
}

function normalizeClearingRow(row: repo.GrirClearingRow): GrirRecord {
  return {
    id: row.id,
    purchaseOrderId: row.purchase_order_id,
    goodsReceiptId: row.goods_receipt_id,
    invoiceId: row.invoice_id,
    poAmount: Money.toNumber(Money.parseDb(row.po_amount)),
    grAmount: row.gr_amount != null ? Money.toNumber(Money.parseDb(row.gr_amount)) : null,
    invoiceAmount: row.invoice_amount != null ? Money.toNumber(Money.parseDb(row.invoice_amount)) : null,
    variance: Money.toNumber(Money.parseDb(row.variance)),
    status: row.status as GrirRecord['status'],
    matchedAt: row.matched_at,
    createdAt: row.created_at,
  };
}
