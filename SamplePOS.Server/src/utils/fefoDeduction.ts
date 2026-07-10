/**
 * Shared FEFO (First Expiry First Out) stock deduction utility.
 *
 * Routes all consumption through LotService.consumeLot (ADR-002 §8).
 * Callers: delivery notes, distribution, quotations, legacy single-store paths.
 */

import { PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { Money } from './money.js';
import { lotService } from '../modules/inventory-lot/lotService.js';
import type { MovementType } from '../modules/stock-movements/types.js';

export interface FEFODeductionRequest {
  productId: string;
  quantity: Decimal;
  specificBatchId?: string;
  movementType: MovementType;
  referenceType: string;
  referenceId: string;
  createdById: string;
  productName?: string;
  storeLocationId?: string | null;
  minDaysBeforeExpiry?: number;
}

export interface FEFODeductionResult {
  totalCost: Decimal;
  batchCount: number;
  batches: Array<{
    batchId: string;
    quantity: Decimal;
    costPrice: Decimal;
    lineCost: Decimal;
  }>;
}

export async function deductStockFEFO(
  client: PoolClient,
  request: FEFODeductionRequest,
): Promise<FEFODeductionResult> {
  const quantity = Number(request.quantity.toFixed(4));
  if (quantity <= 0) {
    return { totalCost: new Decimal(0), batchCount: 0, batches: [] };
  }

  const result = await lotService.consumeLot(client, {
    productId: request.productId,
    quantity,
    storeLocationId: request.storeLocationId,
    specificLotId: request.specificBatchId,
    selectionPolicy: 'FEFO',
    minDaysBeforeExpiry: request.minDaysBeforeExpiry,
    movementType: request.movementType,
    referenceType: request.referenceType,
    referenceId: request.referenceId,
    userId: request.createdById,
    productName: request.productName,
  });

  const batches = result.layers.map((layer) => {
    const costPrice = Money.parseDb(layer.costPrice);
    const qty = new Decimal(layer.quantity);
    return {
      batchId: layer.lotId,
      quantity: qty,
      costPrice,
      lineCost: qty.times(costPrice),
    };
  });

  return {
    totalCost: Money.parseDb(result.totalCost),
    batchCount: batches.length,
    batches,
  };
}
