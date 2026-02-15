// Supplier Controller - HTTP request handlers
// Validates input, calls service layer, formats responses

import type { Request, Response, NextFunction } from 'express';
import Decimal from 'decimal.js';
import pool from '../../db/pool.js';
import { CreateSupplierSchema, UpdateSupplierSchema } from '../../../../shared/zod/supplier.js';
import * as supplierService from './supplierService.js';
import logger from '../../utils/logger.js';

/**
 * Get all suppliers with pagination
 * GET /api/suppliers
 */
export async function getSuppliers(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const result = await supplierService.getAllSuppliers(pool, page, limit);

    res.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get supplier by ID
 * GET /api/suppliers/:id
 */
export async function getSupplier(req: Request, res: Response, next: NextFunction) {
  try {
    const supplier = await supplierService.getSupplierById(pool, req.params.id);
    res.json({ success: true, data: supplier });
  } catch (error) {
    next(error);
  }
}

/**
 * Get supplier by supplier number
 * GET /api/suppliers/by-number/:supplierNumber
 */
export async function getSupplierByNumber(req: Request, res: Response, next: NextFunction) {
  try {
    const { supplierNumber } = req.params;
    const supplier = await supplierService.getSupplierByNumber(pool, supplierNumber);
    res.json({ success: true, data: supplier });
  } catch (error) {
    next(error);
  }
}

/**
 * Search suppliers
 * GET /api/suppliers/search?q=searchTerm&limit=20
 */
export async function searchSuppliers(req: Request, res: Response, next: NextFunction) {
  try {
    const searchTerm = (req.query.q as string) || '';
    const limit = parseInt(req.query.limit as string) || 20;
    const suppliers = await supplierService.searchSuppliers(pool, searchTerm, limit);
    res.json({ success: true, data: suppliers });
  } catch (error) {
    next(error);
  }
}

/**
 * Create new supplier
 * POST /api/suppliers
 */
export async function createSupplier(req: Request, res: Response, next: NextFunction) {
  try {
    const validatedData = CreateSupplierSchema.parse(req.body);
    const supplier = await supplierService.createSupplier(pool, validatedData);

    res.status(201).json({
      success: true,
      data: supplier,
      message: 'Supplier created successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update supplier
 * PUT /api/suppliers/:id
 */
export async function updateSupplier(req: Request, res: Response, next: NextFunction) {
  try {
    const validatedData = UpdateSupplierSchema.parse(req.body);
    const supplier = await supplierService.updateSupplier(pool, req.params.id, validatedData);

    res.json({
      success: true,
      data: supplier,
      message: 'Supplier updated successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete supplier (soft delete)
 * DELETE /api/suppliers/:id
 */
export async function deleteSupplier(req: Request, res: Response, next: NextFunction) {
  try {
    await supplierService.deleteSupplier(pool, req.params.id);

    res.json({
      success: true,
      message: 'Supplier deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get supplier performance metrics
 * GET /api/suppliers/:id/performance
 */
export async function getSupplierPerformance(req: Request, res: Response, next: NextFunction) {
  try {
    const supplierId = req.params.id;

    // Get purchase orders for this supplier
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
    // This reflects what's actually owed after payments
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
    // Outstanding amount comes from supplier_invoices, not purchase_orders
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
  } catch (error) {
    logger.error('Failed to get supplier performance', { supplierId: req.params.id, error });
    next(error);
  }
}

/**
 * Get supplier purchase order history
 * GET /api/suppliers/:id/orders
 */
export async function getSupplierOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const supplierId = req.params.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
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
  } catch (error) {
    logger.error('Failed to get supplier orders', { supplierId: req.params.id, error });
    next(error);
  }
}

/**
 * Get supplier products (items supplied)
 * GET /api/suppliers/:id/products
 */
export async function getSupplierProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const supplierId = req.params.id;

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
  } catch (error) {
    logger.error('Failed to get supplier products', { supplierId: req.params.id, error });
    next(error);
  }
}
