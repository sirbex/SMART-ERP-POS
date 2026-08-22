import { formatCurrency } from '../../utils/currency';
import { isPosUnitPriceBelowCatalogCost, normalizePosUnitPrice } from '../../utils/posCartLine';
import { parseNumericPadValue } from '../../lib/numericPadLogic';
import { NumericSoftKeyboardInput } from '../keyboard/NumericSoftKeyboardInput';

interface PosUnitPriceInputProps {
  value: number;
  minUnitPrice: number;
  uomLabel: string;
  productName: string;
  atCostLine?: boolean;
  onChange: (unitPrice: number) => void;
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
  const display = Number.isFinite(value) ? String(value) : '0';

  const commit = (raw: string) => {
    const normalized = normalizePosUnitPrice(parseNumericPadValue(raw, 0));
    onChange(normalized);
    onCommit?.(normalized);
  };

  return (
    <div className={compact ? 'inline-flex flex-col items-end' : 'flex flex-col items-end'}>
      <NumericSoftKeyboardInput
        mode="decimal"
        value={display}
        onChange={(raw) => onChange(parseNumericPadValue(raw, 0))}
        onCommit={commit}
        onFocus={onFocus}
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
        className={
          (compact ? 'w-20' : 'w-24 sm:w-28') +
          ' border rounded px-1 sm:px-2 py-1 text-right text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 ' +
          (belowCost ? 'border-red-500 bg-red-50 text-red-900' : 'border-gray-300')
        }
        toggleClassName="h-7 w-7"
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
