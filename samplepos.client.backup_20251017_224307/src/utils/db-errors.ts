/**
 * Database error handling utility
 * 
 * Provides standardized error handling for database operations
 */

type DbErrorResponse = {
  success: false;
  message: string;
  errorCode?: string;
  errorType?: string;
  details?: string;
};

/**
 * Handle database errors in a standardized way
 * @param error The error thrown by the database operation
 * @param operation Optional description of the operation that failed
 * @returns Standardized error response object
 */
export function handleDatabaseError(error: unknown, operation?: string): DbErrorResponse {
  console.error(`Database error${operation ? ` during ${operation}` : ''}:`, error);
  
  // If it's a PostgreSQL error, it may have specific properties
  const pgError = error as { code?: string; detail?: string; };

  const errorResponse: DbErrorResponse = {
    success: false,
    message: error instanceof Error ? error.message : 'Unknown database error occurred'
  };

  // Handle specific PostgreSQL error codes
  if (pgError && pgError.code) {
    errorResponse.errorCode = pgError.code;
    errorResponse.details = pgError.detail;

    switch (pgError.code) {
      case '23505': // unique_violation
        errorResponse.errorType = 'DUPLICATE';
        errorResponse.message = 'This record already exists';
        break;
        
      case '23503': // foreign_key_violation
        errorResponse.errorType = 'REFERENCE';
        errorResponse.message = 'This record is referenced by another record';
        break;
        
      case '23502': // not_null_violation
        errorResponse.errorType = 'REQUIRED';
        errorResponse.message = 'Required field is missing';
        break;
        
      case '42P01': // undefined_table
        errorResponse.errorType = 'SCHEMA';
        errorResponse.message = 'The database schema is not set up correctly';
        break;
        
      case '57P03': // cannot_connect_now
      case '57P01': // admin_shutdown
      case '57P02': // crash_shutdown
        errorResponse.errorType = 'CONNECTION';
        errorResponse.message = 'Unable to connect to the database';
        break;
        
      case '28P01': // invalid_password
        errorResponse.errorType = 'AUTH';
        errorResponse.message = 'Database authentication failed';
        break;
        
      default:
        errorResponse.errorType = 'DATABASE';
        errorResponse.message = `Database error: ${pgError.code}`;
    }
  }

  // Log the error for server-side debugging
  console.error(JSON.stringify(errorResponse));
  
  return errorResponse;
}

/**
 * Safely extract PostgreSQL error message
 * @param error Any error object
 * @returns A user-friendly error message
 */
export function getDbErrorMessage(error: unknown): string {
  if (!error) {
    return 'Unknown error occurred';
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  const pgError = error as { message?: string; detail?: string; };
  
  return pgError.detail || pgError.message || 'Unknown database error occurred';
}