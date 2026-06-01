/**
 * COGS Drift Guard — Pure utility
 *
 * Compares GL-posted COGS (FEFO preview at sale build) against the actual
 * cost of batches physically deducted (FOR UPDATE) within the same sale
 * transaction.
 *
 * Prefer `allocatedTotalCost` (preview total in base units) over
 * costPrice × selling quantity — avoids per-selling-unit rounding drift.
 */

import Decimal from 'decimal.js';

/** Whole-currency tolerance (UGX has 0 display decimals). */
export const COGS_DRIFT_TOLERANCE = 1;

/** Minimal slice of CreateSaleItemData that the guard needs. */
export interface CogsDriftItem {
    productId: string;
    productName: string;
    /** Cost per selling-UoM unit (for GL line display). */
    costPrice: number;
    /** Quantity in selling-UoM units. */
    quantity: number;
    /** Total FEFO cost allocated at sale build (base-unit walk). Prefer over costPrice×qty. */
    allocatedTotalCost?: number;
}

export interface CogsDriftResult {
    productId: string;
    productName: string;
    glCost: string;
    actualBatchCost: string;
    drift: string;
    message: string;
}

function glCostForItem(item: CogsDriftItem): Decimal {
    if (item.allocatedTotalCost != null && Number.isFinite(item.allocatedTotalCost)) {
        return new Decimal(item.allocatedTotalCost);
    }
    return new Decimal(item.costPrice || 0).times(new Decimal(item.quantity));
}

/**
 * Detect divergence between GL-posted COGS and actual batch deduction costs.
 * Aggregates multiple sale lines for the same productId before comparing.
 */
export function detectCogsDrift(
    itemsWithCosts: CogsDriftItem[],
    actualBatchCostMap: Map<string, Decimal>,
): CogsDriftResult[] {
    const glByProduct = new Map<string, { total: Decimal; productName: string }>();

    for (const item of itemsWithCosts) {
        if (item.productId?.startsWith('custom_')) continue;

        const lineGl = glCostForItem(item);
        const existing = glByProduct.get(item.productId);
        if (existing) {
            existing.total = existing.total.plus(lineGl);
        } else {
            glByProduct.set(item.productId, {
                total: lineGl,
                productName: item.productName,
            });
        }
    }

    const drifts: CogsDriftResult[] = [];

    for (const [productId, { total: glCost, productName }] of glByProduct) {
        const actualCost = actualBatchCostMap.get(productId);
        if (actualCost === undefined) continue;

        const drift = actualCost.minus(glCost);

        if (drift.abs().greaterThan(COGS_DRIFT_TOLERANCE)) {
            drifts.push({
                productId,
                productName,
                glCost: glCost.toFixed(2),
                actualBatchCost: actualCost.toFixed(2),
                drift: drift.toFixed(2),
                message:
                    `ACCOUNTING ALERT: Inventory cost mismatch for "${productName}" — ` +
                    `GL posted ${glCost.toFixed(2)} but actual batch deduction was ${actualCost.toFixed(2)} ` +
                    `(drift: ${drift.toFixed(2)}). Run an inventory integrity check.`,
            });
        }
    }

    return drifts;
}
