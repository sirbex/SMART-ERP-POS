import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import { parsePagination, buildPaginationResponse, buildSearchFilter } from '../utils/helpers.js';
import { CreateCustomerSchema, UpdateCustomerSchema } from '../validation/customer.js';
import cacheMiddleware, { invalidateCache } from '../middleware/redisCache.js';
import { REDIS_TTL } from '../config/redis.js';
import { CreatePaymentSchema } from '../validation/payment.js';

const router = Router();

// GET /api/customers - List all customers
router.get(
  '/',
  authenticate,
  cacheMiddleware({ prefix: 'customers', ttl: REDIS_TTL.MEDIUM }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const { search, hasCredit } = req.query;

      // Build where clause
      const where: any = {};

      if (search) {
        where.OR = buildSearchFilter(search as string, ['name', 'phone', 'email', 'taxId']);
      }

      if (hasCredit === 'true') {
        where.currentBalance = { gt: 0 };
      }

      // Get customers and total count
      const [customers, total] = await Promise.all([
        prisma.customer.findMany({
          where,
          include: {
            _count: {
              select: { sales: true, transactions: true },
            },
          },
          orderBy: { name: 'asc' },
          skip,
          take: limit,
        }),
        prisma.customer.count({ where }),
      ]);

      logger.info(`Listed ${customers.length} customers`, { userId: (req as any).user?.id });

      res.json(buildPaginationResponse(customers, total, { page, limit, skip }));
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/customers/:id - Get single customer with transaction history
router.get(
  '/:id',
  authenticate,
  cacheMiddleware({ prefix: 'customers', ttl: REDIS_TTL.MEDIUM }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const customer = await prisma.customer.findUnique({
        where: { id },
        include: {
          sales: {
            orderBy: { saleDate: 'desc' },
            take: 10
          },
          transactions: {
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
          _count: {
            select: { sales: true, transactions: true },
          },
        },
      });

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Calculate total purchases and payments
      const stats = await prisma.customerTransaction.aggregate({
        where: { customerId: id },
        _sum: { amount: true },
      });

      logger.info(`Retrieved customer: ${customer.name}`, { userId: (req as any).user?.id });

      res.json({
        ...customer,
        totalTransactions: stats._sum.amount || new Prisma.Decimal(0),
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/customers - Create new customer
router.post(
  '/',
  authenticate,
  authorize(['ADMIN', 'MANAGER', 'CASHIER']),
  invalidateCache.customers,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body with Zod
      const validatedData = CreateCustomerSchema.parse(req.body);
      const { name, phone, email, address, taxId, creditLimit = 0 } = validatedData;

      // Check for duplicate phone or email
      if (phone || email) {
        const duplicate = await prisma.customer.findFirst({
          where: {
            OR: [
              ...(phone ? [{ phone }] : []),
              ...(email ? [{ email }] : []),
            ],
          },
        });

        if (duplicate) {
          return res.status(400).json({
            error: duplicate.phone === phone
              ? 'Phone number already exists'
              : 'Email already exists',
          });
        }
      }

      // Create customer
      const customer = await prisma.customer.create({
        data: {
          name,
          phone,
          email,
          address,
          taxId,
          creditLimit: new Prisma.Decimal(creditLimit),
          currentBalance: new Prisma.Decimal(0),
        },
      });

      logger.info(`Created customer: ${customer.name}`, { userId: (req as any).user?.id });

      res.status(201).json(customer);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/customers/:id - Update customer
router.put(
  '/:id',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  invalidateCache.customers,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      // Validate request body with Zod
      const validatedData = UpdateCustomerSchema.parse(req.body);

      // Check if customer exists
      const existingCustomer = await prisma.customer.findUnique({ where: { id } });
      if (!existingCustomer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Check for duplicate phone or email
      if (validatedData.phone || validatedData.email) {
        const duplicate = await prisma.customer.findFirst({
          where: {
            AND: [
              { id: { not: id } },
              {
                OR: [
                  ...(validatedData.phone ? [{ phone: validatedData.phone }] : []),
                  ...(validatedData.email ? [{ email: validatedData.email }] : []),
                ],
              },
            ],
          },
        });

        if (duplicate) {
          return res.status(400).json({
            error: duplicate.phone === validatedData.phone
              ? 'Phone number already exists'
              : 'Email already exists',
          });
        }
      }

      // Build update data with decimal conversion for creditLimit
      const updateData: any = { ...validatedData };
      if (validatedData.creditLimit !== undefined) {
        updateData.creditLimit = new Prisma.Decimal(validatedData.creditLimit);
      }

      // Update customer
      const customer = await prisma.customer.update({
        where: { id },
        data: updateData,
      });

      logger.info(`Updated customer: ${customer.name}`, { userId: (req as any).user?.id });

      res.json(customer);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/customers/:id - Delete customer
router.delete(
  '/:id',
  authenticate,
  authorize(['ADMIN']),
  invalidateCache.customers,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const customer = await prisma.customer.findUnique({
        where: { id },
        include: {
          _count: { select: { sales: true } },
        },
      });

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Cannot delete customer with sales history
      if (customer._count.sales > 0) {
        return res.status(400).json({
          error: 'Cannot delete customer with sales history',
        });
      }

      // Cannot delete customer with credit balance
      if (customer.currentBalance.gt(0)) {
        return res.status(400).json({
          error: `Cannot delete customer with outstanding credit balance: ${customer.currentBalance}`,
        });
      }

      await prisma.customer.delete({ where: { id } });

      logger.info(`Deleted customer: ${customer.name}`, { userId: (req as any).user?.id });

      res.json({ message: 'Customer deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/customers/:id/payment - Record customer payment
router.post(
  '/:id/payment',
  authenticate,
  authorize(['ADMIN', 'MANAGER', 'CASHIER']),
  invalidateCache.customers,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      // Validate request body with Zod
      const validatedData = CreatePaymentSchema.parse(req.body);
      const { amount, paymentMethod, reference, notes } = validatedData;

      const customer = await prisma.customer.findUnique({ where: { id } });
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      const paymentAmount = new Prisma.Decimal(amount);

      // Cannot pay more than credit balance
      if (paymentAmount.gt(customer.currentBalance)) {
        return res.status(400).json({
          error: `Payment amount (${paymentAmount}) exceeds credit balance (${customer.currentBalance})`,
        });
      }

      // Record payment transaction
  const transaction = await prisma.$transaction(async (tx: any) => {
        // Create payment transaction
        const newTransaction = await tx.customerTransaction.create({
          data: {
            customerId: id,
            type: 'PAYMENT',
            amount: paymentAmount.neg(), // Negative for payment
            balance: customer.currentBalance.minus(paymentAmount),
            description: `Payment received - ${paymentMethod}${reference ? ` (Ref: ${reference})` : ''}${notes ? `\nNotes: ${notes}` : ''}`,
          },
        });

        // Update customer credit balance
        await tx.customer.update({
          where: { id },
          data: {
            currentBalance: { decrement: paymentAmount },
          },
        });

        return newTransaction;
      });

      logger.info(`Recorded payment for customer: ${customer.name}, amount: ${paymentAmount}`, {
        userId: (req as any).user?.id,
      });

      res.status(201).json(transaction);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/customers/:id/transactions - Get customer transaction history
router.get(
  '/:id/transactions',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { page, limit, skip } = parsePagination(req.query);
      const { type, startDate, endDate } = req.query;

      const customer = await prisma.customer.findUnique({ where: { id } });
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      const where: any = { customerId: id };

      if (type) {
        where.type = type;
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate as string);
        if (endDate) {
          const end = new Date(endDate as string);
          end.setHours(23, 59, 59, 999);
          where.createdAt.lte = end;
        }
      }

      const [transactions, total] = await Promise.all([
        prisma.customerTransaction.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.customerTransaction.count({ where }),
      ]);

      logger.info(`Retrieved ${transactions.length} transactions for customer: ${customer.name}`, {
        userId: (req as any).user?.id,
      });

      res.json(buildPaginationResponse(transactions, total, { page, limit, skip }));
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/customers/:id/statement - Get customer statement
router.get(
  '/:id/statement',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { startDate, endDate } = req.query;

      const customer = await prisma.customer.findUnique({ where: { id } });
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      const where: any = { customerId: id };

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate as string);
        if (endDate) {
          const end = new Date(endDate as string);
          end.setHours(23, 59, 59, 999);
          where.createdAt.lte = end;
        }
      }

      const [transactions, summary] = await Promise.all([
        prisma.customerTransaction.findMany({
          where,
          orderBy: { createdAt: 'asc' },
        }),
        prisma.customerTransaction.aggregate({
          where,
          _sum: { amount: true },
        }),
      ]);

      // Calculate running balance
      let runningBalance = new Prisma.Decimal(0);
      const transactionsWithBalance = transactions.map((t: any) => {
        runningBalance = runningBalance.add(t.amount);
        return {
          ...t,
          runningBalance: runningBalance.toFixed(2),
        };
      });

      logger.info(`Generated statement for customer: ${customer.name}`, {
        userId: (req as any).user?.id,
      });

      res.json({
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
        },
        period: {
          startDate: startDate || null,
          endDate: endDate || null,
        },
        currentBalance: customer.currentBalance,
        periodActivity: summary._sum.amount || new Prisma.Decimal(0),
        transactions: transactionsWithBalance,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/customers/with-credit - Get customers with outstanding credit
router.get(
  '/reports/with-credit',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      
      const [customers, totalCount] = await Promise.all([
        prisma.customer.findMany({
          where: {
            currentBalance: { gt: 0 },
          },
          orderBy: {
            currentBalance: 'desc',
          },
          include: {
            transactions: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
          skip,
          take: limit,
        }),
        prisma.customer.count({
          where: { currentBalance: { gt: 0 } },
        }),
      ]);

      const totalCredit = await prisma.customer.aggregate({
        where: { currentBalance: { gt: 0 } },
        _sum: { currentBalance: true },
        _count: true,
      });

      logger.info('Retrieved customers with credit', { userId: (req as any).user?.id });

      res.json({
        ...buildPaginationResponse(customers, totalCount, { page, limit, skip }),
        summary: {
          totalCredit: totalCredit._sum.currentBalance || new Prisma.Decimal(0),
          totalCustomers: totalCredit._count,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/customers/stats/overview - Customer statistics
router.get(
  '/stats/overview',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [totalCustomers, customersWithCredit, totalCredit, recentCustomers] = await Promise.all([
        prisma.customer.count(),
        prisma.customer.count({ where: { currentBalance: { gt: 0 } } }),
        prisma.customer.aggregate({
          where: { currentBalance: { gt: 0 } },
          _sum: { currentBalance: true },
        }),
        prisma.customer.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
            },
          },
        }),
      ]);

      const stats = {
        totalCustomers,
        customersWithCredit,
        totalcurrentBalance: totalCredit._sum.currentBalance || new Prisma.Decimal(0),
        newCustomersLast30Days: recentCustomers,
      };

      logger.info('Retrieved customer statistics', { userId: (req as any).user?.id });

      res.json(stats);
    } catch (error) {
      next(error);
    }
  }
);

export default router;






