import { Router } from 'express';
import prisma from '@prisma/client';
import prisma from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { body, query } from 'express-validator';
import logger from '../utils/logger.js';
import { parsePagination, buildPaginationResponse } from '../utils/helpers.js';

const router = Router();

// Validation schemas
const createCustomerValidation = [
  body('name').trim().isLength({ min: 1, max: 200 }).withMessage('Customer name is required'),
  body('phone').optional().trim().isLength({ max: 50 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('address').optional().trim(),
  body('taxId').optional().trim().isLength({ max: 100 }),
  body('creditLimit').optional().isDecimal({ decimal_digits: '0,2' }),
  body('notes').optional().trim(),
];

const updateCustomerValidation = [
  body('name').optional().trim().isLength({ min: 1, max: 200 }),
  body('phone').optional().trim().isLength({ max: 50 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('address').optional().trim(),
  body('taxId').optional().trim().isLength({ max: 100 }),
  body('creditLimit').optional().isDecimal({ decimal_digits: '0,2' }),
  body('notes').optional().trim(),
];

const paymentValidation = [
  body('amount').isDecimal({ decimal_digits: '0,2' }).withMessage('Valid amount required'),
  body('paymentMethod').isIn(['CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER']).withMessage('Invalid payment method'),
  body('reference').optional().trim(),
  body('notes').optional().trim(),
];

// GET /api/customers - List all customers
router.get(
  '/',
  authenticate,
  async (req, res, next) => {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const { search, hasCredit } = req.query;

      // Build where clause
      const where: any = {};

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { phone: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } },
          { taxId: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      if (hasCredit === 'true') {
        where.creditBalance = { gt: 0 };
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

      logger.info(`Listed ${customers.length} customers`, { userId: req.user?.id });

      res.json(buildPaginationResponse(customers, total, page, limit));
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/customers/:id - Get single customer with transaction history
router.get(
  '/:id',
  authenticate,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const customer = await prisma.customer.findUnique({
        where: { id },
        include: {
          sales: {
            orderBy: { saleDate: 'desc' },
            take: 10,
            include: {
              cashier: {
                select: { username: true, fullName: true },
              },
            },
          },
          transactions: {
            orderBy: { transactionDate: 'desc' },
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

      logger.info(`Retrieved customer: ${customer.name}`, { userId: req.user?.id });

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
  createCustomerValidation,
  validate,
  async (req, res, next) => {
    try {
      const { name, phone, email, address, taxId, creditLimit, notes } = req.body;

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
          creditLimit: creditLimit ? new Prisma.Decimal(creditLimit) : new Prisma.Decimal(0),
          creditBalance: new Prisma.Decimal(0),
          notes,
        },
      });

      logger.info(`Created customer: ${customer.name}`, { userId: req.user?.id });

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
  updateCustomerValidation,
  validate,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Check if customer exists
      const existingCustomer = await prisma.customer.findUnique({ where: { id } });
      if (!existingCustomer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Check for duplicate phone or email
      if (updateData.phone || updateData.email) {
        const duplicate = await prisma.customer.findFirst({
          where: {
            AND: [
              { id: { not: id } },
              {
                OR: [
                  ...(updateData.phone ? [{ phone: updateData.phone }] : []),
                  ...(updateData.email ? [{ email: updateData.email }] : []),
                ],
              },
            ],
          },
        });

        if (duplicate) {
          return res.status(400).json({
            error: duplicate.phone === updateData.phone
              ? 'Phone number already exists'
              : 'Email already exists',
          });
        }
      }

      // Convert decimal fields
      if (updateData.creditLimit) {
        updateData.creditLimit = new Prisma.Decimal(updateData.creditLimit);
      }

      // Update customer
      const customer = await prisma.customer.update({
        where: { id },
        data: updateData,
      });

      logger.info(`Updated customer: ${customer.name}`, { userId: req.user?.id });

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
  async (req, res, next) => {
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
      if (customer.creditBalance.gt(0)) {
        return res.status(400).json({
          error: `Cannot delete customer with outstanding credit balance: ${customer.creditBalance}`,
        });
      }

      await prisma.customer.delete({ where: { id } });

      logger.info(`Deleted customer: ${customer.name}`, { userId: req.user?.id });

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
  paymentValidation,
  validate,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { amount, paymentMethod, reference, notes } = req.body;

      const customer = await prisma.customer.findUnique({ where: { id } });
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      const paymentAmount = new Prisma.Decimal(amount);

      // Cannot pay more than credit balance
      if (paymentAmount.gt(customer.creditBalance)) {
        return res.status(400).json({
          error: `Payment amount (${paymentAmount}) exceeds credit balance (${customer.creditBalance})`,
        });
      }

      // Record payment transaction
      const transaction = await prisma.$transaction(async (tx) => {
        // Create payment transaction
        const newTransaction = await tx.customerTransaction.create({
          data: {
            customerId: id,
            type: 'PAYMENT',
            amount: paymentAmount.neg(), // Negative for payment
            balance: customer.creditBalance.minus(paymentAmount),
            description: `Payment received - ${paymentMethod}${reference ? ` (Ref: ${reference})` : ''}`,
            notes,
          },
        });

        // Update customer credit balance
        await tx.customer.update({
          where: { id },
          data: {
            creditBalance: { decrement: paymentAmount },
          },
        });

        return newTransaction;
      });

      logger.info(`Recorded payment for customer: ${customer.name}, amount: ${paymentAmount}`, {
        userId: req.user?.id,
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
  async (req, res, next) => {
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
        where.transactionDate = {};
        if (startDate) where.transactionDate.gte = new Date(startDate as string);
        if (endDate) {
          const end = new Date(endDate as string);
          end.setHours(23, 59, 59, 999);
          where.transactionDate.lte = end;
        }
      }

      const [transactions, total] = await Promise.all([
        prisma.customerTransaction.findMany({
          where,
          orderBy: { transactionDate: 'desc' },
          skip,
          take: limit,
        }),
        prisma.customerTransaction.count({ where }),
      ]);

      logger.info(`Retrieved ${transactions.length} transactions for customer: ${customer.name}`, {
        userId: req.user?.id,
      });

      res.json(buildPaginationResponse(transactions, total, page, limit));
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/customers/:id/statement - Get customer statement
router.get(
  '/:id/statement',
  authenticate,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { startDate, endDate } = req.query;

      const customer = await prisma.customer.findUnique({ where: { id } });
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      const where: any = { customerId: id };

      if (startDate || endDate) {
        where.transactionDate = {};
        if (startDate) where.transactionDate.gte = new Date(startDate as string);
        if (endDate) {
          const end = new Date(endDate as string);
          end.setHours(23, 59, 59, 999);
          where.transactionDate.lte = end;
        }
      }

      const [transactions, summary] = await Promise.all([
        prisma.customerTransaction.findMany({
          where,
          orderBy: { transactionDate: 'asc' },
        }),
        prisma.customerTransaction.aggregate({
          where,
          _sum: { amount: true },
        }),
      ]);

      // Calculate running balance
      let runningBalance = new Prisma.Decimal(0);
      const transactionsWithBalance = transactions.map((tx) => {
        runningBalance = runningBalance.add(tx.amount);
        return {
          ...tx,
          runningBalance: runningBalance.toFixed(2),
        };
      });

      logger.info(`Generated statement for customer: ${customer.name}`, {
        userId: req.user?.id,
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
        currentBalance: customer.creditBalance,
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
  async (req, res, next) => {
    try {
      const customers = await prisma.customer.findMany({
        where: {
          creditBalance: { gt: 0 },
        },
        orderBy: {
          creditBalance: 'desc',
        },
        include: {
          transactions: {
            orderBy: { transactionDate: 'desc' },
            take: 1,
          },
        },
      });

      const totalCredit = await prisma.customer.aggregate({
        where: { creditBalance: { gt: 0 } },
        _sum: { creditBalance: true },
        _count: true,
      });

      logger.info('Retrieved customers with credit', { userId: req.user?.id });

      res.json({
        customers,
        summary: {
          totalCustomers: totalCredit._count,
          totalCreditBalance: totalCredit._sum.creditBalance || new Prisma.Decimal(0),
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
  async (req, res, next) => {
    try {
      const [totalCustomers, customersWithCredit, totalCredit, recentCustomers] = await Promise.all([
        prisma.customer.count(),
        prisma.customer.count({ where: { creditBalance: { gt: 0 } } }),
        prisma.customer.aggregate({
          where: { creditBalance: { gt: 0 } },
          _sum: { creditBalance: true },
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
        totalCreditBalance: totalCredit._sum.creditBalance || new Prisma.Decimal(0),
        newCustomersLast30Days: recentCustomers,
      };

      logger.info('Retrieved customer statistics', { userId: req.user?.id });

      res.json(stats);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
