/**
 * AT_COST unit price from the same FEFO/FIFO issue preview used for sale COGS.
 * Charge per base unit = total layer cost / base quantity (not master cost_price).
 */
import type { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { Money } from '../../utils/money.js';
import logger from '../../utils/logger.js';

export type CostingMethod = 'FIFO' | 'AVCO' | 'STANDARD';

export interface ProductValuationForAtCost {
    sellingPrice: string;
    costPrice: string;
    averageCost: string;
    costingMethod: CostingMethod;
}

const FEFO_BATCH_QUERY = `
    SELECT remaining_quantity, cost_price
    FROM inventory_batches
    WHERE product_id = $1 AND remaining_quantity > 0 AND status = 'ACTIVE'
      AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
    ORDER BY expiry_date ASC NULLS LAST, received_date ASC`;

export interface FefoIssuePreview {
    totalCost: Decimal;
    coveredQty: Decimal;
    shortfall: Decimal;
}

/** Walk inventory_batches in FEFO order (same as salesService COGS preview). */
export async function previewFefoIssueCostForBaseQty(
    conn: Pool | PoolClient,
    productId: string,
    baseQty: Decimal,
): Promise<FefoIssuePreview> {
    const fefoPreview = await conn.query<{ remaining_quantity: string; cost_price: string }>(
        FEFO_BATCH_QUERY,
        [productId],
    );

    let remainingForCost = baseQty;
    let totalCost = new Decimal(0);

    for (const b of fefoPreview.rows) {
        if (remainingForCost.lessThanOrEqualTo(0)) break;
        const batchAvail = new Decimal(b.remaining_quantity);
        const take = Decimal.min(remainingForCost, batchAvail);
        totalCost = totalCost.plus(take.times(new Decimal(b.cost_price)));
        remainingForCost = remainingForCost.minus(take);
    }

    const coveredQty = baseQty.minus(remainingForCost);
    return {
        totalCost,
        coveredQty,
        shortfall: remainingForCost.greaterThan(0) ? remainingForCost : new Decimal(0),
    };
}

function fallbackUnitCost(valuation: ProductValuationForAtCost): Decimal {
    const avg = Money.parseDb(valuation.averageCost);
    const master = Money.parseDb(valuation.costPrice);
    return avg.greaterThan(0) ? avg : master;
}

/**
 * Resolved AT_COST price per base unit for the requested base quantity.
 */
export async function resolveAtCostPerBaseUnit(
    conn: Pool | PoolClient,
    productId: string,
    baseQuantity: number,
    valuation: ProductValuationForAtCost,
): Promise<{ unitPricePerBase: number; ruleName: string }> {
    const method = (valuation.costingMethod || 'FIFO') as CostingMethod;
    const masterCost = Money.parseDb(valuation.costPrice);

    if (method === 'AVCO' || method === 'STANDARD') {
        const unit = fallbackUnitCost(valuation);
        const label = method === 'AVCO' ? 'At Cost (average)' : 'At Cost (standard)';
        return {
            unitPricePerBase: Money.toNumber(Money.round(unit)),
            ruleName: label,
        };
    }

    const baseQty = new Decimal(baseQuantity);
    if (baseQty.lessThanOrEqualTo(0)) {
        return {
            unitPricePerBase: Money.toNumber(Money.round(masterCost)),
            ruleName: 'At Cost (FIFO issue)',
        };
    }

    const { totalCost, shortfall } = await previewFefoIssueCostForBaseQty(conn, productId, baseQty);
    let lineCost = totalCost;

    if (shortfall.greaterThan(0.001)) {
        const shortfallUnit = fallbackUnitCost(valuation);
        lineCost = lineCost.plus(shortfall.times(shortfallUnit));
        logger.warn('[AT_COST] FEFO batches insufficient for issue-cost preview — shortfall priced at average/master', {
            productId,
            requestedBaseQty: baseQty.toFixed(4),
            shortfall: shortfall.toFixed(4),
        });
    }

    const perBase = lineCost.dividedBy(baseQty);
    return {
        unitPricePerBase: Money.toNumber(Money.round(perBase)),
        ruleName: 'At Cost (FIFO issue)',
    };
}
