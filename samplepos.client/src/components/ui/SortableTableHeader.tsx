/**
 * Reusable clickable column header — same UX as General Ledger & Reorder Dashboard.
 * Click: sort asc → click again: sort desc. Inactive columns show ⇅ hint.
 */

export type SortDirection = 'asc' | 'desc';

export interface SortableTableHeaderProps {
  label: string;
  field: string;
  activeField: string;
  direction: SortDirection;
  onSort: (field: string) => void;
  align?: 'left' | 'right' | 'center';
  /** e.g. outstanding-balance filter active on this column */
  filtered?: boolean;
  className?: string;
}

function SortIndicator({
  active,
  direction,
  filtered,
}: {
  active: boolean;
  direction: SortDirection;
  filtered?: boolean;
}) {
  return (
    <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] font-normal normal-case tracking-normal">
      {active ? (
        <span className="text-blue-600">{direction === 'asc' ? '▲' : '▼'}</span>
      ) : (
        <span className="text-gray-400 opacity-70">⇅</span>
      )}
      {filtered && (
        <span className="rounded bg-amber-100 px-1 text-amber-800" title="Filter active">
          filter
        </span>
      )}
    </span>
  );
}

export function SortableTableHeader({
  label,
  field,
  activeField,
  direction,
  onSort,
  align = 'left',
  filtered = false,
  className = '',
}: SortableTableHeaderProps) {
  const active = activeField === field;
  const alignClass =
    align === 'right' ? 'justify-end text-right' : align === 'center' ? 'justify-center text-center' : 'text-left';

  return (
    <th
      scope="col"
      className={`px-3 sm:px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 whitespace-nowrap ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex w-full items-center gap-0.5 select-none cursor-pointer touch-manipulation min-h-[44px] sm:min-h-0 hover:text-blue-600 active:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded ${alignClass} ${active ? 'text-blue-700' : ''}`}
        aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <span className="truncate">{label}</span>
        <SortIndicator active={active} direction={direction} filtered={filtered} />
      </button>
    </th>
  );
}
