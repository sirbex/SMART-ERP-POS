// Cost Layer Service - FIFO/AVCO Inventory Valuation
// Purpose: Track and allocate inventory costs using FIFO or AVCO methods
// Bank-grade precision using Decimal.js for all monetary calculations

import Decimal from 'decimal.js';
import { pool as globalPool } from '../db/pool.js';
import type pg from 'pg';
import { BusinessError, NotFoundError } from '../middleware/errorHandler.js';
import { UnitOfWork } from '../db/unitOfWork.js';
import logger from '../utils/logger.js';
import type { CostLayer, CreateCostLayer } from '../../../shared/zod/cost-layer.js';

// Configure Decimal for financial precision (2 decimal places for currency)
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

interface CostLayerRow {
  id: string;
  product_id: string;
  quantity: string;
  remaining_quantity: string;
  unit_cost: string;
  received_date: Date;
  goods_receipt_id: string | null;
  batch_number: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface ActualCostResult {
  totalCost: Decimal;
  averageCost: Decimal;
  layers: Array<{
    costLayerId: string;
    quantityConsumed: Decimal;
    unitCost: Decimal;
    totalCost: Decimal;
  }>;
}

interface CostLayerSummary {
  layers: Array<{
    id: string;
    quantity: Decimal;
    remainingQuantity: Decimal;
    unitCost: Decimal;
    value: Decimal;
    receivedDate: Date;
    batchNumber: string | null;
  }>;
  totalQuantity: Decimal;
  totalValue: Decimal;
  averageCost: Decimal;
  activeLayerCount: number;
}

/**
 * Create new cost layer when goods are received (FIFO/AVCO tracking)
 * @param data - Cost layer creation data (product, quantity, cost, batch, GR reference)
 * @returns void (inserts cost layer record)
 * @throws Error if quantity/cost invalid or product not found
 *
 * Called During:
 * - Goods receipt finalization
 * - Purchase order receiving
 * - Stock adjustment with cost data
 *
 * Inventory Valuation Methods:
 * - **FIFO** (First In First Out): Oldest cost layers consumed first
 * - **AVCO** (Average Cost): Weighted average across all layers
 * - **STANDARD** (Fixed Cost): Manual cost override (no layers)
 *
 * Cost Layer Lifecycle:
 * 1. Created on goods receipt with full quantity
 * 2. remaining_quantity decremented on sales (FIFO consumption)
 * 3. Marked is_active=false when remaining_quantity reaches 0
 * 4. Archived after 2 years for historical valuation
 *
 * Bank-Grade Precision:
 * - Uses Decimal.js for all cost calculations
 * - 20-digit precision, ROUND_HALF_UP
 * - Prevents floating-point rounding errors
 *
 * Batch Tracking:
 * - Links to goods_receipt_id for traceability
 * - batch_number for physical inventory management
 * - received_date for aging analysis and FEFO
 *
 * Business Rules:
 * - BR-INV-001: Quantity must be positive
 * - BR-PRC-001: Unit cost cannot be negative
 * - Atomic transaction for data consistency
 *
 * @param txClient - Optional existing transaction client. When provided, all
 *   queries run on that client (no separate connection, no BEGIN/COMMIT).
 *   Use this when calling from inside an active transaction to prevent deadlocks.
 */
export async function createCostLayer(
  data: CreateCostLayer,
  dbPool?: pg.Pool,
  txClient?: pg.PoolClient
): Promise<void> {
  // If transaction client provided, run directly on it (no separate connection)
  if (txClient) {
    await _createCostLayerOnClient(txClient, data);
    return;
  }

  // Standalone mode: use UnitOfWork for transaction management
  const pool = dbPool || globalPool;

  await UnitOfWork.run(pool, async (client) => {
    await _createCostLayerOnClient(client, data);
  });
}

/**
 * Internal: create cost layer using the provided client.
 * Does NOT manage transaction boundaries (caller is responsible).
 */
async function _createCostLayerOnClient(
  client: pg.PoolClient | pg.Pool,
  data: CreateCostLayer
): Promise<void> {
  const quantity = new Decimal(data.quantity);
  const unitCost = new Decimal(data.unitCost);
  const receivedDate = data.receivedDate || new Date().toISOString();
  const totalValue = quantity.times(unitCost);

  // Validate inputs
  if (quantity.lte(0)) {
    throw new BusinessError('Quantity must be positive', 'ERR_COSTLAYER_001', {
      quantity: data.quantity,
    });
  }
  if (unitCost.lt(0)) {
    throw new BusinessError('Unit cost cannot be negative', 'ERR_COSTLAYER_002', {
      unitCost: data.unitCost,
    });
  }

  // Insert cost layer
  await client.query(
    `INSERT INTO cost_layers (
        product_id, quantity, remaining_quantity, unit_cost, 
        received_date, goods_receipt_id, batch_number, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      data.productId,
      quantity.toFixed(4),
      quantity.toFixed(4), // Initially, remaining = quantity
      unitCost.toFixed(2),
      receivedDate,
      data.goodsReceiptId || null,
      data.batchNumber || null,
      true,
    ]
  );

  // Update product_valuation's last_cost
  await client.query(
    `UPDATE product_valuation SET last_cost = $1, updated_at = NOW() WHERE product_id = $2`,
    [unitCost.toFixed(2), data.productId]
  );

  // Recalculate average cost
  await updateAverageCost(data.productId, client);

  // GL posting is handled ONLY by AccountingCore via glEntryService.
  // costLayerService must NEVER write directly to ledger_transactions/ledger_entries.
  // Callers (goodsReceiptService, etc.) are responsible for GL posting.

  logger.info('Cost layer created', {
    productId: data.productId,
    quantity: quantity.toString(),
    unitCost: unitCost.toString(),
    grId: data.goodsReceiptId,
  });
}

/**
 * Calculate actual cost using FIFO method
 * Allocates from oldest layers first
 * @param txClient - Optional existing transaction client (avoids separate connection)
 */
export async function calculateFIFOCost(
  productId: string,
  quantity: number,
  dbPool?: pg.Pool,
  txClient?: pg.PoolClient
): Promise<ActualCostResult> {
  const queryable = txClient || dbPool || globalPool;
  const requestedQty = new Decimal(quantity);

  if (requestedQty.lte(0)) {
    throw new BusinessError('Quantity must be positive', 'ERR_COSTLAYER_001', { quantity });
  }

  // Get active cost layers ordered by received_date (oldest first)
  const result = await queryable.query<CostLayerRow>(
    `SELECT * FROM cost_layers 
     WHERE product_id = $1 AND is_active = TRUE AND remaining_quantity > 0
     ORDER BY received_date ASC, created_at ASC`,
    [productId]
  );

  const layers = result.rows;

  if (layers.length === 0) {
    throw new BusinessError(`No cost layers found for product ${productId}`, 'ERR_COSTLAYER_003', {
      productId,
    });
  }

  let remainingToAllocate = requestedQty;
  let totalCost = new Decimal(0);
  const allocations: ActualCostResult['layers'] = [];

  // Allocate from layers in FIFO order
  for (const layer of layers) {
    if (remainingToAllocate.lte(0)) break;

    const availableQty = new Decimal(layer.remaining_quantity);
    const unitCost = new Decimal(layer.unit_cost);
    const quantityToConsume = Decimal.min(remainingToAllocate, availableQty);
    const layerCost = quantityToConsume.times(unitCost);

    allocations.push({
      costLayerId: layer.id,
      quantityConsumed: quantityToConsume,
      unitCost,
      totalCost: layerCost,
    });

    totalCost = totalCost.plus(layerCost);
    remainingToAllocate = remainingToAllocate.minus(quantityToConsume);
  }

  // Check if we had enough inventory
  if (remainingToAllocate.gt(0)) {
    logger.warn('Insufficient cost layers for FIFO allocation', {
      productId,
      requested: quantity,
      allocated: requestedQty.minus(remainingToAllocate).toNumber(),
      shortfall: remainingToAllocate.toNumber(),
    });
    throw new BusinessError(
      `Insufficient inventory: requested ${quantity}, available ${requestedQty.minus(remainingToAllocate).toNumber()}`,
      'ERR_COSTLAYER_004',
      {
        productId,
        requested: quantity,
        available: requestedQty.minus(remainingToAllocate).toNumber(),
        shortfall: remainingToAllocate.toNumber(),
      }
    );
  }

  const averageCost = totalCost.dividedBy(requestedQty);

  return {
    totalCost,
    averageCost,
    layers: allocations,
  };
}

/**
 * Calculate actual cost using AVCO (Weighted Average Cost) method
 * Uses average of all active layers
 * @param txClient - Optional existing transaction client (avoids separate connection)
 */
export async function calculateAVCOCost(
  productId: string,
  quantity: number,
  dbPool?: pg.Pool,
  txClient?: pg.PoolClient
): Promise<ActualCostResult> {
  const pool = txClient || dbPool || globalPool;
  const requestedQty = new Decimal(quantity);

  if (requestedQty.lte(0)) {
    throw new BusinessError('Quantity must be positive', 'ERR_COSTLAYER_001', { quantity });
  }

  // Get sum of all active cost layers
  const result = await pool.query(
    `SELECT 
      SUM(remaining_quantity) as total_quantity,
      SUM(remaining_quantity * unit_cost) as total_value
     FROM cost_layers
     WHERE product_id = $1 AND is_active = TRUE AND remaining_quantity > 0`,
    [productId]
  );

  const row = result.rows[0];
  const totalQuantity = new Decimal(row.total_quantity || 0);
  const totalValue = new Decimal(row.total_value || 0);

  if (totalQuantity.lte(0)) {
    throw new BusinessError(`No cost layers found for product ${productId}`, 'ERR_COSTLAYER_003', {
      productId,
    });
  }

  if (requestedQty.gt(totalQuantity)) {
    throw new BusinessError(
      `Insufficient inventory: requested ${quantity}, available ${totalQuantity.toNumber()}`,
      'ERR_COSTLAYER_004',
      { productId, requested: quantity, available: totalQuantity.toNumber() }
    );
  }

  // Calculate weighted average cost
  const averageCost = totalValue.dividedBy(totalQuantity);
  const totalCost = averageCost.times(requestedQty);

  return {
    totalCost,
    averageCost,
    layers: [], // AVCO doesn't track individual layer consumption
  };
}

/**
 * Calculate actual cost based on product's costing method
 * @param txClient - Optional existing transaction client (avoids separate connection
 *   and prevents deadlocks when called inside a sale transaction)
 */
export async function calculateActualCost(
  productId: string,
  quantity: number,
  costingMethod: 'FIFO' | 'AVCO' | 'STANDARD',
  dbPool?: pg.Pool,
  txClient?: pg.PoolClient
): Promise<ActualCostResult> {
  const queryable = txClient || dbPool || globalPool;
  if (costingMethod === 'FIFO') {
    return await calculateFIFOCost(productId, quantity, dbPool, txClient);
  } else if (costingMethod === 'AVCO') {
    return await calculateAVCOCost(productId, quantity, dbPool, txClient);
  } else if (costingMethod === 'STANDARD') {
    // Standard costing uses the product's average_cost field
    const result = await queryable.query(
      `SELECT average_cost FROM product_valuation WHERE product_id = $1`,
      [productId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Product ${productId}`);
    }

    const averageCost = new Decimal(result.rows[0].average_cost || 0);
    const requestedQty = new Decimal(quantity);
    const totalCost = averageCost.times(requestedQty);

    return {
      totalCost,
      averageCost,
      layers: [],
    };
  } else {
    throw new BusinessError(`Invalid costing method: ${costingMethod}`, 'ERR_COSTLAYER_005', {
      costingMethod,
      validMethods: ['FIFO', 'AVCO', 'STANDARD'],
    });
  }
}

/**
 * Deduct quantity from cost layers after a sale
 * Only used for FIFO method (AVCO and STANDARD don't track individual layers)
 *
 * @param txClient - Optional existing transaction client. If provided, all
 *   queries run on that client (no separate connection, no BEGIN/COMMIT).
 *   This MUST be used when called from within an active transaction to
 *   prevent deadlocks caused by two connections locking the same product row.
 */
export async function deductFromCostLayers(
  productId: string,
  quantity: number,
  costingMethod: 'FIFO' | 'AVCO' | 'STANDARD',
  dbPool?: pg.Pool,
  txClient?: pg.PoolClient
): Promise<void> {
  if (costingMethod !== 'FIFO') {
    // AVCO and STANDARD don't need layer deduction
    return;
  }

  // If a transaction client is provided, run all queries on it directly
  // (no separate connection, no nested BEGIN/COMMIT)
  if (txClient) {
    await _deductFromCostLayersOnClient(txClient, productId, quantity);
    return;
  }

  // Standalone mode: use UnitOfWork for transaction management
  const pool = dbPool || globalPool;

  await UnitOfWork.run(pool, async (client) => {
    await _deductFromCostLayersOnClient(client, productId, quantity);

    logger.info('Cost layers deducted (standalone)', {
      productId,
      quantity: quantity.toString(),
    });
  });
}

/**
 * Internal: deduct cost layers using the provided client.
 * Does NOT manage transaction boundaries (caller is responsible).
 */
async function _deductFromCostLayersOnClient(
  client: pg.PoolClient | pg.Pool,
  productId: string,
  quantity: number
): Promise<void> {
  const requestedQty = new Decimal(quantity);
  let remainingToDeduct = requestedQty;

  // Get layers in FIFO order
  const result = await client.query<CostLayerRow>(
    `SELECT * FROM cost_layers 
     WHERE product_id = $1 AND is_active = TRUE AND remaining_quantity > 0
     ORDER BY received_date ASC, created_at ASC
     FOR UPDATE`, // Lock rows for update
    [productId]
  );

  const layers = result.rows;

  for (const layer of layers) {
    if (remainingToDeduct.lte(0)) break;

    const availableQty = new Decimal(layer.remaining_quantity);
    const quantityToDeduct = Decimal.min(remainingToDeduct, availableQty);
    const newRemaining = availableQty.minus(quantityToDeduct);

    // Update layer
    await client.query(
      `UPDATE cost_layers 
       SET remaining_quantity = $1, 
           is_active = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [
        newRemaining.toFixed(4),
        newRemaining.gt(0), // Deactivate if fully consumed
        layer.id,
      ]
    );

    remainingToDeduct = remainingToDeduct.minus(quantityToDeduct);

    logger.debug('Cost layer deducted', {
      layerId: layer.id,
      deducted: quantityToDeduct.toString(),
      newRemaining: newRemaining.toString(),
    });
  }

  if (remainingToDeduct.gt(0)) {
    throw new BusinessError(
      `Insufficient cost layers to deduct ${quantity} units (short by ${remainingToDeduct.toNumber()})`,
      'ERR_COSTLAYER_004',
      { productId, requested: quantity, shortfall: remainingToDeduct.toNumber() }
    );
  }

  // Recalculate average cost
  await updateAverageCost(productId, client);

  logger.info('Cost layers deducted', {
    productId,
    quantity: quantity.toString(),
  });
}

/**
 * Update product's average_cost based on active cost layers
 */
export async function updateAverageCost(
  productId: string,
  client?: pg.PoolClient | pg.Pool,
  dbPool?: pg.Pool
): Promise<void> {
  const pool = dbPool || globalPool;
  const queryClient = client || pool;

  const result = await queryClient.query(
    `SELECT 
      SUM(remaining_quantity) as total_quantity,
      SUM(remaining_quantity * unit_cost) as total_value
     FROM cost_layers
     WHERE product_id = $1 AND is_active = TRUE AND remaining_quantity > 0`,
    [productId]
  );

  const row = result.rows[0];
  const totalQuantity = new Decimal(row.total_quantity || 0);
  const totalValue = new Decimal(row.total_value || 0);

  const averageCost = totalQuantity.gt(0) ? totalValue.dividedBy(totalQuantity) : new Decimal(0);

  await queryClient.query(
    `UPDATE product_valuation SET average_cost = $1, updated_at = NOW() WHERE product_id = $2`,
    [averageCost.toFixed(2), productId]
  );

  logger.debug('Average cost updated', {
    productId,
    averageCost: averageCost.toString(),
  });
}

/**
 * Get cost layer summary for a product
 */
export async function getCostLayerSummary(
  productId: string,
  dbPool?: pg.Pool
): Promise<CostLayerSummary> {
  const pool = dbPool || globalPool;
  const result = await pool.query<CostLayerRow>(
    `SELECT * FROM cost_layers 
     WHERE product_id = $1 AND is_active = TRUE AND remaining_quantity > 0
     ORDER BY received_date ASC`,
    [productId]
  );

  const layers = result.rows.map((row) => {
    const quantity = new Decimal(row.quantity);
    const remainingQuantity = new Decimal(row.remaining_quantity);
    const unitCost = new Decimal(row.unit_cost);
    const value = remainingQuantity.times(unitCost);

    return {
      id: row.id,
      quantity,
      remainingQuantity,
      unitCost,
      value,
      receivedDate: row.received_date,
      batchNumber: row.batch_number,
    };
  });

  const totalQuantity = layers.reduce(
    (sum, layer) => sum.plus(layer.remainingQuantity),
    new Decimal(0)
  );

  const totalValue = layers.reduce((sum, layer) => sum.plus(layer.value), new Decimal(0));

  const averageCost = totalQuantity.gt(0) ? totalValue.dividedBy(totalQuantity) : new Decimal(0);

  return {
    layers,
    totalQuantity,
    totalValue,
    averageCost,
    activeLayerCount: layers.length,
  };
}

// returnToCostLayers removed: was dead code with no callers and bypassed GL guards.
// For stock returns, use goodsReceiptService which handles cost layers + GL atomically.
