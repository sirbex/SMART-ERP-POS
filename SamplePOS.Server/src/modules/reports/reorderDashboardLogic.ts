import Decimal from 'decimal.js';
import type { ReorderDashboardItem, ReorderPriority } from './reportTypes.js';

export interface ReorderPriorityInput {
  currentStock: number;
  unitsSold30d: number;
  effectiveVelocity: number;
  daysUntilStockout: number | null;
  leadTimeDays: number;
  reorderPoint: number;
  reorderLevel: number;
  qtyOnOrder: number;
}

/**
 * Single source of truth for reorder dashboard priority buckets.
 * Order matters: dead/inactive before urgent so counts stay ERP-consistent.
 */
export function classifyReorderPriority(input: ReorderPriorityInput): {
  priority: ReorderPriority;
  reason: string;
} {
  const {
    currentStock,
    unitsSold30d,
    effectiveVelocity,
    daysUntilStockout,
    leadTimeDays,
    reorderPoint,
    reorderLevel,
    qtyOnOrder,
  } = input;

  if (currentStock > 0 && unitsSold30d === 0) {
    return { priority: 'DEAD_STOCK', reason: 'In stock but zero sales in 30 days' };
  }

  if (
    currentStock <= 0 &&
    unitsSold30d === 0 &&
    effectiveVelocity <= 0 &&
    reorderLevel <= 0 &&
    qtyOnOrder <= 0
  ) {
    return { priority: 'DEAD_STOCK', reason: 'Out of stock with no recent sales — inactive SKU' };
  }

  if (currentStock <= 0) {
    if (qtyOnOrder > 0) {
      return {
        priority: 'URGENT',
        reason: `Out of stock — ${qtyOnOrder} unit(s) already on open PO`,
      };
    }
    if (effectiveVelocity > 0) {
      return { priority: 'URGENT', reason: 'Out of stock — immediate reorder (active sales movement)' };
    }
    if (reorderLevel > 0) {
      return { priority: 'URGENT', reason: 'Out of stock — reorder to minimum level' };
    }
  }

  if (effectiveVelocity > 0 && daysUntilStockout !== null && daysUntilStockout <= 2) {
    return {
      priority: 'URGENT',
      reason: `Will stock out in ${daysUntilStockout} day(s) at current movement`,
    };
  }

  if (effectiveVelocity > 0 && daysUntilStockout !== null && daysUntilStockout <= leadTimeDays) {
    return {
      priority: 'HIGH',
      reason: `${daysUntilStockout} days left vs ${leadTimeDays}-day supplier lead time`,
    };
  }

  if (currentStock > 0 && currentStock < reorderPoint && effectiveVelocity > 0) {
    return {
      priority: 'MEDIUM',
      reason: `Stock ${currentStock} below reorder point ${reorderPoint}`,
    };
  }

  return { priority: 'HEALTHY', reason: 'Adequate stock levels' };
}

/** Qty used for reorder cost and "items to reorder" — aligns with PO line builder */
export function effectiveReorderQty(item: {
  suggestedOrderQty: number;
  reorderPoint: number;
  currentStock: number;
  qtyOnOrder: number;
  reorderLevel: number;
}): number {
  if (item.suggestedOrderQty > 0) return item.suggestedOrderQty;
  const net = Math.ceil(item.reorderPoint - item.currentStock - item.qtyOnOrder);
  if (net > 0) return net;
  if (item.currentStock <= 0 && item.reorderLevel > 0) {
    return Math.ceil(item.reorderLevel);
  }
  return 0;
}

export function estimatedReorderCost(
  qty: number,
  costPrice: number | null
): number | null {
  if (qty <= 0 || costPrice == null || costPrice <= 0) return null;
  return new Decimal(qty).times(costPrice).toDecimalPlaces(2).toNumber();
}

export function buildReorderDashboardSummary(
  urgent: ReorderDashboardItem[],
  high: ReorderDashboardItem[],
  medium: ReorderDashboardItem[],
  deadStock: ReorderDashboardItem[]
) {
  const reorderCandidates = [...urgent, ...high, ...medium];
  const linesToReorder = reorderCandidates.filter((i) => effectiveReorderQty(i) > 0);

  const totalReorderCost = linesToReorder
    .reduce((sum, i) => {
      const qty = effectiveReorderQty(i);
      const cost = estimatedReorderCost(qty, i.costPrice) ?? 0;
      return sum.plus(cost);
    }, new Decimal(0))
    .toDecimalPlaces(2)
    .toNumber();

  const totalDeadStockValue = deadStock
    .reduce(
      (sum, i) => sum.plus(new Decimal(i.currentStock).times(i.costPrice ?? 0)),
      new Decimal(0)
    )
    .toDecimalPlaces(2)
    .toNumber();

  return {
    urgentCount: urgent.length,
    highCount: high.length,
    mediumCount: medium.length,
    deadStockCount: deadStock.length,
    itemsToReorderCount: linesToReorder.length,
    totalReorderCost,
    totalDeadStockValue,
  };
}
