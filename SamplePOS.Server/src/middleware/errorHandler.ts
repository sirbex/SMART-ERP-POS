import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import logger from '../utils/logger.js';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError | any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  logger.error('Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    name: err.name
  });

  // Zod validation errors (NEW - for consistent validation)
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.errors.map(e => ({
        path: e.path,
        message: e.message,
        code: e.code
      })),
      statusCode: 400,
      timestamp: new Date().toISOString()
    });
  }

  // Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[]) || ['field'];
      return res.status(400).json({
        error: `Duplicate ${target.join(', ')}`,
        details: `The ${target.join(', ')} already exists`,
        statusCode: 400
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ 
        error: 'Record not found',
        details: err.meta?.cause || 'The requested record does not exist',
        statusCode: 404
      });
    }
    if (err.code === 'P2003') {
      return res.status(400).json({ 
        error: 'Foreign key constraint failed',
        details: 'Referenced record does not exist',
        statusCode: 400
      });
    }
    return res.status(400).json({ error: 'Database error', code: err.code, statusCode: 400 });
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({ error: 'Validation error', details: err.message, statusCode: 400 });
  }

  // Operational errors
  if (err.isOperational) {
    return res.status(err.statusCode || 500).json({ error: err.message, statusCode: err.statusCode || 500 });
  }

  // Default error
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
    statusCode,
    timestamp: new Date().toISOString()
  });
};export const createError = (message: string, statusCode: number = 400): AppError => {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
};

// Async handler wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
