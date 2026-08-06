// Customers Service - Business Logic Layer

import Decimal from 'decimal.js';
import type { Pool } from 'pg';
import type pg from 'pg';
import * as customerRepository from './customerRepository.js';
import type { CustomerListQuery } from './customerRepository.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { AccountingCore, AccountingError } from '../../services/accountingCore.js';
import * as glEntryService from '../../services/glEntryService.js';
import { syncCustomerBalanceFromInvoices } from '../../utils/customerBalanceSync.js';
import { checkAccountingPeriodOpen } from '../../utils/periodGuard.js';
import * as arPaymentRepository from '../ar-payments/arPaymentRepository.js';
import { invoiceRepository } from '../invoices/invoiceRepository.js';
import * as openItemEngine from '../ar-payments/openItemAllocationEngine.js';
import { logOpeningBalanceAudit } from '../../utils/openingBalanceAudit.js';
import { assertPositiveFinite } from '../../utils/safeParse.js';
import * as auditRepository from '../audit/auditRepository.js';
import { CustomerStatementSchema } from '../../../../shared/zod/customerStatement.js';
import type { Customer, CreateCustomer, UpdateCustomer } from '../../../../shared/zod/customer.js';
import {
  mergeCustomerTaxForAssert,
  vatRegistrationTinError,
} from '../../../../shared/utils/customerTaxProfileIntegrity.js';
import { SalesBusinessRules } from '../../middleware/businessRules.js';
import { ConflictError, BusinessError, ValidationError } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';
import { BUSINESS_TIMEZONE, getBusinessDate, formatDateBusiness } from '../../utils/dateRange.js';

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
  dbPool?: pg.Pool,
  listQuery: CustomerListQuery = {},
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
  const query: CustomerListQuery = {
    ...listQuery,
    search: listQuery.search?.trim() || undefined,
  };
  const [customers, total] = await Promise.all([
    customerRepository.findAllCustomers(limit, offset, dbPool, query),
    customerRepository.countCustomers(dbPool, query),
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

  const { assertPartnerDefaultWhtType } = await import('../withholding-tax/whtService.js');
  await assertPartnerDefaultWhtType('CUSTOMER', data, dbPool);

  const tinErr = vatRegistrationTinError({
    vatRegistered: data.vatRegistered,
    taxExempt: data.taxExempt,
    taxProfile: data.taxProfile,
    tin: data.tin,
  });
  if (tinErr) {
    throw new ValidationError(tinErr);
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

  const { assertPartnerDefaultWhtType } = await import('../withholding-tax/whtService.js');
  await assertPartnerDefaultWhtType('CUSTOMER', data, dbPool);

  // Only when tax fields are in the payload — legacy incomplete rows can still
  // update name/contact until an operator edits tax status or TIN.
  const taxPatch =
    data.vatRegistered !== undefined ||
    data.taxExempt !== undefined ||
    data.taxProfile !== undefined ||
    data.tin !== undefined;
  if (taxPatch) {
    const tinErr = vatRegistrationTinError(
      mergeCustomerTaxForAssert(existing, {
        vatRegistered: data.vatRegistered,
        taxExempt: data.taxExempt,
        taxProfile: data.taxProfile,
        tin: data.tin,
      }),
    );
    if (tinErr) {
      throw new ValidationError(tinErr);
    }
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
  const unlimited = (customer as { unlimitedCredit?: boolean }).unlimitedCredit === true;

  // BR-SAL-003: Check credit limit (enterprise unlimited skips hard ceiling)
  const newBalance = currentBalanceDecimal.plus(amountDecimal);

  if (
    !unlimited &&
    newBalance.lessThan(0) &&
    newBalance.abs().greaterThan(creditLimitDecimal)
  ) {
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
    unlimitedCredit: unlimited,
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
  start?: Date | string,
  end?: Date | string,
  page: number = 1,
  limit: number = 100,
  dbPool?: pg.Pool
) {
  const customer = await customerRepository.findCustomerById(customerId, dbPool);
  if (!customer) {
    throw new Error(`Customer with ID ${customerId} not found`);
  }

  // Default range: last 30 days in business timezone if not provided
  // Compute "today" in Africa/Kampala by applying UTC+3 offset
  const todayStr = getBusinessDate();

  const periodEndStr = end
    ? (end instanceof Date ? formatDateBusiness(end) : String(end).slice(0, 10))
    : todayStr;
  const periodStartStr = start
    ? (start instanceof Date ? formatDateBusiness(start) : String(start).slice(0, 10))
    : (() => {
      const d = new Date(periodEndStr + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - 30);
      return formatDateBusiness(d);
    })();

  // Opening balance prior to period start (invoice ledger only)
  const openingRaw = await customerRepository.getOpeningBalance(customerId, periodStartStr as unknown as Date, dbPool);
  let running = new Decimal(openingRaw);

  // Get invoice/liability entries (credit sales, payments, adjustments)
  const rawEntries = await customerRepository.getStatementEntries(
    customerId,
    periodStartStr as unknown as Date,
    periodEndStr as unknown as Date,
    dbPool
  );

  // Get deposit activity
  const depositEntries = await customerRepository.getDepositEntries(
    customerId,
    periodStartStr as unknown as Date,
    periodEndStr as unknown as Date,
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

  // Closing balance must match customer AR (SUM invoice amount_due), not only ledger line math
  const ledgerClosing = running.toNumber();
  const customerBalance = new Decimal(customer.balance ?? 0).toNumber();
  const closingBalance = customerBalance;
  if (Math.abs(ledgerClosing - customerBalance) > 0.01) {
    logger.warn('Customer statement ledger closing differs from AR balance', {
      customerId,
      ledgerClosing,
      customerBalance,
      periodStart: periodStartStr,
      periodEnd: periodEndStr,
    });
  }

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
    periodStart: periodStartStr,
    periodEnd: periodEndStr,
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

// ============================================================
// CUSTOMER OPENING BALANCE (AR cutover from legacy system)
// ============================================================

export interface ImportCustomerOpeningBalanceInput {
  customerId: string;
  amount: number;
  asOfDate: string;
  dueDate?: string;
  notes?: string;
  userId: string;
  userName?: string;
  userRole?: string;
  postReason: string;
  skipAudit?: boolean;
}

/**
 * Import historical AR opening balance for a customer (balance brought forward).
 * GL: DR Accounts Receivable (1200) / CR Opening Balance Equity (3050)
 * Creates invoice document_type = OPENING_BALANCE (OB-NNNNNN).
 */
export async function importCustomerOpeningBalance(
  pool: Pool,
  data: ImportCustomerOpeningBalanceInput
): Promise<{ invoiceId: string; invoiceNumber: string; amount: number }> {
  const amountNum = assertPositiveFinite(data.amount, 'Opening balance amount');
  const amount = new Decimal(amountNum);

  return UnitOfWork.run(pool, async (client) => {
    await checkAccountingPeriodOpen(client, data.asOfDate);

    const existing = await client.query(
      `SELECT id FROM invoices
       WHERE customer_id = $1
         AND document_type = 'OPENING_BALANCE'
         AND status NOT IN ('CANCELLED', 'VOIDED')`,
      [data.customerId]
    );
    if (existing.rows.length > 0) {
      throw new Error(
        'This customer already has an opening balance. Use Replace opening balance to correct the amount.'
      );
    }

    const customerRes = await client.query(
      'SELECT id, name FROM customers WHERE id = $1',
      [data.customerId]
    );
    if (!customerRes.rows[0]) {
      throw new Error('Customer not found');
    }
    const customerName = customerRes.rows[0].name as string;

    const seqResult = await client.query(
      `SELECT COALESCE(MAX(
         CAST(SUBSTRING(invoice_number FROM 'OB-([0-9]+)') AS INTEGER)
       ), 0) + 1 AS next_num
       FROM invoices
       WHERE invoice_number LIKE 'OB-%'`
    );
    const nextNum = seqResult.rows[0].next_num as number;
    const invoiceNumber = `OB-${String(nextNum).padStart(6, '0')}`;

    const dueDate = data.dueDate ?? data.asOfDate;
    const invoiceResult = await client.query(
      `INSERT INTO invoices (
         invoice_number, customer_id, customer_name,
         issue_date, due_date,
         subtotal, tax_amount, total_amount,
         amount_paid, amount_due,
         status, payment_terms, document_type, notes, source_module,
         created_by_id, created_at, updated_at
       ) VALUES (
         $1, $2, $3,
         $4, $5,
         $6, 0, $6,
         0, $6,
         'UNPAID', 30, 'OPENING_BALANCE', $7, 'CUTOVER',
         $8, NOW(), NOW()
       ) RETURNING id`,
      [
        invoiceNumber,
        data.customerId,
        customerName,
        data.asOfDate,
        dueDate,
        amount.toNumber(),
        data.notes ?? `Opening balance as of ${data.asOfDate}`,
        data.userId,
      ]
    );
    const invoiceId = invoiceResult.rows[0].id as string;

    await AccountingCore.createJournalEntry(
      {
        entryDate: data.asOfDate,
        description: `Customer opening balance — ${customerName}`,
        referenceType: 'CUSTOMER_OPENING_BALANCE',
        referenceId: invoiceId,
        referenceNumber: invoiceNumber,
        lines: [
          {
            accountCode: glEntryService.AccountCodes.ACCOUNTS_RECEIVABLE,
            description: `Customer AR — ${customerName} opening balance`,
            debitAmount: amount.toNumber(),
            creditAmount: 0,
            entityType: 'customer',
            entityId: data.customerId,
          },
          {
            accountCode: glEntryService.AccountCodes.OPENING_BALANCE_EQUITY,
            description: `Opening balance equity — ${customerName}`,
            debitAmount: 0,
            creditAmount: amount.toNumber(),
          },
        ],
        userId: data.userId,
        idempotencyKey: `CUSTOMER_OB-${invoiceId}`,
        source: 'CUTOVER_OB',
      },
      pool,
      client
    );

    await syncCustomerBalanceFromInvoices(client, data.customerId, 'CUSTOMER_OPENING_BALANCE');

    if (!data.skipAudit) {
      await logOpeningBalanceAudit(client, {
        party: 'customer',
        partyId: data.customerId,
        partyName: customerName,
        action: 'IMPORT',
        invoiceId,
        invoiceNumber,
        amount: amount.toNumber(),
        reason: data.postReason,
        userId: data.userId,
        userName: data.userName,
        userRole: data.userRole,
      });
    }

    logger.info('Customer opening balance posted', {
      customerId: data.customerId,
      customerName,
      invoiceNumber,
      amount: amount.toNumber(),
    });

    return { invoiceId, invoiceNumber, amount: amount.toNumber() };
  });
}

export async function getCustomerOpeningBalanceHistory(
  pool: Pool,
  customerId: string,
): Promise<{ data: import('../../../../shared/types/audit.js').AuditLog[]; total: number }> {
  return auditRepository.getAuditLogs(pool, {
    entityType: 'CUSTOMER',
    entityId: customerId,
    tags: ['OPENING_BALANCE'],
    page: 1,
    limit: 50,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
}

const OB_TERMINAL_STATUSES = ['CANCELLED', 'VOIDED'];

type OpeningBalanceInvoiceRow = {
  id: string;
  customer_id: string;
  invoice_number: string;
  status: string;
  amount_paid: string | number;
};

async function loadCustomerOpeningBalanceForCancel(
  client: pg.PoolClient,
  invoiceId: string,
  customerId?: string,
): Promise<OpeningBalanceInvoiceRow> {
  const invRes = await client.query<OpeningBalanceInvoiceRow>(
    `SELECT id, customer_id, invoice_number, status, amount_paid
     FROM invoices
     WHERE id = $1 AND COALESCE(document_type, 'INVOICE') = 'OPENING_BALANCE'`,
    [invoiceId],
  );
  const inv = invRes.rows[0];
  if (!inv) {
    throw new Error('Opening balance invoice not found');
  }
  if (customerId && inv.customer_id !== customerId) {
    throw new Error('Opening balance does not belong to this customer');
  }
  if (OB_TERMINAL_STATUSES.includes(String(inv.status).toUpperCase())) {
    throw new Error('Opening balance is already cancelled');
  }
  const paid = new Decimal(inv.amount_paid || 0);
  if (paid.greaterThan(0.01)) {
    throw new Error(
      'Cannot cancel opening balance with payments applied. Reverse payments first.',
    );
  }
  const alloc = await client.query(
    `SELECT 1 FROM ar_payment_allocations WHERE invoice_id = $1 AND status = 'ACTIVE' LIMIT 1`,
    [invoiceId],
  );
  if (alloc.rows.length > 0) {
    throw new Error(
      'Cannot cancel opening balance with AR allocations. Unallocate payments first.',
    );
  }
  const legacyPay = await client.query(
    `SELECT 1 FROM invoice_payments ip
     WHERE ip.invoice_id = $1
       AND (
         NOT EXISTS (
           SELECT 1 FROM ar_payment_allocations a WHERE a.invoice_payment_id = ip.id
         )
         OR EXISTS (
           SELECT 1 FROM ar_payment_allocations a
           WHERE a.invoice_payment_id = ip.id AND a.status = 'ACTIVE'
         )
       )
     LIMIT 1`,
    [invoiceId],
  );
  if (legacyPay.rows.length > 0) {
    throw new Error('Cannot cancel opening balance with invoice payments recorded.');
  }
  return inv;
}

/** Reverse ACTIVE AR allocations on OB invoice (replace flow only). */
async function unallocateCustomerObPaymentsBeforeCancel(
  client: pg.PoolClient,
  invoiceId: string,
  customerId: string,
  userId: string,
): Promise<number> {
  const allocs = await client.query<{ id: string; payment_date: string }>(
    `SELECT a.id, p.payment_date
     FROM ar_payment_allocations a
     JOIN ar_customer_payments p ON p.id = a.payment_id
     WHERE a.invoice_id = $1 AND a.status = 'ACTIVE'`,
    [invoiceId],
  );

  for (const row of allocs.rows) {
    await checkAccountingPeriodOpen(client, String(row.payment_date).slice(0, 10));
    await arPaymentRepository.reverseAllocation(client, row.id, userId);
    await invoiceRepository.recalcInvoice(client, invoiceId);
  }

  if (allocs.rows.length > 0) {
    await openItemEngine.syncCustomerBalanceFromOpenItems(
      client,
      customerId,
      'CUSTOMER_OB_REPLACE_UNALLOCATE',
    );
  }

  return allocs.rows.length;
}

/**
 * Cancel a posted customer opening balance (SAP FB08 / Odoo reverse move pattern).
 * Reverses GL, cancels OB invoice, recalculates customer.balance.
 */
export type CancelCustomerOpeningBalanceOptions = {
  /** When true (replace OB), auto-reverse allocations on this invoice before cancel. */
  forReplace?: boolean;
  skipAudit?: boolean;
  userName?: string;
  userRole?: string;
};

export async function cancelCustomerOpeningBalance(
  pool: Pool,
  invoiceId: string,
  userId: string,
  reason: string,
  options?: CancelCustomerOpeningBalanceOptions,
): Promise<{ invoiceId: string; invoiceNumber: string }> {
  if (!reason || reason.trim().length < 5) {
    throw new Error('Cancellation reason is required (min 5 characters)');
  }

  return UnitOfWork.run(pool, async (client) => {
    if (options?.forReplace) {
      const meta = await client.query<{ customer_id: string }>(
        `SELECT customer_id FROM invoices
         WHERE id = $1 AND COALESCE(document_type, 'INVOICE') = 'OPENING_BALANCE'`,
        [invoiceId],
      );
      if (!meta.rows[0]) {
        throw new Error('Opening balance invoice not found');
      }
      const unallocated = await unallocateCustomerObPaymentsBeforeCancel(
        client,
        invoiceId,
        meta.rows[0].customer_id,
        userId,
      );
      if (unallocated > 0) {
        logger.info('Unallocated AR payments from OB before replace', {
          invoiceId,
          customerId: meta.rows[0].customer_id,
          count: unallocated,
        });
      }
    }

    const inv = await loadCustomerOpeningBalanceForCancel(client, invoiceId);
    await checkAccountingPeriodOpen(client, getBusinessDate());

    const glTxn = await client.query<{ Id: string }>(
      `SELECT "Id" FROM ledger_transactions
       WHERE "ReferenceType" = 'CUSTOMER_OPENING_BALANCE'
         AND "ReferenceId" = $1
         AND "IsReversed" = FALSE
       LIMIT 1`,
      [invoiceId],
    );

    if (glTxn.rows[0]) {
      try {
        await AccountingCore.reverseTransaction(
          {
            originalTransactionId: glTxn.rows[0].Id,
            reversalDate: getBusinessDate(),
            reason: `CANCEL ${inv.invoice_number}: ${reason.trim()}`,
            userId,
            idempotencyKey: `CUSTOMER_OB_CANCEL-${invoiceId}`,
          },
          pool,
          client,
        );
      } catch (error: unknown) {
        if (error instanceof AccountingError && error.code === 'ALREADY_REVERSED') {
          logger.info('Customer OB GL already reversed', { invoiceId });
        } else {
          throw error;
        }
      }
    }

    await client.query(
      `UPDATE invoices
       SET status = 'CANCELLED', amount_due = 0, updated_at = NOW()
       WHERE id = $1`,
      [invoiceId],
    );

    await syncCustomerBalanceFromInvoices(
      client,
      inv.customer_id,
      'CUSTOMER_OPENING_BALANCE_CANCEL',
    );

    if (!options?.skipAudit) {
      const custRes = await client.query<{ name: string }>(
        'SELECT name FROM customers WHERE id = $1',
        [inv.customer_id],
      );
      await logOpeningBalanceAudit(client, {
        party: 'customer',
        partyId: inv.customer_id,
        partyName: custRes.rows[0]?.name ?? 'Customer',
        action: 'CANCEL',
        invoiceId,
        invoiceNumber: inv.invoice_number,
        reason,
        userId,
        userName: options?.userName,
        userRole: options?.userRole,
      });
    }

    logger.info('Customer opening balance cancelled', {
      invoiceId,
      invoiceNumber: inv.invoice_number,
      customerId: inv.customer_id,
    });

    return { invoiceId, invoiceNumber: inv.invoice_number };
  });
}

/**
 * Replace customer opening balance: cancel existing active OB (if any) then post new amount.
 * Use when the cutover figure was entered incorrectly (migration rewrite).
 * Prefer increaseCustomerOpeningBalance when the user only needs +delta legacy AR.
 *
 * Governance: if replace would unallocate receipts and/or leave surplus on-account
 * (customer can go into GL credit), requires confirmImpact=true after UI warning.
 */
export async function replaceCustomerOpeningBalance(
  pool: Pool,
  data: ImportCustomerOpeningBalanceInput & {
    replaceReason: string;
    confirmImpact?: boolean;
    /** INCREASE = smart "add to cutover"; UPDATE = rewrite full total. */
    auditAction?: 'UPDATE' | 'INCREASE';
    increaseBy?: number;
  },
): Promise<{ invoiceId: string; invoiceNumber: string; amount: number; replaced: boolean }> {
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM invoices
     WHERE customer_id = $1
       AND document_type = 'OPENING_BALANCE'
       AND status NOT IN ('CANCELLED', 'VOIDED')`,
    [data.customerId],
  );

  let replaced = false;
  let previousAmount: number | undefined;

  if (existing.rows[0]) {
    const impact = await assessCustomerObReplaceImpact(
      pool,
      data.customerId,
      existing.rows[0].id,
      data.amount,
    );
    if (impact.requiresConfirmation && !data.confirmImpact) {
      throw new BusinessError(
        'Confirm opening-balance correction: this will unallocate receipts and may leave the customer in credit on AR.',
        'OB_REPLACE_CONFIRM_REQUIRED',
        { ...impact },
      );
    }

    const oldInv = await pool.query<{ total_amount: string | number; invoice_number: string }>(
      `SELECT total_amount, invoice_number FROM invoices WHERE id = $1`,
      [existing.rows[0].id],
    );
    previousAmount = Number(oldInv.rows[0]?.total_amount ?? 0);

    await cancelCustomerOpeningBalance(
      pool,
      existing.rows[0].id,
      data.userId,
      data.replaceReason || 'Replaced opening balance with corrected amount',
      { forReplace: true, skipAudit: true },
    );
    replaced = true;
  }

  const created = await importCustomerOpeningBalance(pool, {
    ...data,
    postReason: data.replaceReason,
    skipAudit: replaced,
  });

  if (replaced) {
    try {
      const { allocateUnallocatedReceiptsToInvoice } = await import(
        '../ar-payments/arPaymentService.js'
      );
      const reapplied = await allocateUnallocatedReceiptsToInvoice(pool, {
        customerId: data.customerId,
        invoiceId: created.invoiceId,
        createdById: data.userId,
      });
      if (reapplied.allocationCount > 0) {
        logger.info('Reapplied unallocated receipts to replacement customer OB', {
          customerId: data.customerId,
          invoiceId: created.invoiceId,
          invoiceNumber: created.invoiceNumber,
          ...reapplied,
        });
      }
    } catch (err: unknown) {
      logger.error('Failed to reapply unallocated receipts after OB replace', {
        customerId: data.customerId,
        invoiceId: created.invoiceId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    const custRes = await pool.query<{ name: string }>(
      'SELECT name FROM customers WHERE id = $1',
      [data.customerId],
    );
    await UnitOfWork.run(pool, async (client) => {
      await logOpeningBalanceAudit(client, {
        party: 'customer',
        partyId: data.customerId,
        partyName: custRes.rows[0]?.name ?? 'Customer',
        action: data.auditAction === 'INCREASE' ? 'INCREASE' : 'UPDATE',
        invoiceId: created.invoiceId,
        invoiceNumber: created.invoiceNumber,
        amount: created.amount,
        previousAmount,
        increaseBy: data.increaseBy,
        reason: data.replaceReason,
        userId: data.userId,
        userName: data.userName,
        userRole: data.userRole,
      });
    });
  }

  return { ...created, replaced };
}

/**
 * Smart cutover increase: user types "bring in 50,000 more from old system".
 * Derives new cutover document total = current cutover document total + increaseBy.
 * Does NOT treat customers.balance as the base (avoids Mercy-class mistakes).
 */
export async function increaseCustomerOpeningBalance(
  pool: Pool,
  data: {
    customerId: string;
    increaseBy: number;
    asOfDate: string;
    dueDate?: string;
    notes?: string;
    reason: string;
    userId: string;
    userName?: string | null;
    userRole?: string | null;
    confirmImpact?: boolean;
  },
): Promise<{
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  replaced: boolean;
  previousCutoverTotal: number;
  increaseBy: number;
}> {
  const increaseBy = assertPositiveFinite(data.increaseBy, 'Increase amount');
  const active = await pool.query<{
    id: string;
    total_amount: string | number;
    issue_date: Date | string;
  }>(
    `SELECT id, total_amount, issue_date
     FROM invoices
     WHERE customer_id = $1
       AND document_type = 'OPENING_BALANCE'
       AND status NOT IN ('CANCELLED', 'VOIDED')
     LIMIT 1`,
    [data.customerId],
  );
  if (!active.rows[0]) {
    throw new BusinessError(
      'No active cutover opening balance for this customer. Use Post go-live cutover first.',
      'OB_INCREASE_NO_ACTIVE_CUTOVER',
    );
  }

  const previousCutoverTotal = new Decimal(active.rows[0].total_amount || 0).toNumber();
  const newTotal = new Decimal(previousCutoverTotal).plus(increaseBy).toDecimalPlaces(2).toNumber();
  const issueFallback = String(active.rows[0].issue_date).slice(0, 10);

  const result = await replaceCustomerOpeningBalance(pool, {
    customerId: data.customerId,
    amount: newTotal,
    asOfDate: data.asOfDate || issueFallback,
    dueDate: data.dueDate,
    notes:
      data.notes ||
      `Cutover increase +${increaseBy} (prior cutover total ${previousCutoverTotal})`,
    postReason: data.reason,
    userId: data.userId,
    userName: data.userName,
    userRole: data.userRole,
    replaceReason: `[INCREASE +${increaseBy}] ${data.reason}`,
    confirmImpact: data.confirmImpact,
    auditAction: 'INCREASE',
    increaseBy,
  });

  return {
    ...result,
    previousCutoverTotal,
    increaseBy,
  };
}

/** Snapshot for UI: cutover document vs calculated outstanding (SAP/Odoo style). */
export interface CustomerCutoverSummary {
  customerId: string;
  customerName: string;
  /** Read-only net AR (customers.balance) — never type this into cutover. */
  currentOutstanding: number;
  hasActiveCutover: boolean;
  cutover: null | {
    invoiceId: string;
    invoiceNumber: string;
    documentTotal: number;
    amountPaid: number;
    amountDue: number;
    issueDate: string;
    status: string;
  };
  otherOpenInvoicesDue: number;
  otherOpenInvoiceCount: number;
  unallocatedCash: number;
  guidance: string[];
}

export async function getCustomerCutoverSummary(
  pool: Pool,
  customerId: string,
): Promise<CustomerCutoverSummary> {
  const cust = await pool.query<{ name: string; balance: string | number }>(
    `SELECT name, balance FROM customers WHERE id = $1`,
    [customerId],
  );
  if (!cust.rows[0]) {
    throw new Error(`Customer ${customerId} not found`);
  }

  const ob = await pool.query<{
    id: string;
    invoice_number: string;
    total_amount: string | number;
    amount_paid: string | number;
    amount_due: string | number;
    issue_date: Date | string;
    status: string;
  }>(
    `SELECT id, invoice_number, total_amount, amount_paid, amount_due, issue_date, status
     FROM invoices
     WHERE customer_id = $1
       AND document_type = 'OPENING_BALANCE'
       AND status NOT IN ('CANCELLED', 'VOIDED')
     ORDER BY created_at DESC
     LIMIT 1`,
    [customerId],
  );

  const other = await pool.query<{ due: string | number; cnt: string | number }>(
    `SELECT COALESCE(SUM(amount_due), 0) AS due, COUNT(*)::int AS cnt
     FROM invoices
     WHERE customer_id = $1
       AND COALESCE(document_type, 'INVOICE') <> 'OPENING_BALANCE'
       AND status NOT IN ('CANCELLED', 'VOIDED', 'DRAFT', 'PAID')
       AND amount_due > 0.009`,
    [customerId],
  );

  const unalloc = await pool.query<{ total: string | number }>(
    `SELECT COALESCE(SUM(unallocated_amount), 0) AS total
     FROM ar_customer_payments
     WHERE customer_id = $1
       AND status NOT IN ('REVERSED', 'CANCELLED', 'DRAFT')
       AND unallocated_amount > 0.009`,
    [customerId],
  );

  const currentOutstanding = Moneyish(new Decimal(cust.rows[0].balance || 0));
  const otherOpenInvoicesDue = Moneyish(new Decimal(other.rows[0]?.due || 0));
  const otherOpenInvoiceCount = Number(other.rows[0]?.cnt || 0);
  const unallocatedCash = Moneyish(new Decimal(unalloc.rows[0]?.total || 0));

  const cutover = ob.rows[0]
    ? {
        invoiceId: ob.rows[0].id,
        invoiceNumber: ob.rows[0].invoice_number,
        documentTotal: Moneyish(new Decimal(ob.rows[0].total_amount || 0)),
        amountPaid: Moneyish(new Decimal(ob.rows[0].amount_paid || 0)),
        amountDue: Moneyish(new Decimal(ob.rows[0].amount_due || 0)),
        issueDate: String(ob.rows[0].issue_date).slice(0, 10),
        status: ob.rows[0].status,
      }
    : null;

  const guidance: string[] = [];
  if (!cutover) {
    guidance.push(
      'No go-live cutover yet. Post the total this customer still owed from the old system as of cutover date — not cash received, and not today’s invoice list alone.',
    );
  } else {
    guidance.push(
      `Cutover document ${cutover.invoiceNumber} total is ${formatMoney(new Decimal(cutover.documentTotal))} (what Replace rewrites). Today’s outstanding ${formatMoney(new Decimal(currentOutstanding))} is calculated and is usually different.`,
    );
    guidance.push(
      'To bring more legacy debt (+50,000), use Increase cutover by 50,000 — do not type today’s outstanding into Replace.',
    );
  }
  if (otherOpenInvoiceCount > 0) {
    guidance.push(
      `${otherOpenInvoiceCount} open sales invoice(s) contribute ${formatMoney(new Decimal(otherOpenInvoicesDue))} — cutover adjustments do not replace those invoices.`,
    );
  }
  if (unallocatedCash > 0.009) {
    guidance.push(
      `${formatMoney(new Decimal(unallocatedCash))} unallocated receipt cash sits on-account and reduces net outstanding without paying specific invoices.`,
    );
  }

  return {
    customerId,
    customerName: cust.rows[0].name,
    currentOutstanding,
    hasActiveCutover: Boolean(cutover),
    cutover,
    otherOpenInvoicesDue,
    otherOpenInvoiceCount,
    unallocatedCash,
    guidance,
  };
}

export interface CustomerObReplaceImpact {
  currentObAmount: number;
  newObAmount: number;
  allocatedOnOb: number;
  existingUnallocatedReceipts: number;
  /** Receipts freed from OB + already-unallocated − new OB (floored at 0). */
  projectedSurplusOnAccount: number;
  /** Open INV/CN due excluding the active cutover OB. */
  otherOpenInvoicesDue: number;
  /** customers.balance before change (read-only context). */
  currentOutstanding: number;
  /**
   * Open-item estimate after replace + reapply cash to new OB:
   * max(0, otherOpenDue + newObAmount − freedCash).
   */
  projectedOutstanding: number;
  willUnallocateReceipts: boolean;
  mayLeaveCustomerInCredit: boolean;
  requiresConfirmation: boolean;
  warnings: string[];
}

/** Preview replace side-effects before unallocating / reversing GL. */
export async function assessCustomerObReplaceImpact(
  pool: Pool,
  customerId: string,
  currentObInvoiceId: string,
  newAmount: number,
): Promise<CustomerObReplaceImpact> {
  const ob = await pool.query<{ total_amount: string | number }>(
    `SELECT total_amount FROM invoices
     WHERE id = $1 AND customer_id = $2
       AND document_type = 'OPENING_BALANCE'
       AND status NOT IN ('CANCELLED', 'VOIDED')`,
    [currentObInvoiceId, customerId],
  );
  if (!ob.rows[0]) {
    throw new Error('Opening balance invoice not found');
  }

  const currentObAmount = new Decimal(ob.rows[0].total_amount || 0);
  const newObAmount = new Decimal(assertPositiveFinite(newAmount, 'Opening balance amount'));

  const alloc = await pool.query<{ total: string | number }>(
    `SELECT COALESCE(SUM(amount_allocated), 0) AS total
     FROM ar_payment_allocations
     WHERE invoice_id = $1 AND status = 'ACTIVE'`,
    [currentObInvoiceId],
  );
  const allocatedOnOb = new Decimal(alloc.rows[0]?.total || 0);

  const unalloc = await pool.query<{ total: string | number }>(
    `SELECT COALESCE(SUM(unallocated_amount), 0) AS total
     FROM ar_customer_payments
     WHERE customer_id = $1
       AND status NOT IN ('REVERSED', 'CANCELLED', 'DRAFT')
       AND unallocated_amount > 0.009`,
    [customerId],
  );
  const existingUnallocatedReceipts = new Decimal(unalloc.rows[0]?.total || 0);

  const other = await pool.query<{ due: string | number }>(
    `SELECT COALESCE(SUM(amount_due), 0) AS due
     FROM invoices
     WHERE customer_id = $1
       AND id <> $2
       AND COALESCE(document_type, 'INVOICE') <> 'OPENING_BALANCE'
       AND status NOT IN ('CANCELLED', 'VOIDED', 'DRAFT')
       AND amount_due > 0.009`,
    [customerId, currentObInvoiceId],
  );
  const otherOpenInvoicesDue = new Decimal(other.rows[0]?.due || 0);

  const bal = await pool.query<{ balance: string | number }>(
    `SELECT balance FROM customers WHERE id = $1`,
    [customerId],
  );
  const currentOutstanding = new Decimal(bal.rows[0]?.balance || 0);

  const freedPlusExisting = allocatedOnOb.plus(existingUnallocatedReceipts);
  const surplusRaw = freedPlusExisting.minus(newObAmount);
  const projectedSurplusOnAccount = surplusRaw.lt(0) ? new Decimal(0) : surplusRaw;
  // After reapply to new OB only: balance ≈ max(0, otherDue + newOb − cash available)
  const projectedOutstandingRaw = otherOpenInvoicesDue.plus(newObAmount).minus(freedPlusExisting);
  const projectedOutstanding = projectedOutstandingRaw.lt(0)
    ? new Decimal(0)
    : projectedOutstandingRaw;

  const willUnallocateReceipts = allocatedOnOb.greaterThan(0.009);
  const mayLeaveCustomerInCredit = projectedSurplusOnAccount.greaterThan(0.009);
  const amountReduced = newObAmount.lessThan(currentObAmount.minus(0.009));

  const warnings: string[] = [];
  if (willUnallocateReceipts) {
    warnings.push(
      `${formatMoney(allocatedOnOb)} of receipts currently applied to this cutover document will be temporarily unallocated, then reapplied to the new cutover total where possible.`,
    );
  }
  if (amountReduced) {
    warnings.push(
      `New cutover total (${formatMoney(newObAmount)}) is lower than the cutover document total (${formatMoney(currentObAmount)}) — not “today’s outstanding” (${formatMoney(currentOutstanding)}).`,
    );
  }
  if (mayLeaveCustomerInCredit) {
    warnings.push(
      `About ${formatMoney(projectedSurplusOnAccount)} may remain as unallocated on-account cash after the new cutover is posted.`,
    );
  }
  if (otherOpenInvoicesDue.greaterThan(0.009)) {
    warnings.push(
      `Open sales invoices of ${formatMoney(otherOpenInvoicesDue)} stay open; cutover does not replace them.`,
    );
  }
  warnings.push(
    `Estimated outstanding after change: ${formatMoney(projectedOutstanding)} (was ${formatMoney(currentOutstanding)}).`,
  );

  return {
    currentObAmount: Moneyish(currentObAmount),
    newObAmount: Moneyish(newObAmount),
    allocatedOnOb: Moneyish(allocatedOnOb),
    existingUnallocatedReceipts: Moneyish(existingUnallocatedReceipts),
    projectedSurplusOnAccount: Moneyish(projectedSurplusOnAccount),
    otherOpenInvoicesDue: Moneyish(otherOpenInvoicesDue),
    currentOutstanding: Moneyish(currentOutstanding),
    projectedOutstanding: Moneyish(projectedOutstanding),
    willUnallocateReceipts,
    mayLeaveCustomerInCredit,
    requiresConfirmation: willUnallocateReceipts || mayLeaveCustomerInCredit || amountReduced,
    warnings,
  };
}

function Moneyish(d: Decimal): number {
  return d.toDecimalPlaces(2).toNumber();
}

function formatMoney(d: Decimal): string {
  return d.toDecimalPlaces(2).toFixed(2);
}
