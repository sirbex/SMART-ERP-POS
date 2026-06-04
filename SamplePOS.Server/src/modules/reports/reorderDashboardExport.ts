import type { ReorderDashboardItem } from './reportTypes.js';
import { effectiveReorderQty, estimatedReorderCost } from './reorderDashboardLogic.js';

export interface ReorderExportRow {
  name: string;
  category: string;
  currentStock: number;
  qtyOnOrder: number;
  unitsSold30d: number;
  dailySalesVelocity: number;
  daysUntilStockout: string;
  orderQty: number;
  estCost: number;
  priority: string;
  reason: string;
  preferredSupplier: string;
}

export function buildReorderExportRows(lines: ReorderDashboardItem[]): ReorderExportRow[] {
  return lines.map((i) => {
    const orderQty = effectiveReorderQty(i);
    return {
      name: i.name,
      category: i.category?.trim() || '—',
      currentStock: i.currentStock,
      qtyOnOrder: i.qtyOnOrder,
      unitsSold30d: i.unitsSold30d,
      dailySalesVelocity: i.dailySalesVelocity,
      daysUntilStockout:
        i.daysUntilStockout !== null ? String(i.daysUntilStockout) : '—',
      orderQty,
      estCost: estimatedReorderCost(orderQty, i.costPrice) ?? 0,
      priority: i.priority === 'DEAD_STOCK' ? 'DEAD' : i.priority,
      reason: i.reason,
      preferredSupplier: i.preferredSupplier ?? '—',
    };
  });
}

function csvCell(value: string | number): string {
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** CSV export rows — category included, no SKU */
export function buildReorderDashboardCsv(lines: ReorderDashboardItem[]): string {
  const headers = [
    'Product',
    'Category',
    'Stock',
    'On PO',
    'Sold 30d',
    'Daily Avg',
    'Days Left',
    'Order Qty',
    'Est. Cost',
    'Priority',
    'Reason',
    'Supplier',
  ];
  const rows = buildReorderExportRows(lines).map((r) =>
    [
      r.name,
      r.category,
      r.currentStock,
      r.qtyOnOrder,
      r.unitsSold30d,
      r.dailySalesVelocity,
      r.daysUntilStockout,
      r.orderQty,
      r.estCost,
      r.priority,
      r.reason,
      r.preferredSupplier,
    ]
      .map(csvCell)
      .join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}
