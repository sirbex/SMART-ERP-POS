import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { body, param, type ValidationChain } from 'express-validator';
import logger from '../utils/logger.js';

const router = Router();

// ===================================================================
// VALIDATION SCHEMAS
// ===================================================================

const depositValidation: ValidationChain[] = [];

const adjustCreditValidation: ValidationChain[] = [];

const paymentValidation: ValidationChain[] = [];

const statementQueryValidation: ValidationChain[] = [];

// ===================================================================
// ENDPOINT 1: GET /api/customers/:id/balance
// Get customer balance summary
// ===================================================================

router.get(
  '/:id/balance',
  authenticate,
  validate(statementQueryValidation),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const customer = await prisma.customer.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          creditLimit: true,
          currentBalance: true,
          depositBalance: true,
          creditUsed: true,
          accountStatus: true,
          lifetimeValue: true,
          totalPurchases: true,
          totalPayments: true,
          lastPurchaseDate: true,
          lastPaymentDate: true,
        },
      });

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Calculate available credit
      const availableCredit = Number(customer.creditLimit) - Number(customer.creditUsed);
      
      // Calculate net balance (what customer owes minus deposits)
      const netBalance = Number(customer.currentBalance) - Number(customer.depositBalance);

      const balanceSummary = {
        customerId: customer.id,
        customerName: customer.name,
        accountStatus: customer.accountStatus,
        
        // Balance details
        currentBalance: Number(customer.currentBalance),
        depositBalance: Number(customer.depositBalance),
        netBalance: netBalance,
        
        // Credit details
        creditLimit: Number(customer.creditLimit),
        creditUsed: Number(customer.creditUsed),
        availableCredit: availableCredit,
        creditUtilization: Number(customer.creditLimit) > 0 
          ? (Number(customer.creditUsed) / Number(customer.creditLimit) * 100).toFixed(2) 
          : '0.00',
        
        // Statistics
        lifetimeValue: Number(customer.lifetimeValue),
        totalPurchases: Number(customer.totalPurchases),
        totalPayments: Number(customer.totalPayments),
        lastPurchaseDate: customer.lastPurchaseDate,
        lastPaymentDate: customer.lastPaymentDate,
      };

      logger.info(`Balance retrieved for customer ${id}`, { userId: (req as any).user?.id });
      res.json(balanceSummary);
    } catch (error) {
      logger.error('Error fetching customer balance:', error);
      next(error);
    }
  }
);

// ===================================================================
// ENDPOINT 2: POST /api/customers/:id/deposit
// Record customer deposit (prepayment)
// ===================================================================

router.post(
  '/:id/deposit',
  authenticate,
  validate(depositValidation),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { amount, paymentMethod, reference, notes } = req.body;
      const userId = (req as any).user?.id;

      // Verify customer exists
      const customer = await prisma.customer.findUnique({
        where: { id },
        select: { id: true, name: true, depositBalance: true, accountStatus: true },
      });

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      if (customer.accountStatus === 'CLOSED') {
        return res.status(400).json({ error: 'Cannot process deposit for closed account' });
      }

      // Use transaction to ensure data consistency
  const result = await prisma.$transaction(async (tx: any) => {
        // Update customer deposit balance
        const updatedCustomer = await tx.customer.update({
          where: { id },
          data: {
            depositBalance: {
              increment: amount,
            },
            totalPayments: {
              increment: amount,
            },
            lastPaymentDate: new Date(),
          },
        });

        // Create customer transaction record
        const transaction = await tx.customerTransaction.create({
          data: {
            customerId: id,
            type: 'DEPOSIT',
            amount: -amount, // Negative because it reduces what customer owes
            balance: updatedCustomer.currentBalance,
            description: notes || `Deposit via ${paymentMethod}`,
            referenceId: reference || null,
            createdBy: userId,
          },
        });

        return { customer: updatedCustomer, transaction };
      });

      logger.info(`Deposit of ${amount} recorded for customer ${id}`, { userId });
      
      res.status(201).json({
        message: 'Deposit recorded successfully',
        deposit: {
          transactionId: result.transaction.id,
          customerId: id,
          customerName: customer.name,
          amount: Number(amount),
          newDepositBalance: Number(result.customer.depositBalance),
          paymentMethod,
          reference,
          timestamp: result.transaction.createdAt,
        },
      });
    } catch (error) {
      logger.error('Error recording deposit:', error);
      next(error);
    }
  }
);

// ===================================================================
// ENDPOINT 3: GET /api/customers/:id/credit-info
// Get credit limit and utilization details
// ===================================================================

router.get(
  '/:id/credit-info',
  authenticate,
  validate(statementQueryValidation),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const customer = await prisma.customer.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          creditLimit: true,
          creditUsed: true,
          creditScore: true,
          paymentTermsDays: true,
          interestRate: true,
          accountStatus: true,
          autoApplyDeposit: true,
        },
      });

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      const availableCredit = Number(customer.creditLimit) - Number(customer.creditUsed);
      const utilizationRate = Number(customer.creditLimit) > 0
        ? (Number(customer.creditUsed) / Number(customer.creditLimit) * 100)
        : 0;

      // Get active installment plans count
      const activeInstallmentsCount = await prisma.installmentPlan.count({
        where: {
          customerId: id,
          status: 'ACTIVE',
        },
      });

      const creditInfo = {
        customerId: customer.id,
        customerName: customer.name,
        accountStatus: customer.accountStatus,
        
        // Credit details
        creditLimit: Number(customer.creditLimit),
        creditUsed: Number(customer.creditUsed),
        availableCredit: availableCredit,
        utilizationRate: utilizationRate.toFixed(2) + '%',
        
        // Terms & scoring
        creditScore: customer.creditScore,
        paymentTerms: customer.paymentTermsDays > 0 ? `Net ${customer.paymentTermsDays}` : 'Cash on Delivery',
        paymentTermsDays: customer.paymentTermsDays,
        interestRate: Number(customer.interestRate),
        
        // Settings
        autoApplyDeposit: customer.autoApplyDeposit,
        
        // Additional info
        activeInstallmentPlans: activeInstallmentsCount,
        
        // Risk indicators
        riskLevel: utilizationRate > 90 ? 'HIGH' : utilizationRate > 75 ? 'MEDIUM' : 'LOW',
        canExtendCredit: availableCredit > 0 && customer.accountStatus === 'ACTIVE',
      };

      logger.info(`Credit info retrieved for customer ${id}`, { userId: (req as any).user?.id });
      res.json(creditInfo);
    } catch (error) {
      logger.error('Error fetching credit info:', error);
      next(error);
    }
  }
);

// ===================================================================
// ENDPOINT 4: POST /api/customers/:id/adjust-credit
// Adjust customer credit limit
// ===================================================================

router.post(
  '/:id/adjust-credit',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  validate(adjustCreditValidation),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { newCreditLimit, reason } = req.body;
      const userId = (req as any).user?.id;

      const customer = await prisma.customer.findUnique({
        where: { id },
        select: { 
          id: true, 
          name: true, 
          creditLimit: true, 
          creditUsed: true,
          accountStatus: true,
        },
      });

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Check if new limit is less than currently used credit
      if (newCreditLimit < Number(customer.creditUsed)) {
        return res.status(400).json({ 
          error: 'New credit limit cannot be less than currently used credit',
          currentlyUsed: Number(customer.creditUsed),
          requestedLimit: newCreditLimit,
        });
      }

      const oldLimit = Number(customer.creditLimit);
      const change = newCreditLimit - oldLimit;

      // Update credit limit
      const updatedCustomer = await prisma.customer.update({
        where: { id },
        data: {
          creditLimit: newCreditLimit,
        },
      });

      // Log the change as a transaction
      await prisma.customerTransaction.create({
        data: {
          customerId: id,
          type: 'ADJUSTMENT',
          amount: 0, // No balance change
          balance: updatedCustomer.currentBalance,
          description: `Credit limit adjusted from ${oldLimit} to ${newCreditLimit}. Reason: ${reason}`,
          createdBy: userId,
        },
      });

      logger.info(`Credit limit adjusted for customer ${id}: ${oldLimit} -> ${newCreditLimit}`, { userId });
      
      res.json({
        message: 'Credit limit adjusted successfully',
        adjustment: {
          customerId: id,
          customerName: customer.name,
          oldCreditLimit: oldLimit,
          newCreditLimit: Number(newCreditLimit),
          change: change,
          changePercentage: oldLimit > 0 ? ((change / oldLimit) * 100).toFixed(2) + '%' : 'N/A',
          availableCredit: newCreditLimit - Number(customer.creditUsed),
          reason,
          adjustedBy: userId,
          adjustedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error('Error adjusting credit limit:', error);
      next(error);
    }
  }
);

// ===================================================================
// ENDPOINT 5: GET /api/customers/:id/statement
// Generate customer statement
// ===================================================================

router.get(
  '/:id/statement',
  authenticate,
  validate(statementQueryValidation),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { startDate, endDate } = req.query;

      const customer = await prisma.customer.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          address: true,
          creditLimit: true,
          currentBalance: true,
          depositBalance: true,
          creditUsed: true,
        },
      });

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Build date filter
      const dateFilter: any = {};
      if (startDate) {
        dateFilter.gte = new Date(startDate as string);
      }
      if (endDate) {
        dateFilter.lte = new Date(endDate as string);
      }

      // Get transactions within date range
      const transactions = await prisma.customerTransaction.findMany({
        where: {
          customerId: id,
          ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
        },
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          id: true,
          type: true,
          amount: true,
          balance: true,
          description: true,
          referenceId: true,
          createdAt: true,
        },
      });

      // Get sales within date range
      const sales = await prisma.sale.findMany({
        where: {
          customerId: id,
          ...(Object.keys(dateFilter).length > 0 && { saleDate: dateFilter }),
        },
        orderBy: {
          saleDate: 'asc',
        },
        select: {
          id: true,
          saleNumber: true,
          saleDate: true,
          totalAmount: true,
          amountPaid: true,
          amountOutstanding: true,
          paymentStatus: true,
        },
      });

      // Calculate summary
  const totalSales = sales.reduce((sum: number, sale: any) => sum + Number(sale.totalAmount), 0);
  const totalPaid = sales.reduce((sum: number, sale: any) => sum + Number(sale.amountPaid), 0);
  const totalOutstanding = sales.reduce((sum: number, sale: any) => sum + Number(sale.amountOutstanding), 0);

      const statement = {
        customer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          address: customer.address,
        },
        period: {
          startDate: startDate || 'Beginning',
          endDate: endDate || 'Current',
          generatedAt: new Date(),
        },
        balances: {
          currentBalance: Number(customer.currentBalance),
          depositBalance: Number(customer.depositBalance),
          netBalance: Number(customer.currentBalance) - Number(customer.depositBalance),
          creditLimit: Number(customer.creditLimit),
          creditUsed: Number(customer.creditUsed),
          availableCredit: Number(customer.creditLimit) - Number(customer.creditUsed),
        },
        summary: {
          totalSales: totalSales,
          totalPaid: totalPaid,
          totalOutstanding: totalOutstanding,
          transactionCount: transactions.length,
          salesCount: sales.length,
        },
  transactions: transactions.map((t: any) => ({
          id: t.id,
          date: t.createdAt,
          type: t.type,
          description: t.description,
          amount: Number(t.amount),
          balance: Number(t.balance),
          reference: t.referenceId,
        })),
  sales: sales.map((s: any) => ({
          id: s.id,
          saleNumber: s.saleNumber,
          date: s.saleDate,
          totalAmount: Number(s.totalAmount),
          amountPaid: Number(s.amountPaid),
          amountOutstanding: Number(s.amountOutstanding),
          status: s.paymentStatus,
        })),
      };

      logger.info(`Statement generated for customer ${id}`, { userId: (req as any).user?.id });
      res.json(statement);
    } catch (error) {
      logger.error('Error generating statement:', error);
      next(error);
    }
  }
);

// ===================================================================
// ENDPOINT 6: POST /api/customers/:id/payment
// Record customer payment
// ===================================================================

router.post(
  '/:id/payment',
  authenticate,
  validate(paymentValidation),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { amount, paymentMethod, reference, notes, applyToSales } = req.body;
      const userId = (req as any).user?.id;

      const customer = await prisma.customer.findUnique({
        where: { id },
        select: { 
          id: true, 
          name: true, 
          currentBalance: true,
          depositBalance: true,
          creditUsed: true,
          autoApplyDeposit: true,
        },
      });

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Use transaction for consistency
  const result = await prisma.$transaction(async (tx: any) => {
        let remainingAmount = amount;
        const appliedToSales: any[] = [];

        // If specific sales are specified, apply payment to them
        if (applyToSales && applyToSales.length > 0) {
          for (const saleId of applyToSales) {
            if (remainingAmount <= 0) break;

            const sale = await tx.sale.findUnique({
              where: { id: saleId },
              select: { id: true, saleNumber: true, amountOutstanding: true },
            });

            if (sale && Number(sale.amountOutstanding) > 0) {
              const paymentForSale = Math.min(remainingAmount, Number(sale.amountOutstanding));
              
              await tx.sale.update({
                where: { id: saleId },
                data: {
                  amountPaid: { increment: paymentForSale },
                  amountOutstanding: { decrement: paymentForSale },
                  paymentStatus: paymentForSale >= Number(sale.amountOutstanding) ? 'PAID' : 'PARTIAL',
                },
              });

              appliedToSales.push({
                saleId,
                saleNumber: sale.saleNumber,
                amount: paymentForSale,
              });

              remainingAmount -= paymentForSale;
            }
          }
        }

        // Update customer balances
        const updatedCustomer = await tx.customer.update({
          where: { id },
          data: {
            currentBalance: { decrement: amount },
            creditUsed: { decrement: Math.min(amount, Number(customer.creditUsed)) },
            totalPayments: { increment: amount },
            lastPaymentDate: new Date(),
          },
        });

        // Create transaction record
        const transaction = await tx.customerTransaction.create({
          data: {
            customerId: id,
            type: 'PAYMENT',
            amount: -amount, // Negative because it reduces balance
            balance: updatedCustomer.currentBalance,
            description: notes || `Payment via ${paymentMethod}`,
            referenceId: reference || null,
            createdBy: userId,
          },
        });

        return { customer: updatedCustomer, transaction, appliedToSales };
      });

      logger.info(`Payment of ${amount} recorded for customer ${id}`, { userId });
      
      res.status(201).json({
        message: 'Payment recorded successfully',
        payment: {
          transactionId: result.transaction.id,
          customerId: id,
          customerName: customer.name,
          amount: Number(amount),
          newBalance: Number(result.customer.currentBalance),
          appliedToSales: result.appliedToSales,
          paymentMethod,
          reference,
          timestamp: result.transaction.createdAt,
        },
      });
    } catch (error) {
      logger.error('Error recording payment:', error);
      next(error);
    }
  }
);

// ===================================================================
// ENDPOINT 7: GET /api/customers/:id/aging
// Get aging report for customer
// ===================================================================

router.get(
  '/:id/aging',
  authenticate,
  validate(statementQueryValidation),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const customer = await prisma.customer.findUnique({
        where: { id },
        select: { id: true, name: true, currentBalance: true },
      });

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      // Get unpaid/partially paid sales
      const sales = await prisma.sale.findMany({
        where: {
          customerId: id,
          paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
        },
        select: {
          id: true,
          saleNumber: true,
          saleDate: true,
          totalAmount: true,
          amountPaid: true,
          amountOutstanding: true,
        },
        orderBy: {
          saleDate: 'asc',
        },
      });

      // Categorize by age
      const aging = {
        current: 0,      // 0-30 days
        days30: 0,       // 31-60 days
        days60: 0,       // 61-90 days
        days90Plus: 0,   // 90+ days
      };

  const detailedSales = sales.map((sale: any) => {
        const outstanding = Number(sale.amountOutstanding);
        const daysOld = Math.floor((now.getTime() - sale.saleDate.getTime()) / (24 * 60 * 60 * 1000));

        let category = 'current';
        if (daysOld > 90) {
          aging.days90Plus += outstanding;
          category = 'over90Days';
        } else if (daysOld > 60) {
          aging.days60 += outstanding;
          category = '61-90Days';
        } else if (daysOld > 30) {
          aging.days30 += outstanding;
          category = '31-60Days';
        } else {
          aging.current += outstanding;
          category = '0-30Days';
        }

        return {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          saleDate: sale.saleDate,
          totalAmount: Number(sale.totalAmount),
          amountPaid: Number(sale.amountPaid),
          amountOutstanding: outstanding,
          daysOld,
          category,
        };
      });

      const totalOutstanding = aging.current + aging.days30 + aging.days60 + aging.days90Plus;

      const agingReport = {
        customerId: customer.id,
        customerName: customer.name,
        totalOutstanding: totalOutstanding,
        currentBalance: Number(customer.currentBalance),
        reportDate: now,
        aging: {
          current: aging.current,
          days31To60: aging.days30,
          days61To90: aging.days60,
          over90Days: aging.days90Plus,
        },
        percentages: {
          current: totalOutstanding > 0 ? ((aging.current / totalOutstanding) * 100).toFixed(2) + '%' : '0%',
          days31To60: totalOutstanding > 0 ? ((aging.days30 / totalOutstanding) * 100).toFixed(2) + '%' : '0%',
          days61To90: totalOutstanding > 0 ? ((aging.days60 / totalOutstanding) * 100).toFixed(2) + '%' : '0%',
          over90Days: totalOutstanding > 0 ? ((aging.days90Plus / totalOutstanding) * 100).toFixed(2) + '%' : '0%',
        },
        riskLevel: aging.days90Plus > 0 ? 'HIGH' : aging.days60 > 0 ? 'MEDIUM' : 'LOW',
        sales: detailedSales,
      };

      logger.info(`Aging report generated for customer ${id}`, { userId: (req as any).user?.id });
      res.json(agingReport);
    } catch (error) {
      logger.error('Error generating aging report:', error);
      next(error);
    }
  }
);

// ===================================================================
// ENDPOINT 8: GET /api/customers/:id/transactions
// Get customer transaction history
// ===================================================================

router.get(
  '/:id/transactions',
  authenticate,
  validate(statementQueryValidation),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { limit = '50', type, startDate, endDate } = req.query;

      const customer = await prisma.customer.findUnique({
        where: { id },
        select: { id: true, name: true },
      });

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Build filters
      const where: any = { customerId: id };
      
      if (type) {
        where.type = type;
      }
      
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate as string);
        if (endDate) where.createdAt.lte = new Date(endDate as string);
      }

      const transactions = await prisma.customerTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
        select: {
          id: true,
          type: true,
          amount: true,
          balance: true,
          description: true,
          referenceId: true,
          documentNumber: true,
          dueDate: true,
          createdAt: true,
          createdBy: true,
        },
      });

      const transactionHistory = {
        customerId: customer.id,
        customerName: customer.name,
        filters: {
          type: type || 'all',
          startDate: startDate || null,
          endDate: endDate || null,
          limit: parseInt(limit as string),
        },
        transactionCount: transactions.length,
  transactions: transactions.map((t: any) => ({
          id: t.id,
          date: t.createdAt,
          type: t.type,
          description: t.description,
          amount: Number(t.amount),
          runningBalance: Number(t.balance),
          reference: t.referenceId,
          documentNumber: t.documentNumber,
          dueDate: t.dueDate,
          createdBy: t.createdBy,
        })),
      };

      logger.info(`Transaction history retrieved for customer ${id}`, { userId: (req as any).user?.id });
      res.json(transactionHistory);
    } catch (error) {
      logger.error('Error fetching transaction history:', error);
      next(error);
    }
  }
);

// ===================================================================
// EXPORT ROUTER
// ===================================================================

export default router;
