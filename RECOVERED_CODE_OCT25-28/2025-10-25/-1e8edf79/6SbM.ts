import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import logger from '../utils/logger.js';
import { parsePagination, buildPaginationResponse, buildSearchFilter } from '../utils/helpers.js';
import { CreateSupplierSchema, UpdateSupplierSchema } from '../validation/supplier.js';
import { z } from 'zod';
import { sendTablePdf } from '../utils/pdf.js';

const router = Router();

// GET /api/suppliers/active - Get active suppliers (for dropdowns)
router.get('/active', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: { isActive: true },
      select: { 
        id: true, 
        name: true, 
        contactPerson: true, 
        phone: true, 
        email: true, 
        address: true, 
        paymentTerms: true 
      },
      orderBy: { name: 'asc' }
    });
    logger.info(`Listed ${suppliers.length} active suppliers`, { userId: (req as any).user?.id });
    res.json(suppliers);
  } catch (error) {
    next(error);
  }
});

// GET /api/suppliers - List all suppliers with pagination
router.get('/', authenticate, authorize(['ADMIN', 'MANAGER']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { search, status } = req.query;

    const where: any = {};

    if (search) {
      where.OR = buildSearchFilter(search as string, ['name', 'contactPerson']);
    }

    if (status === 'active') {
      where.isActive = true;
    } else if (status === 'inactive') {
      where.isActive = false;
    }

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' }
      }),
      prisma.supplier.count({ where })
    ]);

    logger.info(`Listed ${suppliers.length} suppliers`, { userId: (req as any).user?.id });

    res.json(buildPaginationResponse(suppliers, total, { page, limit, skip }));
  } catch (error) {
    next(error);
  }
});

// POST /api/suppliers - Create new supplier
router.post('/', authenticate, authorize(['ADMIN', 'MANAGER']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validatedData = CreateSupplierSchema.parse(req.body);
    const userId = (req as any).user?.id;

    // Check if supplier with same name already exists
    const existingSupplier = await prisma.supplier.findFirst({
      where: { 
        name: {
          equals: validatedData.name,
          mode: 'insensitive'
        }
      }
    });

    if (existingSupplier) {
      return res.status(400).json({ error: 'Supplier with this name already exists' });
    }

    const supplier = await prisma.supplier.create({
      data: {
        name: validatedData.name,
        contactPerson: validatedData.contactPerson,
        phone: validatedData.phone,
        email: validatedData.email,
        address: validatedData.address,
        paymentTerms: validatedData.paymentTerms,
        taxId: validatedData.taxId,
        isActive: validatedData.isActive ?? true
      }
    });

    logger.info(`Created supplier: ${supplier.name}`, { userId, supplierId: supplier.id });
    res.status(201).json(supplier);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.errors 
      });
    }
    next(error);
  }
});

// PUT /api/suppliers/:id - Update supplier
router.put('/:id', authenticate, authorize(['ADMIN', 'MANAGER']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const validatedData = UpdateSupplierSchema.parse(req.body);
    const userId = (req as any).user?.id;

    // Check if supplier exists
    const existingSupplier = await prisma.supplier.findUnique({
      where: { id }
    });

    if (!existingSupplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    // If name is being changed, check it doesn't conflict
    if (validatedData.name && validatedData.name !== existingSupplier.name) {
      const nameConflict = await prisma.supplier.findFirst({
        where: {
          name: {
            equals: validatedData.name,
            mode: 'insensitive'
          },
          id: { not: id }
        }
      });

      if (nameConflict) {
        return res.status(400).json({ error: 'Supplier with this name already exists' });
      }
    }

    const supplier = await prisma.supplier.update({
      where: { id },
      data: validatedData
    });

    logger.info(`Updated supplier: ${supplier.name}`, { userId, supplierId: supplier.id });
    res.json(supplier);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: error.errors 
      });
    }
    next(error);
  }
});

// DELETE /api/suppliers/:id - Delete (deactivate) supplier
router.delete('/:id', authenticate, authorize(['ADMIN']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    // Check if supplier exists
    const existingSupplier = await prisma.supplier.findUnique({
      where: { id },
      include: {
        _count: {
          select: { purchaseOrders: true }
        }
      }
    });

    if (!existingSupplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    // Don't allow deletion if supplier has purchase orders
    if (existingSupplier._count.purchaseOrders > 0) {
      // Instead, deactivate the supplier
      const supplier = await prisma.supplier.update({
        where: { id },
        data: { isActive: false }
      });

      logger.info(`Deactivated supplier: ${supplier.name}`, { userId, supplierId: supplier.id });
      return res.json({ 
        message: 'Supplier has purchase orders and cannot be deleted. Supplier has been deactivated instead.',
        supplier 
      });
    }

    // If no purchase orders, actually delete
    await prisma.supplier.delete({
      where: { id }
    });

    logger.info(`Deleted supplier: ${existingSupplier.name}`, { userId, supplierId: id });
    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// GET /api/suppliers/:id - Get supplier by ID
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const supplier = await prisma.supplier.findUnique({
      where: { id }
    });

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    logger.info(`Retrieved supplier: ${supplier.name}`, { userId: (req as any).user?.id });
    res.json(supplier);
  } catch (error) {
    next(error);
  }
});

// GET /api/suppliers/:id/performance - Get supplier performance metrics
router.get('/:id/performance', authenticate, authorize(['ADMIN', 'MANAGER']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const supplier = await prisma.supplier.findUnique({
      where: { id }
    });

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    // Get all purchase orders for this supplier
    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: { supplierId: id },
      include: {
        items: {
          include: {
            product: {
              select: { name: true, barcode: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Calculate metrics
    const totalOrders = purchaseOrders.length;
  const completedOrders = purchaseOrders.filter((po: any) => po.status === 'COMPLETED').length;
  const pendingOrders = purchaseOrders.filter((po: any) => po.status === 'PENDING').length;
  const cancelledOrders = purchaseOrders.filter((po: any) => po.status === 'CANCELLED').length;

    // Calculate total ordered vs delivered
    let totalOrderedQty = 0;
    let totalDeliveredQty = 0;
    let totalOrderedValue = 0;
    let totalDeliveredValue = 0;
    let partialDeliveries = 0;
    let fullDeliveries = 0;
    let noDeliveries = 0;

    purchaseOrders.forEach((po: any) => {
      po.items.forEach((item: any) => {
        const ordered = Number(item.orderedQuantity);
        const received = Number(item.receivedQuantity) || 0;
        const price = Number(item.unitPrice);

        totalOrderedQty += ordered;
        totalDeliveredQty += received;
        totalOrderedValue += ordered * price;
        totalDeliveredValue += received * price;

        if (received === 0) {
          noDeliveries++;
        } else if (received < ordered) {
          partialDeliveries++;
        } else if (received >= ordered) {
          fullDeliveries++;
        }
      });
    });

    const deliveryRate = totalOrderedQty > 0 
      ? ((totalDeliveredQty / totalOrderedQty) * 100).toFixed(2) 
      : '0.00';

    const completionRate = totalOrders > 0
      ? ((completedOrders / totalOrders) * 100).toFixed(2)
      : '0.00';

    res.json({
      supplier: {
        id: supplier.id,
        name: supplier.name,
        contactPerson: supplier.contactPerson,
        phone: supplier.phone,
        email: supplier.email
      },
      orderMetrics: {
        totalOrders,
        completedOrders,
        pendingOrders,
        cancelledOrders,
        completionRate: `${completionRate}%`
      },
      deliveryMetrics: {
        totalOrderedQty,
        totalDeliveredQty,
        deliveryRate: `${deliveryRate}%`,
        fullDeliveries,
        partialDeliveries,
        noDeliveries
      },
      financialMetrics: {
        totalOrderedValue: totalOrderedValue.toFixed(2),
        totalDeliveredValue: totalDeliveredValue.toFixed(2),
        outstandingValue: (totalOrderedValue - totalDeliveredValue).toFixed(2),
        totalPaid: Number(supplier.totalPaid).toFixed(2),
        currentBalance: Number(supplier.accountBalance).toFixed(2)
      }
    });

    logger.info(`Retrieved performance metrics for supplier: ${supplier.name}`, { userId: (req as any).user?.id });
  } catch (error) {
    next(error);
  }
});

// GET /api/suppliers/:id/history - Get supplier order history with delivery details
router.get('/:id/history', authenticate, authorize(['ADMIN', 'MANAGER']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { page, limit, skip } = parsePagination(req.query);
    const { status } = req.query;

    const supplier = await prisma.supplier.findUnique({
      where: { id }
    });

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const where: any = { supplierId: id };
    if (status) {
      where.status = status;
    }

    const [orders, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: {
          items: {
            include: {
              product: {
                select: { name: true, barcode: true, baseUnit: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.purchaseOrder.count({ where })
    ]);

    // Transform orders to include delivery details
    const ordersWithDeliveryDetails = orders.map((po: any) => {
      const items = po.items.map((item: any) => ({
        productId: item.productId,
        productName: item.product.name,
        barcode: item.product.barcode,
        unit: item.product.baseUnit || 'pcs',
        orderedQuantity: Number(item.orderedQuantity),
        receivedQuantity: Number(item.receivedQuantity) || 0,
        remainingQuantity: Number(item.orderedQuantity) - (Number(item.receivedQuantity) || 0),
        unitPrice: Number(item.unitPrice),
        totalOrdered: Number(item.orderedQuantity) * Number(item.unitPrice),
        totalReceived: (Number(item.receivedQuantity) || 0) * Number(item.unitPrice),
        deliveryStatus: Number(item.receivedQuantity) === 0 
          ? 'NOT_DELIVERED'
          : Number(item.receivedQuantity) < Number(item.orderedQuantity)
          ? 'PARTIAL'
          : 'COMPLETE'
      }));

  const totalOrderedQty = items.reduce((sum: number, item: any) => sum + item.orderedQuantity, 0);
  const totalReceivedQty = items.reduce((sum: number, item: any) => sum + item.receivedQuantity, 0);
  const totalOrderedValue = items.reduce((sum: number, item: any) => sum + item.totalOrdered, 0);
  const totalReceivedValue = items.reduce((sum: number, item: any) => sum + item.totalReceived, 0);

      return {
        id: po.id,
        poNumber: po.poNumber,
        status: po.status,
        orderDate: po.createdAt,
        totalAmount: Number(po.totalAmount),
        items,
        summary: {
          totalItems: items.length,
          totalOrderedQty,
          totalReceivedQty,
          totalOrderedValue: totalOrderedValue.toFixed(2),
          totalReceivedValue: totalReceivedValue.toFixed(2),
          outstandingValue: (totalOrderedValue - totalReceivedValue).toFixed(2),
          deliveryRate: totalOrderedQty > 0 
            ? `${((totalReceivedQty / totalOrderedQty) * 100).toFixed(2)}%`
            : '0%'
        }
      };
    });

    res.json({
      supplier: {
        id: supplier.id,
        name: supplier.name
      },
      orders: ordersWithDeliveryDetails,
      pagination: buildPaginationResponse(ordersWithDeliveryDetails, total, { page, limit, skip }).pagination
    });

    logger.info(`Retrieved order history for supplier: ${supplier.name}`, { userId: (req as any).user?.id });
  } catch (error) {
    next(error);
  }
});

// GET /api/suppliers/:id/performance/export - Export supplier performance metrics as CSV
router.get('/:id/performance/export', authenticate, authorize(['ADMIN', 'MANAGER']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: { supplierId: id },
      include: { items: true }
    });

    const totalOrders = purchaseOrders.length;
    const completedOrders = purchaseOrders.filter((po: any) => po.status === 'COMPLETED').length;
    const pendingOrders = purchaseOrders.filter((po: any) => po.status === 'PENDING').length;
    const cancelledOrders = purchaseOrders.filter((po: any) => po.status === 'CANCELLED').length;

    let totalOrderedQty = 0;
    let totalDeliveredQty = 0;
    let totalOrderedValue = 0;
    let totalDeliveredValue = 0;
    let partialDeliveries = 0;
    let fullDeliveries = 0;
    let noDeliveries = 0;

    purchaseOrders.forEach((po: any) => {
      po.items.forEach((item: any) => {
        const ordered = Number(item.orderedQuantity) || 0;
        const received = Number(item.receivedQuantity) || 0;
        const price = Number(item.unitPrice) || 0;
        totalOrderedQty += ordered;
        totalDeliveredQty += received;
        totalOrderedValue += ordered * price;
        totalDeliveredValue += received * price;
        if (received === 0) noDeliveries++;
        else if (received < ordered) partialDeliveries++;
        else fullDeliveries++;
      });
    });

    const completionRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;
    const deliveryRate = totalOrderedQty > 0 ? (totalDeliveredQty / totalOrderedQty) * 100 : 0;

    const headers = [
      'Supplier Name','Total Orders','Completed','Pending','Cancelled','Completion %',
      'Total Ordered Qty','Total Delivered Qty','Delivery %','Full Deliveries','Partial Deliveries','No Deliveries',
      'Total Ordered Value','Total Delivered Value','Outstanding Value','Total Paid','Current Balance'
    ];
    const row = [
      supplier.name,
      totalOrders,
      completedOrders,
      pendingOrders,
      cancelledOrders,
      completionRate.toFixed(2),
      totalOrderedQty,
      totalDeliveredQty,
      deliveryRate.toFixed(2),
      fullDeliveries,
      partialDeliveries,
      noDeliveries,
      Number(supplier.totalPurchased || 0).toFixed(2) || totalOrderedValue.toFixed(2),
      totalDeliveredValue.toFixed(2),
      (totalOrderedValue - totalDeliveredValue).toFixed(2),
      Number(supplier.totalPaid || 0).toFixed(2),
      Number(supplier.accountBalance || 0).toFixed(2)
    ];

    const csv = [headers.join(','), row.map((c) => `"${c}"`).join(',')].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="supplier-performance-${supplier.name.replace(/[^a-z0-9]/gi,'_')}-${Date.now()}.csv"`);
    return res.send(csv);
  } catch (error) {
    next(error);
  }
});

// GET /api/suppliers/:id/history/export - Export supplier order history with items as CSV
router.get('/:id/history/export', authenticate, authorize(['ADMIN', 'MANAGER']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { status } = req.query;

    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    const where: any = { supplierId: id };
    if (status) where.status = status;

    const orders = await prisma.purchaseOrder.findMany({
      where,
      include: {
        items: { include: { product: { select: { name: true, barcode: true, baseUnit: true } } } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const headers = [
      'PO Number','Order Date','Status','Product Name','Barcode','Unit','Ordered Qty','Received Qty','Remaining Qty','Unit Price','Total Ordered','Total Received','Delivery Status'
    ];
    const rows: string[] = [];
    for (const po of orders as any[]) {
      for (const item of po.items) {
        const ordered = Number(item.orderedQuantity) || 0;
        const received = Number(item.receivedQuantity) || 0;
        const remaining = ordered - received;
        const price = Number(item.unitPrice) || 0;
        const totalOrdered = ordered * price;
        const totalReceived = received * price;
        const deliveryStatus = received === 0 ? 'NOT_DELIVERED' : (received < ordered ? 'PARTIAL' : 'COMPLETE');
        const row = [
          po.poNumber,
          new Date(po.createdAt).toISOString(),
          po.status,
          item.product?.name || '',
          item.product?.barcode || '',
          item.product?.baseUnit || 'pcs',
          ordered,
          received,
          remaining,
          price.toFixed(2),
          totalOrdered.toFixed(2),
          totalReceived.toFixed(2),
          deliveryStatus
        ].map((c) => `"${c}"`).join(',');
        rows.push(row);
      }
    }

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="supplier-history-${supplier.name.replace(/[^a-z0-9]/gi,'_')}-${Date.now()}.csv"`);
    return res.send(csv);
  } catch (error) {
    next(error);
  }
});

// GET /api/suppliers/:id/performance/export/pdf - Export performance as PDF
router.get('/:id/performance/export/pdf', authenticate, authorize(['ADMIN', 'MANAGER']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    const purchaseOrders = await prisma.purchaseOrder.findMany({ where: { supplierId: id }, include: { items: true } });

    const totalOrders = purchaseOrders.length;
    const completedOrders = purchaseOrders.filter((po: any) => po.status === 'COMPLETED').length;
    const pendingOrders = purchaseOrders.filter((po: any) => po.status === 'PENDING').length;
    const cancelledOrders = purchaseOrders.filter((po: any) => po.status === 'CANCELLED').length;

    let totalOrderedQty = 0, totalDeliveredQty = 0, totalOrderedValue = 0, totalDeliveredValue = 0, partialDeliveries = 0, fullDeliveries = 0, noDeliveries = 0;
    purchaseOrders.forEach((po: any) => {
      po.items.forEach((item: any) => {
        const ordered = Number(item.orderedQuantity) || 0;
        const received = Number(item.receivedQuantity) || 0;
        const price = Number(item.unitPrice) || 0;
        totalOrderedQty += ordered;
        totalDeliveredQty += received;
        totalOrderedValue += ordered * price;
        totalDeliveredValue += received * price;
        if (received === 0) noDeliveries++; else if (received < ordered) partialDeliveries++; else fullDeliveries++;
      });
    });

    const headers = ['Metric','Value'];
    const rows = [
      ['Supplier', supplier.name],
      ['Total Orders', totalOrders],
      ['Completed', completedOrders],
      ['Pending', pendingOrders],
      ['Cancelled', cancelledOrders],
      ['Total Ordered Qty', totalOrderedQty],
      ['Total Delivered Qty', totalDeliveredQty],
      ['Full Deliveries', fullDeliveries],
      ['Partial Deliveries', partialDeliveries],
      ['No Deliveries', noDeliveries],
      ['Total Ordered Value', totalOrderedValue.toFixed(2)],
      ['Total Delivered Value', totalDeliveredValue.toFixed(2)],
      ['Outstanding Value', (totalOrderedValue - totalDeliveredValue).toFixed(2)],
      ['Total Paid', Number(supplier.totalPaid || 0).toFixed(2)],
      ['Current Balance', Number(supplier.accountBalance || 0).toFixed(2)]
    ];

    sendTablePdf(
      res,
      `Supplier Performance - ${supplier.name}`,
      undefined,
      headers,
      rows,
      `supplier-performance-${supplier.name.replace(/[^a-z0-9]/gi,'_')}-${Date.now()}.pdf`
    );
  } catch (error) {
    next(error);
  }
});

// GET /api/suppliers/:id/history/export/pdf - Export order history as PDF
router.get('/:id/history/export/pdf', authenticate, authorize(['ADMIN', 'MANAGER']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { status } = req.query;

    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    const where: any = { supplierId: id };
    if (status) where.status = status;

    const orders = await prisma.purchaseOrder.findMany({
      where,
      include: { items: { include: { product: { select: { name: true, barcode: true, baseUnit: true } } } } },
      orderBy: { createdAt: 'desc' }
    });

    const headers = ['PO Number','Date','Status','Product','Barcode','Unit','Ordered','Received','Unit Price','Total'];
    const rows: any[] = [];
    for (const po of orders as any[]) {
      for (const item of po.items) {
        rows.push([
          po.poNumber,
          new Date(po.createdAt).toLocaleDateString(),
          po.status,
          item.product?.name || '',
          item.product?.barcode || '',
          item.product?.baseUnit || 'pcs',
          Number(item.orderedQuantity || 0),
          Number(item.receivedQuantity || 0),
          Number(item.unitPrice || 0).toFixed(2),
          (Number(item.orderedQuantity || 0) * Number(item.unitPrice || 0)).toFixed(2)
        ]);
      }
    }

    sendTablePdf(
      res,
      `Supplier Order History - ${supplier.name}`,
      undefined,
      headers,
      rows,
      `supplier-history-${supplier.name.replace(/[^a-z0-9]/gi,'_')}-${Date.now()}.pdf`
    );
  } catch (error) {
    next(error);
  }
});

export default router;