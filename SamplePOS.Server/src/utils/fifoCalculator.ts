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
