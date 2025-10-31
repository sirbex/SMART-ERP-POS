/**
 * Custom error classes and error handling utilities for accounting operations
 */

/**
 * Base class for all accounting-related errors
 */
export class AccountingError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string, statusCode: number = 400) {
    super(message);
    this.name = 'AccountingError';
    this.code = code;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, AccountingError.prototype);
  }
}

/**
 * Thrown when validation fails
 */
export class ValidationError extends AccountingError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Thrown when an account has insufficient balance
 */
export class InsufficientBalanceError extends AccountingError {
  accountId: string;
  required: string;
  available: string;

  constructor(accountId: string, required: string, available: string) {
    super(
      `Insufficient balance in account ${accountId}: required ${required}, available ${available}`,
      'INSUFFICIENT_BALANCE',
      400
    );
    this.name = 'InsufficientBalanceError';
    this.accountId = accountId;
    this.required = required;
    this.available = available;
    Object.setPrototypeOf(this, InsufficientBalanceError.prototype);
  }
}

/**
 * Thrown when a resource is not found
 */
export class NotFoundError extends AccountingError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Thrown when double-entry rule is violated
 */
export class DoubleEntryViolationError extends AccountingError {
  debits: string;
  credits: string;

  constructor(debits: string, credits: string) {
    super(
      `Double-entry violation: debits (${debits}) != credits (${credits})`,
      'DOUBLE_ENTRY_VIOLATION',
      400
    );
    this.name = 'DoubleEntryViolationError';
    this.debits = debits;
    this.credits = credits;
    Object.setPrototypeOf(this, DoubleEntryViolationError.prototype);
  }
}

/**
 * Thrown when a business rule is violated
 */
export class BusinessRuleError extends AccountingError {
  constructor(message: string) {
    super(message, 'BUSINESS_RULE_VIOLATION', 400);
    this.name = 'BusinessRuleError';
    Object.setPrototypeOf(this, BusinessRuleError.prototype);
  }
}

/**
 * Formats an error for API response
 */
export interface ErrorResponse {
  error: {
    message: string;
    code: string;
    statusCode: number;
    details?: Record<string, unknown>;
  };
}

export function formatErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof AccountingError) {
    return {
      error: {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        details:
          error instanceof InsufficientBalanceError
            ? {
                accountId: error.accountId,
                required: error.required,
                available: error.available,
              }
            : error instanceof DoubleEntryViolationError
              ? {
                  debits: error.debits,
                  credits: error.credits,
                }
              : undefined,
      },
    };
  }

  if (error instanceof Error) {
    return {
      error: {
        message: error.message,
        code: 'INTERNAL_ERROR',
        statusCode: 500,
      },
    };
  }

  return {
    error: {
      message: 'An unknown error occurred',
      code: 'UNKNOWN_ERROR',
      statusCode: 500,
    },
  };
}

/**
 * Wraps an async handler with error handling
 */
export function withErrorHandling<T>(
  handler: () => Promise<T>
): Promise<T | ErrorResponse> {
  return handler().catch((error) => {
    console.error('Accounting operation error:', error);
    return formatErrorResponse(error);
  });
}
