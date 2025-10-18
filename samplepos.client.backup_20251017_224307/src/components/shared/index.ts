/**
 * Shared Components Index
 * Export all reusable shared components
 */

// Existing refactored components
export { DataTable } from './DataTable';
export type { Column as DataTableColumn, DataTableProps } from './DataTable';

export { FormModal } from './FormModal';
export type { FormModalProps } from './FormModal';

// New optimized list components
export { VirtualizedList } from './VirtualizedList';
export { PaginatedList } from './PaginatedList';
export { InfiniteScrollList } from './InfiniteScrollList';
export { CompactTableView, createColumn } from './CompactTableView';
