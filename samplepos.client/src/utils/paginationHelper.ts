/**
 * Pagination Helper Utilities
 * 
 * Reusable pagination logic for API calls and UI components
 */

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  filters?: Record<string, any>;
}

export interface PaginationMetadata {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMetadata;
}

/**
 * Build query string from pagination parameters
 */
export function buildPaginationQuery(params: PaginationParams): string {
  const queryParams = new URLSearchParams();
  
  if (params.page !== undefined) {
    queryParams.set('page', params.page.toString());
  }
  
  if (params.limit !== undefined) {
    queryParams.set('limit', params.limit.toString());
  }
  
  if (params.sortBy) {
    queryParams.set('sortBy', params.sortBy);
  }
  
  if (params.sortOrder) {
    queryParams.set('sortOrder', params.sortOrder);
  }
  
  if (params.search) {
    queryParams.set('search', params.search);
  }
  
  // Add custom filters
  if (params.filters) {
    Object.entries(params.filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.set(key, String(value));
      }
    });
  }
  
  const query = queryParams.toString();
  return query ? `?${query}` : '';
}

/**
 * Parse pagination metadata from backend response
 */
export function parsePaginationMetadata(response: any): PaginationMetadata {
  const pagination = response.pagination || response.data?.pagination || {};
  
  return {
    total: pagination.total || 0,
    page: pagination.page || 1,
    limit: pagination.limit || 20,
    totalPages: pagination.totalPages || Math.ceil((pagination.total || 0) / (pagination.limit || 20)),
    hasNext: pagination.hasNext ?? (pagination.page || 1) < (pagination.totalPages || 1),
    hasPrev: pagination.hasPrev ?? (pagination.page || 1) > 1
  };
}

/**
 * Calculate page numbers for pagination UI
 */
export function calculatePageNumbers(
  currentPage: number,
  totalPages: number,
  maxVisible: number = 5
): number[] {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  
  const half = Math.floor(maxVisible / 2);
  let start = Math.max(1, currentPage - half);
  let end = Math.min(totalPages, start + maxVisible - 1);
  
  // Adjust if we're near the end
  if (end === totalPages) {
    start = Math.max(1, end - maxVisible + 1);
  }
  
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

/**
 * Get pagination info text (e.g., "Showing 1-20 of 100")
 */
export function getPaginationInfoText(metadata: PaginationMetadata): string {
  const { total, page, limit } = metadata;
  
  if (total === 0) {
    return 'No results';
  }
  
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  
  return `Showing ${start}-${end} of ${total}`;
}

/**
 * Check if pagination is needed
 */
export function needsPagination(total: number, limit: number): boolean {
  return total > limit;
}

/**
 * Get default pagination params
 */
export function getDefaultPaginationParams(): PaginationParams {
  return {
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc'
  };
}

/**
 * Merge pagination params with defaults
 */
export function mergePaginationParams(
  params?: Partial<PaginationParams>
): PaginationParams {
  return {
    ...getDefaultPaginationParams(),
    ...params
  };
}

/**
 * Parse pagination params from URL search params
 */
export function parsePaginationFromUrl(searchParams: URLSearchParams): PaginationParams {
  return {
    page: parseInt(searchParams.get('page') || '1', 10),
    limit: parseInt(searchParams.get('limit') || '20', 10),
    sortBy: searchParams.get('sortBy') || undefined,
    sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || undefined,
    search: searchParams.get('search') || undefined
  };
}

/**
 * Update URL with pagination params
 */
export function updateUrlWithPagination(
  params: PaginationParams,
  replace: boolean = false
): void {
  const queryString = buildPaginationQuery(params);
  const newUrl = `${window.location.pathname}${queryString}`;
  
  if (replace) {
    window.history.replaceState({}, '', newUrl);
  } else {
    window.history.pushState({}, '', newUrl);
  }
}

/**
 * Calculate item indices for current page
 */
export function getItemIndices(page: number, limit: number): { start: number; end: number } {
  return {
    start: (page - 1) * limit,
    end: page * limit
  };
}

/**
 * Paginate local array (for client-side pagination)
 */
export function paginateArray<T>(
  items: T[],
  page: number,
  limit: number
): PaginatedResponse<T> {
  const { start, end } = getItemIndices(page, limit);
  const data = items.slice(start, end);
  
  return {
    data,
    pagination: {
      total: items.length,
      page,
      limit,
      totalPages: Math.ceil(items.length / limit),
      hasNext: end < items.length,
      hasPrev: page > 1
    }
  };
}

/**
 * Create empty paginated response
 */
export function createEmptyPaginatedResponse<T>(): PaginatedResponse<T> {
  return {
    data: [],
    pagination: {
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
      hasNext: false,
      hasPrev: false
    }
  };
}

/**
 * React hook helper: Get pagination state
 */
export function usePaginationState(initialParams?: Partial<PaginationParams>) {
  const [params, setParams] = React.useState<PaginationParams>(
    mergePaginationParams(initialParams)
  );
  
  const goToPage = (page: number) => {
    setParams(prev => ({ ...prev, page }));
  };
  
  const goToNextPage = () => {
    setParams(prev => ({ ...prev, page: (prev.page || 1) + 1 }));
  };
  
  const goToPrevPage = () => {
    setParams(prev => ({ ...prev, page: Math.max(1, (prev.page || 1) - 1) }));
  };
  
  const setLimit = (limit: number) => {
    setParams(prev => ({ ...prev, limit, page: 1 }));
  };
  
  const setSearch = (search: string) => {
    setParams(prev => ({ ...prev, search, page: 1 }));
  };
  
  const setSort = (sortBy: string, sortOrder: 'asc' | 'desc') => {
    setParams(prev => ({ ...prev, sortBy, sortOrder }));
  };
  
  const setFilters = (filters: Record<string, any>) => {
    setParams(prev => ({ ...prev, filters, page: 1 }));
  };
  
  const reset = () => {
    setParams(mergePaginationParams(initialParams));
  };
  
  return {
    params,
    goToPage,
    goToNextPage,
    goToPrevPage,
    setLimit,
    setSearch,
    setSort,
    setFilters,
    reset
  };
}

// Note: React import for the hook (add at top of file where used)
import React from 'react';

export default {
  buildPaginationQuery,
  parsePaginationMetadata,
  calculatePageNumbers,
  getPaginationInfoText,
  needsPagination,
  getDefaultPaginationParams,
  mergePaginationParams,
  parsePaginationFromUrl,
  updateUrlWithPagination,
  getItemIndices,
  paginateArray,
  createEmptyPaginatedResponse,
  usePaginationState
};
