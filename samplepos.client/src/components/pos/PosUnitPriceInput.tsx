import { formatCurrency } from '../../utils/currency';
import { isPosUnitPriceBelowCatalogCost, normalizePosUnitPrice } from '../../utils/posCartLine';

interface PosUnitPriceInputProps {
  value: number;
  /** Minimum allowed unit price (FEFO/cost floor for this line). */
  minUnitPrice: number;
  uomLabel: string;
  productName: string;
  atCostLine?: boolean;
  onChange: (unitPrice: number) => void;
  /** Fired on blur after normalize — use for validation toasts. */
  onCommit?: (unitPrice: number) => void;
  onFocus?: () => void;
  compact?: boolean;
  manualOverride?: boolean;
}

export default function PosUnitPriceInput({
  value,
  minUnitPrice,
  uomLabel,
  productName,
  atCostLine = false,
  onChange,
  onCommit,
  onFocus,
  compact = false,
  manualOverride = false,
}: PosUnitPriceInputProps) {
  const belowCost = isPosUnitPriceBelowCatalogCost(value, minUnitPrice);

  return (
    <div className={compact ? 'inline-flex flex-col items-end' : 'flex flex-col items-end'}>
      <input
        type="number"
        min={0}
        step={1}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        onBlur={(e) => {
          const normalized = normalizePosUnitPrice(parseFloat(e.target.value) || 0);
          onChange(normalized);
          onCommit?.(normalized);
        }}
        onFocus={onFocus}
        className={
          (compact ? 'w-20' : 'w-24 sm:w-28') +
          ' border rounded px-1 sm:px-2 py-1 text-right text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 ' +
          (belowCost ? 'border-red-500 bg-red-50 text-red-900' : 'border-gray-300')
        }
        aria-label={`Unit price per ${uomLabel} for ${productName}`}
        title={
          [
            manualOverride ? 'Manual unit price (kept until UoM changes).' : null,
            minUnitPrice > 0
              ? atCostLine
                ? `AT_COST issue floor (per ${uomLabel}): ${formatCurrency(minUnitPrice)}. Server enforces batch cost.`
                : `Cost floor (per ${uomLabel}): ${formatCurrency(minUnitPrice)}. Server enforces actual batch cost.`
              : null,
          ]
            .filter(Boolean)
            .join(' ') || undefined
        }
      />
      {!compact && (
        <div className="text-[10px] text-gray-500 mt-0.5">per {uomLabel}</div>
      )}
      {belowCost && minUnitPrice > 0 && (
        <div className="text-[10px] text-red-600 font-medium mt-0.5 whitespace-nowrap">
          Min {formatCurrency(minUnitPrice)}
        </div>
      )}
    </div>
  );
}
