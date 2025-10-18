import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import type { ApiResponse } from '../types/api';

/**
 * Global error handler middleware
 */
const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  // Log the error for debugging
  logger.error('Uncaught exception:', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method
  });
  
  // Default error response
  const response: ApiResponse = {
    success: false,
    message: 'An unexpected error occurred',
    errors: [err.message || 'Internal server error']
  };
  
  // Handle different types of errors
  if ((err as any).statusCode) {
    // Custom error with status code
    res.status((err as any).statusCode);
    response.message = err.message;
  } else if ((err as any).name === 'ValidationError') {
    // Mongoose validation error
    res.status(400);
    response.message = 'Validation Error';
    response.errors = Object.values((err as any).errors).map(e => (e as any).message);
  } else if ((err as any).code && (err as any).code === '23505') {
    // PostgreSQL unique violation
    res.status(409);
    response.message = 'Duplicate entry';
    response.errors = [(err as any).detail || 'A record with this value already exists'];
  } else if ((err as any).code && (err as any).code.startsWith('22')) {
    // PostgreSQL data exception (invalid input)
    res.status(400);
    response.message = 'Invalid data';
    response.errors = [(err as any).detail || 'The data provided is not valid'];
  } else {
    // Default to 500 internal server error
    res.status(500);
  }
  
  // Send response
  res.json(response);
};

export default errorHandler;