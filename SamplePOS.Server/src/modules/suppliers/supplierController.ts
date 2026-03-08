// Supplier Controller - HTTP request handlers
// Validates input, calls service layer, formats responses

import type { Request, Response } from 'express';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { pool as globalPool } from '../../db/pool.js';
import { CreateSupplierSchema, UpdateSupplierSchema } from '../../../../shared/zod/supplier.js';
import * as supplierService from './supplierService.js';
import logger from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

// Zod schemas for param/query validation
const UuidParamSchema = z.object({ id: z.string().uuid() });
const SupplierNumberParamSchema = z.object({ supplierNumber: z.string().min(1) });
const PaginationQuerySchema = z.object({
  page: z.string().optional().transform(v => v ? parseInt(v) : 1),
  limit: z.string().optional().transform(v => v ? parseInt(v) : 50),
});
const SearchQuerySchema = z.object({
  q: z.string().optional().default(''),
  limit: z.string().optional().transform(v => v ? parseInt(v) : 20),
});
const OrdersPaginationSchema = z.object({
  page: z.string().optional().transform(v => v ? parseInt(v) : 1),
  limit: z.string().optional().transform(v => v ? parseInt(v) : 20),
});

/**
 * Get all suppliers with pagination
 * GET /api/suppliers
 */
export const getSuppliers = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { page, limit } = PaginationQuerySchema.parse(req.query);

  const result = await supplierService.getAllSuppliers(pool, page, limit);

  res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
  });
});

/**
 * Get supplier by ID
 * GET /api/suppliers/:id
 */
export const getSupplier = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);
  const supplier = await supplierService.getSupplierById(pool, id);
  res.json({ success: true, data: supplier });
});

/**
 * Get supplier by supplier number
 * GET /api/suppliers/by-number/:supplierNumber
 */
export const getSupplierByNumber = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { supplierNumber } = SupplierNumberParamSchema.parse(req.params);
  const supplier = await supplierService.getSupplierByNumber(pool, supplierNumber);
  res.json({ success: true, data: supplier });
});

/**
 * Search suppliers
 * GET /api/suppliers/search?q=searchTerm&limit=20
 */
export const searchSuppliers = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { q: searchTerm, limit } = SearchQuerySchema.parse(req.query);
  const suppliers = await supplierService.searchSuppliers(pool, searchTerm, limit);
  res.json({ success: true, data: suppliers });
});

/**
 * Create new supplier
 * POST /api/suppliers
 */
export const createSupplier = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const validatedData = CreateSupplierSchema.parse(req.body);
  const supplier = await supplierService.createSupplier(pool, validatedData);

  res.status(201).json({
    success: true,
    data: supplier,
    message: 'Supplier created successfully',
  });
});

/**
 * Update supplier
 * PUT /api/suppliers/:id
 */
export const updateSupplier = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);
  const validatedData = UpdateSupplierSchema.parse(req.body);
  const supplier = await supplierService.updateSupplier(pool, id, validatedData);

  res.json({
    success: true,
    data: supplier,
    message: 'Supplier updated successfully',
  });
});

/**
 * Delete supplier (soft delete)
 * DELETE /api/suppliers/:id
 */
export const deleteSupplier = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id } = UuidParamSchema.parse(req.params);
  await supplierService.deleteSupplier(pool, id);

  res.json({
    success: true,
    message: 'Supplier deleted successfully',
  });
});

/**
 * Get supplier performance metrics
 * GET /api/suppliers/:id/performance
 */
export const getSupplierPerformance = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id: supplierId } = UuidParamSchema.parse(req.params);
  const poResult = await pool.query(
    `SELECT 
      COUNT(*) as total_orders,
      COUNT(*) FILTER (WHERE status = 'DRAFT') as draft_orders,
      COUNT(*) FILTER (WHERE status = 'PENDING') as pending_orders,
      COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_orders,
      COALESCE(SUM(total_amount), 0) as total_value
    FROM purchase_orders
    WHERE supplier_id = $1`,
    [supplierId]
  );

  // Get actual outstanding amount from supplier invoices (bills)
  const invoiceResult = await pool.query(
    `SELECT COALESCE(SUM("OutstandingBalance"), 0) as outstanding_amount
    FROM supplier_invoices
    WHERE "SupplierId" = $1 
      AND deleted_at IS NULL
      AND "Status" NOT IN ('Paid', 'PAID', 'Cancelled', 'CANCELLED')`,
    [supplierId]
  );

  // Get unique products supplied
  const productsResult = await pool.query(
    `SELECT COUNT(DISTINCT poi.product_id) as unique_products
    FROM purchase_order_items poi
    JOIN purchase_orders po ON poi.purchase_order_id = po.id
    WHERE po.supplier_id = $1 AND po.status = 'COMPLETED'`,
    [supplierId]
  );

  // Get last order date
  const lastOrderResult = await pool.query(
    `SELECT MAX(order_date) as last_order_date
    FROM purchase_orders
    WHERE supplier_id = $1`,
    [supplierId]
  );

  // Use Decimal.js for bank-grade precision
  const totalValue = new Decimal(poResult.rows[0].total_value || 0);
  const outstandingAmount = new Decimal(invoiceResult.rows[0]?.outstanding_amount || 0);

  const performance = {
    totalOrders: parseInt(poResult.rows[0].total_orders) || 0,
    draftOrders: parseInt(poResult.rows[0].draft_orders) || 0,
    pendingOrders: parseInt(poResult.rows[0].pending_orders) || 0,
    completedOrders: parseInt(poResult.rows[0].completed_orders) || 0,
    totalValue: totalValue.toNumber(),
    outstandingAmount: outstandingAmount.toNumber(),
    uniqueProducts: parseInt(productsResult.rows[0].unique_products) || 0,
    lastOrderDate: lastOrderResult.rows[0].last_order_date || null,
  };

  logger.info('Supplier performance calculated', {
    supplierId,
    totalValue: totalValue.toString(),
    outstandingAmount: outstandingAmount.toString(),
  });
  res.json({ success: true, data: performance });
});

/**
 * Get supplier purchase order history
 * GET /api/suppliers/:id/orders
 */
export const getSupplierOrders = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id: supplierId } = UuidParamSchema.parse(req.params);
  const { page, limit } = OrdersPaginationSchema.parse(req.query);
  const offset = (page - 1) * limit;

  const result = await pool.query(
    `SELECT 
      id, order_number as "poNumber", order_date as "orderDate",
      expected_delivery_date as "expectedDelivery", status,
      total_amount as "totalAmount", notes,
      created_at as "createdAt"
    FROM purchase_orders
    WHERE supplier_id = $1
    ORDER BY order_date DESC, created_at DESC
    LIMIT $2 OFFSET $3`,
    [supplierId, limit, offset]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM purchase_orders WHERE supplier_id = $1`,
    [supplierId]
  );

  res.json({
    success: true,
    data: result.rows,
    pagination: {
      page,
      limit,
      total: parseInt(countResult.rows[0].total),
      totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit),
    },
  });
});

/**
 * Get supplier products (items supplied)
 * GET /api/suppliers/:id/products
 */
export const getSupplierProducts = asyncHandler(async (req: Request, res: Response) => {
  const pool = req.tenantPool || globalPool;
  const { id: supplierId } = UuidParamSchema.parse(req.params);
  const result = await pool.query(
    `SELECT 
      poi.product_id as "productId",
      p.name as "productName",
      p.sku,
      COUNT(DISTINCT po.id) as "orderCount",
      SUM(poi.ordered_quantity) as "totalOrdered",
      COALESCE(SUM(gri.received_quantity), 0) as "totalReceived",
      AVG(poi.unit_price) as "avgUnitCost",
      SUM(poi.ordered_quantity * poi.unit_price) as "totalSpent",
      MIN(poi.unit_price) as "minUnitCost",
      MAX(poi.unit_price) as "maxUnitCost",
      MAX(po.order_date) as "lastOrderDate"
    FROM purchase_order_items poi
    JOIN purchase_orders po ON poi.purchase_order_id = po.id
    JOIN products p ON p.id = poi.product_id
    LEFT JOIN goods_receipts gr ON gr.purchase_order_id = po.id AND gr.status = 'COMPLETED'
    LEFT JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id AND gri.product_id = poi.product_id
    WHERE po.supplier_id = $1 AND po.status != 'CANCELLED'
    GROUP BY poi.product_id, p.name, p.sku
    ORDER BY "totalSpent" DESC`,
    [supplierId]
  );

  // Apply Decimal.js for bank-grade precision on monetary values
  const productsWithPrecision = result.rows.map((row) => ({
    ...row,
    orderCount: parseInt(row.orderCount) || 0,
    totalOrdered: new Decimal(row.totalOrdered || 0).toNumber(),
    totalReceived: new Decimal(row.totalReceived || 0).toNumber(),
    avgUnitCost: new Decimal(row.avgUnitCost || 0).toNumber(),
    totalSpent: new Decimal(row.totalSpent || 0).toNumber(),
    minUnitCost: new Decimal(row.minUnitCost || 0).toNumber(),
    maxUnitCost: new Decimal(row.maxUnitCost || 0).toNumber(),
  }));

  res.json({ success: true, data: productsWithPrecision });
});
