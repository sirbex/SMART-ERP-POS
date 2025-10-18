/**
 * Aging Calculator Service
 * 
 * Handles accounts receivable aging calculations and analysis.
 * Categorizes outstanding balances by age and generates aging reports.
 * 
 * Key Features:
 * - Automatic aging bucket calculation (Current, 30, 60, 90, 90+)
 * - Customer-level and sale-level aging
 * - Overdue alert generation
 * - Collection priority scoring
 * - Days past due calculation
 */

import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { Decimal } from '@prisma/client/runtime/library';

// ============================================================================
// TYPES
// ============================================================================

export interface AgingBuckets {
  current: Decimal;      // 0-30 days
  days30: Decimal;       // 31-60 days
  days60: Decimal;       // 61-90 days
  days90: Decimal;       // 91-120 days
  over90: Decimal;       // 121+ days
}

export interface CustomerAging {
  customerId: string;
  customerName: string;
  totalOutstanding: Decimal;
  agingBuckets: AgingBuckets;
  oldestInvoiceDays: number;
  overdueAmount: Decimal; // Amount past payment terms
  collectionPriority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  riskScore: number; // 0-100 (higher = riskier)
}

export interface SaleAging {
  saleId: string;
  saleNumber: string;
  customerId: string | null;
  customerName: string | null;
  saleDate: Date;
  totalAmount: Decimal;
  amountOutstanding: Decimal;
  daysPastDue: number;
  agingCategory: 'current' | '30-60' | '60-90' | '90-120' | 'over-120';
  isOverdue: boolean;
  daysUntilDue?: number; // Negative if overdue
}

export interface OverdueAlert {
  customerId: string;
  customerName: string;
  totalOverdue: Decimal;
  oldestDaysPastDue: number;
  overdueInvoiceCount: number;
  lastPaymentDate: Date | null;
  recommendedAction: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

// ============================================================================
// CORE AGING CALCULATIONS
// ============================================================================

/**
 * Calculate days past due for a sale
 * 
 * @param saleDate - Date of the sale
 * @param paymentTermsDays - Payment terms (0 = immediate, 30 = net 30, etc.)
 * @returns Days past due (negative = not yet due)
 */
export function calculateDaysPastDue(
  saleDate: Date,
  paymentTermsDays: number = 0
): number {
  const today = new Date();
  const dueDate = new Date(saleDate);
  dueDate.setDate(dueDate.getDate() + paymentTermsDays);
  
  const daysDiff = Math.floor(
    (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  return daysDiff;
}

/**
 * Determine aging bucket category based on days past due
 * 
 * @param daysPastDue - Days since due date (negative = not yet due)
 * @returns Aging category
 */
export function getAgingBucket(daysPastDue: number): keyof AgingBuckets {
  if (daysPastDue <= 30) return 'current';
  if (daysPastDue <= 60) return 'days30';
  if (daysPastDue <= 90) return 'days60';
  if (daysPastDue <= 120) return 'days90';
  return 'over90';
}

/**
 * Calculate aging buckets from array of sales
 * 
 * @param sales - Array of sales with saleDate and amountOutstanding
 * @param paymentTermsDays - Payment terms to apply
 * @returns Aging buckets with totals
 */
export function calculateAgingBuckets(
  sales: Array<{ saleDate: Date; amountOutstanding: Decimal }>,
  paymentTermsDays: number = 0
): AgingBuckets {
  const buckets: AgingBuckets = {
    current: new Decimal(0),
    days30: new Decimal(0),
    days60: new Decimal(0),
    days90: new Decimal(0),
    over90: new Decimal(0)
  };

  for (const sale of sales) {
    const daysPastDue = calculateDaysPastDue(sale.saleDate, paymentTermsDays);
    const bucket = getAgingBucket(daysPastDue);
    buckets[bucket] = buckets[bucket].add(sale.amountOutstanding);
  }

  return buckets;
}

// ============================================================================
// CUSTOMER AGING ANALYSIS
// ============================================================================

/**
 * Calculate collection priority based on aging and amount
 * 
 * @param totalOutstanding - Total amount outstanding
 * @param oldestDays - Days of oldest invoice
 * @param overdueAmount - Amount past terms
 * @returns Priority level
 */
function calculateCollectionPriority(
  totalOutstanding: Decimal,
  oldestDays: number,
  overdueAmount: Decimal
): 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' {
  const amount = parseFloat(totalOutstanding.toString());
  const overdue = parseFloat(overdueAmount.toString());

  // URGENT: Over 90 days or large overdue amount
  if (oldestDays > 90 || overdue > 50000) {
    return 'URGENT';
  }

  // HIGH: Over 60 days or moderate overdue amount
  if (oldestDays > 60 || overdue > 20000) {
    return 'HIGH';
  }

  // MEDIUM: Over 30 days or some overdue amount
  if (oldestDays > 30 || overdue > 5000) {
    return 'MEDIUM';
  }

  // LOW: Current or minimal overdue
  return 'LOW';
}

/**
 * Calculate risk score (0-100, higher = riskier)
 * 
 * @param agingBuckets - Aging distribution
 * @param totalOutstanding - Total amount owed
 * @param creditLimit - Customer credit limit
 * @param lastPaymentDate - Date of last payment
 * @returns Risk score
 */
function calculateRiskScore(
  agingBuckets: AgingBuckets,
  totalOutstanding: Decimal,
  creditLimit: Decimal,
  lastPaymentDate: Date | null
): number {
  let score = 0;

  // Factor 1: Aging distribution (max 40 points)
  const total = parseFloat(totalOutstanding.toString());
  if (total > 0) {
    const over90Pct = parseFloat(agingBuckets.over90.toString()) / total;
    const days90Pct = parseFloat(agingBuckets.days90.toString()) / total;
    const days60Pct = parseFloat(agingBuckets.days60.toString()) / total;
    
    score += over90Pct * 40; // Most weight on oldest
    score += days90Pct * 20;
    score += days60Pct * 10;
  }

  // Factor 2: Credit utilization (max 30 points)
  const limit = parseFloat(creditLimit.toString());
  if (limit > 0) {
    const utilization = total / limit;
    score += Math.min(utilization, 1.5) * 20; // Over 150% = max points
  }

  // Factor 3: Payment recency (max 30 points)
  if (lastPaymentDate) {
    const daysSincePayment = Math.floor(
      (Date.now() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSincePayment > 90) score += 30;
    else if (daysSincePayment > 60) score += 20;
    else if (daysSincePayment > 30) score += 10;
  } else {
    score += 30; // Never paid = high risk
  }

  return Math.min(Math.round(score), 100);
}

/**
 * Calculate complete aging analysis for a customer
 * 
 * @param customerId - Customer ID
 * @returns CustomerAging with complete analysis
 */
export async function calculateCustomerAging(
  customerId: string
): Promise<CustomerAging> {
  try {
    // Fetch customer details
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        paymentTermsDays: true,
        creditLimit: true,
        lastPaymentDate: true
      }
    });

    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    // Fetch outstanding sales
    const sales = await prisma.sale.findMany({
      where: {
        customerId,
        paymentStatus: { in: ['UNPAID', 'PARTIAL'] }
      },
      select: {
        id: true,
        saleNumber: true,
        saleDate: true,
        totalAmount: true,
        amountOutstanding: true
      },
      orderBy: { saleDate: 'asc' }
    });

    if (sales.length === 0) {
      // No outstanding balance
      return {
        customerId: customer.id,
        customerName: customer.name,
        totalOutstanding: new Decimal(0),
        agingBuckets: {
          current: new Decimal(0),
          days30: new Decimal(0),
          days60: new Decimal(0),
          days90: new Decimal(0),
          over90: new Decimal(0)
        },
        oldestInvoiceDays: 0,
        overdueAmount: new Decimal(0),
        collectionPriority: 'LOW',
        riskScore: 0
      };
    }

    // Calculate aging buckets
    const agingBuckets = calculateAgingBuckets(sales, customer.paymentTermsDays);

    // Calculate totals
    const totalOutstanding = sales.reduce(
      (sum, sale) => sum.add(sale.amountOutstanding),
      new Decimal(0)
    );

    // Calculate oldest invoice days
    const oldestSale = sales[0];
    const oldestInvoiceDays = calculateDaysPastDue(
      oldestSale.saleDate,
      customer.paymentTermsDays
    );

    // Calculate overdue amount (past payment terms)
    let overdueAmount = new Decimal(0);
    for (const sale of sales) {
      const daysPastDue = calculateDaysPastDue(sale.saleDate, customer.paymentTermsDays);
      if (daysPastDue > 0) {
        overdueAmount = overdueAmount.add(sale.amountOutstanding);
      }
    }

    // Calculate priority and risk
    const collectionPriority = calculateCollectionPriority(
      totalOutstanding,
      oldestInvoiceDays,
      overdueAmount
    );

    const riskScore = calculateRiskScore(
      agingBuckets,
      totalOutstanding,
      customer.creditLimit,
      customer.lastPaymentDate
    );

    logger.info('Customer aging calculated', {
      customerId,
      customerName: customer.name,
      totalOutstanding: totalOutstanding.toString(),
      oldestInvoiceDays,
      collectionPriority,
      riskScore
    });

    return {
      customerId: customer.id,
      customerName: customer.name,
      totalOutstanding,
      agingBuckets,
      oldestInvoiceDays,
      overdueAmount,
      collectionPriority,
      riskScore
    };
  } catch (error: any) {
    logger.error('Customer aging calculation failed', {
      customerId,
      error: error.message
    });
    throw error;
  }
}

// ============================================================================
// SALE-LEVEL AGING
// ============================================================================

/**
 * Calculate aging details for a specific sale
 * 
 * @param saleId - Sale ID
 * @returns SaleAging with complete details
 */
export async function calculateSaleAging(saleId: string): Promise<SaleAging> {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        saleNumber: true,
        saleDate: true,
        totalAmount: true,
        amountOutstanding: true,
        customerId: true,
        customer: {
          select: {
            name: true,
            paymentTermsDays: true
          }
        }
      }
    });

    if (!sale) {
      throw new Error(`Sale ${saleId} not found`);
    }

    const paymentTerms = sale.customer?.paymentTermsDays || 0;
    const daysPastDue = calculateDaysPastDue(sale.saleDate, paymentTerms);
    const isOverdue = daysPastDue > 0;
    const daysUntilDue = isOverdue ? undefined : -daysPastDue;

    let agingCategory: SaleAging['agingCategory'];
    if (daysPastDue <= 30) agingCategory = 'current';
    else if (daysPastDue <= 60) agingCategory = '30-60';
    else if (daysPastDue <= 90) agingCategory = '60-90';
    else if (daysPastDue <= 120) agingCategory = '90-120';
    else agingCategory = 'over-120';

    return {
      saleId: sale.id,
      saleNumber: sale.saleNumber,
      customerId: sale.customerId,
      customerName: sale.customer?.name || null,
      saleDate: sale.saleDate,
      totalAmount: sale.totalAmount,
      amountOutstanding: sale.amountOutstanding,
      daysPastDue,
      agingCategory,
      isOverdue,
      daysUntilDue
    };
  } catch (error: any) {
    logger.error('Sale aging calculation failed', {
      saleId,
      error: error.message
    });
    throw error;
  }
}

// ============================================================================
// OVERDUE ALERTS & REPORTING
// ============================================================================

/**
 * Get all overdue customers with recommended actions
 * 
 * @param minimumAmount - Minimum overdue amount to include (default: 0)
 * @returns Array of overdue alerts
 */
export async function getOverdueAlerts(
  minimumAmount: number = 0
): Promise<OverdueAlert[]> {
  try {
    // Get customers with outstanding balances
    const customers = await prisma.customer.findMany({
      where: {
        currentBalance: { gt: minimumAmount }
      },
      select: {
        id: true,
        name: true,
        paymentTermsDays: true,
        lastPaymentDate: true,
        sales: {
          where: {
            paymentStatus: { in: ['UNPAID', 'PARTIAL'] }
          },
          select: {
            id: true,
            saleDate: true,
            amountOutstanding: true
          }
        }
      }
    });

    const alerts: OverdueAlert[] = [];

    for (const customer of customers) {
      // Calculate overdue sales
      let totalOverdue = new Decimal(0);
      let oldestDaysPastDue = 0;
      let overdueCount = 0;

      for (const sale of customer.sales) {
        const daysPastDue = calculateDaysPastDue(
          sale.saleDate,
          customer.paymentTermsDays
        );

        if (daysPastDue > 0) {
          totalOverdue = totalOverdue.add(sale.amountOutstanding);
          overdueCount++;
          oldestDaysPastDue = Math.max(oldestDaysPastDue, daysPastDue);
        }
      }

      // Skip if no overdue invoices
      if (overdueCount === 0) {
        continue;
      }

      // Determine urgency
      let urgency: OverdueAlert['urgency'];
      if (oldestDaysPastDue > 120 || parseFloat(totalOverdue.toString()) > 50000) {
        urgency = 'CRITICAL';
      } else if (oldestDaysPastDue > 90 || parseFloat(totalOverdue.toString()) > 20000) {
        urgency = 'HIGH';
      } else if (oldestDaysPastDue > 60 || parseFloat(totalOverdue.toString()) > 10000) {
        urgency = 'MEDIUM';
      } else {
        urgency = 'LOW';
      }

      // Generate recommended action
      let recommendedAction: string;
      if (urgency === 'CRITICAL') {
        recommendedAction = 'Immediate collection action required. Consider legal proceedings or collection agency.';
      } else if (urgency === 'HIGH') {
        recommendedAction = 'Urgent follow-up required. Send final notice and suspend credit.';
      } else if (urgency === 'MEDIUM') {
        recommendedAction = 'Follow-up call required. Send payment reminder.';
      } else {
        recommendedAction = 'Send friendly payment reminder email.';
      }

      alerts.push({
        customerId: customer.id,
        customerName: customer.name,
        totalOverdue,
        oldestDaysPastDue,
        overdueInvoiceCount: overdueCount,
        lastPaymentDate: customer.lastPaymentDate,
        recommendedAction,
        urgency
      });
    }

    // Sort by urgency and amount
    alerts.sort((a, b) => {
      const urgencyOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      if (urgencyDiff !== 0) return urgencyDiff;
      
      return parseFloat(b.totalOverdue.toString()) - parseFloat(a.totalOverdue.toString());
    });

    logger.info('Overdue alerts generated', {
      totalAlerts: alerts.length,
      critical: alerts.filter(a => a.urgency === 'CRITICAL').length,
      high: alerts.filter(a => a.urgency === 'HIGH').length
    });

    return alerts;
  } catch (error: any) {
    logger.error('Failed to generate overdue alerts', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Get aging summary for all customers
 * 
 * @returns Summary of aging across all customers
 */
export async function getAgingSummary(): Promise<{
  totalCustomersWithBalance: number;
  totalOutstanding: Decimal;
  overallAgingBuckets: AgingBuckets;
  averageDaysPastDue: number;
  totalOverdueCustomers: number;
}> {
  try {
    const customers = await prisma.customer.findMany({
      where: {
        currentBalance: { gt: 0 }
      },
      select: {
        id: true,
        paymentTermsDays: true,
        sales: {
          where: {
            paymentStatus: { in: ['UNPAID', 'PARTIAL'] }
          },
          select: {
            saleDate: true,
            amountOutstanding: true
          }
        }
      }
    });

    const overallBuckets: AgingBuckets = {
      current: new Decimal(0),
      days30: new Decimal(0),
      days60: new Decimal(0),
      days90: new Decimal(0),
      over90: new Decimal(0)
    };

    let totalOutstanding = new Decimal(0);
    let totalDays = 0;
    let totalSales = 0;
    let overdueCustomers = 0;

    for (const customer of customers) {
      const buckets = calculateAgingBuckets(customer.sales, customer.paymentTermsDays);
      
      overallBuckets.current = overallBuckets.current.add(buckets.current);
      overallBuckets.days30 = overallBuckets.days30.add(buckets.days30);
      overallBuckets.days60 = overallBuckets.days60.add(buckets.days60);
      overallBuckets.days90 = overallBuckets.days90.add(buckets.days90);
      overallBuckets.over90 = overallBuckets.over90.add(buckets.over90);

      let customerOverdue = false;
      for (const sale of customer.sales) {
        const daysPastDue = calculateDaysPastDue(sale.saleDate, customer.paymentTermsDays);
        totalDays += Math.max(0, daysPastDue);
        totalSales++;
        totalOutstanding = totalOutstanding.add(sale.amountOutstanding);
        
        if (daysPastDue > 0) customerOverdue = true;
      }

      if (customerOverdue) overdueCustomers++;
    }

    const averageDaysPastDue = totalSales > 0 ? Math.round(totalDays / totalSales) : 0;

    logger.info('Aging summary calculated', {
      totalCustomers: customers.length,
      totalOutstanding: totalOutstanding.toString(),
      overdueCustomers,
      averageDaysPastDue
    });

    return {
      totalCustomersWithBalance: customers.length,
      totalOutstanding,
      overallAgingBuckets: overallBuckets,
      averageDaysPastDue,
      totalOverdueCustomers: overdueCustomers
    };
  } catch (error: any) {
    logger.error('Failed to calculate aging summary', {
      error: error.message
    });
    throw error;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  calculateDaysPastDue,
  getAgingBucket,
  calculateAgingBuckets,
  calculateCustomerAging,
  calculateSaleAging,
  getOverdueAlerts,
  getAgingSummary
};
