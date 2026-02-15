// Request Validation Middleware - Zod Schema Validation Helper
// Standardizes validation across all controllers

import type { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';
import logger from '../utils/logger.js';

type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Middleware factory to validate request data against a Zod schema
 * @param schema - Zod schema to validate against
 * @param target - Which part of the request to validate (body, query, params)
 */
export function validate(schema: z.ZodSchema, target: ValidationTarget = 'body') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req[target];
      const validated = await schema.parseAsync(data);

      // Replace the request data with validated & typed data
      req[target] = validated;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
        }));

        logger.debug('Validation failed', { target, errors: formattedErrors });

        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: formattedErrors,
        });
        return;
      }

      logger.error('Validation middleware error', { error });
      res.status(500).json({
        success: false,
        error: 'Validation error occurred',
      });
    }
  };
}

/**
 * Validate multiple targets in a single middleware
 */
export function validateMultiple(
  validations: Array<{ schema: z.ZodSchema; target: ValidationTarget }>
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      for (const { schema, target } of validations) {
        const data = req[target];
        const validated = await schema.parseAsync(data);
        req[target] = validated;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
        }));

        logger.debug('Multi-validation failed', { errors: formattedErrors });

        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: formattedErrors,
        });
        return;
      }

      logger.error('Multi-validation middleware error', { error });
      res.status(500).json({
        success: false,
        error: 'Validation error occurred',
      });
    }
  };
}
