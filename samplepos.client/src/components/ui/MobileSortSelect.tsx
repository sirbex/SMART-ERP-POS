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
}

/** Touch-friendly sort control for mobile card views (sm:hidden). */
export function MobileSortSelect({
  sortField,
  sortOrder,
  options,
  onFieldChange,
  onToggleOrder,
  className = '',
}: MobileSortSelectProps) {
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
