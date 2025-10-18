import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Custom error with HTTP status code
 */
export class ApiError extends Error {
  statusCode: number;
  
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handler middleware
 */
export const errorHandler = (
  err: Error | ApiError,
  req: Request, 
  res: Response, 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) => {
  logger.error(`Error: ${err.message}`);
  logger.error(err.stack || '');

  // Check if it's our custom API error
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
    });
  }

  // Database-specific errors can be handled specifically
  if (err.message.includes('database') || err.message.includes('sql')) {
    return res.status(500).json({
      success: false,
      message: 'Database error occurred',
      error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
    });
  }

  // Default error handler
  return res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
  });
};