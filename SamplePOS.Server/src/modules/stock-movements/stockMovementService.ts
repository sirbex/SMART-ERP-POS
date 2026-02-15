// Stock Movement Service - Business logic layer
// Handles movement operations, validation

import { Pool } from 'pg';
import Decimal from 'decimal.js';
import { MovementType, MANUAL_MOVEMENT_TYPES, MovementFilters } from './types.js';
import * as stockMovementRepository from './stockMovementRepository.js';
import { InventoryBusinessRules } from '../../middleware/businessRules.js';
import logger from '../../utils/logger.js';

/**
 * Record manual stock movement
 * Only ADJUSTMENT_IN, ADJUSTMENT_OUT, DAMAGE, EXPIRY, RETURN can be created manually
 */
export async function recordMovement(
  pool: Pool,
  data: {
    productId: string;
    batchId?: string | null;
    movementType: MovementType;
    quantity: number;
    notes?: string | null;
    createdBy: string;
  }
) {
  // Validate movement type for manual recording
  if (!MANUAL_MOVEMENT_TYPES.includes(data.movementType)) {
    throw new Error(`Movement type ${data.movementType} cannot be created manually`);
  }

  // BR-INV-002: Validate non-zero quantity
  if (data.quantity === 0) {
    throw new Error('Quantity cannot be zero');
  }

  // Use Decimal for bank-grade precision
  const quantityDecimal = new Decimal(data.quantity);

  // BR-INV-002: Validate positive quantity for IN movements
  if (data.movementType === 'ADJUSTMENT_IN' || data.movementType === 'RETURN') {
    InventoryBusinessRules.validatePositiveQuantity(
      Math.abs(quantityDecimal.toNumber()),
      `${data.movementType} movement`
    );
    logger.info('BR-INV-002: Positive quantity validation passed', {
      movementType: data.movementType,
      quantity: quantityDecimal.toString(),
    });
  }

  const result = await stockMovementRepository.recordMovement(pool, {
    ...data,
    quantity: quantityDecimal.toNumber(),
    referenceType: 'MANUAL',
    referenceId: null,
  });

  logger.info('Stock movement recorded successfully', {
    movementId: result.id,
    productId: data.productId,
    movementType: data.movementType,
    quantity: quantityDecimal.toString(),
  });

  return result;
}

/**
 * Get movements by product
 */
export async function getMovementsByProduct(
  pool: Pool,
  productId: string,
  page: number = 1,
  limit: number = 100
) {
  return stockMovementRepository.getMovementsByProduct(pool, productId, page, limit);
}

/**
 * Get movements by batch
 */
export async function getMovementsByBatch(
  pool: Pool,
  batchId: string,
  page: number = 1,
  limit: number = 100
) {
  return stockMovementRepository.getMovementsByBatch(pool, batchId, page, limit);
}

/**
 * Get all movements with filters
 */
export async function getAllMovements(
  pool: Pool,
  page: number = 1,
  limit: number = 100,
  filters?: MovementFilters
) {
  return stockMovementRepository.getAllMovements(pool, page, limit, filters);
}
