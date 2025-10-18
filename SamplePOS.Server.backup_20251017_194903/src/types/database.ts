/**
 * Type definitions for database operations
 */

// For flexibility in query operations
export interface QueryFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'notin' | 'between' | 'null' | 'notnull';
  value: any;
}

export interface SortOptions {
  field: string;
  direction: 'asc' | 'desc';
}

export interface QueryOptions {
  filters?: QueryFilter[];
  sort?: SortOptions[];
  page?: number;
  limit?: number;
  fields?: string[];
}

export interface DbResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  rowCount?: number;
  metadata?: Record<string, any>;
}