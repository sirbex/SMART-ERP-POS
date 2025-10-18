/**
 * API Error Handler Utility
 * 
 * Centralized error handling for API calls with user-friendly messages
 */

import { AxiosError } from 'axios';

export interface ApiError {
  message: string;
  statusCode?: number;
  errors?: Record<string, string[]>;
  originalError?: unknown;
}

/**
 * Parse API error into user-friendly format
 */
export function parseApiError(error: unknown): ApiError {
  // Axios error with response
  if (error instanceof Error && 'isAxiosError' in error) {
    const axiosError = error as AxiosError<any>;
    
    if (axiosError.response) {
      const { status, data } = axiosError.response;
      
      return {
        message: data?.message || data?.error || getDefaultErrorMessage(status),
        statusCode: status,
        errors: data?.errors,
        originalError: error
      };
    }
    
    // No response - network error
    if (axiosError.request) {
      return {
        message: 'Unable to connect to server. Please check your internet connection.',
        originalError: error
      };
    }
  }
  
  // Regular Error object
  if (error instanceof Error) {
    return {
      message: error.message,
      originalError: error
    };
  }
  
  // Unknown error type
  return {
    message: 'An unexpected error occurred',
    originalError: error
  };
}

/**
 * Get default error message based on HTTP status code
 */
function getDefaultErrorMessage(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'Invalid request. Please check your input.';
    case 401:
      return 'Authentication required. Please login again.';
    case 403:
      return 'You do not have permission to perform this action.';
    case 404:
      return 'The requested resource was not found.';
    case 409:
      return 'This action conflicts with existing data.';
    case 422:
      return 'Validation failed. Please check your input.';
    case 429:
      return 'Too many requests. Please try again later.';
    case 500:
      return 'Server error. Please try again later.';
    case 503:
      return 'Service temporarily unavailable. Please try again later.';
    default:
      return 'An error occurred. Please try again.';
  }
}

/**
 * Extract validation errors from API response
 */
export function extractValidationErrors(apiError: ApiError): Record<string, string> {
  if (!apiError.errors) return {};
  
  const flatErrors: Record<string, string> = {};
  
  Object.entries(apiError.errors).forEach(([field, messages]) => {
    flatErrors[field] = messages[0]; // Take first error message
  });
  
  return flatErrors;
}

/**
 * Check if error is authentication error
 */
export function isAuthError(error: unknown): boolean {
  const apiError = parseApiError(error);
  return apiError.statusCode === 401;
}

/**
 * Check if error is authorization error
 */
export function isAuthorizationError(error: unknown): boolean {
  const apiError = parseApiError(error);
  return apiError.statusCode === 403;
}

/**
 * Check if error is validation error
 */
export function isValidationError(error: unknown): boolean {
  const apiError = parseApiError(error);
  return apiError.statusCode === 422 || apiError.statusCode === 400;
}

/**
 * Check if error is network error
 */
export function isNetworkError(error: unknown): boolean {
  const apiError = parseApiError(error);
  return !apiError.statusCode;
}

/**
 * Log error for debugging (can be extended to send to monitoring service)
 */
export function logError(error: unknown, context?: string): void {
  const apiError = parseApiError(error);
  
  console.error(`[API Error${context ? ` - ${context}` : ''}]:`, {
    message: apiError.message,
    statusCode: apiError.statusCode,
    errors: apiError.errors,
    timestamp: new Date().toISOString()
  });
  
  // In production, send to monitoring service like Sentry
  // if (import.meta.env.PROD) {
  //   Sentry.captureException(apiError.originalError);
  // }
}

/**
 * Handle API error with automatic logging and user notification
 */
export function handleApiError(
  error: unknown,
  context?: string,
  onError?: (apiError: ApiError) => void
): void {
  const apiError = parseApiError(error);
  
  // Log error
  logError(error, context);
  
  // Call custom error handler if provided
  if (onError) {
    onError(apiError);
  }
  
  // Handle auth errors automatically
  if (isAuthError(error)) {
    // Clear token and redirect to login
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }
}

/**
 * Create error message for toast notifications
 */
export function createErrorToast(error: unknown): {
  title: string;
  description: string;
  variant: 'destructive';
} {
  const apiError = parseApiError(error);
  
  return {
    title: 'Error',
    description: apiError.message,
    variant: 'destructive'
  };
}

export default {
  parseApiError,
  extractValidationErrors,
  isAuthError,
  isAuthorizationError,
  isValidationError,
  isNetworkError,
  logError,
  handleApiError,
  createErrorToast
};
