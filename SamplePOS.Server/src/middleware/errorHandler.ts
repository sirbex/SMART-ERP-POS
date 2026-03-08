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
      message: (error instanceof Error ? error.message : String(error)),
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
      error: (error instanceof Error ? error.message : String(error)),
      stack: (error instanceof Error ? error.stack : undefined),
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

  // Handle AppError
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      error: (error instanceof Error ? error.message : String(error)),
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
  const isDevelopment = process.env.NODE_ENV === 'development';

  res.status(500).json({
    success: false,
    error: error instanceof Error ? error.message : 'Internal server error',
    requestId: req.requestId,
    ...(isDevelopment && { stack: (error instanceof Error ? error.stack : undefined) }),
  });
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
