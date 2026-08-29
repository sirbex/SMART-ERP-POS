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
import {
  F13_DEFAULT_TOLERANCE_PERCENT,
  selectF13Pairs,
} from './grirIntegrity.js';

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
  failures: Array<{
    grNumber: string;
    invoiceNumber: string;
    error: string;
  }>;
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
export interface ClearingBalanceSummaryExtended extends ClearingBalanceSummary {
  /** True ledger CR − DR on account 2150 (authoritative residual). */
  trueGlBalance: number;
}

export async function getClearingBalance(
  pool?: pg.Pool
): Promise<ClearingBalanceSummaryExtended> {
  const dbPool = pool || globalPool;
  const row = await repo.getBalanceSummary(dbPool);
  const gl = await repo.getTrueGlBalance(dbPool);

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
    trueGlBalance: Money.toNumber(Money.parseDb(gl.gl_balance_cr)),
  };
}

// =============================================================================
// MR11 PURITY DIAGNOSTIC
// =============================================================================

export interface GrirPurityDiagnostic {
  /** GR/IR GL balance from only GRN/Invoice sources — the "clean" balance. */
  pureBalance: number;
  /** Balance contributed by Return GRN/Credit Note entries still in account 2150 (should be 0 after migration). */
  pollutedBalance: number;
  /** Full GL balance of account 2150. */
  totalGlBalance: number;
  /** Number of polluting ledger entries in account 2150. */
  pollutedEntryCount: number;
  /** True when pollutedBalance === 0: GR/IR is clean. */
  isPure: boolean;
}

/**
 * Diagnose GR/IR (2150) purity by splitting the GL balance into:
 *   \u2022 pureBalance:    entries from GOODS_RECEIPT and SUPPLIER_INVOICE only
 *   \u2022 pollutedBalance: entries from RETURN_GRN or SUPPLIER_CREDIT_NOTE
 *
 * A non-zero pollutedBalance means historical data predates the
 * Supplier Return Clearing (2160) refactor. Run the migration SQL to clean.
 */
export async function getGrirPurityDiagnostic(
  pool?: pg.Pool
): Promise<GrirPurityDiagnostic> {
  const dbPool = pool || globalPool;
  const row = await repo.getGrirPurityDiagnostic(dbPool);
  const pureBalance = Money.toNumber(Money.parseDb(row.pure_balance));
  const pollutedBalance = Money.toNumber(Money.parseDb(row.polluted_balance));
  const totalGlBalance = Money.toNumber(Money.parseDb(row.total_gl_balance));
  const pollutedEntryCount = parseInt(row.polluted_entry_count, 10);

  return {
    pureBalance,
    pollutedBalance,
    totalGlBalance,
    pollutedEntryCount,
    isPure: pollutedBalance === 0,
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
 * GL Posting (when invoice is NOT yet posted to GL):
 *   DR GR/IR Clearing 2150 (GR amount — reverses the credit from GR posting)
 *   CR Accounts Payable 2100 (invoice amount)
 *   DR/CR Price Variance 5020 (difference, if any)
 *
 * When invoice is already GL-posted (createInvoiceFromGRN / postInvoiceToGL):
 *   Record grir_clearing only — AP must not be double-posted. Residual 2150
 *   gaps should use clear-residual instead of inventing a second AP leg.
 *
 * SAP Reference: Transaction MR11N
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

    // 1. Verify GR exists and get amount (PO optional for non-PO receipts)
    const grResult = await client.query(
      `SELECT gr.id, gr.receipt_number, gr.purchase_order_id, gr.status,
              po.order_number AS po_number,
              COALESCE(po.total_amount, 0) AS po_total,
              COALESCE(items.total, 0) AS gr_total
       FROM goods_receipts gr
       LEFT JOIN purchase_orders po ON gr.purchase_order_id = po.id
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
      `SELECT "Id", "SupplierInvoiceNumber", "TotalAmount", "Status", "PurchaseOrderId",
              COALESCE(is_posted_to_gl, false) AS is_posted_to_gl
       FROM supplier_invoices
       WHERE "Id" = $1 AND deleted_at IS NULL`,
      [data.invoiceId]
    );
    if (invResult.rows.length === 0) throw new NotFoundError('Supplier invoice not found');
    const inv = invResult.rows[0];
    if (['Cancelled', 'CANCELLED', 'Voided', 'VOIDED'].includes(String(inv.Status || ''))) {
      throw new ValidationError('Cannot clear against a cancelled/voided invoice');
    }

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

    // purchase_order_id required on grir_clearing — create synthetic placeholder if missing?
    // Schema may require NOT NULL. Check via existing code path using gr.purchase_order_id.
    let purchaseOrderId = gr.purchase_order_id as string | null;
    if (!purchaseOrderId) {
      // Prefer invoice PO when GR has no PO
      purchaseOrderId = inv.PurchaseOrderId || null;
    }
    if (!purchaseOrderId) {
      throw new ValidationError(
        `Cannot record GR/IR clear for ${gr.receipt_number}: no purchase order on GR or invoice. Link the bill to a PO or GR first.`,
      );
    }

    // 5. Create clearing record
    const clearingRecord = await repo.createClearingRecord(client, {
      id: existing?.id || uuidv4(),
      purchaseOrderId,
      goodsReceiptId: data.grId,
      invoiceId: data.invoiceId,
      poAmount,
      grAmount,
      invoiceAmount,
      variance,
      status,
    });

    const alreadyPosted = inv.is_posted_to_gl === true || inv.is_posted_to_gl === 't';

    if (alreadyPosted) {
      // Bookkeeping only — GL already posted via supplier invoice path
      await client.query('COMMIT');
      logger.info('GR/IR clearing recorded without GL (invoice already posted)', {
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
    }

    // 6. Post GL entries — SAP standard clearing journal (unposted invoice only)
    const entryDate = data.date || getBusinessDate();
    const lines: JournalLine[] = [
      {
        accountCode: GRIR_CLEARING_ACCOUNT,
        description: `GR/IR Clear: ${gr.receipt_number} ↔ ${inv.SupplierInvoiceNumber || data.invoiceId.slice(0, 8)}`,
        debitAmount: grAmount,
        creditAmount: 0,
        entityType: 'GRIR_CLEARING',
        entityId: clearingRecord.id,
      },
      {
        accountCode: AccountCodes.ACCOUNTS_PAYABLE,
        description: `AP: Invoice ${inv.SupplierInvoiceNumber || data.invoiceId.slice(0, 8)} for ${gr.po_number || gr.receipt_number}`,
        debitAmount: 0,
        creditAmount: invoiceAmount,
        entityType: 'GRIR_CLEARING',
        entityId: clearingRecord.id,
      },
    ];

    if (!isExactMatch) {
      const absVariance = Math.abs(variance);
      if (variance > 0) {
        lines.push({
          accountCode: AccountCodes.PRICE_VARIANCE,
          description: `Price variance (GR > Invoice) on ${gr.po_number || gr.receipt_number}: ${variance.toFixed(2)}`,
          debitAmount: 0,
          creditAmount: absVariance,
          entityType: 'GRIR_CLEARING',
          entityId: clearingRecord.id,
        });
      } else {
        lines.push({
          accountCode: AccountCodes.PRICE_VARIANCE,
          description: `Price variance (Invoice > GR) on ${gr.po_number || gr.receipt_number}: ${Math.abs(variance).toFixed(2)}`,
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
 * Automatically match GRs to invoices (F.13).
 *
 * Rules (shared with getMatchCandidates via selectF13Pairs):
 *   1. Multi-path GR↔bill links (grn_links / PO / internal ref).
 *   2. 1:1 greedy assignment (exact first from repo order).
 *   3. Within tolerance % (default F13_DEFAULT_TOLERANCE_PERCENT = 2).
 *   4. clearItem posts GL when bill not posted; bookkeeping-only when already posted.
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
  const tolerancePct =
    options.tolerancePercent != null && Number.isFinite(options.tolerancePercent)
      ? Number(options.tolerancePercent)
      : F13_DEFAULT_TOLERANCE_PERCENT;

  const rawCandidates = await repo.getMatchCandidates(dbPool, {
    supplierId: options.supplierId,
  });

  const selected = selectF13Pairs(rawCandidates, tolerancePct);

  const result: AutoMatchResult = {
    matched: 0,
    withVariance: 0,
    skipped: Math.max(0, rawCandidates.length - selected.length),
    failures: [],
    details: [],
  };

  for (const candidate of selected) {
    const grAmount = Money.toNumber(Money.parseDb(candidate.gr_line_total));
    const invoiceAmount = Money.toNumber(Money.parseDb(candidate.invoice_total));

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
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('Auto-match failed for pair', {
        grId: candidate.gr_id,
        invoiceId: candidate.invoice_id,
        error: message,
      });
      result.failures.push({
        grNumber: candidate.gr_number,
        invoiceNumber: candidate.invoice_number,
        error: message,
      });
      result.skipped++;
    }
  }

  logger.info('GR/IR auto-match completed', {
    matched: result.matched,
    withVariance: result.withVariance,
    skipped: result.skipped,
    candidatePairsRaw: rawCandidates.length,
    selectedPairs: selected.length,
  });

  return result;
}

// =============================================================================
// MATCH CANDIDATES — For UI suggestions
// =============================================================================

/**
 * Get GR↔Invoice match candidates for the auto-match UI preview.
 * Same selectF13Pairs as Run Auto-Match so preview count = run count.
 */
export async function getMatchCandidates(
  options: { supplierId?: string; tolerancePercent?: number } = {},
  pool?: pg.Pool
): Promise<MatchCandidate[]> {
  const dbPool = pool || globalPool;
  const tolerancePct =
    options.tolerancePercent != null && Number.isFinite(options.tolerancePercent)
      ? Number(options.tolerancePercent)
      : F13_DEFAULT_TOLERANCE_PERCENT;

  const rows = await repo.getMatchCandidates(dbPool, {
    supplierId: options.supplierId,
  });
  const selected = selectF13Pairs(rows, tolerancePct);

  return selected.map((r) => ({
    grId: r.gr_id,
    grNumber: r.gr_number,
    grDate: r.gr_date,
    poId: r.po_id || '',
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
// GL RESIDUAL WORKLIST + SAFE CLEAR (no second AP leg)
// =============================================================================

export type ResidualClearMethod =
  | 'TO_PRICE_VARIANCE'
  | 'TO_RETURN_CLEARING'
  | 'RECLASS_FROM_EXPENSE';

export interface GrirGlResidualItem {
  referenceNumber: string;
  referenceType: string;
  /** CR − DR on 2150 for this document. Positive = credit residual (typical open GR). */
  netCr: number;
  firstDate: string | null;
  lastDate: string | null;
  txnCount: number;
  description: string | null;
  recommendedMethod: ResidualClearMethod;
  reasonCode: string;
}

export interface ResidualClearResult {
  referenceNumber: string;
  method: ResidualClearMethod;
  amountCleared: number;
  /** Remaining net after clear (should be ~0). */
  remainingNetCr: number;
  journalReference: string;
}

function recommendResidualMethod(
  referenceType: string,
  netCr: number,
): { method: ResidualClearMethod; reasonCode: string } {
  const t = (referenceType || '').toUpperCase();
  if (t === 'RETURN_GRN' || t === 'SUPPLIER_CREDIT_NOTE') {
    return { method: 'TO_RETURN_CLEARING', reasonCode: 'RETURN_POLLUTION' };
  }
  if (t === 'GOODS_RECEIPT' && netCr > 0.01) {
    // Open GR credit: either invoice still needed, expense-path misbill, or write to variance.
    return { method: 'RECLASS_FROM_EXPENSE', reasonCode: 'UNCLEARED_GR_OR_EXPENSE_BILL' };
  }
  if (t === 'SUPPLIER_INVOICE' && netCr < -0.01) {
    return { method: 'TO_PRICE_VARIANCE', reasonCode: 'PRICE_GAP_OR_OVERCLEAR' };
  }
  return { method: 'TO_PRICE_VARIANCE', reasonCode: 'GL_RESIDUAL' };
}

/**
 * List non-zero 2150 residuals by reference (true ledger SSOT).
 */
export async function getGlResiduals(
  options: { limit?: number; minAbs?: number } = {},
  pool?: pg.Pool
): Promise<{ items: GrirGlResidualItem[]; trueGlBalance: number }> {
  const dbPool = pool || globalPool;
  const [rows, gl] = await Promise.all([
    repo.getGlResiduals(dbPool, options),
    repo.getTrueGlBalance(dbPool),
  ]);

  const items = rows.map((r) => {
    const netCr = Money.toNumber(Money.parseDb(r.net_cr));
    const { method, reasonCode } = recommendResidualMethod(r.reference_type, netCr);
    return {
      referenceNumber: r.reference_number,
      referenceType: r.reference_type,
      netCr,
      firstDate: r.first_date,
      lastDate: r.last_date,
      txnCount: parseInt(r.txn_count, 10) || 0,
      description: r.description_sample,
      recommendedMethod: method,
      reasonCode,
    };
  });

  return {
    items,
    trueGlBalance: Money.toNumber(Money.parseDb(gl.gl_balance_cr)),
  };
}

/**
 * Clear a GL residual on 2150 without re-posting Accounts Payable.
 *
 * Methods:
 *  - TO_PRICE_VARIANCE: offset residual to 5020 (price variance / small write-off)
 *  - TO_RETURN_CLEARING: move polluted residual to 2160
 *  - RECLASS_FROM_EXPENSE: DR 2150 / CR 6900 when goods were received on 2150
 *    but the supplier bill hit expense instead of GR/IR (common INV-GR- misroute)
 *
 * Amount defaults to the full current residual for the reference.
 */
export async function clearGlResidual(
  data: {
    referenceNumber: string;
    method: ResidualClearMethod;
    userId: string;
    amount?: number;
    date?: string;
    notes?: string;
  },
  pool?: pg.Pool
): Promise<ResidualClearResult> {
  const dbPool = pool || globalPool;
  const ref = (data.referenceNumber || '').trim();
  if (!ref) throw new ValidationError('referenceNumber is required');

  const allowed: ResidualClearMethod[] = [
    'TO_PRICE_VARIANCE',
    'TO_RETURN_CLEARING',
    'RECLASS_FROM_EXPENSE',
  ];
  if (!allowed.includes(data.method)) {
    throw new ValidationError(`Invalid method. Use one of: ${allowed.join(', ')}`);
  }

  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');

    const residual = await repo.getGlResidualForReference(client, ref);
    if (!residual) {
      throw new NotFoundError(`No open 2150 residual for reference ${ref}`);
    }

    const netCr = Money.toNumber(Money.parseDb(residual.net_cr));
    const absNet = Math.abs(netCr);
    if (absNet < 0.01) {
      throw new ValidationError('Residual already cleared');
    }

    let clearAbs = absNet;
    if (data.amount != null && Number.isFinite(data.amount)) {
      clearAbs = Math.abs(Number(data.amount));
      if (clearAbs < 0.01) throw new ValidationError('amount must be positive');
      if (clearAbs > absNet + 0.01) {
        throw new ValidationError(
          `amount ${clearAbs.toFixed(2)} exceeds open residual ${absNet.toFixed(2)} on ${ref}`,
        );
      }
    }

    // Preserve sign: netCr > 0 means credit residual (need DR 2150 to clear)
    const residualSign = netCr >= 0 ? 1 : -1;
    const clearSigned = clearAbs * residualSign; // amount of CR to remove (= signed amount)

    if (data.method === 'RECLASS_FROM_EXPENSE') {
      // Only clears credit residual by DR 2150 / CR 6900
      if (netCr <= 0.01) {
        throw new ValidationError(
          'RECLASS_FROM_EXPENSE only applies when 2150 still has a credit residual (open GR). For debit residual use TO_PRICE_VARIANCE.',
        );
      }
    }

    const entryDate = data.date || getBusinessDate();
    const note = (data.notes || '').trim();
    const methodLabel =
      data.method === 'TO_PRICE_VARIANCE'
        ? 'price variance'
        : data.method === 'TO_RETURN_CLEARING'
          ? 'return clearing 2160'
          : 'expense reclass 6900';

    if (data.method === 'TO_RETURN_CLEARING') {
      const { ensureSupplierReturnClearingAccount } = await import(
        '../return-grn/ensureSupplierReturnClearingAccount.js'
      );
      await ensureSupplierReturnClearingAccount(client);
    }

    const lines: JournalLine[] = [];

    if (data.method === 'RECLASS_FROM_EXPENSE') {
      // DR 2150, CR 6900 — reverse wrong expense, clear GR/IR credit
      lines.push(
        {
          accountCode: GRIR_CLEARING_ACCOUNT,
          description: `Clear residual ${ref} (expense reclass)`,
          debitAmount: clearAbs,
          creditAmount: 0,
        },
        {
          accountCode: AccountCodes.GENERAL_EXPENSE,
          description: `Reclass expense → GR/IR for ${ref}`,
          debitAmount: 0,
          creditAmount: clearAbs,
        },
      );
    } else if (data.method === 'TO_RETURN_CLEARING') {
      // Move residual to 2160 (same-sign move: if 2150 is debit residual, DR 2160? wait)
      // Net residual netCr on 2150: to zero 2150 by amount clearAbs with sign residualSign:
      // entry on 2150 must be opposite to residual: DR if residual credit, CR if residual debit.
      // Offset goes to 2160 with same direction as residual (moving the residual across accounts).
      if (residualSign > 0) {
        // Credit residual on 2150 → DR 2150, CR 2160 (liability moves to return clearing)
        lines.push(
          {
            accountCode: GRIR_CLEARING_ACCOUNT,
            description: `Move residual ${ref} off GR/IR`,
            debitAmount: clearAbs,
            creditAmount: 0,
          },
          {
            accountCode: AccountCodes.SUPPLIER_RETURN_CLEARING,
            description: `Return clearing residual from ${ref}`,
            debitAmount: 0,
            creditAmount: clearAbs,
          },
        );
      } else {
        // Debit residual on 2150 → CR 2150, DR 2160
        lines.push(
          {
            accountCode: GRIR_CLEARING_ACCOUNT,
            description: `Move residual ${ref} off GR/IR`,
            debitAmount: 0,
            creditAmount: clearAbs,
          },
          {
            accountCode: AccountCodes.SUPPLIER_RETURN_CLEARING,
            description: `Return clearing residual from ${ref}`,
            debitAmount: clearAbs,
            creditAmount: 0,
          },
        );
      }
    } else {
      // TO_PRICE_VARIANCE
      if (residualSign > 0) {
        // Credit residual → DR 2150, CR 5020 (favorable / write-off credit)
        lines.push(
          {
            accountCode: GRIR_CLEARING_ACCOUNT,
            description: `Clear residual ${ref} to price variance`,
            debitAmount: clearAbs,
            creditAmount: 0,
          },
          {
            accountCode: AccountCodes.PRICE_VARIANCE,
            description: `GR/IR residual write-off ${ref}`,
            debitAmount: 0,
            creditAmount: clearAbs,
          },
        );
      } else {
        // Debit residual → CR 2150, DR 5020
        lines.push(
          {
            accountCode: GRIR_CLEARING_ACCOUNT,
            description: `Clear residual ${ref} to price variance`,
            debitAmount: 0,
            creditAmount: clearAbs,
          },
          {
            accountCode: AccountCodes.PRICE_VARIANCE,
            description: `GR/IR residual write-off ${ref}`,
            debitAmount: clearAbs,
            creditAmount: 0,
          },
        );
      }
    }

    const journalRef = `GRIR-RES-${ref}`.slice(0, 60);
    const clearingId = uuidv4();

    await AccountingCore.createJournalEntry({
      entryDate,
      description: `GR/IR residual clear (${methodLabel}): ${ref}${note ? ` — ${note}` : ''}`,
      referenceType: 'GRIR_CLEARING',
      referenceId: clearingId,
      referenceNumber: journalRef,
      lines,
      userId: data.userId,
      idempotencyKey: `GRIR-RESIDUAL-${data.method}-${ref}-${clearAbs.toFixed(2)}-${entryDate}`,
    }, undefined, client);

    await client.query('COMMIT');

    // Re-read residual after post
    const after = await repo.getGlResidualForReference(dbPool, ref);
    const remaining = after
      ? Money.toNumber(Money.parseDb(after.net_cr))
      : 0;

    logger.info('GR/IR residual cleared', {
      referenceNumber: ref,
      method: data.method,
      clearAbs,
      remaining,
      userId: data.userId,
    });

    return {
      referenceNumber: ref,
      method: data.method,
      amountCleared: clearSigned,
      remainingNetCr: remaining,
      journalReference: journalRef,
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
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
