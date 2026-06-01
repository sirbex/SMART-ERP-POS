/**
 * Pure math for GL(1300) ↔ batch subledger coupling analysis and tests.
 *
 *   gap = glNet1300 − batchValuation
 *
 * Invariant (guarded workflows): |gapAfter − gapBefore| ≤ INVENTORY_COUPLING_TOLERANCE
 */
import Decimal from 'decimal.js';
import { Money } from '../utils/money.js';

/** Max |Δgap| per guarded transaction — sub-cent; GL amounts must come from batch SQL delta. */
export const INVENTORY_COUPLING_TOLERANCE = 0.02;

export interface CouplingSnapshot {
    glNet1300: number;
    batchValuation: number;
    gap: number;
}

export function computeGap(glNet1300: number, batchValuation: number): number {
    return Money.toNumber(
        Money.subtract(Money.parseDb(glNet1300), Money.parseDb(batchValuation)),
    );
}

export function computeDeltaGap(before: CouplingSnapshot, after: CouplingSnapshot): number {
    return Math.abs(after.gap - before.gap);
}

export function couplingAssertWouldPass(
    before: CouplingSnapshot,
    after: CouplingSnapshot,
    tolerance = INVENTORY_COUPLING_TOLERANCE,
): boolean {
    return computeDeltaGap(before, after) <= tolerance;
}

/** Batch subledger value removed (sales, returns, outbound adjustments). */
export function batchValuationReduction(
    before: CouplingSnapshot,
    after: CouplingSnapshot,
): number {
    return Money.toNumber(
        Money.round(
            Money.subtract(
                Money.parseDb(before.batchValuation),
                Money.parseDb(after.batchValuation),
            ),
            2,
        ),
    );
}

/** Batch subledger value added (goods receipts, inbound adjustments). */
export function batchValuationIncrease(
    before: CouplingSnapshot,
    after: CouplingSnapshot,
): number {
    return Money.toNumber(
        Money.round(
            Money.subtract(
                Money.parseDb(after.batchValuation),
                Money.parseDb(before.batchValuation),
            ),
            2,
        ),
    );
}

/**
 * Simulate gap after an inventory transaction when GL 1300 and batch subledger
 * change by given deltas (debits positive on GL asset account).
 */
export function simulateGapAfterTransaction(
    before: CouplingSnapshot,
    gl1300Delta: number,
    batchValuationDelta: number,
): CouplingSnapshot {
    const glNet1300 = before.glNet1300 + gl1300Delta;
    const batchValuation = before.batchValuation + batchValuationDelta;
    return { glNet1300, batchValuation, gap: computeGap(glNet1300, batchValuation) };
}

/** Sum JS-side FEFO deduction costs (Decimal) — can differ from SQL batch delta by ≤1 UGX. */
export function sumJsBatchDeductionCost(
    slices: Array<{ qty: number | string; unitCost: number | string }>,
): number {
    let total = new Decimal(0);
    for (const s of slices) {
        total = total.plus(Money.multiply(s.unitCost, s.qty));
    }
    return Money.toNumber(Money.round(total, 2));
}

/**
 * Workflows that mutate batches + GL(1300) inside a transaction with coupling assert.
 * New drift from these paths is limited to INVENTORY_COUPLING_TOLERANCE per txn.
 */
export const COUPLING_GUARDED_WORKFLOWS = [
    'SALE (salesService.createSale)',
    'GOODS_RECEIPT (goodsReceiptService.finalize)',
    'RETURN_GRN (returnGrnService.post)',
    'STOCK_ADJUSTMENT_IN|OUT|DAMAGE|EXPIRY (stockMovementHandler)',
] as const;

/**
 * Workflows that can add historical / unbounded GL ↔ batch drift (no coupling assert).
 * Forensics: classify-inventory-gl-drift.mjs buckets by ReferenceType.
 */
export const UNGUARDED_DRIFT_SOURCES = [
    'OPENING_STOCK — GL after COMMIT; errors swallowed (goodsReceiptService)',
    'DELIVERY_NOTE_PGI — GL after COMMIT (deliveryNoteService)',
    'SALE_VOID — batch restore vs GL reversal, no coupling (salesService.voidSale)',
    'SALE_REFUND / CREDIT_NOTE_RETURN — restore 1300 without coupling',
    'recordStockAdjustmentToGL — legacy path without stockMovementHandler',
    'CORRECTION / SYSTEM_CORRECTION / heal-inventory-drift — GL-only alignment',
    'Duplicate GOODS_RECEIPT GL postings (re-post / repair scripts)',
    'SUPPLIER_INVOICE or EXPENSE posted to 1300 (misclassification)',
    'Pre-fix sales — COGS preview before FEFO deduction (historical DATA)',
] as const;
