import { z } from 'zod';

/** Positive monetary amount — rejects NaN, Infinity, zero, and non-numeric strings. */
export const positiveFiniteAmount = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'string' ? Number(v.trim().replace(/[,\s]/g, '')) : v))
  .refine((v) => Number.isFinite(v) && v > 0, {
    message: 'Amount must be a positive number',
  });

/** Positive quantity — rejects NaN and Infinity (common cause of PG integer "NaN" errors). */
export const positiveFiniteQuantity = z
  .number({ invalid_type_error: 'Quantity must be a number' })
  .finite('Quantity must be a finite number')
  .positive('Quantity must be positive');
