// ============================================================================
// BACKEND UTILITIES - Helper Functions
// ============================================================================

// ============================================================================
// FILE: pos-backend/src/utils/logger.ts
// ============================================================================

import winston from 'winston';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: consoleFormat
    }),
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 5242880,
      maxFiles: 5
    })
  ]
});

// ============================================================================
// FILE: pos-backend/src/utils/fifoCalculator.ts
// ============================================================================

import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export interface StockBatch {
  id: string;
  quantityRemaining: Decimal;
  unitCost: Decimal;
}

export interface FIFOAllocation {
  batchId: string;
  quantity: Decimal;
  cost: Decimal;
  totalCost: Decimal;
}

export interface FIFOResult {
  allocations: FIFOAllocation[];
  totalQuantity: Decimal;
  totalCost: Decimal;
  averageCost: Decimal;
}

/**
 * Calculate FIFO cost allocation for a given quantity
 * @param batches - Available stock batches sorted by receivedDate ASC
 * @param quantityNeeded - Quantity to allocate (in base units)
 * @returns FIFO allocation result
 */
export function calculateFIFO(
  batches: StockBatch[],
  quantityNeeded: Decimal | number
): FIFOResult {
  const qty = new Decimal(quantityNeeded);
  const allocations: FIFOAllocation[] = [];
  let remainingQty = qty;
  let totalCost = new Decimal(0);

  for (const batch of batches) {
    if (remainingQty.lte(0)) break;

    const qtyFromBatch = Decimal.min(batch.quantityRemaining, remainingQty);
    const costFromBatch = qtyFromBatch.mul(batch.unitCost);

    allocations.push({
      batchId: batch.id,
      quantity: qtyFromBatch,
      cost: batch.unitCost,
      totalCost: costFromBatch
    });

    totalCost = totalCost.add(costFromBatch);
    remainingQty = remainingQty.sub(qtyFromBatch);
  }

  if (remainingQty.gt(0)) {
    throw new Error(`Insufficient stock: Need ${qty}, only ${qty.sub(remainingQty)} available`);
  }

  const averageCost = totalCost.div(qty);

  return {
    allocations,
    totalQuantity: qty,
    totalCost,
    averageCost
  };
}

/**
 * Update batch quantities after FIFO allocation
 * Used in database transactions to reduce stock
 */
export function createBatchUpdates(allocations: FIFOAllocation[]) {
  return allocations.map(alloc => ({
    where: { id: alloc.batchId },
    data: { 
      quantityRemaining: { 
        decrement: alloc.quantity 
      } 
    }
  }));
}

// ============================================================================
// FILE: pos-backend/src/utils/uomConverter.ts
// ============================================================================

import { Decimal } from '@prisma/client/runtime/library';

export interface Product {
  baseUnit: string;
  hasMultipleUnits: boolean;
  alternateUnit: string | null;
  conversionFactor: Decimal | null;
}

/**
 * Convert quantity from given unit to base unit
 * @param product - Product with UOM settings
 * @param quantity - Quantity in given unit
 * @param unit - Unit type: "base" or "alternate"
 * @returns Quantity in base units
 */
export function convertToBaseUnit(
  product: Product,
  quantity: Decimal | number,
  unit: string
): Decimal {
  const qty = new Decimal(quantity);

  if (unit === 'base' || !product.hasMultipleUnits) {
    return qty;
  }

  if (unit === 'alternate' && product.conversionFactor) {
    return qty.mul(product.conversionFactor);
  }

  throw new Error(`Invalid unit: ${unit} for product`);
}

/**
 * Convert quantity from base unit to target unit
 * @param product - Product with UOM settings
 * @param quantity - Quantity in base units
 * @param targetUnit - Target unit: "base" or "alternate"
 * @returns Quantity in target unit
 */
export function convertFromBaseUnit(
  product: Product,
  quantity: Decimal | number,
  targetUnit: string
): Decimal {
  const qty = new Decimal(quantity);

  if (targetUnit === 'base' || !product.hasMultipleUnits) {
    return qty;
  }

  if (targetUnit === 'alternate' && product.conversionFactor) {
    return qty.div(product.conversionFactor);
  }

  throw new Error(`Invalid unit: ${targetUnit} for product`);
}

/**
 * Get unit label for display
 */
export function getUnitLabel(product: Product, unit: string): string {
  if (unit === 'base') {
    return product.baseUnit;
  }
  if (unit === 'alternate' && product.alternateUnit) {
    return product.alternateUnit;
  }
  return product.baseUnit;
}

// ============================================================================
// FILE: pos-backend/src/utils/helpers.ts
// ============================================================================

import { Decimal } from '@prisma/client/runtime/library';

/**
 * Generate unique document number
 * @param prefix - Document prefix (e.g., "INV", "PO", "REC")
 * @param lastNumber - Last number used
 * @returns New document number
 */
export function generateDocumentNumber(prefix: string, lastNumber: number = 0): string {
  const number = (lastNumber + 1).toString().padStart(6, '0');
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}-${date}-${number}`;
}

/**
 * Calculate tax amount
 */
export function calculateTax(amount: Decimal | number, taxRate: Decimal | number): Decimal {
  return new Decimal(amount).mul(new Decimal(taxRate));
}

/**
 * Calculate discount amount
 */
export function calculateDiscount(
  amount: Decimal | number,
  discount: Decimal | number,
  isPercentage: boolean = false
): Decimal {
  const amt = new Decimal(amount);
  const disc = new Decimal(discount);
  
  if (isPercentage) {
    return amt.mul(disc.div(100));
  }
  return disc;
}

/**
 * Round to 2 decimal places
 */
export function round2(value: Decimal | number): Decimal {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Round to 4 decimal places (for quantities)
 */
export function round4(value: Decimal | number): Decimal {
  return new Decimal(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: Decimal | number, currency: string = 'USD'): string {
  const num = typeof amount === 'number' ? amount : Number(amount.toString());
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(num);
}

/**
 * Parse query pagination
 */
export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export function parsePagination(page?: string, limit?: string): PaginationParams {
  const pageNum = Math.max(1, parseInt(page || '1', 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit || '50', 10)));
  const skip = (pageNum - 1) * limitNum;

  return { page: pageNum, limit: limitNum, skip };
}

/**
 * Build pagination response
 */
export interface PaginationResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function buildPaginationResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginationResponse<T> {
  const totalPages = Math.ceil(total / params.limit);

  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
      hasNext: params.page < totalPages,
      hasPrev: params.page > 1
    }
  };
}

/**
 * Sanitize search query
 */
export function sanitizeSearchQuery(query?: string): string | undefined {
  if (!query) return undefined;
  return query.trim().replace(/[^\w\s-]/g, '');
}

/**
 * Parse date range
 */
export interface DateRange {
  startDate?: Date;
  endDate?: Date;
}

export function parseDateRange(startDate?: string, endDate?: string): DateRange {
  const range: DateRange = {};

  if (startDate) {
    range.startDate = new Date(startDate);
    range.startDate.setHours(0, 0, 0, 0);
  }

  if (endDate) {
    range.endDate = new Date(endDate);
    range.endDate.setHours(23, 59, 59, 999);
  }

  return range;
}

console.log('✅ Utility files template created');
console.log('📁 Split into: logger.ts, fifoCalculator.ts, uomConverter.ts, helpers.ts');
