import type { StockProductUom } from '../../utils/quotationStockProduct';
import { displayProductUomName } from '../../utils/quotationStockProduct';
import { useMasterUoms } from '../../hooks/useMasterUoms';
import { displayMasterUomName } from '../../utils/quotationUom';
import { UomSelector } from '../inventory/UomSelector';

interface QuotationLineUomSelectProps {
  productId?: string;
  uomId?: string | null;
  uomName?: string | null;
  /** POS catalog UoMs from stock-levels — selling price + conversion (preferred for product lines). */
  availableUoms?: StockProductUom[];
  /** When true, switching UoM uses catalog cost (AT_COST customers). */
  atCost?: boolean;
  disabled?: boolean;
  className?: string;
  inputRef?: (el: HTMLSelectElement | null) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLSelectElement>) => void;
  onChange: (uomId: string | null, uomName: string, unitPrice?: number) => void;
}

/**
 * Quotation line UoM:
 * - Product lines with catalog UoMs: POS-style selling unit + price (stock-levels)
 * - Product lines without catalog: product MUoM dropdown (UomSelector) — legacy
 * - Custom lines: master UoM list only
 */
export function QuotationLineUomSelect({
  productId,
  uomId,
  uomName,
  availableUoms,
  atCost = false,
  disabled = false,
  className = '',
  inputRef,
  onKeyDown,
  onChange,
}: QuotationLineUomSelectProps) {
  const { data: masterUoms = [], isLoading } = useMasterUoms();
  const selectClass =
    className ||
    'w-full px-2 py-1 text-sm border border-transparent hover:border-gray-300 focus:border-blue-500 rounded focus:ring-1 focus:ring-blue-500 bg-transparent';

  if (productId && availableUoms && availableUoms.length > 0) {
    const baseUom = availableUoms.find((u) => u.isDefault) || availableUoms[0];
    const baseLabel = displayProductUomName(baseUom);
    const value = uomId || '';

    return (
      <select
        ref={inputRef}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const id = e.target.value;
          const selected = availableUoms.find((u) => u.uomId === id);
          if (!selected) return;
          const resolvedId = selected.uomId.startsWith('default-') ? null : selected.uomId;
          const sell = Number(selected.price) || 0;
          const cost = Number(selected.cost) || 0;
          const unitPrice = atCost ? (cost > 0 ? cost : sell) : sell;
          onChange(resolvedId, displayProductUomName(selected), unitPrice);
        }}
        onKeyDown={onKeyDown}
        aria-label="Unit of measure"
        className={selectClass}
      >
        {availableUoms.map((u) => (
          <option key={u.uomId} value={u.uomId}>
            {u.isDefault
              ? `${displayProductUomName(u)} (Base)`
              : `1 ${displayProductUomName(u)} = ${Number(u.conversionFactor)} ${baseLabel}`}
          </option>
        ))}
      </select>
    );
  }

  if (productId) {
    return (
      <UomSelector
        productId={productId}
        baseCost={0}
        selectedUomId={uomId}
        disabled={disabled}
        className={selectClass}
        onChange={({ uomId: id, uomName: name }) => onChange(id, name)}
      />
    );
  }

  const selectValue = uomId || '';

  return (
    <select
      ref={inputRef}
      value={selectValue}
      disabled={disabled || isLoading || masterUoms.length === 0}
      onChange={(e) => {
        const id = e.target.value;
        if (!id) {
          onChange(null, '');
          return;
        }
        const selected = masterUoms.find((u) => u.id === id);
        if (selected) {
          onChange(selected.id, displayMasterUomName(selected));
        }
      }}
      onKeyDown={onKeyDown}
      aria-label="Unit of measure"
      className={selectClass}
    >
      <option value="">{isLoading ? 'Loading…' : 'Select UoM…'}</option>
      {masterUoms.map((u) => (
        <option key={u.id} value={u.id}>
          {displayMasterUomName(u)}
          {u.symbol && u.symbol !== u.name ? ` (${u.name})` : ''}
        </option>
      ))}
      {!selectValue && uomName?.trim() && (
        <option value="" disabled>
          {uomName} (select from list)
        </option>
      )}
    </select>
  );
}
