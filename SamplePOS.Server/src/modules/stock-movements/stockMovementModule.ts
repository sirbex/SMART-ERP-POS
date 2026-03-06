import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { Pool } from 'pg';
import Decimal from 'decimal.js';
import { pool as globalPool } from '../../db/pool.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { InventoryBusinessRules } from '../../middleware/businessRules.js';
import logger from '../../utils/logger.js';

// Stock movement types
export type MovementType =
  | 'GOODS_RECEIPT'
  | 'SALE'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'RETURN'
  | 'DAMAGE'
  | 'EXPIRY';

export interface StockMovement {
  id: string;
  productId: string;
  batchId: string | null;
  movementType: MovementType;
  quantity: number;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: Date;
}

// Repository
export const stockMovementRepository = {
  /**
   * Record stock movement
   */
  async recordMovement(
    pool: Pool,
    data: {
      productId: string;
      batchId?: string | null;
      movementType: MovementType;
      quantity: number;
      referenceType?: string | null;
      referenceId?: string | null;
      notes?: string | null;
      createdBy?: string | null;
    }
  ): Promise<StockMovement> {
    const result = await pool.query(
      `INSERT INTO stock_movements (
        product_id, batch_id, movement_type, quantity,
        reference_type, reference_id, notes, created_by_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        data.productId,
        data.batchId || null,
        data.movementType,
        data.quantity,
        data.referenceType || null,
        data.referenceId || null,
        data.notes || null,
        data.createdBy || null,
      ]
    );
    return result.rows[0];
  },

  /**
   * Get movement history for a product
   */
  async getMovementsByProduct(
    pool: Pool,
    productId: string,
    page: number = 1,
    limit: number = 100
  ): Promise<{ movements: StockMovement[]; total: number }> {
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM stock_movements WHERE product_id = $1',
      [productId]
    );

    const result = await pool.query(
      `SELECT 
         sm.id,
         sm.movement_number AS "movementNumber",
         sm.product_id AS "productId",
         sm.batch_id AS "batchId",
         sm.movement_type AS "movementType",
         sm.quantity,
         sm.unit_cost AS "unitCost",
         sm.reference_type AS "referenceType",
         sm.reference_id AS "referenceId",
         sm.notes,
         sm.created_by_id AS "createdById",
         sm.created_at AS "createdAt",
         p.name AS "productName",
         b.batch_number AS "batchNumber"
       FROM stock_movements sm
       JOIN products p ON sm.product_id = p.id
       LEFT JOIN inventory_batches b ON sm.batch_id = b.id
       WHERE sm.product_id = $1
       ORDER BY sm.created_at DESC
       LIMIT $2 OFFSET $3`,
      [productId, limit, offset]
    );

    return {
      movements: result.rows,
      total: parseInt(countResult.rows[0].count),
    };
  },

  /**
   * Get movement history for a batch
   */
  async getMovementsByBatch(
    pool: Pool,
    batchId: string,
    page: number = 1,
    limit: number = 100
  ): Promise<{ movements: StockMovement[]; total: number }> {
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM stock_movements WHERE batch_id = $1',
      [batchId]
    );

    const result = await pool.query(
      `SELECT 
         sm.id,
         sm.movement_number AS "movementNumber",
         sm.product_id AS "productId",
         sm.batch_id AS "batchId",
         sm.movement_type AS "movementType",
         sm.quantity,
         sm.unit_cost AS "unitCost",
         sm.reference_type AS "referenceType",
         sm.reference_id AS "referenceId",
         sm.notes,
         sm.created_by_id AS "createdById",
         sm.created_at AS "createdAt",
         p.name AS "productName",
         b.batch_number AS "batchNumber"
       FROM stock_movements sm
       JOIN products p ON sm.product_id = p.id
       LEFT JOIN inventory_batches b ON sm.batch_id = b.id
       WHERE sm.batch_id = $1
       ORDER BY sm.created_at DESC
       LIMIT $2 OFFSET $3`,
      [batchId, limit, offset]
    );

    return {
      movements: result.rows,
      total: parseInt(countResult.rows[0].count),
    };
  },

  /**
   * Get all movements with filters
   */
  async getAllMovements(
    pool: Pool,
    page: number = 1,
    limit: number = 100,
    filters?: {
      movementType?: MovementType;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<{ movements: StockMovement[]; total: number }> {
    const offset = (page - 1) * limit;
    const whereClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters?.movementType) {
      whereClauses.push(`sm.movement_type = $${paramIndex++}`);
      values.push(filters.movementType);
    }

    if (filters?.startDate) {
      whereClauses.push(`DATE(sm.created_at) >= DATE($${paramIndex++})`);
      values.push(filters.startDate);
    }

    if (filters?.endDate) {
      whereClauses.push(`DATE(sm.created_at) <= DATE($${paramIndex++})`);
      values.push(filters.endDate);
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM stock_movements sm ${whereClause}`,
      values
    );

    const result = await pool.query(
      `SELECT 
         sm.id,
         sm.movement_number AS "movementNumber",
         sm.product_id AS "productId",
         sm.batch_id AS "batchId",
         sm.movement_type AS "movementType",
         sm.quantity,
         sm.unit_cost AS "unitCost",
         sm.reference_type AS "referenceType",
         sm.reference_id AS "referenceId",
         sm.notes,
         sm.created_by_id AS "createdById",
         sm.created_at AS "createdAt",
         p.name AS "productName",
         b.batch_number AS "batchNumber",
         s.sale_number AS "saleNumber",
         gr.receipt_number AS "grNumber"
       FROM stock_movements sm
       JOIN products p ON sm.product_id = p.id
       LEFT JOIN inventory_batches b ON sm.batch_id = b.id
       LEFT JOIN sales s ON sm.reference_type = 'SALE' AND sm.reference_id = s.id
       LEFT JOIN goods_receipts gr ON sm.reference_type = 'GOODS_RECEIPT' AND sm.reference_id = gr.id
       ${whereClause}
       ORDER BY sm.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    );

    return {
      movements: result.rows,
      total: parseInt(countResult.rows[0].count),
    };
  },
};

// Service
export const stockMovementService = {
  /**
   * Record manual stock movement
   */
  async recordMovement(
    pool: Pool,
    data: {
      productId: string;
      batchId?: string | null;
      movementType: MovementType;
      quantity: number;
      notes?: string | null;
      createdBy: string;
    }
  ): Promise<StockMovement> {
    // Validate movement type for manual recording
    const manualTypes: MovementType[] = [
      'ADJUSTMENT_IN',
      'ADJUSTMENT_OUT',
      'DAMAGE',
      'EXPIRY',
      'RETURN',
    ];

    if (!manualTypes.includes(data.movementType)) {
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
  },

  /**
   * Get movements by product
   */
  async getMovementsByProduct(
    pool: Pool,
    productId: string,
    page: number = 1,
    limit: number = 100
  ) {
    return stockMovementRepository.getMovementsByProduct(pool, productId, page, limit);
  },

  /**
   * Get movements by batch
   */
  async getMovementsByBatch(pool: Pool, batchId: string, page: number = 1, limit: number = 100) {
    return stockMovementRepository.getMovementsByBatch(pool, batchId, page, limit);
  },

  /**
   * Get all movements
   */
  async getAllMovements(
    pool: Pool,
    page: number = 1,
    limit: number = 100,
    filters?: { movementType?: MovementType; startDate?: Date; endDate?: Date }
  ) {
    return stockMovementRepository.getAllMovements(pool, page, limit, filters);
  },
};

// Validation schemas
const RecordMovementSchema = z
  .object({
    productId: z.string().uuid(),
    batchId: z.string().uuid().optional().nullable(),
    movementType: z.enum(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRY', 'RETURN']),
    quantity: z.number().refine((val) => val !== 0, { message: 'Quantity cannot be zero' }),
    notes: z.string().optional().nullable(),
    createdBy: z.string().uuid(),
  })
  .strict();

const ListMovementsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val) : 100)),
  movementType: z
    .enum([
      'GOODS_RECEIPT',
      'SALE',
      'ADJUSTMENT_IN',
      'ADJUSTMENT_OUT',
      'TRANSFER_IN',
      'TRANSFER_OUT',
      'RETURN',
      'DAMAGE',
      'EXPIRY',
    ])
    .optional(),
  startDate: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
  endDate: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
});

// Controller
export const stockMovementController = {
  /**
   * Record manual stock movement
   */
  async recordMovement(req: Request, res: Response): Promise<void> {
    try {
      const pool = req.tenantPool || globalPool;
      const validatedData = RecordMovementSchema.parse(req.body);
      const result = await stockMovementService.recordMovement(pool, validatedData);

      res.status(201).json({
        success: true,
        data: result,
        message: 'Stock movement recorded successfully',
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }

      console.error('Error recording stock movement:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to record stock movement',
      });
    }
  },

  /**
   * Get movements by product
   */
  async getMovementsByProduct(req: Request, res: Response): Promise<void> {
    try {
      const pool = req.tenantPool || globalPool;
      const { productId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 100;

      const result = await stockMovementService.getMovementsByProduct(pool, productId, page, limit);

      res.json({
        success: true,
        data: result.movements,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (error: unknown) {
      console.error('Error getting product movements:', error);
      res.status(500).json({
        success: false,
        error: `Failed to get product movements: ${(error instanceof Error ? error.message : String(error))}`,
      });
    }
  },

  /**
   * Get movements by batch
   */
  async getMovementsByBatch(req: Request, res: Response): Promise<void> {
    try {
      const pool = req.tenantPool || globalPool;
      const { batchId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 100;

      const result = await stockMovementService.getMovementsByBatch(pool, batchId, page, limit);

      res.json({
        success: true,
        data: result.movements,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      });
    } catch (error: unknown) {
      console.error('Error getting batch movements:', error);
      res.status(500).json({
        success: false,
        error: `Failed to get batch movements: ${(error instanceof Error ? error.message : String(error))}`,
      });
    }
  },

  /**
   * Get all movements
   */
  async getAllMovements(req: Request, res: Response): Promise<void> {
    try {
      const pool = req.tenantPool || globalPool;
      const query = ListMovementsQuerySchema.parse(req.query);
      const result = await stockMovementService.getAllMovements(pool, query.page, query.limit, {
        movementType: query.movementType,
        startDate: query.startDate,
        endDate: query.endDate,
      });

      res.json({
        success: true,
        data: result.movements,
        pagination: {
          page: query.page,
          limit: query.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / query.limit),
        },
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: error.errors,
        });
        return;
      }

      console.error('Error getting movements:', error);
      res.status(500).json({
        success: false,
        error: `Failed to get movements: ${(error instanceof Error ? error.message : String(error))}`,
      });
    }
  },
};

// Routes
export const stockMovementRoutes = Router();

// View routes - all authenticated users
stockMovementRoutes.get('/', authenticate, stockMovementController.getAllMovements);
stockMovementRoutes.get(
  '/product/:productId',
  authenticate,
  stockMovementController.getMovementsByProduct
);
stockMovementRoutes.get(
  '/batch/:batchId',
  authenticate,
  stockMovementController.getMovementsByBatch
);

// Manual movement recording - requires inventory.create permission
stockMovementRoutes.post(
  '/',
  authenticate,
  requirePermission('inventory.create'),
  stockMovementController.recordMovement
);
