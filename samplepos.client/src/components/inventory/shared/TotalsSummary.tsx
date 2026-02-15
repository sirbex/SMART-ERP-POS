import { formatCurrency } from "@/utils/currency";

interface TotalsSummaryProps {
  itemCount: number;
  subtotal: number;
  avgCost?: number;
  className?: string;
}

/**
 * Shared Totals Summary Component
 * Used in: Purchase Orders, Manual Goods Receipt
 * Displays item count, subtotal, and average cost in consistent cards
 */
export function TotalsSummary({
  itemCount,
  subtotal,
  avgCost,
  className = "",
}: TotalsSummaryProps) {
  return (
    <div className={`grid grid-cols-3 gap-4 ${className}`}>
      <div className="bg-blue-50 rounded-lg p-3">
        <div className="text-xs text-blue-600 mb-1">Items Count</div>
        <div className="text-lg font-bold text-blue-900">{itemCount}</div>
      </div>
      <div className="bg-green-50 rounded-lg p-3">
        <div className="text-xs text-green-600 mb-1">Subtotal</div>
        <div className="text-lg font-bold text-green-900">{formatCurrency(subtotal)}</div>
      </div>
      {avgCost !== undefined && (
        <div className="bg-purple-50 rounded-lg p-3">
          <div className="text-xs text-purple-600 mb-1">Avg Cost/Item</div>
          <div className="text-lg font-bold text-purple-900">{formatCurrency(avgCost)}</div>
        </div>
      )}
    </div>
  );
}
