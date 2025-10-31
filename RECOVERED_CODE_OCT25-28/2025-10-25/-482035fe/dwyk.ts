import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import { parsePagination, buildPaginationResponse, generateDocumentNumber } from '../utils/helpers.js';
import { calculateFIFO, createBatchUpdates } from '../utils/fifoCalculator.js';
import { convertToBaseUnit as legacyConvertToBaseUnit } from '../utils/uomConverter.js';
import { convertToBaseUnit, calculatePriceForUoM, validateUoMForProduct } from '../utils/uomService.js';
import { CreateSaleSchema, RefundSaleSchema } from '../validation/sale.js';

const router = Router();

// Validation schemas
// GET /api/sales - List all sales with pagination and filters
router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const { search, customerId, status, startDate, endDate, cashierId } = req.query;

      // Build where clause
      const where: any = {};

      if (search) {
        where.OR = [
          { invoiceNumber: { contains: search as string, mode: 'insensitive' } },
          { customer: { name: { contains: search as string, mode: 'insensitive' } } },
        ];
      }

      if (customerId) {
        where.customerId = customerId;
      }

      if (status) {
        where.status = status;
      }

      if (cashierId) {
        where.cashierId = cashierId;
      }

      if (startDate || endDate) {
        where.saleDate = {};
        if (startDate) where.saleDate.gte = new Date(startDate as string);
        if (endDate) {
          const end = new Date(endDate as string);
          end.setHours(23, 59, 59, 999);
          where.saleDate.lte = end;
        }
      }

      // Get sales and total count
      const [sales, total] = await Promise.all([
        prisma.sale.findMany({
          where,
          include: {
            customer: {
              select: { id: true, name: true, phone: true },
            },
            createdBy: {
              select: { id: true, username: true, fullName: true },
            },
            items: {
              include: {
                product: {
                  select: { id: true, name: true, barcode: true, baseUnit: true },
                },
              },
            },
            payments: true,
            _count: {
              select: { items: true, payments: true },
            },
          },
          orderBy: { saleDate: 'desc' },
          skip,
          take: limit,
        }),
        prisma.sale.count({ where }),
      ]);

      logger.info(`Listed ${sales.length} sales`, { userId: (req as any).user?.id });

      res.json(buildPaginationResponse(sales, total, { page, limit, skip }));
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/sales/:id - Get single sale with full details
router.get(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const sale = await prisma.sale.findUnique({
        where: { id },
        include: {
          customer: true,
          createdBy: {
            select: { id: true, username: true, fullName: true, role: true },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  barcode: true,
                  baseUnit: true,
                  alternateUnit: true,
                  conversionFactor: true,
                },
              },
            },
          },
          payments: true,
        },
      });

      if (!sale) {
        return res.status(404).json({ error: 'Sale not found' });
      }

      logger.info(`Retrieved sale: ${sale.saleNumber}`, { userId: (req as any).user?.id });

      res.json(sale);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/sales - Create new sale (POS transaction)
router.post(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body with Zod
      const validatedData = CreateSaleSchema.parse(req.body);
      const { customerId, items, payments, discount, notes } = req.body;
      const cashierId = (req as any).user!.id;

      // Validate customer if provided
      if (customerId) {
        const customer = await prisma.customer.findUnique({ where: { id: customerId } });
        if (!customer) {
          return res.status(404).json({ error: 'Customer not found' });
        }
      }

      // Process sale items and calculate totals
      const processedItems: any[] = [];
      let subtotal = new Prisma.Decimal(0);

      for (const item of items) {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          include: {
            stockBatches: {
              where: { quantityRemaining: { gt: 0 } },
              orderBy: { receivedDate: 'asc' }, // FIFO
            },
            productUoMs: {
              where: { isSaleAllowed: true },
              include: {
                uom: true,
              },
            },
          },
        });

        if (!product) {
          return res.status(404).json({ error: `Product not found: ${item.productId}` });
        }

        if (!product.isActive) {
          return res.status(400).json({ 
            error: `Product "${product.name}" is inactive and cannot be sold. Please activate the product first or remove it from the sale.` 
          });
        }

        // Handle UoM conversion
        let quantityInBaseUnit: Prisma.Decimal;
        let unitPrice: Prisma.Decimal;
        let actualUnit: string;
        let uomId: string | null = item.uomId || null;

        if (item.uomId && product.productUoMs && product.productUoMs.length > 0) {
          // New UoM system: validate and convert using UoM service
          try {
            await validateUoMForProduct(product.id, item.uomId, 'SALE');
            
            const conversionResult = await convertToBaseUnit(
              product as any,
              new Prisma.Decimal(item.quantity),
              item.uomId
            );
            
            quantityInBaseUnit = conversionResult.quantityInBaseUnit;
            actualUnit = conversionResult.unit;

            // Calculate price for this UoM
            const basePrice = item.unitPrice
              ? new Prisma.Decimal(item.unitPrice)
              : product.sellingPrice;
              
            const priceCalc = await calculatePriceForUoM(
              basePrice,
              new Prisma.Decimal(item.quantity),
              item.uomId,
              product as any
            );
            
            unitPrice = priceCalc.unitPrice;
          } catch (error: any) {
            return res.status(400).json({ 
              error: `UoM validation failed for ${product.name}: ${error.message}` 
            });
          }
        } else {
          // Legacy system: use old converter for backward compatibility
          const unit = item.unit || product.baseUnit;
          quantityInBaseUnit = new Prisma.Decimal(
            legacyConvertToBaseUnit(
              product as any,
              parseFloat(item.quantity),
              unit
            )
          );
          actualUnit = unit;
          unitPrice = item.unitPrice
            ? new Prisma.Decimal(item.unitPrice)
            : product.sellingPrice;
        }

        // Check stock availability
        const totalStock = await prisma.stockBatch.aggregate({
          where: { productId: product.id, quantityRemaining: { gt: 0 } },
          _sum: { quantityRemaining: true },
        });

        const availableStock = totalStock._sum?.quantityRemaining || new Prisma.Decimal(0);

        // Check stock availability
        if (availableStock.lt(quantityInBaseUnit)) {
          return res.status(400).json({
            error: `Insufficient stock for ${product.name}. Available: ${availableStock}, Required: ${quantityInBaseUnit}`,
          });
        }

        // Calculate FIFO cost
        const fifoResult = calculateFIFO(product.stockBatches, quantityInBaseUnit);
        const unitCost = fifoResult.totalCost.div(quantityInBaseUnit);

        const itemDiscount = item.discount ? new Prisma.Decimal(item.discount) : new Prisma.Decimal(0);
        const total = unitPrice.mul(item.quantity).minus(itemDiscount);

        processedItems.push({
          product,
          productId: product.id,
          quantity: new Prisma.Decimal(item.quantity),
          unit: actualUnit,
          uomId,
          quantityInBaseUnit,
          unitPrice,
          unitCost,
          discount: itemDiscount,
          total,
          fifoResult,
        });

        subtotal = subtotal.add(total);
      }

      // Calculate totals
      const saleDiscount = discount ? new Prisma.Decimal(discount) : new Prisma.Decimal(0);
      const totalBeforeTax = subtotal.minus(saleDiscount);

      // Calculate tax (using weighted average of product tax rates)
      let totalTax = new Prisma.Decimal(0);
      for (const item of processedItems) {
        const taxableAmount = item.total;
        const tax = taxableAmount.mul(item.product.taxRate || 0).div(100);
        totalTax = totalTax.add(tax);
      }

      const totalAmount = totalBeforeTax.add(totalTax);

      // Validate payments
      const totalPaid = payments.reduce(
        (sum: Prisma.Decimal, p: any) => sum.add(new Prisma.Decimal(p.amount)),
        new Prisma.Decimal(0)
      );

      if (totalPaid.lt(totalAmount)) {
        return res.status(400).json({
          error: `Insufficient payment. Total: ${totalAmount}, Paid: ${totalPaid}`,
        });
      }

      // Check for credit payment
      const hasCreditPayment = payments.some((p: any) => p.method === 'CREDIT');
      if (hasCreditPayment && !customerId) {
        return res.status(400).json({
          error: 'Credit payment requires a customer',
        });
      }

      // Generate invoice number
      const invoiceNumber = await generateDocumentNumber('INV');

      // Create sale transaction
      const sale = await prisma.$transaction(async (tx: any) => {
        // Generate sale number with database-aware sequence
        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
        
        // Find the last sale with the correct format (SALE-YYYYMMDD-NNNNNN)
        const prefix = `SALE-${dateStr}-`;
        const allSales = await tx.sale.findMany({
          where: { saleNumber: { startsWith: prefix } },
          select: { saleNumber: true },
          orderBy: { createdAt: 'desc' }
        });
        
        // Find the highest sequence number from correctly formatted sale numbers
        let maxSequence = 0;
        for (const sale of allSales) {
          const parts = sale.saleNumber.split('-');
          // Only accept format: SALE-YYYYMMDD-NNNNNN (exactly 3 parts)
          if (parts.length === 3 && parts[0] === 'SALE' && parts[1] === dateStr) {
            const seqNum = parseInt(parts[2], 10);
            if (!isNaN(seqNum) && seqNum > maxSequence) {
              maxSequence = seqNum;
            }
          }
        }
        
        const sequence = maxSequence + 1;
        const saleNumber = `SALE-${dateStr}-${sequence.toString().padStart(6, '0')}`;

        // Create sale
        const newSale = await tx.sale.create({
          data: {
            saleNumber,
            customer: customerId ? { connect: { id: customerId } } : undefined,
            createdBy: { connect: { id: cashierId } },
            saleDate: new Date(),
            subtotal,
            discount: saleDiscount,
            taxAmount: totalTax,
            totalAmount,
            status: 'COMPLETED',
            notes,
            items: {
              create: processedItems.map((item) => {
                // Calculate costs and profit
                const itemTax = item.total.mul(item.product.taxRate || 0).div(100);
                const itemCostTotal = item.fifoResult.totalCost;
                const itemProfit = item.total.sub(itemCostTotal);
                const profitMargin = item.total.gt(0) 
                  ? itemProfit.div(item.total) // Store as decimal (0.25 = 25%), not percentage
                  : new Prisma.Decimal(0);

                return {
                  product: { connect: { id: item.productId } },
                  quantity: item.quantity,
                  quantityInBase: item.quantityInBaseUnit,
                  unit: item.unit,
                  unitPrice: item.unitPrice,
                  unitCost: item.unitCost,
                  discount: item.discount,
                  subtotal: item.total,
                  taxRate: item.product.taxRate || new Prisma.Decimal(0),
                  taxAmount: itemTax,
                  total: item.total.add(itemTax),
                  costTotal: itemCostTotal,
                  lineCost: itemCostTotal,
                  profit: itemProfit,
                  lineProfit: itemProfit,
                  profitMargin: profitMargin,
                  ...(item.fifoResult.allocations[0]?.batchId && {
                    batch: { connect: { id: item.fifoResult.allocations[0].batchId } }
                  }), // Connect to primary batch used
                };
              }),
            },
            payments: {
              create: payments.map((p: any) => ({
                method: p.method,
                amount: new Prisma.Decimal(p.amount),
                reference: p.reference,
              })),
            },
          },
          include: {
            items: true,
            payments: true,
          },
        });

        // Update stock batches (FIFO) and create stock movements
        for (const item of processedItems) {
          // Get product's current stock before update
          const productBefore = await tx.product.findUnique({
            where: { id: item.productId },
            select: { currentStock: true }
          });
          const beforeQty = productBefore?.currentStock || new Prisma.Decimal(0);
          const afterQty = beforeQty.sub(item.quantityInBaseUnit);

          // Use the correct property: allocations, not batches
          const batchUpdates = createBatchUpdates(
            item.fifoResult.allocations
          );

          // Apply batch updates and create stock movements for each batch
          for (let i = 0; i < batchUpdates.length; i++) {
            const update = batchUpdates[i];
            const allocation = item.fifoResult.allocations[i];
            
            await tx.stockBatch.update(update);

            // Create stock movement record for audit trail (without batchId since it references InventoryBatch, not StockBatch)
            const movementNumber = `SM-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now()}-${i}`;
            await tx.stockMovement.create({
              data: {
                movementNumber,
                productId: item.productId,
                batchId: null, // StockMovement.batchId references InventoryBatch, not StockBatch
                movementType: 'OUT',
                quantity: allocation.quantity,
                beforeQuantity: beforeQty,
                afterQuantity: afterQty,
                performedById: cashierId,
                reference: newSale.saleNumber,
                reason: 'SALE',
                notes: `Product sold via POS transaction (StockBatch: ${allocation.batchId})`,
              }
            });
          }

          // Update product's current stock
          await tx.product.update({
            where: { id: item.productId },
            data: {
              currentStock: {
                decrement: item.quantityInBaseUnit,
              },
            },
          });
        }

        // Handle credit payment - update customer balance
        const creditPayment = payments.find((p: any) => p.method === 'CREDIT');
        if (creditPayment && customerId) {
          const creditAmount = new Prisma.Decimal(creditPayment.amount);

          await tx.customerTransaction.create({
            data: {
              customerId,
              type: 'SALE',
              amount: creditAmount,
              balance: creditAmount, // Will be updated by trigger or separate logic
              description: `Credit sale - ${invoiceNumber}`,
              referenceId: newSale.id,
            },
          });

          // Update customer balance
          await tx.customer.update({
            where: { id: customerId },
            data: {
              currentBalance: { increment: creditAmount },
            },
          });
        }

        return newSale;
      });

      logger.info(`Created sale: ${sale.saleNumber}`, {
        userId: cashierId,
        totalAmount: sale.totalAmount.toString(),
      });

      // Fetch full sale details with all relations for the response
      const fullSale = await prisma.sale.findUnique({
        where: { id: sale.id },
        include: {
          customer: true,
          createdBy: { select: { id: true, username: true, fullName: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, barcode: true, baseUnit: true } },
            },
          },
          payments: true,
        },
      });

      // Transform to match frontend Transaction interface
      const response = {
        ...fullSale,
        id: fullSale!.id,
        invoiceNumber: fullSale!.saleNumber,
        customerId: fullSale!.customerId,
        customerName: fullSale!.customer?.name,
        items: fullSale!.items.map((item: any) => ({
          id: item.id,
          productId: item.productId,
          productName: item.product.name,
          name: item.product.name,
          quantity: Number(item.quantity),
          unit: item.unit,
          unitPrice: Number(item.unitPrice),
          price: Number(item.unitPrice),
          discount: Number(item.discount),
          subtotal: Number(item.subtotal),
          tax: Number(item.taxAmount),
          total: Number(item.total),
          lineTotal: Number(item.total),
        })),
        subtotal: Number(fullSale!.subtotal),
        tax: Number(fullSale!.taxAmount),
        taxAmount: Number(fullSale!.taxAmount),
        discount: Number(fullSale!.discount),
        discountAmount: Number(fullSale!.discount),
        total: Number(fullSale!.totalAmount),
        totalAmount: Number(fullSale!.totalAmount),
        paymentStatus: 'paid',
        paymentMethod: fullSale!.payments[0]?.method || 'CASH',
        amountPaid: Number(fullSale!.payments[0]?.amount || fullSale!.totalAmount),
        saleDate: fullSale!.saleDate.toISOString(),
        date: fullSale!.saleDate.toISOString(),
        timestamp: fullSale!.saleDate.toISOString(),
        status: fullSale!.status,
        notes: fullSale!.notes,
        createdAt: fullSale!.createdAt.toISOString(),
      };

      // Return transformed sale object matching frontend Transaction interface
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/sales/:id - Update sale (limited - mainly for status)
router.put(
  '/:id',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body with Zod
      const validatedData = CreateSaleSchema.parse(req.body);
      const { id } = req.params;
      const { status, notes } = req.body;

      const existingSale = await prisma.sale.findUnique({
        where: { id },
        include: { items: true, payments: true },
      });

      if (!existingSale) {
        return res.status(404).json({ error: 'Sale not found' });
      }

      // Cannot modify completed sales (except to cancel)
      if (existingSale.status === 'COMPLETED' && status !== 'CANCELLED') {
        return res.status(400).json({
          error: 'Cannot modify completed sale. You can only cancel it.',
        });
      }

      const updateData: any = {};
      if (notes !== undefined) updateData.notes = notes;
      if (status !== undefined) updateData.status = status;

      const sale = await prisma.sale.update({
        where: { id },
        data: updateData,
        include: {
          customer: true,
          createdBy: { select: { id: true, username: true, fullName: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, barcode: true, baseUnit: true } },
            },
          },
          payments: true,
        },
      });

      logger.info(`Updated sale: ${sale.saleNumber}`, { userId: (req as any).user?.id });

      res.json(sale);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/sales/:id/cancel - Cancel a sale and restore stock
router.post(
  '/:id/cancel',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body with Zod
      const validatedData = CreateSaleSchema.parse(req.body);
      const { id } = req.params;
      const { reason } = req.body;

      const sale = await prisma.sale.findUnique({
        where: { id },
        include: {
          items: {
            include: { product: true },
          },
          payments: true,
          customer: true,
        },
      });

      if (!sale) {
        return res.status(404).json({ error: 'Sale not found' });
      }

      if (sale.status === 'CANCELLED' || sale.status === 'REFUNDED') {
        return res.status(400).json({ error: 'Sale is already cancelled or refunded' });
      }

      // Cancel sale and restore stock
      const cancelledSale = await prisma.$transaction(async (tx: any) => {
        // Update sale status
        const updated = await tx.sale.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            notes: `${sale.notes || ''}\n[CANCELLED] ${reason || 'No reason provided'}`,
          },
        });

        // Restore stock for returned products
        for (const item of sale.items) {
          // Create a new batch for the returned stock
          await tx.stockBatch.create({
            data: {
              product: { connect: { id: item.productId } },
              quantityReceived: item.quantity,
              quantityRemaining: item.quantity,
              unitCost: item.unitCost,
              receivedDate: new Date(),
              expiryDate: null,
              batchNumber: `RETURN-${sale.saleNumber}`,
            },
          });
        }

        // Reverse customer credit if applicable
        const creditPayment = sale.payments.find((p: any) => p.method === 'CREDIT');
        if (creditPayment && sale.customerId) {
          await tx.customerTransaction.create({
            data: {
              customerId: sale.customerId,
              type: 'PAYMENT',
              amount: creditPayment.amount.neg(),
              balance: new Prisma.Decimal(0),
              description: `Sale cancellation - ${sale.saleNumber}`,
              referenceId: sale.id,
            },
          });

          await tx.customer.update({
            where: { id: sale.customerId },
            data: {
              currentBalance: { decrement: creditPayment.amount },
            },
          });
        }

        return updated;
      });

      logger.info(`Cancelled sale: ${sale.saleNumber}`, {
        userId: (req as any).user?.id,
        reason,
      });

      res.json({ message: 'Sale cancelled successfully', sale: cancelledSale });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/sales/stats/daily - Daily sales statistics
router.get(
  '/stats/daily',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body with Zod
      const validatedData = CreateSaleSchema.parse(req.body);
      const { date } = req.query;
      const targetDate = date ? new Date(date as string) : new Date();
      
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const [salesStats, topProducts] = await Promise.all([
        prisma.sale.aggregate({
          where: {
            saleDate: { gte: startOfDay, lte: endOfDay },
            status: 'COMPLETED',
          },
          _count: true,
          _sum: {
            subtotal: true,
            discount: true,
            taxAmount: true,
            totalAmount: true,
          },
        }),
        prisma.saleItem.groupBy({
          by: ['productId'],
          where: {
            sale: {
              saleDate: { gte: startOfDay, lte: endOfDay },
              status: 'COMPLETED',
            },
          },
          _sum: {
            quantity: true,
            total: true,
          },
          orderBy: {
            _sum: { total: 'desc' },
          },
          take: 10,
        }),
      ]);

      // Get product details for top products
      const topProductsWithDetails = await Promise.all(
        topProducts.map(async (item: any) => {
          const product = await prisma.product.findUnique({
            where: { id: item.productId },
            select: { id: true, name: true, barcode: true },
          });
          return {
            product,
            quantitySold: item._sum?.quantity,
            totalSales: item._sum?.total,
          };
        })
      );

      logger.info('Retrieved daily sales stats', { userId: (req as any).user?.id });

      res.json({
        date: targetDate,
        totalSales: salesStats._count,
        subtotal: salesStats._sum?.subtotal || new Prisma.Decimal(0),
        discount: salesStats._sum?.discount || new Prisma.Decimal(0),
        tax: salesStats._sum?.taxAmount || new Prisma.Decimal(0),
        totalAmount: salesStats._sum?.totalAmount || new Prisma.Decimal(0),
        topProducts: topProductsWithDetails,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/sales/stats/summary - Sales summary for date range
router.get(
  '/stats/summary',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body with Zod
      const validatedData = CreateSaleSchema.parse(req.body);
      const { startDate, endDate } = req.query;
      
      const where: any = { status: 'COMPLETED' };
      
      if (startDate || endDate) {
        where.saleDate = {};
        if (startDate) where.saleDate.gte = new Date(startDate as string);
        if (endDate) {
          const end = new Date(endDate as string);
          end.setHours(23, 59, 59, 999);
          where.saleDate.lte = end;
        }
      }

      const [salesStats, paymentStats] = await Promise.all([
        prisma.sale.aggregate({
          where,
          _count: true,
          _sum: {
            subtotal: true,
            discount: true,
            taxAmount: true,
            totalAmount: true,
          },
          _avg: { totalAmount: true },
        }),
        prisma.payment.groupBy({
          by: ['method'],
          where: {
            sale: where,
          },
          _sum: { amount: true },
          _count: true,
        }),
      ]);

      logger.info('Retrieved sales summary', { userId: (req as any).user?.id });

      res.json({
        period: { startDate, endDate },
        totalSales: salesStats._count,
        subtotal: salesStats._sum?.subtotal || new Prisma.Decimal(0),
        discount: salesStats._sum?.discount || new Prisma.Decimal(0),
        tax: salesStats._sum?.taxAmount || new Prisma.Decimal(0),
        totalAmount: salesStats._sum?.totalAmount || new Prisma.Decimal(0),
        averageSale: salesStats._avg?.totalAmount || new Prisma.Decimal(0),
        paymentMethods: paymentStats,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;









