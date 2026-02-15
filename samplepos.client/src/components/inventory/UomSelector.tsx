/**
 * Reusable UoM Selector Component
 * 
 * Ensures consistent UoM selection behavior across all pages:
 * - Purchase Orders
 * - Goods Receipts
 * - Products Management
 * 
 * Features:
 * - Auto-calculates cost when UoM changes (baseCost × conversionFactor)
 * - Handles cost overrides
 * - Sanity checks for incorrect displayCost values
 * - Persists selected UoM
 * - Converts quantities to base units for storage
 */

import { useProductWithUoms } from '../../hooks/useProductWithUoms';
import { computeUnitCost } from '../../utils/uom';
import Decimal from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

interface UomSelectorProps {
  productId: string;
  baseCost: number | string;
  selectedUomId?: string | null;
  disabled?: boolean;
  onChange: (params: {
    uomId: string | null;
    newCost: string;
    conversionFactor: string;
    uomName: string;
  }) => void;
  className?: string;
}

export function UomSelector({
  productId,
  baseCost,
  selectedUomId,
  disabled = false,
  onChange,
  className = '',
}: UomSelectorProps) {
  const { data: productWithUoms } = useProductWithUoms(productId);
  const uoms = productWithUoms?.uoms || [];

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    
    if (!productWithUoms) return;

    // Handle clearing to Base UoM
    if (value === '') {
      const baseUnitCost = new Decimal(baseCost || 0).toFixed(2);
      onChange({
        uomId: null,
        newCost: baseUnitCost,
        conversionFactor: '1',
        uomName: 'Base UoM',
      });
      return;
    }

    const selected = uoms.find(u => u.id === value);
    
    if (!selected) return;

    // Use pre-computed displayCost from server with fallback
    let newCostStr = selected.displayCost;
    if (!newCostStr || newCostStr === '') {
      // Fallback: compute cost = baseCost × factor, or override when provided
      newCostStr = computeUnitCost(baseCost, selected.conversionFactor, selected.costOverride);
    } else {
      // Sanity check: if displayCost equals base cost but factor > 1, recalculate
      const baseCostNum = parseFloat(baseCost?.toString() || '0');
      const displayCost = parseFloat(newCostStr);
      const factor = parseFloat(selected.conversionFactor || '1');
      
      if (factor > 1 && Math.abs(displayCost - baseCostNum) < 0.01) {
        newCostStr = computeUnitCost(baseCostNum, factor, selected.costOverride);
      }
    }

    onChange({
      uomId: value,
      newCost: new Decimal(parseFloat(newCostStr || '0')).toFixed(2),
      conversionFactor: selected.conversionFactor,
      uomName: selected.uomName,
    });
  };

  // Always show at least "Base UoM" option, even if no additional UoMs configured
  return (
    <select
      value={selectedUomId || ''}
      onChange={handleChange}
      disabled={disabled}
      className={className || 'ml-2 px-2 py-1 text-xs border border-gray-300 rounded'}
      aria-label="Unit of Measure"
    >
      <option value="">Base UoM</option>
      {uoms.map((u) => (
        <option key={u.id} value={u.id}>
          {u.uomSymbol || u.uomName} × {parseFloat(u.conversionFactor).toString()}
        </option>
      ))}
    </select>
  );
}
