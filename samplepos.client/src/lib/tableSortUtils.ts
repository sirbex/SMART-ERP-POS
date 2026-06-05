import type { SortDirection } from '../components/ui/SortableTableHeader';

type SortValue = string | number | boolean | null | undefined;

/** Compare two row values for table column sort (asc/desc). */
export function compareSortValues(a: SortValue, b: SortValue, order: SortDirection): number {
  if (a == null && b == null) return 0;
  if (a == null) return order === 'asc' ? -1 : 1;
  if (b == null) return order === 'asc' ? 1 : -1;

  if (typeof a === 'string' && typeof b === 'string') {
    const cmp = a.toLowerCase().localeCompare(b.toLowerCase());
    return order === 'asc' ? cmp : -cmp;
  }

  if (typeof a === 'boolean' && typeof b === 'boolean') {
    const cmp = (a ? 1 : 0) - (b ? 1 : 0);
    return order === 'asc' ? cmp : -cmp;
  }

  const aNum = Number(a) || 0;
  const bNum = Number(b) || 0;
  if (aNum < bNum) return order === 'asc' ? -1 : 1;
  if (aNum > bNum) return order === 'asc' ? 1 : -1;
  return 0;
}

/** Client-side sort for list tables — shared across Customer/Inventory/Sales. */
export function applyTableSort<T>(
  rows: T[],
  sortField: string,
  sortOrder: SortDirection,
  accessors: Record<string, (row: T) => SortValue>,
): T[] {
  const accessor = accessors[sortField];
  if (!accessor) return rows;

  return [...rows].sort((a, b) => compareSortValues(accessor(a), accessor(b), sortOrder));
}
