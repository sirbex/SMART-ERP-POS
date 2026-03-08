// Error Handler Middleware - Centralized Error Handling
// Ensures consistent { success, data?, error? } response format

import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import logger from '../utils/logger.js';

// Custom error class for application errors
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

// Common error types
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message);
  }
}

// Structured business rule error — carries error_code + typed details for frontend parsing
export class BusinessError extends AppError {
  constructor(
    message: string,
    public errorCode: string,
    public details: Record<string, unknown> = {}
  ) {
    super(400, message);
    Object.setPrototypeOf(this, BusinessError.prototype);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(403, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
  }
}

/**
 * Global error handler middleware
 * Must be registered AFTER all routes
 */
export function errorHandler(
  error: Error | AppError | ZodError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // If headers already sent (e.g., PDF streaming), cannot send error response
  if (res.headersSent) {
    logger.error('Error after headers sent', {
      error: error instanceof Error ? error.message : String(error),
      path: req.path,
      method: req.method,
    });
    return next(error);
  }

  // Log error details
  if (error instanceof AppError) {
    logger.error('Application error', {
      statusCode: error.statusCode,
      message: error instanceof Error ? error.message : String(error),
      path: req.path,
      method: req.method,
      user: req.user?.id,
      requestId: req.requestId,
    });
  } else if (
    error instanceof Error &&
    'statusCode' in error &&
    typeof (error as Error & { statusCode: number }).statusCode === 'number'
  ) {
    const statusError = error as Error & { statusCode: number; code?: string };
    logger.error('Domain error', {
      statusCode: statusError.statusCode,
      code: statusError.code,
      message: error.message,
      path: req.path,
      method: req.method,
      user: req.user?.id,
      requestId: req.requestId,
    });
  } else if (error instanceof ZodError) {
    logger.debug('Zod validation error', {
      errors: error.errors,
      path: req.path,
      requestId: req.requestId,
    });
  } else {
    logger.error('Unhandled error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      path: req.path,
      method: req.method,
      requestId: req.requestId,
    });
  }

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const formattedErrors = error.errors.map((err) => ({
      path: err.path.join('.'),
      message: err.message,
    }));

    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: formattedErrors,
      requestId: req.requestId,
    });
    return;
  }

  // Handle BusinessError (structured details for frontend)
  if (error instanceof BusinessError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      error_code: error.errorCode,
      details: error.details,
      requestId: req.requestId,
    });
    return;
  }

  // Handle AppError
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      requestId: req.requestId,
    });
    return;
  }

  // Handle domain-specific errors with statusCode property (e.g., RbacError)
  if (
    error instanceof Error &&
    'statusCode' in error &&
    typeof (error as Error & { statusCode: number }).statusCode === 'number'
  ) {
    const statusError = error as Error & { statusCode: number; code?: string };
    res.status(statusError.statusCode).json({
      success: false,
      error: error.message,
      ...(statusError.code ? { code: statusError.code } : {}),
      requestId: req.requestId,
    });
    return;
  }

  // Handle unexpected errors
  // Classify plain Error throws: many are business errors that should be 400, not 500
  const errorMessage = error instanceof Error ? error.message : 'Internal server error';
  const classified = classifyPlainError(errorMessage);

  res.status(classified.status).json({
    success: false,
    error: errorMessage,
    error_code: classified.errorCode,
    ...(classified.details ? { details: classified.details } : {}),
    requestId: req.requestId,
  });
}

/**
 * Classify a plain Error message into a structured error code and HTTP status.
 * This catches the 200+ `throw new Error(...)` across the codebase that haven't
 * been individually converted to BusinessError yet, ensuring the frontend always
 * receives error_code for structured display.
 */
function classifyPlainError(message: string): {
  status: number;
  errorCode: string;
  details?: Record<string, unknown>;
} {
  const msg = message.toLowerCase();

  // Not found patterns
  if (
    msg.includes('not found') ||
    msg.includes('does not exist') ||
    msg.includes('no active deposits')
  ) {
    return { status: 404, errorCode: 'ERR_NOT_FOUND', details: { reason: message } };
  }

  // Auth / permission patterns
  if (
    msg.includes('invalid email or password') ||
    msg.includes('invalid refresh token') ||
    msg.includes('token expired') ||
    msg.includes('account is disabled') ||
    msg.includes('account is locked') ||
    msg.includes('too many failed attempts')
  ) {
    return { status: 401, errorCode: 'ERR_AUTH', details: { reason: message } };
  }
  if (msg.includes('only admin') || msg.includes('only manager') || msg.includes('permission')) {
    return { status: 403, errorCode: 'ERR_FORBIDDEN', details: { reason: message } };
  }

  // Validation patterns
  if (
    msg.includes('cannot be negative') ||
    msg.includes('cannot be zero') ||
    msg.includes('required') ||
    msg.includes('must be') ||
    msg.includes('invalid') ||
    msg.includes('already exists') ||
    msg.includes('already registered') ||
    msg.includes('validation failed') ||
    msg.includes('does not meet')
  ) {
    return { status: 400, errorCode: 'ERR_VALIDATION', details: { reason: message } };
  }

  // Business rule patterns
  if (
    msg.includes('cannot') ||
    msg.includes('insufficient') ||
    msg.includes('exceeds') ||
    msg.includes('already') ||
    msg.includes('cannot delete') ||
    msg.includes('cannot deactivate') ||
    msg.includes('cannot change status') ||
    msg.includes('failed to')
  ) {
    return { status: 400, errorCode: 'ERR_BUSINESS', details: { reason: message } };
  }

  // PostgreSQL constraint violations (from pg driver)
  if (msg.includes('violates check constraint') || msg.includes('violates unique constraint')) {
    return { status: 400, errorCode: 'ERR_CONSTRAINT', details: { reason: message } };
  }

  // Default: genuine 500 server error
  return { status: 500, errorCode: 'ERR_INTERNAL', details: { reason: message } };
}

/**
 * 404 handler for unknown routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  logger.debug('Route not found', {
    path: req.path,
    method: req.method,
    requestId: req.requestId,
  });

  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
    requestId: req.requestId,
  });
}

/**
 * Async route wrapper to catch errors in async route handlers
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
