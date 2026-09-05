import type { SortDirection } from './SortableTableHeader';

export interface MobileSortOption {
  value: string;
  label: string;
}

interface MobileSortSelectProps {
  sortField: string;
  sortOrder: SortDirection;
  options: MobileSortOption[];
  onFieldChange: (field: string) => void;
  onToggleOrder: () => void;
  className?: string;
  /**
   * bar — touch select under toolbar (legacy).
   * menu — menuitems for AdaptiveMoreMenu (phone overflow SSOT; no blank band).
   */
  presentation?: 'bar' | 'menu';
}

/** Labels often say "Sort by X" for native <select>; menu must not double-prefix. */
export function formatMobileSortMenuLabel(label: string): string {
  const trimmed = label.trim();
  const stripped = trimmed.replace(/^Sort\s*:\s*/i, '').replace(/^Sort by\s+/i, '');
  return stripped ? `Sort by ${stripped}` : trimmed;
}

/**
 * Mobile list sort — SSOT.
 * Prefer presentation="menu" inside AdaptiveToolbar `more` (SAP/Square overflow).
 */
export function MobileSortSelect({
  sortField,
  sortOrder,
  options,
  onFieldChange,
  onToggleOrder,
  className = '',
  presentation = 'bar',
}: MobileSortSelectProps) {
  if (presentation === 'menu') {
    return (
      <div className={`contents sm:hidden ${className}`.trim()} data-mobile-sort-menu="true">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="menuitem"
            aria-current={sortField === opt.value ? 'true' : undefined}
            onClick={() => onFieldChange(opt.value)}
            data-mobile-sort-field={opt.value}
          >
            {sortField === opt.value ? '✓ ' : ''}
            {formatMobileSortMenuLabel(opt.label)}
          </button>
        ))}
        <button
          type="button"
          role="menuitem"
          onClick={onToggleOrder}
          data-mobile-sort-order="true"
        >
          Order: {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
        </button>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 sm:hidden ${className}`}>
      <select
        value={sortField}
        onChange={(e) => onFieldChange(e.target.value)}
        className="flex-1 min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm touch-manipulation"
        aria-label="Sort list"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onToggleOrder}
        className="min-h-[44px] min-w-[44px] rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium touch-manipulation active:bg-gray-50"
        aria-label={sortOrder === 'asc' ? 'Sort ascending' : 'Sort descending'}
        title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
      >
        {sortOrder === 'asc' ? '▲' : '▼'}
      </button>
    </div>
  );
}
