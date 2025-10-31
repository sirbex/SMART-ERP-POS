import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from 'lucide-react';

interface PaginatedListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  itemsPerPageOptions?: number[];
  defaultItemsPerPage?: number;
  loading?: boolean;
  emptyMessage?: string;
  onPageChange?: (page: number, itemsPerPage: number) => void;
  serverSide?: boolean;
  totalItems?: number;
  className?: string;
  showSearch?: boolean;
  onSearch?: (query: string) => void;
  searchPlaceholder?: string;
  compact?: boolean;
}

/**
 * PaginatedList - Optimized list with client or server-side pagination
 * 
 * Supports both client-side pagination (for smaller datasets) and server-side pagination (for large datasets).
 * Includes search, page size selection, and responsive controls.
 * 
 * @example Client-side pagination:
 * ```tsx
 * <PaginatedList
 *   items={allProducts}
 *   renderItem={(product) => <ProductCard product={product} />}
 *   defaultItemsPerPage={20}
 * />
 * ```
 * 
 * @example Server-side pagination:
 * ```tsx
 * <PaginatedList
 *   items={currentPageProducts}
 *   serverSide
 *   totalItems={1000}
 *   loading={isLoading}
 *   onPageChange={(page, limit) => fetchProducts(page, limit)}
 *   renderItem={(product) => <ProductCard product={product} />}
 * />
 * ```
 */
export function PaginatedList<T>({
  items,
  renderItem,
  itemsPerPageOptions = [10, 20, 50, 100],
  defaultItemsPerPage = 20,
  loading = false,
  emptyMessage = 'No items to display',
  onPageChange,
  serverSide = false,
  totalItems,
  className = '',
  showSearch = false,
  onSearch,
  searchPlaceholder = 'Search...',
  compact = false
}: PaginatedListProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(defaultItemsPerPage);
  const [searchQuery, setSearchQuery] = useState('');

  // Calculate pagination for client-side
  const totalItemsCount = serverSide ? (totalItems || 0) : items.length;
  const totalPages = Math.ceil(totalItemsCount / itemsPerPage);
  
  // Get current page items for client-side pagination
  const currentItems = serverSide 
    ? items 
    : items.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Reset to page 1 when items per page changes
  useEffect(() => {
    setCurrentPage(1);
    onPageChange?.(1, itemsPerPage);
  }, [itemsPerPage]);

  // Handle page change
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    if (serverSide) {
      onPageChange?.(page, itemsPerPage);
    }
    // Scroll to top of list
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle search
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
    onSearch?.(query);
  };

  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItemsCount);

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxPagesToShow = compact ? 3 : 7;
    
    if (totalPages <= maxPagesToShow) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    // Always show first page
    pages.push(1);

    if (currentPage > 3) {
      pages.push('...');
    }

    // Show pages around current page
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (currentPage < totalPages - 2) {
      pages.push('...');
    }

    // Always show last page
    if (totalPages > 1) {
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Search and controls */}
      {showSearch && (
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className={compact ? 'h-8 text-sm' : ''}
          />
        </div>
      )}

      {/* Items list */}
      <div className={compact ? 'space-y-1' : 'space-y-2'}>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        ) : currentItems.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <p>{emptyMessage}</p>
          </div>
        ) : (
          currentItems.map((item, index) => (
            <div key={index}>
              {renderItem(item, (currentPage - 1) * itemsPerPage + index)}
            </div>
          ))
        )}
      </div>

      {/* Pagination controls */}
      {!loading && totalItemsCount > 0 && (
        <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t ${compact ? 'text-xs' : 'text-sm'}`}>
          {/* Items info */}
          <div className="text-muted-foreground">
            Showing {startItem} to {endItem} of {totalItemsCount} items
          </div>

          {/* Page controls */}
          <div className="flex items-center gap-2">
            {/* Items per page selector */}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground whitespace-nowrap">Per page:</span>
              <Select
                value={itemsPerPage.toString()}
                onValueChange={(value) => setItemsPerPage(Number(value))}
              >
                <SelectTrigger className={compact ? 'w-16 h-7 text-xs' : 'w-20 h-9'}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {itemsPerPageOptions.map((option) => (
                    <SelectItem key={option} value={option.toString()}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Page navigation */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size={compact ? 'sm' : 'default'}
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
                className={compact ? 'h-7 w-7 p-0' : 'h-9 w-9 p-0'}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size={compact ? 'sm' : 'default'}
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className={compact ? 'h-7 w-7 p-0' : 'h-9 w-9 p-0'}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              {/* Page numbers */}
              <div className="hidden md:flex items-center gap-1">
                {getPageNumbers().map((page, idx) => (
                  typeof page === 'number' ? (
                    <Button
                      key={idx}
                      variant={currentPage === page ? 'default' : 'outline'}
                      size={compact ? 'sm' : 'default'}
                      onClick={() => handlePageChange(page)}
                      className={compact ? 'h-7 w-7 p-0' : 'h-9 w-9 p-0'}
                    >
                      {page}
                    </Button>
                  ) : (
                    <span key={idx} className="px-2 text-muted-foreground">
                      {page}
                    </span>
                  )
                ))}
              </div>

              {/* Current page indicator (mobile) */}
              <div className="md:hidden px-3 py-1 text-sm">
                {currentPage} / {totalPages}
              </div>

              <Button
                variant="outline"
                size={compact ? 'sm' : 'default'}
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={compact ? 'h-7 w-7 p-0' : 'h-9 w-9 p-0'}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size={compact ? 'sm' : 'default'}
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages}
                className={compact ? 'h-7 w-7 p-0' : 'h-9 w-9 p-0'}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
