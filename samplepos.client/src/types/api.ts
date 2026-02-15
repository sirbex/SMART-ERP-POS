/**
 * API Response Types
 * 
 * TypeScript interfaces matching backend API responses.
 * All responses follow { success, data?, error? } format.
 */

import Decimal from 'decimal.js';
import type { User } from './business';

/**
 * Base API Response
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * API Response with Alerts
 */
export interface ApiResponseWithAlerts<T = unknown> extends ApiResponse<T> {
  alerts?: Alert[];
  alertSummary?: string;
}

/**
 * Paginated Response
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Alert Interface
 */
export interface Alert {
  type: 'COST_PRICE_CHANGE' | 'LOW_STOCK' | 'EXPIRY_WARNING' | 'CREDIT_LIMIT' | 'NEGATIVE_STOCK';
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  productId?: string;
  productName?: string;
  message: string;
  details?: {
    previousCost?: string;
    newCost?: string;
    changeAmount?: string;
    changePercentage?: string;
    batchNumber?: string;
    availableQuantity?: string;
    requestedQuantity?: string;
    expiryDate?: string;
    currentBalance?: string;
    creditLimit?: string;
  };
}

/**
 * Cost Price Change Alert (specific type from GR finalization)
 */
export interface CostPriceChangeAlert {
  productId: string;
  productName: string;
  previousCost: string | Decimal;
  newCost: string | Decimal;
  changeAmount: string | Decimal;
  changePercentage: string | Decimal;
  batchNumber: string;
}

/**
 * Error Response
 */
export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  rule?: string;
  details?: Record<string, unknown>;
}

/**
 * Authentication Request/Response
 */
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  role?: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF';
}

export interface AuthResponse {
  token: string;
  user: User;
}

/**
 * Query Parameters
 */
export interface ListQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface StockQueryParams extends ListQueryParams {
  lowStockOnly?: boolean;
  expiringOnly?: boolean;
  expiryDays?: number;
}

/**
 * Validation Error
 */
export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

/**
 * Batch Operation Response
 */
export interface BatchOperationResponse {
  success: boolean;
  results: Array<{
    id: string;
    success: boolean;
    error?: string;
  }>;
  successCount: number;
  failureCount: number;
}

/**
 * Export Response
 */
export interface ExportResponse {
  success: boolean;
  filePath: string;
  filename: string;
  format: 'PDF' | 'CSV' | 'EXCEL' | 'JSON';
  size: number;
}

/**
 * Health Check Response
 */
export interface HealthCheckResponse {
  success: boolean;
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  database?: 'connected' | 'disconnected';
  uptime?: number;
}

/**
 * Type Guards
 */
export function isApiError(response: unknown): response is ErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'success' in response &&
    response.success === false &&
    'error' in response
  );
}

export function isApiSuccess<T>(response: ApiResponse<T>): response is ApiResponse<T> & { data: T } {
  return response.success && response.data !== undefined;
}

export function hasAlerts<T>(response: ApiResponse<T>): response is ApiResponseWithAlerts<T> {
  return 'alerts' in response && Array.isArray(response.alerts) && response.alerts.length > 0;
}

/**
 * Helper to extract data from API response
 */
export function extractData<T>(response: ApiResponse<T>): T {
  if (!isApiSuccess(response)) {
    throw new Error(response.error || 'Unknown error');
  }
  return response.data;
}

/**
 * Helper to extract error message
 */
export function extractError(response: unknown): string {
  if (isApiError(response)) {
    return response.error;
  }
  if (response instanceof Error) {
    return response.message;
  }
  return 'Unknown error';
}
