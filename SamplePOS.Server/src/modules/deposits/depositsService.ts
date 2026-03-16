/**
 * Deposits Service - Business logic for customer deposits
 * Part of the SamplePOS hybrid architecture
 */

import { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';
import * as depositsRepository from './depositsRepository.js';
import { findCustomerById } from '../customers/customerRepository.js';
import * as glEntryService from '../../services/glEntryService.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import logger from '../../utils/logger.js';

// Type for either a Pool or PoolClient - allows reuse in transactions
type DbConnection = Pool | PoolClient;

export interface Deposit {
    id: string;
    depositNumber: string;
    customerId: string;
    customerName?: string;
    amount: number;
    amountUsed: number;
    amountAvailable: number;
    paymentMethod: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER';
    reference?: string;
    notes?: string;
    status: 'ACTIVE' | 'DEPLETED' | 'REFUNDED' | 'CANCELLED';
    createdBy?: string;
    createdAt: string;
    updatedAt: string;
}

export interface DepositApplication {
    id: string;
    depositId: string;
    saleId: string;
    amountApplied: number;
    appliedAt: string;
    appliedBy?: string;
    depositNumber?: string;
    saleNumber?: string;
}

export interface CreateDepositInput {
    customerId: string;
    amount: number;
    paymentMethod: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER';
    reference?: string;
    notes?: string;
    createdBy?: string;
}

export interface CustomerDepositBalance {
    customerId: string;
    customerName: string;
    availableBalance: number;
    totalDeposits: number;
    totalUsed: number;
    activeDepositCount: number;
}

// Normalize DB row to camelCase
function normalizeDeposit(row: depositsRepository.DepositDbRow): Deposit {
    return {
        id: row.id,
        depositNumber: row.deposit_number,
        customerId: row.customer_id,
        customerName: row.customer_name,
        amount: parseFloat(row.amount),
        amountUsed: parseFloat(row.amount_used),
        amountAvailable: parseFloat(row.amount_available),
        paymentMethod: row.payment_method as Deposit['paymentMethod'],
        reference: row.reference || undefined,
        notes: row.notes || undefined,
        status: row.status,
        createdBy: row.created_by || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function normalizeApplication(row: depositsRepository.DepositApplicationDbRow): DepositApplication {
    return {
        id: row.id,
        depositId: row.deposit_id,
        saleId: row.sale_id,
        amountApplied: parseFloat(row.amount_applied),
        appliedAt: row.applied_at,
        appliedBy: row.applied_by || undefined,
        depositNumber: row.deposit_number,
        saleNumber: row.sale_number
    };
}

/**
 * Create a new customer deposit
 */
export async function createDeposit(
    pool: Pool,
    input: CreateDepositInput
): Promise<Deposit> {
    // Validate customer exists
    const customer = await findCustomerById(input.customerId);
    if (!customer) {
        throw new Error(`Customer not found: ${input.customerId}`);
    }

    // Validate amount
    if (input.amount <= 0) {
        throw new Error('Deposit amount must be greater than zero');
    }

    // Validate payment method
    const validMethods = ['CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER'];
    if (!validMethods.includes(input.paymentMethod)) {
        throw new Error(`Invalid payment method: ${input.paymentMethod}`);
    }

    logger.info('Creating deposit', {
        customerId: input.customerId,
        customerName: customer.name,
        amount: input.amount,
        paymentMethod: input.paymentMethod
    });

    const depositRow = await depositsRepository.createDeposit(pool, input);

    logger.info('Deposit created', {
        depositNumber: depositRow.deposit_number,
        amount: depositRow.amount
    });

    const deposit = normalizeDeposit(depositRow);

    // ============================================================
    // GL POSTING: Record customer deposit to ledger
    // DR Cash/Bank  /  CR Customer Deposits (2200)
    // ============================================================
    try {
        await glEntryService.recordCustomerDepositToGL({
            depositId: deposit.id,
            depositNumber: deposit.depositNumber,
            depositDate: deposit.createdAt.split('T')[0],
            amount: deposit.amount,
            paymentMethod: deposit.paymentMethod,
            customerId: input.customerId,
            customerName: customer?.name || 'Unknown',
        });
    } catch (glError) {
        logger.error('GL posting failed for customer deposit (non-fatal)', {
            depositId: deposit.id,
            depositNumber: deposit.depositNumber,
            error: glError,
        });
    }

    return deposit;
}

/**
 * Get deposit by ID
 */
export async function getDepositById(
    pool: Pool,
    depositId: string
): Promise<Deposit | null> {
    const row = await depositsRepository.getDepositById(pool, depositId);
    return row ? normalizeDeposit(row) : null;
}

/**
 * Get all deposits for a customer
 */
export async function getCustomerDeposits(
    pool: Pool,
    customerId: string,
    status?: 'ACTIVE' | 'DEPLETED' | 'REFUNDED' | 'CANCELLED'
): Promise<Deposit[]> {
    const rows = await depositsRepository.getDepositsByCustomer(pool, customerId, status);
    return rows.map(normalizeDeposit);
}

/**
 * Get customer's available deposit balance
 */
export async function getCustomerDepositBalance(
    pool: Pool,
    customerId: string
): Promise<CustomerDepositBalance> {
    const summary = await depositsRepository.getCustomerDepositSummary(pool, customerId);

    if (!summary) {
        // Customer exists but no deposits
        const customer = await findCustomerById(customerId);
        return {
            customerId,
            customerName: customer?.name || 'Unknown',
            availableBalance: 0,
            totalDeposits: 0,
            totalUsed: 0,
            activeDepositCount: 0
        };
    }

    return {
        customerId: summary.customer_id,
        customerName: summary.customer_name,
        availableBalance: parseFloat(summary.available_deposit_balance),
        totalDeposits: parseFloat(summary.total_deposits),
        totalUsed: parseFloat(summary.total_deposits_used),
        activeDepositCount: summary.active_deposit_count
    };
}

/**
 * Apply deposits to a sale using FIFO (oldest deposits first)
 * This version works within an existing transaction client
 * Returns the applications created and total amount applied
 */
export async function applyDepositsToSaleInTransaction(
    client: PoolClient,
    customerId: string,
    saleId: string,
    amountToApply: number,
    appliedBy?: string
): Promise<{ applications: DepositApplication[]; totalApplied: number }> {
    if (amountToApply <= 0) {
        throw new Error('Amount to apply must be greater than zero');
    }

    // Get active deposits with FIFO ordering (using the client)
    const activeDeposits = await depositsRepository.getActiveDepositsForCustomer(client, customerId);

    if (activeDeposits.length === 0) {
        throw new Error('No active deposits available for this customer');
    }

    // Calculate total available
    const totalAvailable = activeDeposits.reduce(
        (sum, d) => sum.plus(d.amount_available),
        new Decimal(0)
    );

    if (totalAvailable.lessThan(amountToApply)) {
        throw new Error(`Insufficient deposit balance. Available: ${totalAvailable.toFixed(2)}, Requested: ${amountToApply}`);
    }

    const applications: DepositApplication[] = [];
    let remaining = new Decimal(amountToApply);

    for (const deposit of activeDeposits) {
        if (remaining.lessThanOrEqualTo(0)) break;

        const available = new Decimal(deposit.amount_available);
        const toApply = Decimal.min(remaining, available);

        // Use the transaction-safe version
        const applicationRow = await depositsRepository.applyDepositToSaleInTransaction(client, {
            depositId: deposit.id,
            saleId,
            amount: toApply.toNumber(),
            appliedBy
        });

        applications.push(normalizeApplication(applicationRow));
        remaining = remaining.minus(toApply);

        logger.info('Deposit applied to sale', {
            depositNumber: deposit.deposit_number,
            amountApplied: toApply.toFixed(2),
            saleId
        });
    }

    return {
        applications,
        totalApplied: new Decimal(amountToApply).minus(remaining).toNumber()
    };
}

/**
 * Apply deposits to a sale using FIFO (oldest deposits first)
 * Returns the applications created and total amount applied
 * Accepts either a Pool (creates own connection) or PoolClient (uses existing transaction)
 */
export async function applyDepositsToSale(
    dbConn: DbConnection,
    customerId: string,
    saleId: string,
    amountToApply: number,
    appliedBy?: string
): Promise<{ applications: DepositApplication[]; totalApplied: number }> {
    // Check if this is a Pool or PoolClient
    // Pool has 'totalCount' and 'idleCount' properties
    const isPool = 'totalCount' in dbConn;

    if (isPool) {
        // Use pool - the repository will create its own transaction
        return applyDepositsToSaleWithPool(dbConn as Pool, customerId, saleId, amountToApply, appliedBy);
    } else {
        // Use existing client - use the transaction-safe version
        return applyDepositsToSaleInTransaction(dbConn as PoolClient, customerId, saleId, amountToApply, appliedBy);
    }
}

/**
 * Apply deposits to a sale using a Pool (creates own transaction)
 */
async function applyDepositsToSaleWithPool(
    pool: Pool,
    customerId: string,
    saleId: string,
    amountToApply: number,
    appliedBy?: string
): Promise<{ applications: DepositApplication[]; totalApplied: number }> {
    if (amountToApply <= 0) {
        throw new Error('Amount to apply must be greater than zero');
    }

    // Get active deposits with FIFO ordering
    const activeDeposits = await depositsRepository.getActiveDepositsForCustomer(pool, customerId);

    if (activeDeposits.length === 0) {
        throw new Error('No active deposits available for this customer');
    }

    // Calculate total available
    const totalAvailable = activeDeposits.reduce(
        (sum, d) => sum.plus(d.amount_available),
        new Decimal(0)
    );

    if (totalAvailable.lessThan(amountToApply)) {
        throw new Error(`Insufficient deposit balance. Available: ${totalAvailable.toFixed(2)}, Requested: ${amountToApply}`);
    }

    const applications: DepositApplication[] = [];
    let remaining = new Decimal(amountToApply);

    for (const deposit of activeDeposits) {
        if (remaining.lessThanOrEqualTo(0)) break;

        const available = new Decimal(deposit.amount_available);
        const toApply = Decimal.min(remaining, available);

        const applicationRow = await depositsRepository.applyDepositToSale(pool, {
            depositId: deposit.id,
            saleId,
            amount: toApply.toNumber(),
            appliedBy
        });

        applications.push(normalizeApplication(applicationRow));
        remaining = remaining.minus(toApply);

        logger.info('Deposit applied to sale', {
            depositNumber: deposit.deposit_number,
            amountApplied: toApply.toFixed(2),
            saleId
        });
    }

    return {
        applications,
        totalApplied: new Decimal(amountToApply).minus(remaining).toNumber()
    };
}

/**
 * Reverse all deposit applications for a sale (used when voiding sale)
 * All reversals are atomic — if one fails, none are committed.
 */
export async function reverseDepositsForSale(
    pool: Pool,
    saleId: string
): Promise<number> {
    const applications = await depositsRepository.getDepositApplicationsBySale(pool, saleId);

    if (applications.length === 0) {
        return 0;
    }

    await UnitOfWork.run<void>(pool, async (client) => {
        for (const app of applications) {
            await depositsRepository.reverseDepositApplicationInTransaction(client, app.id);
            logger.info('Deposit application reversed', {
                depositNumber: app.deposit_number,
                amountReversed: app.amount_applied,
                saleId
            });
        }
    });

    return applications.length;
}

/**
 * Get deposit applications for a sale
 */
export async function getSaleDepositApplications(
    pool: Pool,
    saleId: string
): Promise<DepositApplication[]> {
    const rows = await depositsRepository.getDepositApplicationsBySale(pool, saleId);
    return rows.map(normalizeApplication);
}

/**
 * Get all deposits with pagination
 */
export async function getAllDeposits(
    pool: Pool,
    options: {
        page?: number;
        limit?: number;
        status?: string;
        customerId?: string;
    } = {}
): Promise<{ deposits: Deposit[]; total: number; page: number; limit: number; totalPages: number }> {
    const { deposits, total } = await depositsRepository.getAllDeposits(pool, options);
    const page = options.page || 1;
    const limit = options.limit || 20;

    return {
        deposits: deposits.map(normalizeDeposit),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
    };
}

/**
 * Refund a deposit
 */
export async function refundDeposit(
    pool: Pool,
    depositId: string,
    reason?: string
): Promise<Deposit> {
    const row = await depositsRepository.refundDeposit(pool, depositId, reason);

    logger.info('Deposit refunded', {
        depositNumber: row.deposit_number,
        amount: row.amount_available,
        reason
    });

    return normalizeDeposit(row);
}
