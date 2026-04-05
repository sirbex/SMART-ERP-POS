// Customers Repository - Database Layer
// Contains ONLY SQL queries - NO business logic

import { pool as globalPool } from '../../db/pool.js';
import type pg from 'pg';
import type { Customer, CreateCustomer, UpdateCustomer } from '../../../../shared/zod/customer.js';
import { assertRowUpdated } from '../../utils/optimisticUpdate.js';
import { toUtcRange, BUSINESS_TIMEZONE } from '../../utils/dateRange.js';

export async function findAllCustomers(
  limit: number = 50,
  offset: number = 0,
  dbPool?: pg.Pool
): Promise<Customer[]> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `SELECT 
      c.id, c.customer_number as "customerNumber", c.name, c.email, c.phone, c.address,
      c.customer_group_id as "customerGroupId",
      c.balance, c.credit_limit as "creditLimit",
      c.is_active as "isActive",
      c.created_at as "createdAt",
      c.updated_at as "updatedAt",
      c.version,
      COALESCE(dep.available_balance, 0) as "depositBalance"
    FROM customers c
    LEFT JOIN LATERAL (
      SELECT SUM(amount_available) as available_balance
      FROM pos_customer_deposits
      WHERE customer_id = c.id AND status = 'ACTIVE'
    ) dep ON true
    WHERE c.is_active = true
    ORDER BY c.name ASC
    LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return result.rows;
}

export async function findCustomerById(id: string, dbPool?: pg.Pool | pg.PoolClient): Promise<Customer | null> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `SELECT 
      id, customer_number as "customerNumber", name, email, phone, address,
      customer_group_id as "customerGroupId",
      balance, credit_limit as "creditLimit",
      is_active as "isActive",
      created_at as "createdAt",
      updated_at as "updatedAt",
      version
    FROM customers 
    WHERE id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

export async function findCustomerByEmail(email: string, dbPool?: pg.Pool | pg.PoolClient): Promise<Customer | null> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `SELECT 
      id, customer_number as "customerNumber", name, email, phone, address,
      customer_group_id as "customerGroupId",
      balance, credit_limit as "creditLimit",
      is_active as "isActive",
      created_at as "createdAt",
      updated_at as "updatedAt",
      version
    FROM customers 
    WHERE email = $1`,
    [email]
  );

  return result.rows[0] || null;
}

/**
 * Generate next customer number (CUST-NNNNNN format).
 * Uses advisory lock + sequence — safe for concurrent calls.
 */
export async function generateCustomerNumber(conn: pg.Pool | pg.PoolClient): Promise<string> {
  await conn.query(`SELECT pg_advisory_xact_lock(hashtext('customer_number_seq'))`);
  const result = await conn.query(`SELECT nextval('customer_number_seq') AS seq`);
  const seq = parseInt(result.rows[0].seq, 10);
  return `CUST-${seq.toString().padStart(6, '0')}`;
}

export async function createCustomer(data: CreateCustomer, dbPool?: pg.Pool | pg.PoolClient): Promise<Customer> {
  const pool = dbPool || globalPool;
  const customerNumber = await generateCustomerNumber(pool);
  const result = await pool.query(
    `INSERT INTO customers (
      customer_number, name, email, phone, address, customer_group_id, credit_limit
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING 
      id, customer_number as "customerNumber", name, email, phone, address,
      customer_group_id as "customerGroupId",
      balance, credit_limit as "creditLimit",
      is_active as "isActive",
      created_at as "createdAt",
      updated_at as "updatedAt",
      version`,
    [
      customerNumber,
      data.name,
      data.email || null,
      data.phone || null,
      data.address || null,
      data.customerGroupId || null,
      data.creditLimit || 0,
    ]
  );

  return result.rows[0];
}

export async function updateCustomer(id: string, data: UpdateCustomer, dbPool?: pg.Pool | pg.PoolClient): Promise<Customer | null> {
  const pool = dbPool || globalPool;
  const clientVersion = data.version;
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.email !== undefined) {
    fields.push(`email = $${paramIndex++}`);
    values.push(data.email);
  }
  if (data.phone !== undefined) {
    fields.push(`phone = $${paramIndex++}`);
    values.push(data.phone);
  }
  if (data.address !== undefined) {
    fields.push(`address = $${paramIndex++}`);
    values.push(data.address);
  }
  if (data.customerGroupId !== undefined) {
    fields.push(`customer_group_id = $${paramIndex++}`);
    values.push(data.customerGroupId);
  }
  if (data.creditLimit !== undefined) {
    fields.push(`credit_limit = $${paramIndex++}`);
    values.push(data.creditLimit);
  }

  if (fields.length === 0) {
    return findCustomerById(id, pool);
  }

  // Always bump version
  fields.push(`version = version + 1`);

  values.push(id);
  let whereClause = `id = $${paramIndex++}`;

  if (clientVersion !== undefined) {
    whereClause += ` AND version = $${paramIndex++}`;
    values.push(clientVersion);
  }

  const result = await pool.query(
    `UPDATE customers 
     SET ${fields.join(', ')}
     WHERE ${whereClause}
     RETURNING 
      id, customer_number as "customerNumber", name, email, phone, address,
      customer_group_id as "customerGroupId",
      balance, credit_limit as "creditLimit",
      is_active as "isActive",
      created_at as "createdAt",
      updated_at as "updatedAt",
      version`,
    values
  );

  if (clientVersion !== undefined) {
    assertRowUpdated(result.rowCount, 'Customer', id);
  }

  return result.rows[0] || null;
}

export async function deleteCustomer(id: string, dbPool?: pg.Pool | pg.PoolClient): Promise<boolean> {
  const pool = dbPool || globalPool;
  const result = await pool.query('UPDATE customers SET is_active = false WHERE id = $1', [id]);

  return result.rowCount !== null && result.rowCount > 0;
}

export async function toggleCustomerActive(id: string, isActive: boolean, dbPool?: pg.Pool | pg.PoolClient): Promise<Customer | null> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `UPDATE customers 
     SET is_active = $1, version = version + 1
     WHERE id = $2
     RETURNING 
      id, customer_number as "customerNumber", name, email, phone, address,
      customer_group_id as "customerGroupId",
      balance, credit_limit as "creditLimit",
      is_active as "isActive",
      created_at as "createdAt",
      updated_at as "updatedAt",
      version`,
    [isActive, id]
  );

  return result.rows[0] || null;
}

export async function updateCustomerBalance(id: string, amount: number, dbPool?: pg.Pool | pg.PoolClient): Promise<Customer | null> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `UPDATE customers 
     SET balance = balance + $1, version = version + 1
     WHERE id = $2
     RETURNING 
      id, name, email, phone, address,
      customer_group_id as "customerGroupId",
      balance, credit_limit as "creditLimit",
      is_active as "isActive",
      created_at as "createdAt",
      updated_at as "updatedAt",
      version`,
    [amount, id]
  );

  // Sync AR account balance (replaces trg_sync_customer_to_ar)
  await pool.query(`
    UPDATE accounts SET "CurrentBalance" = COALESCE(
      (SELECT SUM(balance) FROM customers WHERE is_active = true), 0
    ), "UpdatedAt" = NOW()
    WHERE "AccountCode" = '1200'
  `);

  return result.rows[0] || null;
}

export async function findCustomerByNumber(customerNumber: string, dbPool?: pg.Pool | pg.PoolClient): Promise<Customer | null> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `SELECT 
      id, customer_number as "customerNumber", name, email, phone, address,
      customer_group_id as "customerGroupId",
      balance, credit_limit as "creditLimit",
      is_active as "isActive",
      created_at as "createdAt",
      updated_at as "updatedAt",
      version
    FROM customers 
    WHERE customer_number = $1`,
    [customerNumber]
  );

  return result.rows[0] || null;
}

export async function searchCustomers(searchTerm: string, limit: number = 20, dbPool?: pg.Pool | pg.PoolClient): Promise<Customer[]> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `SELECT 
      id, customer_number as "customerNumber", name, email, phone, address,
      customer_group_id as "customerGroupId",
      balance, credit_limit as "creditLimit",
      is_active as "isActive",
      created_at as "createdAt",
      updated_at as "updatedAt",
      version
    FROM customers 
    WHERE is_active = true
      AND (
        customer_number ILIKE $1
        OR name ILIKE $1
        OR email ILIKE $1
        OR phone ILIKE $1
      )
    ORDER BY 
      CASE 
        WHEN customer_number ILIKE $1 THEN 1
        WHEN name ILIKE $2 THEN 2
        ELSE 3
      END,
      name ASC
    LIMIT $3`,
    [`%${searchTerm}%`, `${searchTerm}%`, limit]
  );

  return result.rows;
}

export async function countCustomers(dbPool?: pg.Pool | pg.PoolClient): Promise<number> {
  const pool = dbPool || globalPool;
  const result = await pool.query('SELECT COUNT(*) as count FROM customers WHERE is_active = true');

  return parseInt(result.rows[0].count, 10);
}

/**
 * Get customer sales/invoices history
 */
export interface CustomerSale {
  id: string;
  saleNumber: string;
  saleDate: Date;
  totalAmount: number;
  paymentMethod: string;
  amountPaid: number;
  changeAmount: number;
  status: string;
  itemCount: number;
  cashierName?: string;
}

export async function findCustomerSales(
  customerId: string,
  limit: number = 50,
  offset: number = 0,
  dbPool?: pg.Pool
): Promise<CustomerSale[]> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `SELECT 
      s.id,
      s.sale_number as "saleNumber",
      s.sale_date as "saleDate",
      s.total_amount as "totalAmount",
      s.payment_method as "paymentMethod",
      s.amount_paid as "amountPaid",
      s.change_amount as "changeAmount",
      s.status,
      COUNT(si.id) as "itemCount",
      u.full_name as "cashierName"
    FROM sales s
    LEFT JOIN sale_items si ON s.id = si.sale_id
    LEFT JOIN users u ON s.cashier_id = u.id
    WHERE s.customer_id = $1
  GROUP BY s.id, u.full_name
    ORDER BY s.sale_date DESC, s.created_at DESC
    LIMIT $2 OFFSET $3`,
    [customerId, limit, offset]
  );

  return result.rows.map(row => ({
    ...row,
    itemCount: parseInt(row.itemCount, 10)
  }));
}

export async function countCustomerSales(customerId: string, dbPool?: pg.Pool | pg.PoolClient): Promise<number> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    'SELECT COUNT(*) as count FROM sales WHERE customer_id = $1',
    [customerId]
  );

  return parseInt(result.rows[0].count, 10);
}

/**
 * Get customer transaction history (for accounting/balance tracking)
 */
export interface CustomerTransaction {
  id: string;
  transactionDate: Date;
  type: 'SALE' | 'PAYMENT' | 'ADJUSTMENT';
  amount: number;
  balance: number;
  description: string;
  referenceNumber?: string;
}

export async function findCustomerTransactions(
  customerId: string,
  limit: number = 50,
  offset: number = 0,
  dbPool?: pg.Pool
): Promise<CustomerTransaction[]> {
  const pool = dbPool || globalPool;
  // Combine credit sales and invoice payments
  // Note: invoices uses PascalCase columns (EF Core), invoice_payments uses lowercase
  const result = await pool.query(
    `(
      SELECT 
        s.id,
        s.sale_date as "transactionDate",
        'SALE' as type,
        s.total_amount as amount,
        s.sale_number as "referenceNumber",
        CONCAT('Sale #', s.sale_number) as description
      FROM sales s
      WHERE s.customer_id = $1 AND s.payment_method = 'CREDIT'
    )
    UNION ALL
    (
      SELECT 
        ip.id,
        ip.payment_date as "transactionDate",
        'PAYMENT' as type,
        -ip.amount as amount, -- negative for liability reduction
        ip.receipt_number as "referenceNumber",
        CONCAT('Payment ', ip.receipt_number) as description
      FROM invoice_payments ip
      INNER JOIN invoices i ON i."Id" = ip.invoice_id
      WHERE i."CustomerId" = $1
    )
    ORDER BY "transactionDate" DESC
    LIMIT $2 OFFSET $3`,
    [customerId, limit, offset]
  );

  return result.rows;
}

/**
 * Count total customer transactions (for pagination)
 */
export async function countCustomerTransactions(customerId: string, dbPool?: pg.Pool | pg.PoolClient): Promise<number> {
  const pool = dbPool || globalPool;
  // Count from invoices (AR ledger) + payments — same source as statement
  const result = await pool.query(
    `SELECT COUNT(*) as total FROM (
      SELECT i."Id" FROM invoices i
      WHERE i."CustomerId" = $1
        AND i."Status" NOT IN ('Cancelled', 'CANCELLED', 'Draft', 'DRAFT')
      UNION ALL
      SELECT ip.id FROM invoice_payments ip
      INNER JOIN invoices i ON i."Id" = ip.invoice_id
      WHERE i."CustomerId" = $1
    ) combined`,
    [customerId]
  );

  return parseInt(result.rows[0]?.total || '0', 10);
}

/**
 * Statement queries: opening balance and in-period entries
 */
export async function getOpeningBalance(customerId: string, start: Date, dbPool?: pg.Pool | pg.PoolClient): Promise<number> {
  const pool = dbPool || globalPool;
  const startStr = start instanceof Date ? start.toISOString().slice(0, 10) : String(start).slice(0, 10);
  const { startUtc } = toUtcRange(startStr, startStr, BUSINESS_TIMEZONE);
  // Derive opening balance from invoices (AR ledger) — same source as fn_recalculate_customer_ar_balance
  // invoices uses PascalCase columns (EF Core), invoice_payments uses lowercase
  const res = await pool.query(
    `WITH debits AS (
       SELECT COALESCE(SUM(
         CASE WHEN i.document_type IS NULL OR i.document_type = 'INVOICE' OR i.document_type = 'DEBIT_NOTE'
              THEN i."TotalAmount" ELSE 0 END
       ),0) AS amt
       FROM invoices i
       WHERE i."CustomerId" = $1
         AND i."Status" NOT IN ('Cancelled', 'CANCELLED', 'Draft', 'DRAFT')
         AND i."InvoiceDate" < $2
     ),
     credits AS (
       SELECT COALESCE(SUM(ip.amount),0) AS amt
       FROM invoice_payments ip
       INNER JOIN invoices i ON i."Id" = ip.invoice_id
       WHERE i."CustomerId" = $1 AND ip.payment_date < $2
     ),
     credit_notes AS (
       SELECT COALESCE(SUM(i."TotalAmount"),0) AS amt
       FROM invoices i
       WHERE i."CustomerId" = $1
         AND i.document_type = 'CREDIT_NOTE'
         AND i."Status" NOT IN ('Cancelled', 'CANCELLED', 'Draft', 'DRAFT')
         AND i."InvoiceDate" < $2
     )
     SELECT (d.amt - c.amt - cn.amt) AS opening
     FROM debits d, credits c, credit_notes cn`,
    [customerId, startUtc]
  );
  return parseFloat(res.rows[0]?.opening ?? 0);
}

/**
 * Get statement entries for invoice/liability tracking only
 * This tracks: Credit sales (INVOICE), Payments (PAYMENT), Manual adjustments (ADJUSTMENT)
 * Deposits are tracked separately - they don't affect invoice balance
 */
export async function getStatementEntries(customerId: string, start: Date, end: Date, dbPool?: pg.Pool | pg.PoolClient): Promise<Record<string, unknown>[]> {
  const pool = dbPool || globalPool;
  const startStr = start instanceof Date ? start.toISOString().slice(0, 10) : String(start).slice(0, 10);
  const endStr = end instanceof Date ? end.toISOString().slice(0, 10) : String(end).slice(0, 10);
  const { startUtc, endUtc } = toUtcRange(startStr, endStr, BUSINESS_TIMEZONE);
  // Derive entries from invoices (AR ledger) — same source as fn_recalculate_customer_ar_balance
  // invoices uses PascalCase columns (EF Core), invoice_payments uses lowercase
  const res = await pool.query(
    `(
      SELECT 
        i."InvoiceDate" as date,
        'INVOICE' as type,
        i."InvoiceNumber" as reference,
        CONCAT('Invoice ', i."InvoiceNumber") as description,
        i."TotalAmount" as debit,
        0::numeric as credit
      FROM invoices i
      WHERE i."CustomerId" = $1
        AND (i.document_type IS NULL OR i.document_type = 'INVOICE')
        AND i."Status" NOT IN ('Cancelled', 'CANCELLED', 'Draft', 'DRAFT')
        AND i."InvoiceDate" >= $2 AND i."InvoiceDate" < $3
    )
    UNION ALL
    (
      SELECT 
        i."InvoiceDate" as date,
        'CREDIT_NOTE' as type,
        i."InvoiceNumber" as reference,
        CONCAT('Credit Note ', i."InvoiceNumber", ' - ', COALESCE(i.reason, '')) as description,
        0::numeric as debit,
        i."TotalAmount" as credit
      FROM invoices i
      WHERE i."CustomerId" = $1
        AND i.document_type = 'CREDIT_NOTE'
        AND i."Status" NOT IN ('Cancelled', 'CANCELLED', 'Draft', 'DRAFT')
        AND i."InvoiceDate" >= $2 AND i."InvoiceDate" < $3
    )
    UNION ALL
    (
      SELECT 
        i."InvoiceDate" as date,
        'DEBIT_NOTE' as type,
        i."InvoiceNumber" as reference,
        CONCAT('Debit Note ', i."InvoiceNumber", ' - ', COALESCE(i.reason, '')) as description,
        i."TotalAmount" as debit,
        0::numeric as credit
      FROM invoices i
      WHERE i."CustomerId" = $1
        AND i.document_type = 'DEBIT_NOTE'
        AND i."Status" NOT IN ('Cancelled', 'CANCELLED', 'Draft', 'DRAFT')
        AND i."InvoiceDate" >= $2 AND i."InvoiceDate" < $3
    )
    UNION ALL
    (
      SELECT 
        ip.payment_date as date,
        'PAYMENT' as type,
        ip.receipt_number as reference,
        CONCAT('Payment ', ip.receipt_number) as description,
        0::numeric as debit,
        ip.amount as credit
      FROM invoice_payments ip
      INNER JOIN invoices i ON i."Id" = ip.invoice_id
      WHERE i."CustomerId" = $1 AND ip.payment_date >= $2 AND ip.payment_date < $3
    )
    UNION ALL
    (
      SELECT 
        sm.created_at as date,
        'ADJUSTMENT' as type,
        sm.reference as reference,
        sm.description as description,
        CASE WHEN sm.amount > 0 THEN sm.amount ELSE 0 END as debit,
        CASE WHEN sm.amount < 0 THEN -sm.amount ELSE 0 END as credit
      FROM customer_balance_adjustments sm
      WHERE sm.customer_id = $1 AND sm.created_at >= $2 AND sm.created_at < $3
    )
    ORDER BY date ASC`,
    [customerId, startUtc, endUtc]
  );
  return res.rows;
}

/**
 * Get deposit activity for a customer (separate from invoice ledger)
 * Returns both deposit receipts and deposit applications
 */
export async function getDepositEntries(customerId: string, start: Date, end: Date, dbPool?: pg.Pool | pg.PoolClient): Promise<Record<string, unknown>[]> {
  const pool = dbPool || globalPool;
  const startStr = start instanceof Date ? start.toISOString().slice(0, 10) : String(start).slice(0, 10);
  const endStr = end instanceof Date ? end.toISOString().slice(0, 10) : String(end).slice(0, 10);
  const { startUtc, endUtc } = toUtcRange(startStr, endStr, BUSINESS_TIMEZONE);
  const res = await pool.query(
    `(
      SELECT 
        d.created_at as date,
        'DEPOSIT_IN' as type,
        d.deposit_number as reference,
        CONCAT('Deposit received (', d.payment_method, ')') as description,
        d.amount as amount,
        d.status
      FROM pos_customer_deposits d
      WHERE d.customer_id = $1 AND d.created_at >= $2 AND d.created_at < $3
    )
    UNION ALL
    (
      SELECT 
        da.applied_at as date,
        'DEPOSIT_OUT' as type,
        d.deposit_number as reference,
        CONCAT('Applied to sale ', s.sale_number) as description,
        -da.amount_applied as amount,
        'APPLIED' as status
      FROM pos_deposit_applications da
      INNER JOIN pos_customer_deposits d ON d.id = da.deposit_id
      INNER JOIN sales s ON s.id = da.sale_id
      WHERE d.customer_id = $1 AND da.applied_at >= $2 AND da.applied_at < $3
    )
    ORDER BY date ASC`,
    [customerId, startUtc, endUtc]
  );
  return res.rows;
}

/**
 * Get customer deposit summary (current balances)
 */
export async function getCustomerDepositSummary(customerId: string, dbPool?: pg.Pool | pg.PoolClient): Promise<{
  totalDeposited: number;
  totalUsed: number;
  availableBalance: number;
  depositCount: number;
}> {
  const pool = dbPool || globalPool;
  const res = await pool.query(
    `SELECT 
      COALESCE(SUM(amount), 0) as total_deposited,
      COALESCE(SUM(amount_used), 0) as total_used,
      COALESCE(SUM(amount_available), 0) as available_balance,
      COUNT(*) as deposit_count
    FROM pos_customer_deposits
    WHERE customer_id = $1 AND status = 'ACTIVE'`,
    [customerId]
  );

  const row = res.rows[0];
  return {
    totalDeposited: parseFloat(row.total_deposited || 0),
    totalUsed: parseFloat(row.total_used || 0),
    availableBalance: parseFloat(row.available_balance || 0),
    depositCount: parseInt(row.deposit_count || 0, 10)
  };
}

/**
 * Get customer summary statistics
 */
export interface CustomerSummary {
  totalSales: number;
  totalSpent: number;
  totalInvoices: number;
  outstandingBalance: number;
  creditUsed: number;
  creditAvailable: number;
  lastPurchaseDate?: Date;
  pendingInvoices: number;
}

export async function getCustomerSummary(customerId: string, dbPool?: pg.Pool | pg.PoolClient): Promise<CustomerSummary> {
  const pool = dbPool || globalPool;
  const customer = await findCustomerById(customerId, pool);
  if (!customer) {
    throw new Error(`Customer with ID ${customerId} not found`);
  }

  // Derive summary from invoices (AR ledger) — covers both POS credit sales and DN→Invoice flow
  const invoiceResult = await pool.query(
    `SELECT 
      COUNT(*) as "totalInvoices",
      COALESCE(SUM("TotalAmount"), 0) as "totalSpent",
      MAX("InvoiceDate") as "lastPurchaseDate"
    FROM invoices 
    WHERE "CustomerId" = $1
      AND "Status" NOT IN ('Cancelled', 'CANCELLED', 'Draft', 'DRAFT')`,
    [customerId]
  );

  // Count pending (unpaid/partially paid) invoices
  const pendingResult = await pool.query(
    `SELECT COUNT(*) as "pendingCount"
    FROM invoices
    WHERE "CustomerId" = $1
      AND "Status" NOT IN ('Cancelled', 'CANCELLED', 'Draft', 'DRAFT', 'Paid', 'PAID')`,
    [customerId]
  );

  const summary = invoiceResult.rows[0];
  const pendingInvoices = parseInt(pendingResult.rows[0]?.pendingCount || '0', 10);
  // customer.balance = SUM(invoiced) - SUM(paid) from AR trigger
  // Positive → customer owes money, Negative → customer overpaid (credit balance)
  const balance = typeof customer.balance === 'string' ? parseFloat(customer.balance) : (customer.balance || 0);
  const creditLimit = typeof customer.creditLimit === 'string' ? parseFloat(String(customer.creditLimit)) : (customer.creditLimit || 0);
  const outstandingBalance = balance > 0 ? balance : 0;
  const creditUsed = outstandingBalance;
  const creditAvailable = Math.max(0, creditLimit - creditUsed);

  return {
    totalSales: parseInt(summary.totalInvoices, 10),
    totalSpent: parseFloat(summary.totalSpent),
    totalInvoices: parseInt(summary.totalInvoices, 10),
    outstandingBalance,
    creditUsed,
    creditAvailable,
    lastPurchaseDate: summary.lastPurchaseDate || undefined,
    pendingInvoices,
  };
}
