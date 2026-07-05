import type { ReactNode } from 'react';
import { ResponsiveTableWrapper } from '../ui/ResponsiveTableWrapper';

export interface DataTableColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** When false the column is omitted entirely (e.g. multistore-only columns). */
  visible?: boolean;
  align?: 'left' | 'right' | 'center';
  headerClassName?: string;
  cellClassName?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowKey: (row: T) => string;
  emptyMessage?: string;
  isLoading?: boolean;
  loadingMessage?: string;
  className?: string;
  stickyHeader?: boolean;
  rowClassName?: string | ((row: T) => string);
}

const alignClass = (align: DataTableColumn<unknown>['align']) => {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
};

/**
 * Column-driven data grid — pass pre-flattened row objects from page-level fetches.
 * Conditional columns use `visible: false` so headers never leak for single-store tenants.
 */
export function DataTable<T>({
  columns,
  data,
  getRowKey,
  emptyMessage = 'No records found.',
  isLoading = false,
  loadingMessage = 'Loading…',
  className = '',
  stickyHeader = false,
  rowClassName,
}: DataTableProps<T>) {
  const visibleColumns = columns.filter((col) => col.visible !== false);
  const colSpan = visibleColumns.length || 1;

  return (
    <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
      <ResponsiveTableWrapper>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className={`bg-gray-50 ${stickyHeader ? 'sticky top-0 z-10' : ''}`}>
            <tr>
              {visibleColumns.map((col) => (
                <th
                  key={col.id}
                  scope="col"
                  className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap ${alignClass(col.align)} ${col.headerClassName ?? ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {isLoading ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-6 text-center text-gray-500 text-sm">
                  {loadingMessage}
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-6 text-center text-gray-500 text-sm">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const rowClass =
                  typeof rowClassName === 'function' ? rowClassName(row) : rowClassName;
                return (
                  <tr key={getRowKey(row)} className={`hover:bg-gray-50 ${rowClass ?? ''}`}>
                    {visibleColumns.map((col) => (
                      <td
                        key={col.id}
                        className={`px-4 py-3 text-sm text-gray-900 ${alignClass(col.align)} ${col.cellClassName ?? ''}`}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </ResponsiveTableWrapper>
    </div>
  );
}
