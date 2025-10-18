/**
 * Credit Manager Service
 * 
 * Handles customer credit limit management, validation, and enforcement.
 * Manages credit approval workflows and utilization tracking.
 * 
 * Key Features:
 * - Credit limit validation before sales
 * - Available credit calculation
 * - Credit utilization tracking
 * - Credit approval workflow
 * - Automatic credit suspension
 * - Credit score management
 */

import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { Decimal } from '@prisma/client/runtime/library';

// ============================================================================
// TYPES
// ============================================================================

export interface CreditCheckResult {
  approved: boolean;
  availableCredit: Decimal;
  requestedAmount: Decimal;
  creditLimit: Decimal;
  currentBalance: Decimal;
  utilizationPercent: number;
  reason: string;
  requiresApproval?: boolean; // Needs manager approval
}

export interface CreditInfo {
  customerId: string;
  customerName: string;
  creditLimit: Decimal;
  currentBalance: Decimal;
  availableCredit: Decimal;
  utilizationPercent: number;
  creditScore: number;
  accountStatus: string;
  paymentTermsDays: number;
  depositBalance: Decimal;
  autoApplyDeposit: boolean;
}

export interface CreditAdjustment {
  customerId: string;
  oldLimit: Decimal;
  newLimit: Decimal;
  reason: string;
  approvedBy: string;
  adjustmentDate: Date;
}

// ============================================================================
// CREDIT VALIDATION
// ============================================================================

/**
 * Check if customer can afford a purchase based on credit limit
 * 
 * @param customerId - Customer ID
 * @param amount - Purchase amount to validate
 * @param allowOverdraft - Allow exceeding credit limit (requires approval)
 * @returns CreditCheckResult with approval decision
 */
export async function checkCreditLimit(
  customerId: string,
  amount: Decimal,
  allowOverdraft: boolean = false
): Promise<CreditCheckResult> {
  try {
    // Validate amount
    if (amount.lessThanOrEqualTo(0)) {
      return {
        approved: false,
        availableCredit: new Decimal(0),
        requestedAmount: amount,
        creditLimit: new Decimal(0),
        currentBalance: new Decimal(0),
        utilizationPercent: 0,
        reason: 'Invalid amount: must be greater than zero'
      };
    }

    // Fetch customer credit details
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        creditLimit: true,
        currentBalance: true,
        depositBalance: true,
        autoApplyDeposit: true,
        accountStatus: true,
        creditScore: true
      }
    });

    if (!customer) {
      return {
        approved: false,
        availableCredit: new Decimal(0),
        requestedAmount: amount,
        creditLimit: new Decimal(0),
        currentBalance: new Decimal(0),
        utilizationPercent: 0,
        reason: 'Customer not found'
      };
    }

    // Check account status
    if (customer.accountStatus === 'SUSPENDED') {
      return {
        approved: false,
        availableCredit: new Decimal(0),
        requestedAmount: amount,
        creditLimit: customer.creditLimit,
        currentBalance: customer.currentBalance,
        utilizationPercent: 0,
        reason: 'Customer account is suspended. Contact management to reactivate.'
      };
    }

    if (customer.accountStatus === 'CLOSED') {
      return {
        approved: false,
        availableCredit: new Decimal(0),
        requestedAmount: amount,
        creditLimit: customer.creditLimit,
        currentBalance: customer.currentBalance,
        utilizationPercent: 0,
        reason: 'Customer account is closed'
      };
    }

    // Calculate available credit
    const availableCredit = customer.creditLimit.sub(customer.currentBalance);
    
    // Calculate utilization
    const utilizationPercent = customer.creditLimit.greaterThan(0)
      ? parseFloat(
          customer.currentBalance.div(customer.creditLimit).mul(100).toString()
        )
      : 0;

    // Check if customer has sufficient deposit (if auto-apply enabled)
    let effectiveAmount = amount;
    let depositWillCover = false;
    
    if (customer.autoApplyDeposit && customer.depositBalance.greaterThanOrEqualTo(amount)) {
      depositWillCover = true;
      effectiveAmount = new Decimal(0); // Deposit will cover entire amount
    }

    // APPROVAL LOGIC
    
    // Case 1: Deposit covers the entire amount
    if (depositWillCover) {
      logger.info('Credit check approved (deposit coverage)', {
        customerId,
        customerName: customer.name,
        amount: amount.toString(),
        depositBalance: customer.depositBalance.toString()
      });

      return {
        approved: true,
        availableCredit,
        requestedAmount: amount,
        creditLimit: customer.creditLimit,
        currentBalance: customer.currentBalance,
        utilizationPercent,
        reason: 'Approved: Purchase will be covered by deposit balance'
      };
    }

    // Case 2: Within available credit
    if (availableCredit.greaterThanOrEqualTo(amount)) {
      logger.info('Credit check approved (within limit)', {
        customerId,
        customerName: customer.name,
        amount: amount.toString(),
        availableCredit: availableCredit.toString()
      });

      return {
        approved: true,
        availableCredit,
        requestedAmount: amount,
        creditLimit: customer.creditLimit,
        currentBalance: customer.currentBalance,
        utilizationPercent,
        reason: 'Approved: Within credit limit'
      };
    }

    // Case 3: Exceeds credit limit but overdraft allowed
    if (allowOverdraft) {
      const overage = amount.sub(availableCredit);
      
      logger.warn('Credit check requires approval (overdraft)', {
        customerId,
        customerName: customer.name,
        amount: amount.toString(),
        availableCredit: availableCredit.toString(),
        overage: overage.toString()
      });

      return {
        approved: false,
        availableCredit,
        requestedAmount: amount,
        creditLimit: customer.creditLimit,
        currentBalance: customer.currentBalance,
        utilizationPercent,
        reason: `Exceeds credit limit by ${overage.toString()}. Requires manager approval.`,
        requiresApproval: true
      };
    }

    // Case 4: Exceeds credit limit - DENIED
    const shortage = amount.sub(availableCredit);
    
    logger.warn('Credit check denied (limit exceeded)', {
      customerId,
      customerName: customer.name,
      amount: amount.toString(),
      availableCredit: availableCredit.toString(),
      shortage: shortage.toString()
    });

    return {
      approved: false,
      availableCredit,
      requestedAmount: amount,
      creditLimit: customer.creditLimit,
      currentBalance: customer.currentBalance,
      utilizationPercent,
      reason: `Credit limit exceeded. Available: ${availableCredit.toString()}, Requested: ${amount.toString()}`
    };
  } catch (error: any) {
    logger.error('Credit check failed', {
      customerId,
      amount: amount.toString(),
      error: error.message
    });
    throw error;
  }
}

// ============================================================================
// CREDIT INFORMATION
// ============================================================================

/**
 * Get complete credit information for a customer
 * 
 * @param customerId - Customer ID
 * @returns CreditInfo with all credit details
 */
export async function getCreditInfo(customerId: string): Promise<CreditInfo> {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        creditLimit: true,
        currentBalance: true,
        depositBalance: true,
        creditUsed: true,
        paymentTermsDays: true,
        accountStatus: true,
        creditScore: true,
        autoApplyDeposit: true
      }
    });

    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    const availableCredit = customer.creditLimit.sub(customer.currentBalance);
    
    const utilizationPercent = customer.creditLimit.greaterThan(0)
      ? parseFloat(
          customer.currentBalance.div(customer.creditLimit).mul(100).toString()
        )
      : 0;

    return {
      customerId: customer.id,
      customerName: customer.name,
      creditLimit: customer.creditLimit,
      currentBalance: customer.currentBalance,
      availableCredit,
      utilizationPercent,
      creditScore: customer.creditScore,
      accountStatus: customer.accountStatus,
      paymentTermsDays: customer.paymentTermsDays,
      depositBalance: customer.depositBalance,
      autoApplyDeposit: customer.autoApplyDeposit
    };
  } catch (error: any) {
    logger.error('Failed to get credit info', {
      customerId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Calculate available credit for a customer
 * 
 * @param customerId - Customer ID
 * @returns Available credit amount
 */
export async function calculateAvailableCredit(customerId: string): Promise<Decimal> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      creditLimit: true,
      currentBalance: true
    }
  });

  if (!customer) {
    throw new Error(`Customer ${customerId} not found`);
  }

  return customer.creditLimit.sub(customer.currentBalance);
}

/**
 * Calculate credit utilization percentage
 * 
 * @param customerId - Customer ID
 * @returns Utilization percentage (0-100+)
 */
export async function calculateCreditUtilization(customerId: string): Promise<number> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      creditLimit: true,
      currentBalance: true
    }
  });

  if (!customer) {
    throw new Error(`Customer ${customerId} not found`);
  }

  if (customer.creditLimit.lessThanOrEqualTo(0)) {
    return 0;
  }

  return parseFloat(
    customer.currentBalance.div(customer.creditLimit).mul(100).toString()
  );
}

// ============================================================================
// CREDIT ADJUSTMENTS
// ============================================================================

/**
 * Adjust customer credit limit
 * 
 * @param customerId - Customer ID
 * @param newLimit - New credit limit
 * @param reason - Reason for adjustment
 * @param approvedBy - User ID who approved the change
 * @returns CreditAdjustment record
 */
export async function adjustCreditLimit(
  customerId: string,
  newLimit: Decimal,
  reason: string,
  approvedBy: string
): Promise<CreditAdjustment> {
  try {
    // Validate new limit
    if (newLimit.lessThan(0)) {
      throw new Error('Credit limit cannot be negative');
    }

    // Get current limit
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { creditLimit: true, currentBalance: true }
    });

    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    // Warn if new limit is below current balance
    if (newLimit.lessThan(customer.currentBalance)) {
      logger.warn('Credit limit set below current balance', {
        customerId,
        newLimit: newLimit.toString(),
        currentBalance: customer.currentBalance.toString()
      });
    }

    const oldLimit = customer.creditLimit;

    // Update credit limit
    await prisma.customer.update({
      where: { id: customerId },
      data: { creditLimit: newLimit }
    });

    // Get current balance for transaction record
    const updatedCustomer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { currentBalance: true }
    });

    // Log adjustment in customer transactions
    await prisma.customerTransaction.create({
      data: {
        customerId,
        type: 'CREDIT_ADJUSTMENT',
        amount: newLimit.sub(oldLimit),
        balance: updatedCustomer?.currentBalance || new Decimal(0),
        description: `Credit limit adjusted from ${oldLimit.toString()} to ${newLimit.toString()}. Reason: ${reason}`,
        referenceId: approvedBy,
        documentNumber: `CREDIT-ADJ-${Date.now()}`
      }
    });

    logger.info('Credit limit adjusted', {
      customerId,
      oldLimit: oldLimit.toString(),
      newLimit: newLimit.toString(),
      reason,
      approvedBy
    });

    return {
      customerId,
      oldLimit,
      newLimit,
      reason,
      approvedBy,
      adjustmentDate: new Date()
    };
  } catch (error: any) {
    logger.error('Failed to adjust credit limit', {
      customerId,
      newLimit: newLimit.toString(),
      error: error.message
    });
    throw error;
  }
}

/**
 * Request credit limit increase (for approval workflow)
 * 
 * @param customerId - Customer ID
 * @param requestedLimit - Requested new limit
 * @param reason - Reason for increase
 * @param requestedBy - User ID requesting the increase
 * @returns Approval request details
 */
export async function requestCreditIncrease(
  customerId: string,
  requestedLimit: Decimal,
  reason: string,
  requestedBy: string
): Promise<{
  requestId: string;
  currentLimit: Decimal;
  requestedLimit: Decimal;
  status: 'PENDING';
}> {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { creditLimit: true, name: true }
    });

    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    if (requestedLimit.lessThanOrEqualTo(customer.creditLimit)) {
      throw new Error('Requested limit must be higher than current limit');
    }

    // Get current balance
    const currentBalance = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { currentBalance: true }
    });

    // Create transaction record for approval tracking
    const request = await prisma.customerTransaction.create({
      data: {
        customerId,
        type: 'CREDIT_REQUEST',
        amount: requestedLimit.sub(customer.creditLimit),
        balance: currentBalance?.currentBalance || new Decimal(0),
        description: `Credit increase request from ${customer.creditLimit.toString()} to ${requestedLimit.toString()}. Reason: ${reason}`,
        referenceId: requestedBy,
        documentNumber: `CREDIT-REQ-${Date.now()}`
      }
    });

    logger.info('Credit increase requested', {
      customerId,
      customerName: customer.name,
      currentLimit: customer.creditLimit.toString(),
      requestedLimit: requestedLimit.toString(),
      requestedBy,
      requestId: request.id
    });

    return {
      requestId: request.id,
      currentLimit: customer.creditLimit,
      requestedLimit,
      status: 'PENDING'
    };
  } catch (error: any) {
    logger.error('Failed to request credit increase', {
      customerId,
      requestedLimit: requestedLimit.toString(),
      error: error.message
    });
    throw error;
  }
}

// ============================================================================
// ACCOUNT MANAGEMENT
// ============================================================================

/**
 * Suspend customer credit (block new credit sales)
 * 
 * @param customerId - Customer ID
 * @param reason - Reason for suspension
 * @param suspendedBy - User ID who suspended the account
 */
export async function suspendCustomerCredit(
  customerId: string,
  reason: string,
  suspendedBy: string
): Promise<void> {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { name: true, accountStatus: true }
    });

    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    if (customer.accountStatus === 'SUSPENDED') {
      logger.warn('Customer already suspended', { customerId });
      return;
    }

    await prisma.customer.update({
      where: { id: customerId },
      data: { accountStatus: 'SUSPENDED' }
    });

    const currentBalance = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { currentBalance: true }
    });

    await prisma.customerTransaction.create({
      data: {
        customerId,
        type: 'ACCOUNT_SUSPENDED',
        amount: new Decimal(0),
        balance: currentBalance?.currentBalance || new Decimal(0),
        description: `Account suspended. Reason: ${reason}`,
        referenceId: suspendedBy,
        documentNumber: `SUSPEND-${Date.now()}`
      }
    });

    logger.warn('Customer credit suspended', {
      customerId,
      customerName: customer.name,
      reason,
      suspendedBy
    });
  } catch (error: any) {
    logger.error('Failed to suspend customer credit', {
      customerId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Reactivate suspended customer credit
 * 
 * @param customerId - Customer ID
 * @param reason - Reason for reactivation
 * @param reactivatedBy - User ID who reactivated the account
 */
export async function reactivateCustomerCredit(
  customerId: string,
  reason: string,
  reactivatedBy: string
): Promise<void> {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { name: true, accountStatus: true }
    });

    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    if (customer.accountStatus === 'ACTIVE') {
      logger.warn('Customer already active', { customerId });
      return;
    }

    await prisma.customer.update({
      where: { id: customerId },
      data: { accountStatus: 'ACTIVE' }
    });

    const currentBalance = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { currentBalance: true }
    });

    await prisma.customerTransaction.create({
      data: {
        customerId,
        type: 'ACCOUNT_REACTIVATED',
        amount: new Decimal(0),
        balance: currentBalance?.currentBalance || new Decimal(0),
        description: `Account reactivated. Reason: ${reason}`,
        referenceId: reactivatedBy,
        documentNumber: `REACTIVATE-${Date.now()}`
      }
    });

    logger.info('Customer credit reactivated', {
      customerId,
      customerName: customer.name,
      reason,
      reactivatedBy
    });
  } catch (error: any) {
    logger.error('Failed to reactivate customer credit', {
      customerId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Update customer credit score
 * 
 * @param customerId - Customer ID
 * @param newScore - New credit score (0-100)
 * @param reason - Reason for score change
 */
export async function updateCreditScore(
  customerId: string,
  newScore: number,
  reason: string
): Promise<void> {
  try {
    if (newScore < 0 || newScore > 100) {
      throw new Error('Credit score must be between 0 and 100');
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { creditScore: true, name: true }
    });

    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    const oldScore = customer.creditScore;

    await prisma.customer.update({
      where: { id: customerId },
      data: { creditScore: newScore }
    });

    logger.info('Credit score updated', {
      customerId,
      customerName: customer.name,
      oldScore,
      newScore,
      reason
    });
  } catch (error: any) {
    logger.error('Failed to update credit score', {
      customerId,
      newScore,
      error: error.message
    });
    throw error;
  }
}

// ============================================================================
// AUTOMATIC CREDIT MANAGEMENT
// ============================================================================

/**
 * Recalculate and update customer's available credit
 * Called after payments or new sales
 * 
 * @param customerId - Customer ID
 */
export async function recalculateAvailableCredit(customerId: string): Promise<void> {
  try {
    // Get total outstanding from sales
    const sales = await prisma.sale.findMany({
      where: {
        customerId,
        paymentStatus: { in: ['UNPAID', 'PARTIAL'] }
      },
      select: {
        amountOutstanding: true
      }
    });

    const totalOutstanding = sales.reduce(
      (sum, sale) => sum.add(sale.amountOutstanding),
      new Decimal(0)
    );

    // Update customer balance
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        currentBalance: totalOutstanding,
        creditUsed: totalOutstanding
      }
    });

    logger.debug('Available credit recalculated', {
      customerId,
      totalOutstanding: totalOutstanding.toString()
    });
  } catch (error: any) {
    logger.error('Failed to recalculate available credit', {
      customerId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Check and auto-suspend customers who exceed credit limits
 * Should be run periodically (e.g., daily cron job)
 * 
 * @returns Array of suspended customer IDs
 */
export async function autoSuspendOverlimitCustomers(): Promise<string[]> {
  try {
    const customers = await prisma.customer.findMany({
      where: {
        accountStatus: 'ACTIVE',
        currentBalance: { gt: 0 }
      },
      select: {
        id: true,
        name: true,
        creditLimit: true,
        currentBalance: true
      }
    });

    const suspended: string[] = [];

    for (const customer of customers) {
      // Suspend if balance exceeds limit by 10% or more
      const overage = customer.currentBalance.sub(customer.creditLimit);
      const overagePercent = customer.creditLimit.greaterThan(0)
        ? overage.div(customer.creditLimit).mul(100)
        : new Decimal(0);

      if (overagePercent.greaterThan(10)) {
        await suspendCustomerCredit(
          customer.id,
          `Automatic suspension: Credit limit exceeded by ${overagePercent.toFixed(2)}%`,
          'SYSTEM'
        );
        suspended.push(customer.id);
      }
    }

    logger.info('Auto-suspend check completed', {
      customersChecked: customers.length,
      customersSuspended: suspended.length
    });

    return suspended;
  } catch (error: any) {
    logger.error('Auto-suspend check failed', {
      error: error.message
    });
    throw error;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  checkCreditLimit,
  getCreditInfo,
  calculateAvailableCredit,
  calculateCreditUtilization,
  adjustCreditLimit,
  requestCreditIncrease,
  suspendCustomerCredit,
  reactivateCustomerCredit,
  updateCreditScore,
  recalculateAvailableCredit,
  autoSuspendOverlimitCustomers
};
