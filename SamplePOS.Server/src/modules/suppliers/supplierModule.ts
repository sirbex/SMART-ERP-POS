// Suppliers Module - Combined for brevity
// Repository, Service, Controller, Routes

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { pool as globalPool } from '../../db/pool.js';
import { CreateSupplierSchema, UpdateSupplierSchema } from '../../../../shared/zod/supplier.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { PurchaseOrderBusinessRules } from '../../middleware/businessRules.js';
import logger from '../../utils/logger.js';

// ============================================================================
// REPOSITORY LAYER - Raw SQL Only, No Business Logic
// ============================================================================

const supplierRepository = {
  async findAll(pool: Pool, limit: number, offset: number) {
    const result = await pool.query(
      `SELECT 
        "Id" as id, "SupplierCode" as "supplierNumber", "CompanyName" as name, 
        "ContactName" as "contactPerson", "Email" as email, "Phone" as phone, "Address" as address,
        "DefaultPaymentTerms" as "paymentTerms", "CreditLimit" as "creditLimit",
        COALESCE("OutstandingBalance", 0) as "outstandingBalance",
        "TaxId" as "taxId", "Notes" as notes, "IsActive" as "isActive",
        "CreatedAt" as "createdAt", "UpdatedAt" as "updatedAt"
      FROM suppliers 
      WHERE "IsActive" = true
      ORDER BY "CompanyName" ASC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  },

  async findById(pool: Pool, id: string) {
    const result = await pool.query(
      `SELECT 
        "Id" as id, "SupplierCode" as "supplierNumber", "CompanyName" as name, 
        "ContactName" as "contactPerson", "Email" as email, "Phone" as phone, "Address" as address,
        "DefaultPaymentTerms" as "paymentTerms", "CreditLimit" as "creditLimit",
        COALESCE("OutstandingBalance", 0) as "outstandingBalance",
        "TaxId" as "taxId", "Notes" as notes, "IsActive" as "isActive",
        "CreatedAt" as "createdAt", "UpdatedAt" as "updatedAt"
      FROM suppliers WHERE "Id" = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async findBySupplierNumber(pool: Pool, supplierNumber: string) {
    const result = await pool.query(
      `SELECT 
        "Id" as id, "SupplierCode" as "supplierNumber", "CompanyName" as name, 
        "ContactName" as "contactPerson", "Email" as email, "Phone" as phone, "Address" as address,
        "DefaultPaymentTerms" as "paymentTerms", "CreditLimit" as "creditLimit",
        COALESCE("OutstandingBalance", 0) as "outstandingBalance",
        "TaxId" as "taxId", "Notes" as notes, "IsActive" as "isActive",
        "CreatedAt" as "createdAt", "UpdatedAt" as "updatedAt"
      FROM suppliers WHERE "SupplierCode" = $1`,
      [supplierNumber]
    );
    return result.rows[0] || null;
  },

  async searchSuppliers(pool: Pool, searchTerm: string, limit: number = 20) {
    const result = await pool.query(
      `SELECT 
        "Id" as id, "SupplierCode" as "supplierNumber", "CompanyName" as name, 
        "ContactName" as "contactPerson", "Email" as email, "Phone" as phone, "Address" as address,
        "DefaultPaymentTerms" as "paymentTerms", "CreditLimit" as "creditLimit",
        COALESCE("OutstandingBalance", 0) as "outstandingBalance",
        "TaxId" as "taxId", "Notes" as notes, "IsActive" as "isActive",
        "CreatedAt" as "createdAt", "UpdatedAt" as "updatedAt"
      FROM suppliers 
      WHERE "IsActive" = true
        AND ("SupplierCode" ILIKE $1
        OR "CompanyName" ILIKE $1
        OR "ContactName" ILIKE $1
        OR "Email" ILIKE $1)
      ORDER BY 
        CASE 
          WHEN "SupplierCode" ILIKE $1 THEN 1
          WHEN "CompanyName" ILIKE $2 THEN 2
          ELSE 3
        END,
        "CompanyName" ASC
      LIMIT $3`,
      [`%${searchTerm}%`, `${searchTerm}%`, limit]
    );
    return result.rows;
  },

  async create(client: PoolClient, data: any) {
    // Generate a supplier code
    const codeResult = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING("SupplierCode" FROM 5) AS INTEGER)), 0) + 1 as next_num 
       FROM suppliers WHERE "SupplierCode" LIKE 'SUP-%'`
    );
    const nextNum = codeResult.rows[0].next_num || 1;
    const supplierCode = `SUP-${String(nextNum).padStart(4, '0')}`;

    const result = await client.query(
      `INSERT INTO suppliers ("Id", "SupplierCode", "CompanyName", "ContactName", "Email", "Phone", "Address", 
        "DefaultPaymentTerms", "CreditLimit", "OutstandingBalance", "TaxId", "Notes", "IsActive", "CreatedAt", "UpdatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, true, NOW(), NOW())
       RETURNING 
        "Id" as id, "SupplierCode" as "supplierNumber", "CompanyName" as name, 
        "ContactName" as "contactPerson", "Email" as email, "Phone" as phone, "Address" as address,
        "DefaultPaymentTerms" as "paymentTerms", "CreditLimit" as "creditLimit",
        COALESCE("OutstandingBalance", 0) as "outstandingBalance",
        "TaxId" as "taxId", "Notes" as notes, "IsActive" as "isActive",
        "CreatedAt" as "createdAt", "UpdatedAt" as "updatedAt"`,
      [
        supplierCode,
        data.name,
        data.contactPerson || null,
        data.email || null,
        data.phone || null,
        data.address || null,
        data.paymentTerms || 30, // Default to 30 days
        data.creditLimit || 0,
        data.taxId || null,
        data.notes || null,
      ]
    );
    return result.rows[0];
  },

  async update(client: PoolClient, id: string, data: any) {
    const fields: string[] = ['"UpdatedAt" = NOW()'];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      fields.push(`"CompanyName" = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.contactPerson !== undefined) {
      fields.push(`"ContactName" = $${paramIndex++}`);
      values.push(data.contactPerson);
    }
    if (data.email !== undefined) {
      fields.push(`"Email" = $${paramIndex++}`);
      values.push(data.email);
    }
    if (data.phone !== undefined) {
      fields.push(`"Phone" = $${paramIndex++}`);
      values.push(data.phone);
    }
    if (data.address !== undefined) {
      fields.push(`"Address" = $${paramIndex++}`);
      values.push(data.address);
    }
    if (data.paymentTerms !== undefined) {
      fields.push(`"DefaultPaymentTerms" = $${paramIndex++}`);
      values.push(data.paymentTerms);
    }
    if (data.creditLimit !== undefined) {
      fields.push(`"CreditLimit" = $${paramIndex++}`);
      values.push(data.creditLimit);
    }
    if (data.taxId !== undefined) {
      fields.push(`"TaxId" = $${paramIndex++}`);
      values.push(data.taxId);
    }
    if (data.notes !== undefined) {
      fields.push(`"Notes" = $${paramIndex++}`);
      values.push(data.notes);
    }
    if (data.isActive !== undefined) {
      fields.push(`"IsActive" = $${paramIndex++}`);
      values.push(data.isActive);
    }

    if (fields.length === 1) { // Only UpdatedAt
      throw new Error('No fields to update');
    }

    values.push(id);

    const result = await client.query(
      `UPDATE suppliers 
       SET ${fields.join(', ')}
       WHERE "Id" = $${paramIndex}
       RETURNING 
        "Id" as id, "SupplierCode" as "supplierNumber", "CompanyName" as name, 
        "ContactName" as "contactPerson", "Email" as email, "Phone" as phone, "Address" as address,
        "DefaultPaymentTerms" as "paymentTerms", "CreditLimit" as "creditLimit",
        COALESCE("OutstandingBalance", 0) as "outstandingBalance",
        "TaxId" as "taxId", "Notes" as notes, "IsActive" as "isActive",
        "CreatedAt" as "createdAt", "UpdatedAt" as "updatedAt"`,
      values
    );
    return result.rows[0] || null;
  },

  async softDelete(client: PoolClient, id: string) {
    // Soft delete by setting IsActive to false
    const result = await client.query(
      `UPDATE suppliers SET "IsActive" = false, "UpdatedAt" = NOW() WHERE "Id" = $1 RETURNING "Id"`,
      [id]
    );
    return result.rows.length > 0;
  },

  async countAll(pool: Pool, includeInactive: boolean = false) {
    const whereClause = includeInactive ? '' : 'WHERE "IsActive" = true';
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM suppliers ${whereClause}`
    );
    return parseInt(result.rows[0].count, 10);
  },

  /**
   * @deprecated DO NOT USE - Supplier balance is managed by database triggers
   * 
   * The supplier outstanding balance is automatically maintained by:
   * - trg_sync_supplier_on_invoice -> fn_recalculate_supplier_ap_balance
   * 
   * Using this will cause DOUBLE-COUNTING issues.
   */
  async updateOutstandingBalance(client: PoolClient, supplierId: string, change: number) {
    console.warn(
      `DEPRECATED: updateOutstandingBalance called for supplier ${supplierId}. ` +
      `Supplier balance is managed by database triggers. This may cause inconsistencies.`
    );
    const result = await client.query(
      `UPDATE suppliers 
       SET "OutstandingBalance" = COALESCE("OutstandingBalance", 0) + $1, "UpdatedAt" = NOW()
       WHERE "Id" = $2
       RETURNING COALESCE("OutstandingBalance", 0) as "outstandingBalance"`,
      [change, supplierId]
    );
    return result.rows[0]?.outstandingBalance || 0;
  },
};

// ============================================================================
// SERVICE LAYER - Business Logic
// ============================================================================

const supplierService = {
  async getAllSuppliers(pool: Pool, page: number = 1, limit: number = 50) {
    const offset = (page - 1) * limit;
    const [data, total] = await Promise.all([
      supplierRepository.findAll(pool, limit, offset),
      supplierRepository.countAll(pool),
    ]);

    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async getSupplierById(pool: Pool, id: string) {
    const supplier = await supplierRepository.findById(pool, id);
    if (!supplier) {
      throw new Error(`Supplier with ID ${id} not found`);
    }
    return supplier;
  },

  async getSupplierByNumber(pool: Pool, supplierNumber: string) {
    const supplier = await supplierRepository.findBySupplierNumber(pool, supplierNumber);
    if (!supplier) {
      throw new Error(`Supplier with number ${supplierNumber} not found`);
    }
    return supplier;
  },

  async searchSuppliers(pool: Pool, searchTerm: string, limit: number = 20) {
    if (!searchTerm || searchTerm.trim().length === 0) {
      return [];
    }
    return supplierRepository.searchSuppliers(pool, searchTerm.trim(), limit);
  },

  async createSupplier(pool: Pool, data: any) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // BR-PO-001: Validate supplier data
      if (!data.name || data.name.trim().length < 2) {
        throw new Error('Supplier name must be at least 2 characters');
      }

      logger.info('BR-PO-001: Supplier data validation passed', {
        name: data.name,
      });

      const supplier = await supplierRepository.create(client, data);

      await client.query('COMMIT');

      logger.info('Supplier created successfully', { supplierId: supplier.id });
      return supplier;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create supplier', { error });
      throw error;
    } finally {
      client.release();
    }
  },

  async updateSupplier(pool: Pool, id: string, data: any) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Check if supplier exists
      const existing = await supplierRepository.findById(pool, id);
      if (!existing) {
        throw new Error(`Supplier with ID ${id} not found`);
      }

      // BR-PO-001: Validate supplier data if name is being updated
      if (data.name !== undefined && data.name.trim().length < 2) {
        throw new Error('Supplier name must be at least 2 characters');
      }

      const supplier = await supplierRepository.update(client, id, data);

      await client.query('COMMIT');

      logger.info('Supplier updated successfully', { supplierId: id });
      return supplier;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to update supplier', { error });
      throw error;
    } finally {
      client.release();
    }
  },

  async deleteSupplier(pool: Pool, id: string) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Check if supplier exists
      const existing = await supplierRepository.findById(pool, id);
      if (!existing) {
        throw new Error(`Supplier with ID ${id} not found`);
      }

      // Check if supplier has active purchase orders
      const poCheck = await client.query(
        `SELECT COUNT(*) as count FROM purchase_orders 
         WHERE supplier_id = $1 AND status IN ('DRAFT', 'PENDING')`,
        [id]
      );

      if (parseInt(poCheck.rows[0].count) > 0) {
        throw new Error('Cannot delete supplier with active purchase orders');
      }

      const success = await supplierRepository.softDelete(client, id);

      await client.query('COMMIT');

      logger.info('Supplier deleted successfully', { supplierId: id });
      return success;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to delete supplier', { error });
      throw error;
    } finally {
      client.release();
    }
  },
};

// ============================================================================
// CONTROLLER LAYER - HTTP Handling, Validation
// ============================================================================

export async function getSuppliers(req: Request, res: Response, next: NextFunction) {
  try {
    const pool = req.tenantPool || globalPool;
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

export async function getSupplier(req: Request, res: Response, next: NextFunction) {
  try {
    const pool = req.tenantPool || globalPool;
    const supplier = await supplierService.getSupplierById(pool, req.params.id);
    res.json({ success: true, data: supplier });
  } catch (error) {
    next(error);
  }
}

export async function getSupplierByNumber(req: Request, res: Response, next: NextFunction) {
  try {
    const pool = req.tenantPool || globalPool;
    const { supplierNumber } = req.params;
    const supplier = await supplierService.getSupplierByNumber(pool, supplierNumber);
    res.json({ success: true, data: supplier });
  } catch (error) {
    next(error);
  }
}

export async function searchSuppliers(req: Request, res: Response, next: NextFunction) {
  try {
    const pool = req.tenantPool || globalPool;
    const searchTerm = (req.query.q as string) || '';
    const limit = parseInt(req.query.limit as string) || 20;
    const suppliers = await supplierService.searchSuppliers(pool, searchTerm, limit);
    res.json({ success: true, data: suppliers });
  } catch (error) {
    next(error);
  }
}

export async function createSupplier(req: Request, res: Response, next: NextFunction) {
  try {
    const pool = req.tenantPool || globalPool;
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

export async function updateSupplier(req: Request, res: Response, next: NextFunction) {
  try {
    const pool = req.tenantPool || globalPool;
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

export async function deleteSupplier(req: Request, res: Response, next: NextFunction) {
  try {
    const pool = req.tenantPool || globalPool;
    await supplierService.deleteSupplier(pool, req.params.id);

    res.json({
      success: true,
      message: 'Supplier deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

// Get supplier performance metrics
export async function getSupplierPerformance(req: Request, res: Response, next: NextFunction) {
  try {
    const pool = req.tenantPool || globalPool;
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

// Get supplier purchase order history
export async function getSupplierOrders(req: Request, res: Response, next: NextFunction) {
  try {
    const pool = req.tenantPool || globalPool;
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

// Get supplier products (items supplied)
export async function getSupplierProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const pool = req.tenantPool || globalPool;
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
      totalQuantity: new Decimal(row.totalOrdered || 0).toNumber(),
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

// ============================================================================
// ROUTES
// ============================================================================

const router = Router();

// View routes - authenticated users
router.get('/', authenticate, getSuppliers);
router.get('/search', authenticate, searchSuppliers);
router.get('/by-number/:supplierNumber', authenticate, getSupplierByNumber);
router.get('/:id', authenticate, getSupplier);
router.get('/:id/performance', authenticate, getSupplierPerformance);
router.get('/:id/orders', authenticate, getSupplierOrders);
router.get('/:id/products', authenticate, getSupplierProducts);

// Modify routes - requires supplier permissions
router.post('/', authenticate, requirePermission('suppliers.create'), createSupplier);
router.put('/:id', authenticate, requirePermission('suppliers.update'), updateSupplier);
router.delete('/:id', authenticate, requirePermission('suppliers.delete'), deleteSupplier);

export default router;
