/**
 * Report Generation Worker
 * 
 * Background worker to process heavy report generation jobs
 * Handles: sales reports, inventory reports, financial reports
 */

import { reportQueue } from '../config/queue.js';
import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { Decimal } from 'decimal.js';

// Job data interfaces
interface ReportJobData {
  reportType: 'sales' | 'inventory' | 'financial' | 'customer';
  startDate?: Date;
  endDate?: Date;
  filters?: any;
  userId: string;
}

// Process report jobs
reportQueue.process(async (job) => {
  const data = job.data as ReportJobData;
  
  logger.info(`Processing report job`, { 
    jobId: job.id, 
    reportType: data.reportType,
    userId: data.userId
  });

  try {
    let result: any;

    switch (data.reportType) {
      case 'sales':
        result = await generateSalesReport(data);
        break;
      case 'inventory':
        result = await generateInventoryReport(data);
        break;
      case 'financial':
        result = await generateFinancialReport(data);
        break;
      case 'customer':
        result = await generateCustomerReport(data);
        break;
      default:
        throw new Error(`Unknown report type: ${data.reportType}`);
    }

    logger.info(`Report generated successfully`, { 
      jobId: job.id, 
      reportType: data.reportType,
      recordCount: result.recordCount
    });

    return result;
  } catch (error) {
    logger.error(`Report generation failed`, { 
      jobId: job.id, 
      reportType: data.reportType,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
});

// Report generation functions
async function generateSalesReport(data: ReportJobData) {
  const where: any = {};
  
  if (data.startDate || data.endDate) {
    where.saleDate = {};
    if (data.startDate) where.saleDate.gte = data.startDate;
    if (data.endDate) where.saleDate.lte = data.endDate;
  }

  const [sales, summary] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        items: true,
        payments: true,
      },
      orderBy: { saleDate: 'desc' },
    }),
    prisma.sale.aggregate({
      where,
      _sum: {
        subtotal: true,
        taxAmount: true,
        totalAmount: true,
        discountAmount: true,
      },
      _count: true,
    }),
  ]);

  return {
    recordCount: sales.length,
    sales,
    summary: {
      totalSales: summary._count,
      totalRevenue: summary._sum.totalAmount || new Decimal(0),
      totalTax: summary._sum.taxAmount || new Decimal(0),
      totalDiscount: summary._sum.discountAmount || new Decimal(0),
    },
  };
}

async function generateInventoryReport(data: ReportJobData) {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: {
      batches: {
        where: { status: 'ACTIVE' },
      },
      _count: {
        select: { batches: true },
      },
    },
  });

  const lowStockProducts = products.filter(
    (p: any) => new Decimal(p.currentStock).lessThan(p.reorderLevel)
  );

  return {
    recordCount: products.length,
    products,
    summary: {
      totalProducts: products.length,
      lowStockCount: lowStockProducts.length,
      totalValue: products.reduce(
        (sum: Decimal, p: any) => sum.plus(new Decimal(p.currentStock).times(p.costPrice)),
        new Decimal(0)
      ),
    },
  };
}

async function generateFinancialReport(data: ReportJobData) {
  const where: any = {};
  
  if (data.startDate || data.endDate) {
    where.createdAt = {};
    if (data.startDate) where.createdAt.gte = data.startDate;
    if (data.endDate) where.createdAt.lte = data.endDate;
  }

  const [sales, payments] = await Promise.all([
    prisma.sale.aggregate({
      where: {
        ...where,
        status: 'COMPLETED',
      },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where,
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  return {
    recordCount: sales._count + payments._count,
    summary: {
      totalRevenue: sales._sum.totalAmount || new Decimal(0),
      totalPayments: payments._sum.amount || new Decimal(0),
      salesCount: sales._count,
      paymentCount: payments._count,
    },
  };
}

async function generateCustomerReport(data: ReportJobData) {
  const customers = await prisma.customer.findMany({
    include: {
      _count: {
        select: { sales: true, transactions: true },
      },
    },
  });

  const summary = await prisma.customer.aggregate({
    _sum: { currentBalance: true, totalPurchases: true },
    _count: true,
  });

  return {
    recordCount: customers.length,
    customers,
    summary: {
      totalCustomers: summary._count,
      totalOutstanding: summary._sum.currentBalance || new Decimal(0),
      totalPurchases: summary._sum.totalPurchases || new Decimal(0),
      customersWithCredit: customers.filter(
        (c: any) => new Decimal(c.currentBalance).greaterThan(0)
      ).length,
    },
  };
}

// Job event listeners
reportQueue.on('completed', (job, result) => {
  logger.info(`Report job completed`, { 
    jobId: job.id, 
    recordCount: result.recordCount 
  });
});

reportQueue.on('failed', (job, err) => {
  logger.error(`Report job failed`, { 
    jobId: job?.id, 
    error: err.message,
    attempts: job?.attemptsMade 
  });
});

reportQueue.on('stalled', (job) => {
  logger.warn(`Report job stalled`, { jobId: job.id });
});

logger.info('Report worker started and listening for jobs');

export default reportQueue;
