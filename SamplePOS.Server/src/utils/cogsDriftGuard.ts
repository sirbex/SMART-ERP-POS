/**
 * COGS Drift Guard — Pure utility
 *
 * Compares GL-posted COGS (from FEFO batch preview) against the actual
 * cost of batches physically deducted (FOR UPDATE) within the same sale
 * transaction. If they diverge by more than 1 cent the sale was subject
 * to a concurrent-inventory race condition and accounting integrity is at risk.
 *
 * Extracted as a pure function so it can be unit-tested without any
 * database, pool, or service mocks.
 */

import Decimal from 'decimal.js';

/** Minimal slice of CreateSaleItemData that the guard needs. */
export interface CogsDriftItem {
    productId: string;
    productName: string;
    /** Cost per selling-UoM unit as posted to the GL (from FEFO preview). */
    costPrice: number;
    /** Quantity in selling-UoM units. */
    quantity: number;
}

export interface CogsDriftResult {
    productId: string;
    productName: string;
    /** GL COGS posted = costPrice × quantity (from FEFO preview). */
    glCost: string;
    /** Actual cost accumulated from physical FEFO batch deductions. */
    actualBatchCost: string;
    /** actualBatchCost − glCost (positive = GL understated, negative = GL overstated). */
    drift: string;
    message: string;
}

/**
 * Detect any divergence between GL-posted COGS and actual batch deduction costs.
 *
 * @param itemsWithCosts  Sale items as recorded in the GL (costPrice is per selling unit).
 * @param actualBatchCostMap  Map<productId, Decimal> accumulated during the physical deduction loop.
 * @returns Array of CogsDriftResult for every item where |drift| > 0.01.
 *          Returns an empty array when everything is in sync.
 */
export function detectCogsDrift(
    itemsWithCosts: CogsDriftItem[],
    actualBatchCostMap: Map<string, Decimal>
): CogsDriftResult[] {
    const drifts: CogsDriftResult[] = [];

    for (const item of itemsWithCosts) {
        // Custom / service items never touch inventory_batches — skip
        if (item.productId?.startsWith('custom_')) continue;

        const actualCost = actualBatchCostMap.get(item.productId);
        // No entry = item was skipped during deduction (service, custom) — skip
        if (actualCost === undefined) continue;

        // GL cost = what was posted to ledger_entries as the inventory credit
        const glCost = new Decimal(item.costPrice || 0).times(new Decimal(item.quantity));
        const drift = actualCost.minus(glCost);

        if (drift.abs().greaterThan(0.01)) {
            drifts.push({
                productId: item.productId,
                productName: item.productName,
                glCost: glCost.toFixed(2),
                actualBatchCost: actualCost.toFixed(2),
                drift: drift.toFixed(2),
                message:
                    `ACCOUNTING ALERT: Inventory cost mismatch for "${item.productName}" — ` +
                    `GL posted ${glCost.toFixed(2)} but actual batch deduction was ${actualCost.toFixed(2)} ` +
                    `(drift: ${drift.toFixed(2)}). Run an inventory integrity check.`,
            });
        }
    }

    return drifts;
}
