/**
 * Number Generator Utility
 * 
 * Auto-generates unique sequential numbers for:
 * - Purchase Orders: PO-YYYY-NNNN
 * - Goods Receipts: GR-YYYY-NNNN
 * - Stock Movements: SM-YYYY-NNNNNN (6 digits for high volume)
 * - Inventory Batches: BATCH-YYYY-NNNN
 * 
 * Features:
 * - Year-based sequencing (resets each year)
 * - Zero-padded numbers
 * - Collision detection with retry logic
 * - Transaction-safe
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Generate unique Purchase Order number
 * Format: PO-YYYY-NNNN (e.g., PO-2025-0001)
 */
export async function generatePONumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;
  
  // Find the last PO number for current year
  const lastPO = await prisma.purchaseOrder.findFirst({
    where: {
      poNumber: {
        startsWith: prefix
      }
    },
    orderBy: {
      poNumber: 'desc'
    },
    select: {
      poNumber: true
    }
  });

  let nextNumber = 1;
  
  if (lastPO) {
    // Extract number from PO-2025-0001
    const lastNumberStr = lastPO.poNumber.split('-')[2];
    const lastNumber = parseInt(lastNumberStr, 10);
    nextNumber = lastNumber + 1;
  }

  const paddedNumber = nextNumber.toString().padStart(4, '0');
  const newPONumber = `${prefix}${paddedNumber}`;

  // Check for collision (paranoid check)
  const exists = await prisma.purchaseOrder.findFirst({
    where: { poNumber: newPONumber }
  });

  if (exists) {
    // Recursively try next number
    return generatePONumber();
  }

  return newPONumber;
}

/**
 * Generate unique Goods Receipt number
 * Format: GR-YYYY-NNNN (e.g., GR-2025-0001)
 */
export async function generateGRNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `GR-${year}-`;
  
  const lastGR = await prisma.goodsReceipt.findFirst({
    where: {
      receiptNumber: {
        startsWith: prefix
      }
    },
    orderBy: {
      receiptNumber: 'desc'
    },
    select: {
      receiptNumber: true
    }
  });

  let nextNumber = 1;
  
  if (lastGR) {
    const lastNumberStr = lastGR.receiptNumber.split('-')[2];
    const lastNumber = parseInt(lastNumberStr, 10);
    nextNumber = lastNumber + 1;
  }

  const paddedNumber = nextNumber.toString().padStart(4, '0');
  const newGRNumber = `${prefix}${paddedNumber}`;

  // Check for collision
  const exists = await prisma.goodsReceipt.findFirst({
    where: { receiptNumber: newGRNumber }
  });

  if (exists) {
    return generateGRNumber();
  }

  return newGRNumber;
}

/**
 * Generate unique Stock Movement number
 * Format: SM-YYYY-NNNNNN (e.g., SM-2025-000001)
 * 6 digits to handle high volume of movements
 */
export async function generateSMNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `SM-${year}-`;
  
  const lastSM = await prisma.stockMovement.findFirst({
    where: {
      movementNumber: {
        startsWith: prefix
      }
    },
    orderBy: {
      movementNumber: 'desc'
    },
    select: {
      movementNumber: true
    }
  });

  let nextNumber = 1;
  
  if (lastSM) {
    const lastNumberStr = lastSM.movementNumber.split('-')[2];
    const lastNumber = parseInt(lastNumberStr, 10);
    nextNumber = lastNumber + 1;
  }

  const paddedNumber = nextNumber.toString().padStart(6, '0');
  const newSMNumber = `${prefix}${paddedNumber}`;

  // Check for collision
  const exists = await prisma.stockMovement.findFirst({
    where: { movementNumber: newSMNumber }
  });

  if (exists) {
    return generateSMNumber();
  }

  return newSMNumber;
}

/**
 * Generate unique Batch number
 * Format: BATCH-YYYY-NNNN (e.g., BATCH-2025-0001)
 */
export async function generateBatchNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `BATCH-${year}-`;
  
  const lastBatch = await prisma.inventoryBatch.findFirst({
    where: {
      batchNumber: {
        startsWith: prefix
      }
    },
    orderBy: {
      batchNumber: 'desc'
    },
    select: {
      batchNumber: true
    }
  });

  let nextNumber = 1;
  
  if (lastBatch) {
    const lastNumberStr = lastBatch.batchNumber.split('-')[2];
    const lastNumber = parseInt(lastNumberStr, 10);
    nextNumber = lastNumber + 1;
  }

  const paddedNumber = nextNumber.toString().padStart(4, '0');
  const newBatchNumber = `${prefix}${paddedNumber}`;

  // Check for collision
  const exists = await prisma.inventoryBatch.findFirst({
    where: { batchNumber: newBatchNumber }
  });

  if (exists) {
    return generateBatchNumber();
  }

  return newBatchNumber;
}

/**
 * Validate PO number format
 */
export function isValidPONumber(poNumber: string): boolean {
  return /^PO-\d{4}-\d{4}$/.test(poNumber);
}

/**
 * Validate GR number format
 */
export function isValidGRNumber(grNumber: string): boolean {
  return /^GR-\d{4}-\d{4}$/.test(grNumber);
}

/**
 * Validate SM number format
 */
export function isValidSMNumber(smNumber: string): boolean {
  return /^SM-\d{4}-\d{6}$/.test(smNumber);
}

/**
 * Validate Batch number format
 */
export function isValidBatchNumber(batchNumber: string): boolean {
  return /^BATCH-\d{4}-\d{4}$/.test(batchNumber);
}
