import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Loader2 } from 'lucide-react';

interface Column<T> {
  key: string;
  label: string;
  render?: (item: T, index: number) => React.ReactNode;
  className?: string;
  sortable?: boolean;
}

interface CompactTableViewProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (item: T, index: number) => void;
  loading?: boolean;
  emptyMessage?: string;
  rowClassName?: (item: T, index: number) => string;
  className?: string;
  stickyHeader?: boolean;
  striped?: boolean;
  hoverable?: boolean;
}

/**
 * CompactTableView - Optimized compact table for large datasets
 * 
 * Features:
 * - Reduced vertical spacing (py-1 instead of py-4)
 * - Smaller font sizes (text-sm)
 * - Sticky header option for long tables
 * - Row striping and hover effects
 * - Custom cell rendering
 * - Responsive and accessible
 * 
 * Perfect for displaying lots of data in limited vertical space.
 * 
 * @example
 * ```tsx
 * const columns = [
 *   { key: 'name', label: 'Product Name' },
 *   { key: 'price', label: 'Price', render: (item) => `$${item.price}` },
 *   { key: 'stock', label: 'Stock', className: 'text-right' },
 * ];
 * 
 * <CompactTableView
 *   data={products}
 *   columns={columns}
 *   onRowClick={(product) => console.log(product)}
 *   striped
 *   hoverable
 *   stickyHeader
 * />
 * ```
 */
export function CompactTableView<T extends Record<string, any>>({
  data,
  columns,
  onRowClick,
  loading = false,
  emptyMessage = 'No data available',
  rowClassName,
  className = '',
  stickyHeader = false,
  striped = false,
  hoverable = true
}: CompactTableViewProps<T>) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={`rounded-md border ${className}`}>
      <Table>
        <TableHeader className={stickyHeader ? 'sticky top-0 bg-background z-10 shadow-sm' : ''}>
          <TableRow>
            {columns.map((column) => (
              <TableHead 
                key={column.key}
                className={`py-2 text-xs font-semibold ${column.className || ''}`}
              >
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item, index) => {
            const isEven = index % 2 === 0;
            const baseRowClass = `
              py-1 
              text-sm
              ${striped && isEven ? 'bg-muted/50' : ''}
              ${hoverable ? 'hover:bg-accent cursor-pointer' : ''}
              ${onRowClick ? 'cursor-pointer' : ''}
            `;
            const customRowClass = rowClassName?.(item, index) || '';
            
            return (
              <TableRow
                key={index}
                className={`${baseRowClass} ${customRowClass}`}
                onClick={() => onRowClick?.(item, index)}
              >
                {columns.map((column) => (
                  <TableCell 
                    key={column.key}
                    className={`py-1 text-sm ${column.className || ''}`}
                  >
                    {column.render 
                      ? column.render(item, index)
                      : item[column.key]
                    }
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Helper: Create a compact column definition
 */
export function createColumn<T>(
  key: string,
  label: string,
  options?: {
    render?: (item: T, index: number) => React.ReactNode;
    className?: string;
    sortable?: boolean;
  }
): Column<T> {
  return {
    key,
    label,
    ...options
  };
}
