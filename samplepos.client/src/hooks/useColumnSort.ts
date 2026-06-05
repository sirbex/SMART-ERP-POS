import { useCallback, useState } from 'react';
import type { SortDirection } from '../components/ui/SortableTableHeader';

/**
 * Shared column sort state — GL / Reorder Dashboard pattern for any data table.
 */
export function useColumnSort<T extends string>(
  defaultField: T,
  defaultOrder: SortDirection = 'asc',
) {
  const [sortField, setSortField] = useState<T>(defaultField);
  const [sortOrder, setSortOrder] = useState<SortDirection>(defaultOrder);

  const handleSort = useCallback(
    (field: T, options?: { defaultOrder?: SortDirection }) => {
      if (sortField === field) {
        setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortOrder(options?.defaultOrder ?? 'asc');
      }
    },
    [sortField],
  );

  const resetSort = useCallback(() => {
    setSortField(defaultField);
    setSortOrder(defaultOrder);
  }, [defaultField, defaultOrder]);

  return {
    sortField,
    sortOrder,
    setSortField,
    setSortOrder,
    handleSort,
    resetSort,
  };
}
