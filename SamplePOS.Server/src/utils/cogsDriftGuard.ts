/**
 * COGS cost alignment — preview vs physical FEFO deduction.
 *
 * Enterprise rule: batches deducted under lock are the source of truth.
 * Preview may differ (concurrency, rounding); sales reconcile to actual
 * and log preview drift — they must not block checkout.
 *
 * Prefer `allocatedTotalCost` over costPrice × quantity for comparisons.
 */

import Decimal from 'decimal.js';
import { Money } from './money.js';

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

/** Line fields updated when reconciling to actual batch deduction. */
export interface ReconcilableSaleLine extends CogsDriftItem {
    lineTotal?: number;
    profit?: number;
}

export interface ReconcileSaleCostsResult {
    /** Preview vs actual mismatches (audit only — sale proceeds after reconcile). */
    previewDrifts: CogsDriftResult[];
    /** Sum of reconciled line costs (inventory + unchanged custom lines). */
    totalActualCost: Decimal;
}

/**
 * Rewrite sale line costs from locked FEFO deduction totals.
 * Call after physical batch deduction, before GL posting.
 */
export function reconcileSaleCostsToActualBatchDeduction(
    items: ReconcilableSaleLine[],
    actualBatchCostMap: Map<string, Decimal>,
): ReconcileSaleCostsResult {
    const previewDrifts = detectCogsDrift(items, actualBatchCostMap);

    const indicesByProduct = new Map<string, number[]>();
    items.forEach((item, index) => {
        if (item.productId?.startsWith('custom_')) return;
        const list = indicesByProduct.get(item.productId) ?? [];
        list.push(index);
        indicesByProduct.set(item.productId, list);
    });

    for (const [productId, indices] of indicesByProduct) {
        const actualTotal = actualBatchCostMap.get(productId);
        if (actualTotal === undefined) continue;

        const previewParts = indices.map((i) => glCostForItem(items[i]!));
        const previewSum = previewParts.reduce((s, p) => s.plus(p), new Decimal(0));

        let allocated = new Decimal(0);

        for (let j = 0; j < indices.length; j++) {
            const idx = indices[j]!;
            const item = items[idx]!;
            const isLast = j === indices.length - 1;

            let lineActual: Decimal;
            if (isLast) {
                lineActual = actualTotal.minus(allocated);
            } else if (previewSum.greaterThan(0)) {
                lineActual = actualTotal
                    .times(previewParts[j]!.dividedBy(previewSum))
                    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
                allocated = allocated.plus(lineActual);
            } else {
                lineActual = actualTotal
                    .dividedBy(indices.length)
                    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
                allocated = allocated.plus(lineActual);
            }

            const previewLine = previewParts[j]!;
            const costDelta = previewLine.minus(lineActual);

            item.allocatedTotalCost = Money.toNumber(Money.round(lineActual, 2));
            item.costPrice =
                item.quantity > 0
                    ? Money.toNumber(Money.round(lineActual.dividedBy(item.quantity), 2))
                    : 0;

            if (item.profit !== undefined) {
                item.profit = Money.toNumber(
                    Money.round(new Decimal(item.profit).plus(costDelta), 2),
                );
            }
        }
    }

    let totalActualCost = new Decimal(0);
    for (const item of items) {
        if (item.productId?.startsWith('custom_')) continue;
        totalActualCost = totalActualCost.plus(glCostForItem(item));
    }

    return { previewDrifts, totalActualCost };
}
