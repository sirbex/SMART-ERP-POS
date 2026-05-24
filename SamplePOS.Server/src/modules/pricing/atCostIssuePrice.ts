/**
 * AT_COST unit price from the same FEFO/FIFO issue preview used for sale COGS.
 * Charge per base unit = total layer cost / base quantity (not master cost_price).
 *
 * REGRESSION: atCostIssuePrice.test.ts + npm run test:at-cost-regression
 * CONTRACT: AT_COST_FIFO_INTEGRITY.md
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

/** One FIFO/FEFO consumption segment at a single batch unit cost. */
export interface FefoIssueLayerSegment {
    baseQuantity: number;
    unitCostPerBase: number;
    totalCost: number;
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

/**
 * FIFO/FEFO layer walk — one segment per batch cost consumed (e.g. 1@20000 + 1@18000).
 */
export async function previewFefoIssueLayers(
    conn: Pool | PoolClient,
    productId: string,
    baseQty: Decimal,
): Promise<FefoIssueLayerSegment[]> {
    const fefoPreview = await conn.query<{ remaining_quantity: string; cost_price: string }>(
        FEFO_BATCH_QUERY,
        [productId],
    );

    const segments: FefoIssueLayerSegment[] = [];
    let remainingForCost = baseQty;

    for (const b of fefoPreview.rows) {
        if (remainingForCost.lessThanOrEqualTo(0)) break;
        const batchAvail = new Decimal(b.remaining_quantity);
        const take = Decimal.min(remainingForCost, batchAvail);
        if (take.lessThanOrEqualTo(0)) continue;

        const unitCost = new Decimal(b.cost_price);
        segments.push({
            baseQuantity: Money.toNumber(take),
            unitCostPerBase: Money.toNumber(Money.round(unitCost)),
            totalCost: Money.toNumber(Money.round(take.times(unitCost))),
        });
        remainingForCost = remainingForCost.minus(take);
    }

    return segments;
}

function fallbackUnitCost(valuation: ProductValuationForAtCost): Decimal {
    const avg = Money.parseDb(valuation.averageCost);
    const master = Money.parseDb(valuation.costPrice);
    return avg.greaterThan(0) ? avg : master;
}

/**
 * Resolved AT_COST price per base unit for the requested base quantity.
 */
export async function resolveAtCostWithLayers(
    conn: Pool | PoolClient,
    productId: string,
    baseQuantity: number,
    valuation: ProductValuationForAtCost,
): Promise<{
    unitPricePerBase: number;
    ruleName: string;
    layers: FefoIssueLayerSegment[];
}> {
    const method = (valuation.costingMethod || 'FIFO') as CostingMethod;
    const masterCost = Money.parseDb(valuation.costPrice);
    const baseQty = new Decimal(baseQuantity);

    if (method === 'AVCO' || method === 'STANDARD') {
        const unit = fallbackUnitCost(valuation);
        const unitNum = Money.toNumber(Money.round(unit));
        const label = method === 'AVCO' ? 'At Cost (average)' : 'At Cost (standard)';
        const qty = Math.max(baseQuantity, 0);
        return {
            unitPricePerBase: unitNum,
            ruleName: label,
            layers:
                qty > 0
                    ? [{ baseQuantity: qty, unitCostPerBase: unitNum, totalCost: Money.toNumber(unit.times(baseQty)) }]
                    : [],
        };
    }

    if (baseQty.lessThanOrEqualTo(0)) {
        const unitNum = Money.toNumber(Money.round(masterCost));
        return {
            unitPricePerBase: unitNum,
            ruleName: 'At Cost (FIFO issue)',
            layers: [],
        };
    }

    let segments = await previewFefoIssueLayers(conn, productId, baseQty);
    const covered = segments.reduce((s, l) => s + l.baseQuantity, 0);
    const shortfall = baseQuantity - covered;

    if (shortfall > 0.001) {
        const shortfallUnit = Money.toNumber(fallbackUnitCost(valuation));
        segments = [
            ...segments,
            {
                baseQuantity: shortfall,
                unitCostPerBase: shortfallUnit,
                totalCost: Money.toNumber(new Decimal(shortfall).times(shortfallUnit)),
            },
        ];
        logger.warn('[AT_COST] FEFO batches insufficient for layer preview — shortfall segment added', {
            productId,
            requestedBaseQty: baseQty.toFixed(4),
            shortfall: shortfall.toFixed(4),
        });
    }

    const totalCost = segments.reduce((s, l) => s + l.totalCost, 0);
    const perBase = baseQty.greaterThan(0)
        ? Money.toNumber(Money.round(new Decimal(totalCost).dividedBy(baseQty)))
        : Money.toNumber(Money.round(masterCost));

    return {
        unitPricePerBase: perBase,
        ruleName: 'At Cost (FIFO issue)',
        layers: segments,
    };
}

export async function resolveAtCostPerBaseUnit(
    conn: Pool | PoolClient,
    productId: string,
    baseQuantity: number,
    valuation: ProductValuationForAtCost,
): Promise<{ unitPricePerBase: number; ruleName: string }> {
    const resolved = await resolveAtCostWithLayers(conn, productId, baseQuantity, valuation);
    return {
        unitPricePerBase: resolved.unitPricePerBase,
        ruleName: resolved.ruleName,
    };
}
