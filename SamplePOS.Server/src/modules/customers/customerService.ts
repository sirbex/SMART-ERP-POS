// Customers Service - Business Logic Layer

import Decimal from 'decimal.js';
import type pg from 'pg';
import * as customerRepository from './customerRepository.js';
import { CustomerStatementSchema } from '../../../../shared/zod/customerStatement.js';
import type { Customer, CreateCustomer, UpdateCustomer } from '../../../../shared/zod/customer.js';
import { SalesBusinessRules } from '../../middleware/businessRules.js';
import { ConflictError } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

/**
 * Get all customers with pagination
 * @param page - Page number (1-indexed, default: 1)
 * @param limit - Results per page (default: 50, max: 100)
 * @returns Paginated customer list with total count
 *
 * Features:
 * - Pagination support for large customer databases
 * - Includes active and inactive customers
 * - Returns totalPages for UI pagination controls
 *
 * Performance:
 * - Uses LIMIT/OFFSET for efficient pagination
 * - Parallel count query for total records
 */
export async function getAllCustomers(
  page: number = 1,
  limit: number = 50,
  dbPool?: pg.Pool
): Promise<{
  data: Customer[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const offset = (page - 1) * limit;
  const [customers, total] = await Promise.all([
    customerRepository.findAllCustomers(limit, offset, dbPool),
    customerRepository.countCustomers(dbPool),
  ]);

  return {
    data: customers,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getCustomerById(id: string, dbPool?: pg.Pool): Promise<Customer> {
  const customer = await customerRepository.findCustomerById(id, dbPool);

  if (!customer) {
    throw new Error(`Customer with ID ${id} not found`);
  }

  return customer;
}

export async function getCustomerByNumber(
  customerNumber: string,
  dbPool?: pg.Pool
): Promise<Customer> {
  const customer = await customerRepository.findCustomerByNumber(customerNumber, dbPool);

  if (!customer) {
    throw new Error(`Customer with number ${customerNumber} not found`);
  }

  return customer;
}

export async function searchCustomers(
  searchTerm: string,
  limit: number = 20,
  dbPool?: pg.Pool
): Promise<Customer[]> {
  if (!searchTerm || searchTerm.trim().length === 0) {
    return [];
  }

  return customerRepository.searchCustomers(searchTerm.trim(), limit, dbPool);
}

/**
 * Create new customer with validation
 * @param data - Customer creation data (name, email, phone, credit settings)
 * @returns Created customer with auto-generated customer_number
 * @throws Error if email already exists or credit limit invalid
 *
 * Business Rules:
 * - Email uniqueness (if provided)
 * - BR-SAL-003: Credit limit must be non-negative
 * - Auto-generates customer_number: CUST-YYYY-####
 *
 * Credit Management:
 * - creditLimit: Maximum outstanding balance allowed
 * - balance: Current outstanding amount (starts at 0)
 * - Credit sales blocked when balance >= creditLimit
 *
 * Field Validation:
 * - name: Required, 1-255 characters
 * - email: Optional, must be valid format
 * - phone: Optional, any format
 * - creditLimit: Optional, >= 0
 */
export async function createCustomer(data: CreateCustomer, dbPool?: pg.Pool): Promise<Customer> {
  // Business rule: Check if email already exists (if provided)
  if (data.email) {
    const existing = await customerRepository.findCustomerByEmail(data.email, dbPool);
    if (existing) {
      throw new Error(`Customer with email ${data.email} already exists`);
    }
  }

  // BR-SAL-003: Validate credit limit setup (if provided)
  if (data.creditLimit !== undefined && data.creditLimit !== null) {
    const creditLimitDecimal = new Decimal(data.creditLimit);

    if (creditLimitDecimal.lessThan(0)) {
      throw new Error('Credit limit cannot be negative');
    }

    logger.info('Credit limit validation passed', {
      creditLimit: creditLimitDecimal.toString(),
    });
  }

  // Use Decimal for bank-grade precision
  const customerData = {
    ...data,
    creditLimit: data.creditLimit ? new Decimal(data.creditLimit).toNumber() : data.creditLimit,
  };

  try {
    const customer = await customerRepository.createCustomer(customerData, dbPool);
    logger.info('Customer created successfully', { customerId: customer.id });
    return customer;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // PG unique constraint violation → friendly 409 with existing customer ID
    if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
      // Try to find the existing customer so we can return their ID
      const existing = data.email
        ? await customerRepository.findCustomerByEmail(data.email, dbPool)
        : ((await customerRepository.searchCustomers(data.name, 1, dbPool))[0] ?? null);
      const existingId = existing?.id ?? '';
      throw new ConflictError(`Customer already exists${existingId ? ` (id: ${existingId})` : ''}`);
    }
    throw err;
  }
}

export async function updateCustomer(
  id: string,
  data: UpdateCustomer,
  dbPool?: pg.Pool
): Promise<Customer> {
  const existing = await customerRepository.findCustomerById(id, dbPool);
  if (!existing) {
    throw new Error(`Customer with ID ${id} not found`);
  }

  // Business rule: Check email uniqueness if being updated
  if (data.email && data.email !== existing.email) {
    const emailExists = await customerRepository.findCustomerByEmail(data.email, dbPool);
    if (emailExists) {
      throw new Error(`Customer with email ${data.email} already exists`);
    }
  }

  // BR-SAL-003: Validate credit limit update (if provided)
  if (data.creditLimit !== undefined && data.creditLimit !== null) {
    const creditLimitDecimal = new Decimal(data.creditLimit);

    if (creditLimitDecimal.lessThan(0)) {
      throw new Error('Credit limit cannot be negative');
    }

    logger.info('Credit limit validation passed', {
      customerId: id,
      creditLimit: creditLimitDecimal.toString(),
    });
  }

  // Use Decimal for bank-grade precision
  const updateData = {
    ...data,
    creditLimit: data.creditLimit ? new Decimal(data.creditLimit).toNumber() : data.creditLimit,
  };

  const updated = await customerRepository.updateCustomer(id, updateData, dbPool);

  if (!updated) {
    throw new Error(`Failed to update customer with ID ${id}`);
  }

  logger.info('Customer updated successfully', { customerId: id });
  return updated;
}

export async function deleteCustomer(id: string, dbPool?: pg.Pool): Promise<void> {
  const customer = await customerRepository.findCustomerById(id, dbPool);
  if (!customer) {
    throw new Error(`Customer with ID ${id} not found`);
  }

  // Business rule: Check if customer has outstanding balance
  if (customer.balance < 0) {
    throw new Error(`Cannot delete customer with outstanding balance of ${customer.balance}`);
  }

  const success = await customerRepository.deleteCustomer(id, dbPool);
  if (!success) {
    throw new Error(`Failed to delete customer with ID ${id}`);
  }
}

export async function toggleCustomerActive(
  id: string,
  isActive: boolean,
  dbPool?: pg.Pool
): Promise<Customer> {
  const customer = await customerRepository.findCustomerById(id, dbPool);
  if (!customer) {
    throw new Error(`Customer with ID ${id} not found`);
  }

  // Business rule: Check if customer has outstanding balance when deactivating
  if (!isActive && customer.balance < 0) {
    throw new Error(`Cannot deactivate customer with outstanding balance of ${customer.balance}`);
  }

  const updated = await customerRepository.toggleCustomerActive(id, isActive, dbPool);
  if (!updated) {
    throw new Error(`Failed to update customer status`);
  }

  logger.info(`Customer ${isActive ? 'activated' : 'deactivated'}`, { customerId: id });
  return updated;
}

export async function adjustCustomerBalance(
  id: string,
  amount: number,
  reason: string,
  dbPool?: pg.Pool
): Promise<Customer> {
  const customer = await customerRepository.findCustomerById(id, dbPool);
  if (!customer) {
    throw new Error(`Customer with ID ${id} not found`);
  }

  // Use Decimal for bank-grade precision
  const amountDecimal = new Decimal(amount);
  const currentBalanceDecimal = new Decimal(customer.balance);
  const creditLimitDecimal = new Decimal(customer.creditLimit);

  // BR-SAL-003: Check credit limit
  const newBalance = currentBalanceDecimal.plus(amountDecimal);

  if (newBalance.lessThan(0) && newBalance.abs().greaterThan(creditLimitDecimal)) {
    throw new Error(
      `Transaction would exceed credit limit. Current: ${currentBalanceDecimal.toString()}, ` +
        `Adjustment: ${amountDecimal.toString()}, Limit: ${creditLimitDecimal.toString()}`
    );
  }

  logger.info('BR-SAL-003: Credit limit check passed', {
    customerId: id,
    currentBalance: currentBalanceDecimal.toString(),
    adjustment: amountDecimal.toString(),
    newBalance: newBalance.toString(),
    creditLimit: creditLimitDecimal.toString(),
  });

  const updated = await customerRepository.updateCustomerBalance(
    id,
    amountDecimal.toNumber(),
    dbPool
  );

  if (!updated) {
    throw new Error(`Failed to update customer balance`);
  }

  logger.info('Customer balance adjusted successfully', {
    customerId: id,
    amount: amountDecimal.toString(),
    reason,
  });

  return updated;
}

/**
 * Get customer sales/invoices history with pagination
 */
export async function getCustomerSales(
  customerId: string,
  page: number = 1,
  limit: number = 50,
  dbPool?: pg.Pool
) {
  const customer = await customerRepository.findCustomerById(customerId, dbPool);
  if (!customer) {
    throw new Error(`Customer with ID ${customerId} not found`);
  }

  const offset = (page - 1) * limit;
  const [sales, total] = await Promise.all([
    customerRepository.findCustomerSales(customerId, limit, offset, dbPool),
    customerRepository.countCustomerSales(customerId, dbPool),
  ]);

  return {
    data: sales,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get customer transaction history
 */
export async function getCustomerTransactions(
  customerId: string,
  page: number = 1,
  limit: number = 50,
  dbPool?: pg.Pool
) {
  const customer = await customerRepository.findCustomerById(customerId, dbPool);
  if (!customer) {
    throw new Error(`Customer with ID ${customerId} not found`);
  }

  const offset = (page - 1) * limit;
  const transactions = await customerRepository.findCustomerTransactions(
    customerId,
    limit,
    offset,
    dbPool
  );
  const totalCount = await customerRepository.countCustomerTransactions(customerId, dbPool);

  return {
    data: transactions,
    pagination: {
      page,
      limit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
  };
}

/**
 * Get customer summary statistics
 */
export async function getCustomerSummary(customerId: string, dbPool?: pg.Pool) {
  const customer = await customerRepository.findCustomerById(customerId, dbPool);
  if (!customer) {
    throw new Error(`Customer with ID ${customerId} not found`);
  }

  return customerRepository.getCustomerSummary(customerId, dbPool);
}

/**
 * Generate a precision customer statement using Decimal arithmetic.
 * Includes opening balance, ordered entries (invoices/payments), and closing balance.
 */
export async function getCustomerStatement(
  customerId: string,
  start?: Date,
  end?: Date,
  page: number = 1,
  limit: number = 100,
  dbPool?: pg.Pool
) {
  const customer = await customerRepository.findCustomerById(customerId, dbPool);
  if (!customer) {
    throw new Error(`Customer with ID ${customerId} not found`);
  }

  // Default range: last 30 days if not provided
  const periodEnd = end ? new Date(end) : new Date();
  const periodStart = start
    ? new Date(start)
    : new Date(periodEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Opening balance prior to period start (invoice ledger only)
  const openingRaw = await customerRepository.getOpeningBalance(customerId, periodStart, dbPool);
  let running = new Decimal(openingRaw);

  // Get invoice/liability entries (credit sales, payments, adjustments)
  const rawEntries = await customerRepository.getStatementEntries(
    customerId,
    periodStart,
    periodEnd,
    dbPool
  );

  // Get deposit activity
  const depositEntries = await customerRepository.getDepositEntries(
    customerId,
    periodStart,
    periodEnd,
    dbPool
  );

  // Convert deposit entries to statement format
  // DEPOSIT_IN → credit (customer gave us money / prepayment)
  // DEPOSIT_OUT → debit (deposit applied to a sale)
  const depositAsMapped = depositEntries.map((r: Record<string, unknown>) => {
    const amount = new Decimal(r.amount || 0);
    const isDepositIn = r.type === 'DEPOSIT_IN';
    return {
      date: new Date(String(r.date)).toISOString(),
      type: isDepositIn ? 'DEPOSIT' : 'DEPOSIT_APPLIED',
      reference: r.reference || null,
      description: r.description || null,
      debit: isDepositIn ? 0 : amount.abs().toNumber(),
      credit: isDepositIn ? amount.abs().toNumber() : 0,
    };
  });

  // Map AR entries
  const arMapped = rawEntries.map((r: Record<string, unknown>) => {
    const validTypes = ['INVOICE', 'PAYMENT', 'ADJUSTMENT'];
    const normalizedType = validTypes.includes(String(r.type)) ? r.type : 'ADJUSTMENT';
    return {
      date: new Date(String(r.date)).toISOString(),
      type: normalizedType,
      reference: r.reference || null,
      description: r.description || null,
      debit: new Decimal(r.debit || 0).toNumber(),
      credit: new Decimal(r.credit || 0).toNumber(),
    };
  });

  // Merge all entries and sort by date
  const allEntries = [...arMapped, ...depositAsMapped].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Calculate running balance across all entries
  const entriesWithBalance = allEntries.map((entry) => {
    const debit = new Decimal(entry.debit);
    const credit = new Decimal(entry.credit);
    running = running.plus(debit).minus(credit);
    return {
      ...entry,
      balanceAfter: running.toNumber(),
    };
  });

  const totalEntries = entriesWithBalance.length;
  const startIndex = Math.max(0, (page - 1) * limit);
  const endIndex = Math.min(totalEntries, startIndex + limit);
  const entries = entriesWithBalance.slice(startIndex, endIndex);
  const closingBalance = running.toNumber();

  // Get deposit summary
  const depositSummary = await customerRepository.getCustomerDepositSummary(customerId, dbPool);

  // Map deposit entries for the separate deposit section
  let depositRunning = new Decimal(0);
  const mappedDeposits = depositEntries.map((r: Record<string, unknown>) => {
    const amount = new Decimal(r.amount || 0);
    depositRunning = depositRunning.plus(amount);
    return {
      date: new Date(String(r.date)).toISOString(),
      type: r.type,
      reference: r.reference || null,
      description: r.description || null,
      amount: amount.toNumber(),
      runningBalance: depositRunning.toNumber(),
    };
  });

  // Assemble statement object & validate via Zod (defense-in-depth)
  const statement = CustomerStatementSchema.parse({
    customerId,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    openingBalance: new Decimal(openingRaw).toNumber(),
    closingBalance,
    entries,
    page,
    limit,
    totalEntries,
  });

  // Return enhanced statement with deposit info
  return {
    ...statement,
    // Deposit section (separate from invoice ledger)
    deposits: {
      summary: depositSummary,
      entries: mappedDeposits,
    },
  };
}
