import { useMasterUoms } from '../../hooks/useMasterUoms';
import { displayMasterUomName } from '../../utils/quotationUom';
import { UomSelector } from '../inventory/UomSelector';

interface QuotationLineUomSelectProps {
  productId?: string;
  uomId?: string | null;
  uomName?: string | null;
  disabled?: boolean;
  className?: string;
  inputRef?: (el: HTMLSelectElement | null) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLSelectElement>) => void;
  onChange: (uomId: string | null, uomName: string) => void;
}

/**
 * Quotation line UoM:
 * - Product lines: product MUoM dropdown (UomSelector)
 * - Custom lines: master UoM list only (no free-text duplicates)
 */
export function QuotationLineUomSelect({
  productId,
  uomId,
  uomName,
  disabled = false,
  className = '',
  inputRef,
  onKeyDown,
  onChange,
}: QuotationLineUomSelectProps) {
  const { data: masterUoms = [], isLoading } = useMasterUoms();

  if (productId) {
    return (
      <UomSelector
        productId={productId}
        baseCost={0}
        selectedUomId={uomId}
        disabled={disabled}
        className={
          className ||
          'w-full px-2 py-1 text-sm border border-transparent hover:border-gray-300 focus:border-blue-500 rounded focus:ring-1 focus:ring-blue-500 bg-transparent'
        }
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
      className={
        className ||
        'w-full px-2 py-1 text-sm border border-transparent hover:border-gray-300 focus:border-blue-500 rounded focus:ring-1 focus:ring-blue-500 bg-transparent'
      }
    >
      <option value="">{isLoading ? 'Loading…' : 'Select UoM…'}</option>
      {masterUoms.map((u) => (
        <option key={u.id} value={u.id}>
          {displayMasterUomName(u)}
          {u.symbol && u.symbol !== u.name ? ` (${u.name})` : ''}
        </option>
      ))}
      {/* Legacy row saved with name only — show until user picks canonical UoM */}
      {!selectValue && uomName?.trim() && (
        <option value="" disabled>
          {uomName} (select from list)
        </option>
      )}
    </select>
  );
}
