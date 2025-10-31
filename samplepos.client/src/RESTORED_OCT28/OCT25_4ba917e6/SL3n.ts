/**
 * Purchase Orders API Module
 * 
 * Complete CRUD operations for Purchase Orders with business logic:
 * - Create PO with items and auto-generated PO number
 * - Update PO (only in DRAFT status)
 * - Send PO to supplier (DRAFT → PENDING)
 * - List POs with filters (status, supplier, date)
 * - Get single PO with full details
 * - Cancel PO
 * - Get pending POs for receiving screen
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import {
  CreatePurchaseOrderSchema,
  UpdatePurchaseOrderSchema,
  PurchaseOrderFiltersSchema,
  SendPurchaseOrderSchema,
  CreatePurchaseOrderInput,
  UpdatePurchaseOrderInput,
  PurchaseOrderFilters
} from '../validation/purchaseOrder.js';
import { generatePONumber } from '../utils/numberGenerator.js';
import { sendTablePdf } from '../utils/pdf.js';

const router = Router();
const prisma = new PrismaClient();

/**
 * POST /api/purchase-orders
 * Create a new purchase order with items
 */
router.post('/', authenticate, async (req, res) => {
  console.log(" Incoming Purchase Order BODY:", req.body);
  
  try {
    // Validate request body
    const validatedData = CreatePurchaseOrderSchema.parse(req.body) as CreatePurchaseOrderInput;
    const userId = (req as any).user?.id; // From auth middleware

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Validate supplier exists
    const supplier = await prisma.supplier.findUnique({
      where: { id: validatedData.supplierId }
    });

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    // Validate all products exist
    const productIds = validatedData.items.map(item => item.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } }
    });

    if (products.length !== productIds.length) {
      return res.status(404).json({ error: 'One or more products not found' });
    }

    // Generate PO number
    const poNumber = await generatePONumber();

    // Calculate totals using Decimal.js for precision
    let subtotal = new Decimal(0);
    const itemsWithTotals = validatedData.items.map(item => {
      const qty = new Decimal(item.orderedQuantity);
      const price = new Decimal(item.unitPrice);
      const total = qty.times(price);
      subtotal = subtotal.plus(total);

      return {
        productId: item.productId,
        orderedQuantity: item.orderedQuantity,
        unitPrice: item.unitPrice,
        notes: item.notes
      };
    });

    // For simplicity, assume 0% tax. Adjust as needed for your business.
    const taxAmount = new Decimal(0);
    const totalAmount = subtotal.plus(taxAmount);

    // Create PO with items in a transaction
    const purchaseOrder = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          poNumber,
          supplierId: validatedData.supplierId,
          createdById: userId,
          status: 'DRAFT',
          subtotal: subtotal.toNumber(),
          taxAmount: taxAmount.toNumber(),
          totalAmount: totalAmount.toNumber(),
          expectedDeliveryDate: validatedData.expectedDeliveryDate 
            ? new Date(validatedData.expectedDeliveryDate) 
            : null,
          paymentTerms: validatedData.paymentTerms,
          notes: validatedData.notes,
          items: {
            create: itemsWithTotals
          }
        },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  barcode: true,
                }
              }
            }
          },
          supplier: {
            select: {
              id: true,
              name: true,
              contactPerson: true,
              phone: true,
              email: true
            }
          },
          createdBy: {
            select: {
              id: true,
              fullName: true,
              username: true
            }
          }
        }
      });

      return po;
    });

    return res.status(201).json({
      success: true,
      data: purchaseOrder
    });

  } catch (error: any) {
    console.error('Error creating purchase order:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors
      });
    }

    return res.status(500).json({
      error: 'Failed to create purchase order',
      details: error.message
    });
  }
});

/**
 * GET /api/purchase-orders
 * List purchase orders with filters and pagination
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    // Parse and validate query parameters
    const filters = PurchaseOrderFiltersSchema.parse({
      status: req.query.status,
      supplierId: req.query.supplierId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20
    }) as PurchaseOrderFilters;

    // Build where clause
    const where: any = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.supplierId) {
      where.supplierId = filters.supplierId;
    }

    if (filters.startDate || filters.endDate) {
      where.orderDate = {};
      if (filters.startDate) {
        where.orderDate.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.orderDate.lte = new Date(filters.endDate);
      }
    }

    // Calculate pagination
    const skip = (filters.page - 1) * filters.limit;
    const take = filters.limit;

    // Fetch purchase orders and total count
    const [purchaseOrders, totalCount] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        skip,
        take,
        orderBy: { orderDate: 'desc' },
        include: {
          supplier: {
            select: {
              id: true,
              name: true
            }
          },
          createdBy: {
            select: {
              id: true,
              fullName: true
            }
          },
          _count: {
            select: { items: true }
          }
        }
      }),
      prisma.purchaseOrder.count({ where })
    ]);

    return res.json({
      success: true,
      data: purchaseOrders,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        totalCount,
        totalPages: Math.ceil(totalCount / filters.limit)
      }
    });

  } catch (error: any) {
    console.error('Error fetching purchase orders:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: error.errors
      });
    }

    return res.status(500).json({
      error: 'Failed to fetch purchase orders',
      details: error.message
    });
  }
});

/**
 * GET /api/purchase-orders/export
 * Export purchase orders summary as CSV
 */
router.get('/export', authenticate, async (req: Request, res: Response) => {
  try {
    // Looser parsing for export: accept optional filters without strict pagination limits
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const supplierId = typeof req.query.supplierId === 'string' ? req.query.supplierId : undefined;
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;

    const where: any = {};
    if (status && ['DRAFT','PENDING','PARTIAL','COMPLETED','CANCELLED'].includes(status)) {
      where.status = status;
    }
    if (supplierId) where.supplierId = supplierId;
    if (startDate || endDate) {
      where.orderDate = {};
      if (startDate) {
        const sd = new Date(startDate);
        if (!isNaN(sd.getTime())) where.orderDate.gte = sd;
      }
      if (endDate) {
        const ed = new Date(endDate);
        if (!isNaN(ed.getTime())) where.orderDate.lte = ed;
      }
    }

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where,
      orderBy: { orderDate: 'desc' },
      include: {
        supplier: { select: { name: true } },
        _count: { select: { items: true } }
      }
    });

    const headers = ['PO Number','Order Date','Supplier','Status','Items','Subtotal','Tax','Total Amount'];
    const rows = purchaseOrders.map((po: any) => [
      po.poNumber,
      new Date(po.orderDate).toISOString(),
      po.supplier?.name || '',
      po.status,
      po._count?.items || 0,
      Number(po.subtotal || 0).toFixed(2),
      Number(po.taxAmount || 0).toFixed(2),
      Number(po.totalAmount || 0).toFixed(2)
    ].map((c: any) => `"${c}"`).join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="purchase-orders-${Date.now()}.csv"`);
    return res.send(csv);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to export purchase orders', details: error.message });
  }
});

/**
 * GET /api/purchase-orders/export/pdf
 * Export purchase orders summary as PDF
 */
router.get('/export/pdf', authenticate, async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const supplierId = typeof req.query.supplierId === 'string' ? req.query.supplierId : undefined;
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;

    const where: any = {};
    if (status && ['DRAFT','PENDING','PARTIAL','COMPLETED','CANCELLED'].includes(status)) where.status = status;
    if (supplierId) where.supplierId = supplierId;
    if (startDate || endDate) {
      where.orderDate = {};
      if (startDate) { const sd = new Date(startDate); if (!isNaN(sd.getTime())) where.orderDate.gte = sd; }
      if (endDate) { const ed = new Date(endDate); if (!isNaN(ed.getTime())) where.orderDate.lte = ed; }
    }

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where,
      orderBy: { orderDate: 'desc' },
      include: {
        supplier: { select: { name: true } },
        _count: { select: { items: true } }
      }
    });

    const headers = ['PO Number','Order Date','Supplier','Status','Items','Subtotal','Tax','Total'];
    const rows = purchaseOrders.map((po: any) => [
      po.poNumber,
      new Date(po.orderDate).toLocaleString(),
      po.supplier?.name || '',
      po.status,
      po._count?.items || 0,
      Number(po.subtotal || 0).toFixed(2),
      Number(po.taxAmount || 0).toFixed(2),
      Number(po.totalAmount || 0).toFixed(2)
    ]);

    sendTablePdf(
      res,
      'Purchase Orders Summary',
      supplierId ? `Filtered by supplier ${supplierId}` : undefined,
      headers,
      rows,
      `purchase-orders-${Date.now()}.pdf`
    );
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to export purchase orders (PDF)', details: error.message });
  }
});

/**
 * GET /api/purchase-orders/pending
 * Get pending purchase orders for receiving screen
 */
router.get('/pending', authenticate, async (req: Request, res: Response) => {
  try {
    const pendingOrders = await prisma.purchaseOrder.findMany({
      where: {
        status: {
          in: ['PENDING', 'PARTIAL']
        }
      },
      orderBy: { expectedDeliveryDate: 'asc' },
      include: {
        supplier: true,
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                barcode: true,
                baseUnit: true
              }
            }
          }
        },
        _count: {
          select: { goodsReceipts: true }
        }
      }
    });

    return res.json({
      success: true,
      data: pendingOrders
    });

  } catch (error: any) {
    console.error('Error fetching pending purchase orders:', error);
    return res.status(500).json({
      error: 'Failed to fetch pending orders',
      details: error.message
    });
  }
});

/**
 * GET /api/purchase-orders/:id
 * Get single purchase order with full details
 */
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                barcode: true,
                baseUnit: true,
                currentStock: true
              }
            }
          }
        },
        supplier: true,
        createdBy: {
          select: {
            id: true,
            fullName: true,
            username: true
          }
        },
        goodsReceipts: {
          select: {
            id: true,
            receiptNumber: true,
            receivedDate: true,
            status: true
          }
        }
      }
    });

      if (!purchaseOrder) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }

      // Transform items to match frontend expectations
      const formattedPO = {
        ...purchaseOrder,
        items: purchaseOrder.items.map(item => ({
          ...item,
          quantity: item.orderedQuantity, // Map to 'quantity'
          totalPrice: Number(item.orderedQuantity) * Number(item.unitPrice) // Calculate totalPrice
        }))
      };

      console.log(`[DEBUG] Purchase Order ${id} - Item count: ${formattedPO.items.length}`);
      if (formattedPO.items.length > 0) {
        console.log(`[DEBUG] First item:`, JSON.stringify(formattedPO.items[0], null, 2));
      }

      return res.json({
        success: true,
        data: formattedPO
      });  } catch (error: any) {
    console.error('Error fetching purchase order:', error);
    return res.status(500).json({
      error: 'Failed to fetch purchase order',
      details: error.message
    });
  }
});

/**
 * GET /api/purchase-orders/:id/items/export
 * Export a single PO's item details as CSV
 */
router.get('/:id/items/export', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: { include: { product: { select: { name: true, barcode: true, baseUnit: true } } } },
        supplier: { select: { name: true } }
      }
    });
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });

    const headers = ['PO Number','Supplier','Order Date','Status','Product Name','Barcode','Unit','Ordered Qty','Received Qty','Unit Price','Total'];
    const rows = (po.items as any[]).map((item: any) => [
      po.poNumber,
      po.supplier?.name || '',
      new Date(po.orderDate).toISOString(),
      po.status,
      item.product?.name || '',
      item.product?.barcode || '',
      item.product?.baseUnit || 'pcs',
      Number(item.orderedQuantity || 0),
      Number(item.receivedQuantity || 0),
      Number(item.unitPrice || 0).toFixed(2),
      (Number(item.orderedQuantity || 0) * Number(item.unitPrice || 0)).toFixed(2)
    ].map((c: any) => `"${c}"`).join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="po-${po.poNumber}-items-${Date.now()}.csv"`);
    return res.send(csv);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to export PO items', details: error.message });
  }
});

/**
 * GET /api/purchase-orders/:id/items/export/pdf
 * Export a single PO's item details as PDF
 */
router.get('/:id/items/export/pdf', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: { include: { product: { select: { name: true, barcode: true, baseUnit: true } } } },
        supplier: { select: { name: true } }
      }
    });
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });

    const headers = ['Product','Barcode','Unit','Ordered','Received','Unit Price','Line Total'];
    const rows = (po.items as any[]).map((item: any) => [
      item.product?.name || '',
      item.product?.barcode || '',
      item.product?.baseUnit || 'pcs',
      Number(item.orderedQuantity || 0),
      Number(item.receivedQuantity || 0),
      Number(item.unitPrice || 0).toFixed(2),
      (Number(item.orderedQuantity || 0) * Number(item.unitPrice || 0)).toFixed(2)
    ]);

    sendTablePdf(
      res,
      `PO ${po.poNumber} - Items`,
      po.supplier?.name || undefined,
      headers,
      rows,
      `po-${po.poNumber}-items-${Date.now()}.pdf`
    );
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to export PO items (PDF)', details: error.message });
  }
});

/**
 * PUT /api/purchase-orders/:id
 * Update purchase order (only if status is DRAFT)
 */
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = UpdatePurchaseOrderSchema.parse(req.body) as UpdatePurchaseOrderInput;

    // Check if PO exists and is DRAFT
    const existingPO = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!existingPO) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    if (existingPO.status !== 'DRAFT') {
      return res.status(400).json({
        error: 'Cannot update purchase order',
        details: `Purchase order status is ${existingPO.status}. Only DRAFT orders can be updated.`
      });
    }

    // If supplier is being changed, validate it exists
    if (validatedData.supplierId) {
      const supplier = await prisma.supplier.findUnique({
        where: { id: validatedData.supplierId }
      });

      if (!supplier) {
        return res.status(404).json({ error: 'Supplier not found' });
      }
    }

    // If items are being updated, validate products and recalculate totals
    let updateData: any = {
      expectedDeliveryDate: validatedData.expectedDeliveryDate 
        ? new Date(validatedData.expectedDeliveryDate) 
        : undefined,
      paymentTerms: validatedData.paymentTerms,
      notes: validatedData.notes
    };

    if (validatedData.supplierId) {
      updateData.supplierId = validatedData.supplierId;
    }

    if (validatedData.items) {
      // Validate all products exist
      const productIds = validatedData.items.map(item => item.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds } }
      });

      if (products.length !== productIds.length) {
        return res.status(404).json({ error: 'One or more products not found' });
      }

      // Recalculate totals
      let subtotal = new Decimal(0);
      validatedData.items.forEach(item => {
        const qty = new Decimal(item.orderedQuantity);
        const price = new Decimal(item.unitPrice);
        subtotal = subtotal.plus(qty.times(price));
      });

      const taxAmount = new Decimal(0);
      const totalAmount = subtotal.plus(taxAmount);

      updateData.subtotal = subtotal.toNumber();
      updateData.taxAmount = taxAmount.toNumber();
      updateData.totalAmount = totalAmount.toNumber();
    }

    // Update PO in transaction
    const updatedPO = await prisma.$transaction(async (tx) => {
      // If items are being updated, delete old items and create new ones
      if (validatedData.items) {
        await tx.purchaseOrderItem.deleteMany({
          where: { purchaseOrderId: id }
        });
      }

      const po = await tx.purchaseOrder.update({
        where: { id },
        data: {
          ...updateData,
          ...(validatedData.items && {
            items: {
              create: validatedData.items.map(item => ({
                productId: item.productId,
                orderedQuantity: item.orderedQuantity,
                unitPrice: item.unitPrice,
                notes: item.notes
              }))
            }
          })
        },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  barcode: true,
                }
              }
            }
          },
          supplier: true,
          createdBy: {
            select: {
              id: true,
              fullName: true
            }
          }
        }
      });

      return po;
    });

    return res.json({
      success: true,
      data: updatedPO
    });

  } catch (error: any) {
    console.error('Error updating purchase order:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors
      });
    }

    return res.status(500).json({
      error: 'Failed to update purchase order',
      details: error.message
    });
  }
});

/**
 * POST /api/purchase-orders/:id/send
 * Send purchase order to supplier (DRAFT → PENDING)
 */
router.post('/:id/send', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = SendPurchaseOrderSchema.parse(req.body || {});

    // Check if PO exists and is DRAFT
    const existingPO = await prisma.purchaseOrder.findUnique({
      where: { id }
    });

    if (!existingPO) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    if (existingPO.status !== 'DRAFT') {
      return res.status(400).json({
        error: 'Cannot send purchase order',
        details: `Purchase order status is ${existingPO.status}. Only DRAFT orders can be sent.`
      });
    }

    // Update status to PENDING
    const updatedPO = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: 'PENDING',
        sentDate: validatedData.sentDate ? new Date(validatedData.sentDate) : new Date()
      },
      include: {
        items: {
          include: {
            product: true
          }
        },
        supplier: true
      }
    });

    return res.json({
      success: true,
      message: 'Purchase order sent to supplier',
      data: updatedPO
    });

  } catch (error: any) {
    console.error('Error sending purchase order:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors
      });
    }

    return res.status(500).json({
      error: 'Failed to send purchase order',
      details: error.message
    });
  }
});

/**
 * POST /api/purchase-orders/:id/cancel
 * Cancel purchase order with optional reason
 */
router.post('/:id/cancel', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    // Check if PO exists
    const existingPO = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { goodsReceipts: true }
    });

    if (!existingPO) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    // Cannot cancel if already completed
    if (existingPO.status === 'COMPLETED') {
      return res.status(400).json({
        error: 'Cannot cancel purchase order',
        details: 'Cannot cancel a completed purchase order'
      });
    }

    // Cannot cancel if goods have been received
    if (existingPO.goodsReceipts.length > 0) {
      return res.status(400).json({
        error: 'Cannot cancel purchase order',
        details: 'Cannot cancel a purchase order with goods receipts'
      });
    }

    // Update status to CANCELLED
    const cancelledPO = await prisma.purchaseOrder.update({
      where: { id },
      data: { 
        status: 'CANCELLED',
        notes: reason ? `${existingPO.notes || ''}\nCancelled: ${reason}`.trim() : existingPO.notes
      },
      include: {
        items: {
          include: {
            product: true
          }
        },
        supplier: true
      }
    });

    return res.json({
      success: true,
      message: 'Purchase order cancelled',
      data: cancelledPO
    });

  } catch (error: any) {
    console.error('Error cancelling purchase order:', error);
    return res.status(500).json({
      error: 'Failed to cancel purchase order',
      details: error.message
    });
  }
});

/**
 * DELETE /api/purchase-orders/:id
 * Cancel purchase order (soft delete via status change)
 */
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if PO exists
    const existingPO = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { goodsReceipts: true }
    });

    if (!existingPO) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    // Cannot cancel if already completed
    if (existingPO.status === 'COMPLETED') {
      return res.status(400).json({
        error: 'Cannot cancel purchase order',
        details: 'Cannot cancel a completed purchase order'
      });
    }

    // Cannot cancel if goods have been received
    if (existingPO.goodsReceipts.length > 0) {
      return res.status(400).json({
        error: 'Cannot cancel purchase order',
        details: 'Cannot cancel a purchase order with goods receipts'
      });
    }

    // Update status to CANCELLED
    const cancelledPO = await prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });

    return res.json({
      success: true,
      message: 'Purchase order cancelled',
      data: cancelledPO
    });

  } catch (error: any) {
    console.error('Error cancelling purchase order:', error);
    return res.status(500).json({
      error: 'Failed to cancel purchase order',
      details: error.message
    });
  }
});

/**
 * POST /api/purchase-orders/:id/complete
 * Mark a purchase order as COMPLETED after receiving items
 */
router.post('/:id/complete', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { receivedItems } = req.body; // Array of { productId, receivedQuantity }

    // Check if PO exists
    const existingPO = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!existingPO) {
      return res.status(404).json({ error: 'Purchase order not found' });
    }

    // Cannot complete if already completed
    if (existingPO.status === 'COMPLETED') {
      return res.status(400).json({
        error: 'Purchase order already completed'
      });
    }

    // Cannot complete if cancelled
    if (existingPO.status === 'CANCELLED') {
      return res.status(400).json({
        error: 'Cannot complete a cancelled purchase order'
      });
    }

    // Update PO status and item received quantities
    const updatedPO = await prisma.$transaction(async (tx) => {
      // Update each item's received quantity
      if (receivedItems && Array.isArray(receivedItems)) {
        for (const received of receivedItems) {
          await tx.purchaseOrderItem.updateMany({
            where: {
              purchaseOrderId: id,
              productId: received.productId
            },
            data: {
              receivedQuantity: {
                increment: received.quantity || 0
              }
            }
          });
        }
      }

      // Mark PO as COMPLETED
      return tx.purchaseOrder.update({
        where: { id },
        data: { status: 'COMPLETED' },
        include: {
          items: {
            include: { product: true }
          },
          supplier: true
        }
      });
    });

    return res.json({
      success: true,
      message: 'Purchase order marked as completed',
      data: updatedPO
    });

  } catch (error: any) {
    console.error('Error completing purchase order:', error);
    return res.status(500).json({
      error: 'Failed to complete purchase order',
      details: error.message
    });
  }
});

export default router;


