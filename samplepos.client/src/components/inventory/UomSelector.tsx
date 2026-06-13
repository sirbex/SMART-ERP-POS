/**
 * Reusable UoM Selector Component
 *
 * Follows the canonical ERP MUoM rule:
 * Display unit cost = base-unit cost × factorToBase (or costOverride if set).
 *
 * Cost is computed LOCALLY and synchronously via computeUnitCost(),
 * never derived from an async server-side displayCost. This ensures
 * the cost is always correct immediately on UOM selection.
 *
 * Used in: Purchase Orders, Goods Receipts, Products Management
 */

import { useEffect, useMemo, useRef } from 'react';
import { useProductWithUoms, type ProductUomDetail } from '../../hooks/useProductWithUoms';
import { computeUnitCost } from '../../utils/uom';

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
  /** Pre-fetched UoMs — when provided, skips the per-product API call */
  prefetchedUoms?: ProductUomDetail[];
}

export function UomSelector({
  productId,
  baseCost,
  selectedUomId,
  disabled = false,
  onChange,
  className = '',
  prefetchedUoms,
}: UomSelectorProps) {
  const { data: productWithUoms } = useProductWithUoms(prefetchedUoms ? undefined : productId);
  const uoms = useMemo(
    () => prefetchedUoms || productWithUoms?.uoms || [],
    [prefetchedUoms, productWithUoms],
  );

  // Track whether we've already synced cost for the current selectedUomId
  const syncedUomRef = useRef<string | null>(null);
  // Keep a stable ref to onChange to avoid triggering useEffect on every render
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const baseUomLabel = useMemo(() => {
    const baseUom = uoms.find((u) => u.isDefault) || uoms[0];
    return baseUom ? (baseUom.uomSymbol || baseUom.uomName) : 'Base';
  }, [uoms]);

  // When server UOM data loads with a pre-selected UOM,
  // ensure the parent's displayed cost reflects baseCost × factor, computed locally.
  useEffect(() => {
    if (uoms.length === 0) return;

    if (!selectedUomId) return;

    // Only fire once per UOM selection to avoid infinite loops
    if (syncedUomRef.current === selectedUomId) return;

    // Match by master uomId (uoms table PK) or product_uoms.id for backward compat
    const selected = uoms.find(u => u.uomId === selectedUomId || u.id === selectedUomId);
    if (!selected) {
      // Orphan selection (e.g. products.purchase_uom_id not in product_uoms) — fall back to base
      syncedUomRef.current = '__orphan__';
      onChangeRef.current({
        uomId: null,
        newCost: computeUnitCost(baseCost),
        conversionFactor: '1',
        uomName: 'Base UoM',
      });
      return;
    }

    syncedUomRef.current = selectedUomId;

    // Display cost = baseCost × factor (or costOverride if set)
    // CRITICAL: Return selected.uomId (master uoms.id), NOT selected.id (product_uoms.id)
    // purchase_order_items.uom_id FK references uoms(id)
    onChangeRef.current({
      uomId: selected.uomId,
      newCost: computeUnitCost(baseCost, selected.conversionFactor, selected.costOverride),
      conversionFactor: String(selected.conversionFactor),
      uomName: selected.uomName,
    });
  }, [selectedUomId, uoms, baseCost]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;

    if (uoms.length === 0) return;

    // Reset sync tracker so the effect can work for the new selection
    syncedUomRef.current = value || null;

    // Revert to base UoM
    if (value === '') {
      onChange({
        uomId: null,
        newCost: computeUnitCost(baseCost),
        conversionFactor: '1',
        uomName: 'Base UoM',
      });
      return;
    }

    // Match by master uomId (uoms.id) or product_uoms.id for backward compat
    const selected = uoms.find(u => u.uomId === value || u.id === value);
    if (!selected) return;

    // Display cost = baseCost × factor (or costOverride if set)
    // CRITICAL: Return selected.uomId (master uoms.id), NOT selected.id (product_uoms.id)
    // purchase_order_items.uom_id FK references uoms(id)
    onChange({
      uomId: selected.uomId,
      newCost: computeUnitCost(baseCost, selected.conversionFactor, selected.costOverride),
      conversionFactor: String(selected.conversionFactor),
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
        <option key={u.uomId} value={u.uomId}>
          {u.isDefault
            ? `${u.uomSymbol || u.uomName} (Base)`
            : `1 ${u.uomSymbol || u.uomName} = ${parseFloat(u.conversionFactor).toString()} ${baseUomLabel}`}
        </option>
      ))}
    </select>
  );
}
