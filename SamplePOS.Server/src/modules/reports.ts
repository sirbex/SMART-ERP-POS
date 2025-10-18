import { Router, Request, Response, NextFunction } from 'express';
import { query, param, validationResult } from 'express-validator';
import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { authenticate } from '../middleware/auth.js';
import { Decimal } from '@prisma/client/runtime/library';

const router = Router();
router.use(authenticate);

// Helper: Calculate aging buckets
function calculateAgingBuckets(sales: any[]) {
  const buckets = { current: new Decimal(0), days30: new Decimal(0), days60: new Decimal(0), days90: new Decimal(0), over90: new Decimal(0) };
  const today = new Date();
  
  for (const sale of sales) {
    const daysPastDue = Math.floor((today.getTime() - new Date(sale.saleDate).getTime()) / (1000 * 60 * 60 * 24));
    const amount = new Decimal(sale.amountOutstanding.toString());
    
    if (daysPastDue <= 30) buckets.current = buckets.current.add(amount);
    else if (daysPastDue <= 60) buckets.days30 = buckets.days30.add(amount);
    else if (daysPastDue <= 90) buckets.days60 = buckets.days60.add(amount);
    else if (daysPastDue <= 120) buckets.days90 = buckets.days90.add(amount);
    else buckets.over90 = buckets.over90.add(amount);
  }
  
  return buckets;
}

// Helper: Format date range
function getDateRange(startDate?: string, endDate?: string) {
  const where: any = {};
  if (startDate || endDate) {
    where.saleDate = {};
    if (startDate) where.saleDate.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.saleDate.lte = end;
    }
  }
  return where;
}

// Endpoint 1: GET /api/reports/aging - Accounts Receivable Aging Report
router.get('/aging', [
  query('groupBy').optional().isIn(['customer', 'sale'])
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { groupBy = 'customer' } = req.query;
    const user = (req as any).user;

    const outstandingSales = await prisma.sale.findMany({
      where: {
        paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
        customerId: { not: null }
      },
      select: {
        id: true,
        saleNumber: true,
        saleDate: true,
        totalAmount: true,
        amountPaid: true,
        amountOutstanding: true,
        paymentStatus: true,
        customerId: true,
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            creditLimit: true,
            currentBalance: true
          }
        }
      },
      orderBy: { saleDate: 'asc' }
    });

    if (groupBy === 'customer') {
      const customerMap = new Map<string, any>();
      
      for (const sale of outstandingSales) {
        if (!sale.customer) continue;
        
        const customerId = sale.customerId!;
        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            customer: {
              id: sale.customer.id,
              name: sale.customer.name,
              phone: sale.customer.phone,
              email: sale.customer.email,
              creditLimit: parseFloat(sale.customer.creditLimit.toString()),
              currentBalance: parseFloat(sale.customer.currentBalance.toString())
            },
            sales: [],
            totalOutstanding: new Decimal(0)
          });
        }
        
        const customer = customerMap.get(customerId)!;
        customer.sales.push({
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          saleDate: sale.saleDate,
          totalAmount: parseFloat(sale.totalAmount.toString()),
          amountPaid: parseFloat(sale.amountPaid.toString()),
          amountOutstanding: parseFloat(sale.amountOutstanding.toString()),
          daysPastDue: Math.floor((Date.now() - new Date(sale.saleDate).getTime()) / (1000 * 60 * 60 * 24))
        });
        customer.totalOutstanding = customer.totalOutstanding.add(sale.amountOutstanding);
      }

      const customers = Array.from(customerMap.values()).map((c: any) => ({
        ...c,
        totalOutstanding: parseFloat(c.totalOutstanding.toString()),
        agingBuckets: calculateAgingBuckets(c.sales.map((s: any) => ({ saleDate: s.saleDate, amountOutstanding: new Decimal(s.amountOutstanding) })))
      })).sort((a, b) => b.totalOutstanding - a.totalOutstanding);

      const totalAR = customers.reduce((sum: number, c: any) => sum + c.totalOutstanding, 0);
      const overallBuckets = calculateAgingBuckets(outstandingSales);

      logger.info('Generated aging report (by customer)', { userId: user.id, customerCount: customers.length });

      res.json({
        success: true,
        reportType: 'aging',
        groupBy: 'customer',
        generatedAt: new Date(),
        summary: {
          totalCustomers: customers.length,
          totalOutstanding: totalAR,
          agingBuckets: {
            current: parseFloat(overallBuckets.current.toString()),
            days30: parseFloat(overallBuckets.days30.toString()),
            days60: parseFloat(overallBuckets.days60.toString()),
            days90: parseFloat(overallBuckets.days90.toString()),
            over90: parseFloat(overallBuckets.over90.toString())
          }
        },
        customers
      });
    } else {
      const sales = outstandingSales.map(sale => ({
        saleId: sale.id,
        saleNumber: sale.saleNumber,
        saleDate: sale.saleDate,
        customer: sale.customer ? {
          id: sale.customer.id,
          name: sale.customer.name,
          phone: sale.customer.phone
        } : null,
        totalAmount: parseFloat(sale.totalAmount.toString()),
        amountPaid: parseFloat(sale.amountPaid.toString()),
        amountOutstanding: parseFloat(sale.amountOutstanding.toString()),
        daysPastDue: Math.floor((Date.now() - new Date(sale.saleDate).getTime()) / (1000 * 60 * 60 * 24)),
        agingCategory: (() => {
          const days = Math.floor((Date.now() - new Date(sale.saleDate).getTime()) / (1000 * 60 * 60 * 24));
          if (days <= 30) return 'current';
          if (days <= 60) return '30-60';
          if (days <= 90) return '60-90';
          if (days <= 120) return '90-120';
          return 'over-120';
        })()
      })).sort((a, b) => b.daysPastDue - a.daysPastDue);

      const totalAR = sales.reduce((sum: number, s: any) => sum + s.amountOutstanding, 0);
      const overallBuckets = calculateAgingBuckets(outstandingSales);

      logger.info('Generated aging report (by sale)', { userId: user.id, saleCount: sales.length });

      res.json({
        success: true,
        reportType: 'aging',
        groupBy: 'sale',
        generatedAt: new Date(),
        summary: {
          totalSales: sales.length,
          totalOutstanding: totalAR,
          agingBuckets: {
            current: parseFloat(overallBuckets.current.toString()),
            days30: parseFloat(overallBuckets.days30.toString()),
            days60: parseFloat(overallBuckets.days60.toString()),
            days90: parseFloat(overallBuckets.days90.toString()),
            over90: parseFloat(overallBuckets.over90.toString())
          }
        },
        sales
      });
    }
  } catch (error: any) {
    logger.error('Aging report error:', error);
    next(error);
  }
});

// Endpoint 2: GET /api/reports/customer-statement/:id - Customer Account Statement
router.get('/customer-statement/:id', [
  param('id').isString().trim().notEmpty(),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const customerId = req.params.id;
    const { startDate, endDate } = req.query;
    const user = (req as any).user;

    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const dateFilter = getDateRange(startDate as string, endDate as string);

    const [sales, payments, deposits, credits] = await Promise.all([
      prisma.sale.findMany({
        where: { customerId, ...dateFilter },
        select: {
          id: true,
          saleNumber: true,
          saleDate: true,
          totalAmount: true,
          amountPaid: true,
          amountOutstanding: true
        },
        orderBy: { saleDate: 'asc' }
      }),
      prisma.customerTransaction.findMany({
        where: {
          customerId,
          type: 'PAYMENT',
          createdAt: dateFilter.saleDate ? { gte: dateFilter.saleDate.gte, lte: dateFilter.saleDate.lte } : undefined
        },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.customerTransaction.findMany({
        where: {
          customerId,
          type: 'DEPOSIT',
          createdAt: dateFilter.saleDate ? { gte: dateFilter.saleDate.gte, lte: dateFilter.saleDate.lte } : undefined
        },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.customerTransaction.findMany({
        where: {
          customerId,
          type: 'CREDIT_NOTE',
          createdAt: dateFilter.saleDate ? { gte: dateFilter.saleDate.gte, lte: dateFilter.saleDate.lte } : undefined
        },
        orderBy: { createdAt: 'asc' }
      })
    ]);

    const transactions = [
      ...sales.map(s => ({ date: s.saleDate, type: 'SALE', reference: s.saleNumber, debit: parseFloat(s.totalAmount.toString()), credit: 0, balance: 0 })),
      ...payments.map(p => ({ date: p.createdAt, type: 'PAYMENT', reference: p.referenceId, debit: 0, credit: parseFloat(p.amount.toString()), balance: 0 })),
      ...deposits.map(d => ({ date: d.createdAt, type: 'DEPOSIT', reference: d.referenceId, debit: 0, credit: parseFloat(d.amount.toString()), balance: 0 })),
      ...credits.map(c => ({ date: c.createdAt, type: 'CREDIT', reference: c.referenceId, debit: 0, credit: Math.abs(parseFloat(c.amount.toString())), balance: 0 }))
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    let runningBalance = 0;
    for (const txn of transactions) {
      runningBalance += txn.debit - txn.credit;
      txn.balance = runningBalance;
    }

    const summary = {
      openingBalance: 0,
      totalCharges: sales.reduce((sum: number, s: any) => sum + parseFloat(s.totalAmount.toString()), 0),
      totalPayments: payments.reduce((sum: number, p: any) => sum + parseFloat(p.amount.toString()), 0),
      totalCredits: credits.reduce((sum: number, c: any) => sum + Math.abs(parseFloat(c.amount.toString())), 0),
      closingBalance: parseFloat(customer.currentBalance.toString()),
      creditLimit: parseFloat(customer.creditLimit.toString()),
      availableCredit: Math.max(0, parseFloat(customer.creditLimit.toString()) - parseFloat(customer.currentBalance.toString()))
    };

    logger.info(`Generated customer statement for ${customer.name}`, { userId: user.id, customerId });

    res.json({
      success: true,
      reportType: 'customer-statement',
      generatedAt: new Date(),
      period: { startDate, endDate },
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address
      },
      summary,
      transactions
    });
  } catch (error: any) {
    logger.error('Customer statement error:', error);
    next(error);
  }
});

// Endpoint 3: GET /api/reports/profitability - Profitability Analysis Report
router.get('/profitability', [
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('groupBy').optional().isIn(['product', 'category', 'overall'])
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { startDate, endDate, groupBy = 'overall' } = req.query;
    const user = (req as any).user;
    const dateFilter = getDateRange(startDate as string, endDate as string);

    const saleItems = await prisma.saleItem.findMany({
      where: {
        sale: { ...dateFilter, status: 'COMPLETED' }
      },
      include: {
        product: true,
        sale: true
      }
    });

    if (groupBy === 'product') {
      const productMap = new Map<string, any>();
      
      for (const item of saleItems) {
        const productId = item.productId;
        if (!productMap.has(productId)) {
          productMap.set(productId, {
            product: { id: item.product.id, name: item.product.name, category: item.product.category },
            totalRevenue: new Decimal(0),
            totalCost: new Decimal(0),
            quantitySold: new Decimal(0),
            salesCount: 0
          });
        }
        
        const product = productMap.get(productId)!;
        product.totalRevenue = product.totalRevenue.add(item.total);
        product.totalCost = product.totalCost.add(item.costTotal);
        product.quantitySold = product.quantitySold.add(item.quantity);
        product.salesCount++;
      }

      const products = Array.from(productMap.values()).map((p: any) => {
        const revenue = parseFloat(p.totalRevenue.toString());
        const cost = parseFloat(p.totalCost.toString());
        const profit = revenue - cost;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
        return {
          ...p,
          totalRevenue: revenue,
          totalCost: cost,
          grossProfit: profit,
          profitMargin: margin,
          quantitySold: parseFloat(p.quantitySold.toString())
        };
      }).sort((a, b) => b.grossProfit - a.grossProfit);

      const totals = products.reduce((sum: any, p: any) => ({
        revenue: sum.revenue + p.totalRevenue,
        cost: sum.cost + p.totalCost,
        profit: sum.profit + p.grossProfit
      }), { revenue: 0, cost: 0, profit: 0 });

      logger.info('Generated profitability report (by product)', { userId: user.id, productCount: products.length });

      res.json({
        success: true,
        reportType: 'profitability',
        groupBy: 'product',
        period: { startDate, endDate },
        generatedAt: new Date(),
        summary: {
          totalRevenue: totals.revenue,
          totalCost: totals.cost,
          grossProfit: totals.profit,
          profitMargin: totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0,
          productCount: products.length
        },
        products
      });
    } else {
      let totalRevenue = new Decimal(0);
      let totalCost = new Decimal(0);
      
      for (const item of saleItems) {
        totalRevenue = totalRevenue.add(item.total);
        totalCost = totalCost.add(item.costTotal);
      }
      
      const grossProfit = totalRevenue.sub(totalCost);
      const profitMargin = totalRevenue.gt(0) ? grossProfit.div(totalRevenue).mul(100) : new Decimal(0);

      logger.info('Generated profitability report (overall)', { userId: user.id });

      res.json({
        success: true,
        reportType: 'profitability',
        groupBy: 'overall',
        period: { startDate, endDate },
        generatedAt: new Date(),
        summary: {
          totalRevenue: parseFloat(totalRevenue.toString()),
          totalCost: parseFloat(totalCost.toString()),
          grossProfit: parseFloat(grossProfit.toString()),
          profitMargin: parseFloat(profitMargin.toString()),
          itemsSold: saleItems.length
        }
      });
    }
  } catch (error: any) {
    logger.error('Profitability report error:', error);
    next(error);
  }
});

// Endpoint 4: GET /api/reports/cash-flow - Cash Flow Report
router.get('/cash-flow', [
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { startDate, endDate } = req.query;
    const user = (req as any).user;
    const dateFilter = getDateRange(startDate as string, endDate as string);

    const [sales, customerPayments, purchases, supplierPayments] = await Promise.all([
      prisma.sale.findMany({
        where: { ...dateFilter, status: 'COMPLETED' },
        select: {
          id: true,
          saleNumber: true,
          saleDate: true,
          totalAmount: true,
          amountPaid: true,
          amountOutstanding: true
        }
      }),
      prisma.customerTransaction.findMany({
        where: {
          type: 'PAYMENT',
          createdAt: dateFilter.saleDate ? { gte: dateFilter.saleDate.gte, lte: dateFilter.saleDate.lte } : undefined
        }
      }),
      prisma.purchase.findMany({
        where: {
          orderDate: dateFilter.saleDate ? { gte: dateFilter.saleDate.gte, lte: dateFilter.saleDate.lte } : undefined
        }
      }),
      prisma.supplierPayment.findMany({
        where: {
          paymentDate: dateFilter.saleDate ? { gte: dateFilter.saleDate.gte, lte: dateFilter.saleDate.lte } : undefined
        }
      })
    ]);

    const cashIn = {
      salesRevenue: sales.reduce((sum: number, s: any) => sum + parseFloat(s.amountPaid.toString()), 0),
      customerPayments: customerPayments.reduce((sum: number, p: any) => sum + parseFloat(p.amount.toString()), 0)
    };

    const cashOut = {
      purchases: purchases.reduce((sum: number, p: any) => sum + parseFloat(p.totalAmount.toString()), 0),
      supplierPayments: supplierPayments.reduce((sum: number, p: any) => sum + parseFloat(p.amount.toString()), 0)
    };

    const totalInflow = cashIn.salesRevenue + cashIn.customerPayments;
    const totalOutflow = cashOut.purchases + cashOut.supplierPayments;
    const netCashFlow = totalInflow - totalOutflow;

    logger.info('Generated cash flow report', { userId: user.id });

    res.json({
      success: true,
      reportType: 'cash-flow',
      period: { startDate, endDate },
      generatedAt: new Date(),
      cashInflows: {
        salesRevenue: cashIn.salesRevenue,
        customerPayments: cashIn.customerPayments,
        total: totalInflow
      },
      cashOutflows: {
        purchases: cashOut.purchases,
        supplierPayments: cashOut.supplierPayments,
        total: totalOutflow
      },
      netCashFlow,
      summary: {
        totalInflow,
        totalOutflow,
        netCashFlow,
        cashFlowRatio: totalOutflow > 0 ? totalInflow / totalOutflow : 0
      }
    });
  } catch (error: any) {
    logger.error('Cash flow report error:', error);
    next(error);
  }
});

// Endpoint 5: GET /api/reports/ar-summary - Accounts Receivable Summary
router.get('/ar-summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;

    const [outstandingSales, customers, recentPayments] = await Promise.all([
      prisma.sale.findMany({
        where: { paymentStatus: { in: ['UNPAID', 'PARTIAL'] }, customerId: { not: null } },
        select: {
          id: true,
          saleNumber: true,
          saleDate: true,
          totalAmount: true,
          amountPaid: true,
          amountOutstanding: true,
          paymentStatus: true,
          customerId: true,
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              creditLimit: true,
              currentBalance: true
            }
          }
        }
      }),
      prisma.customer.findMany({
        where: { currentBalance: { gt: 0 } }
      }),
      prisma.customerTransaction.findMany({
        where: { type: 'PAYMENT' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { customer: true }
      })
    ]);

    const totalAR = outstandingSales.reduce((sum: number, s: any) => sum + parseFloat(s.amountOutstanding.toString()), 0);
    const agingBuckets = calculateAgingBuckets(outstandingSales);
    
    const customerBalances = customers.map(c => ({
      customerId: c.id,
      customerName: c.name,
      balance: parseFloat(c.currentBalance.toString()),
      creditLimit: parseFloat(c.creditLimit.toString()),
      utilizationPercent: parseFloat(c.creditLimit.toString()) > 0 
        ? (parseFloat(c.currentBalance.toString()) / parseFloat(c.creditLimit.toString())) * 100 
        : 0
    })).sort((a, b) => b.balance - a.balance);

    const topDebtors = customerBalances.slice(0, 10);
    const overdueCount = outstandingSales.filter(s => {
      const days = Math.floor((Date.now() - new Date(s.saleDate).getTime()) / (1000 * 60 * 60 * 24));
      return days > 30;
    }).length;

    logger.info('Generated AR summary report', { userId: user.id });

    res.json({
      success: true,
      reportType: 'ar-summary',
      generatedAt: new Date(),
      summary: {
        totalOutstanding: totalAR,
        customersWithBalance: customers.length,
        outstandingSales: outstandingSales.length,
        overdueSales: overdueCount,
        agingBuckets: {
          current: parseFloat(agingBuckets.current.toString()),
          days30: parseFloat(agingBuckets.days30.toString()),
          days60: parseFloat(agingBuckets.days60.toString()),
          days90: parseFloat(agingBuckets.days90.toString()),
          over90: parseFloat(agingBuckets.over90.toString())
        }
      },
      topDebtors,
      recentPayments: recentPayments.map(p => ({
        paymentDate: p.createdAt,
        customer: p.customer ? p.customer.name : 'Unknown',
        amount: parseFloat(p.amount.toString()),
        reference: p.referenceId
      }))
    });
  } catch (error: any) {
    logger.error('AR summary report error:', error);
    next(error);
  }
});

export default router;
