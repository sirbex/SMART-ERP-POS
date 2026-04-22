/**
 * Down Payment Clearing Repository — Raw SQL queries only
 * Links customer deposits to invoices via clearing documents
 */

import { Pool, PoolClient } from 'pg';
import { getBusinessYear } from '../../utils/dateRange.js';
import { Money } from '../../utils/money.js';

// ── DB Row Types ────────────────────────────────────────────

export interface ClearingDbRow {
  id: string;
  clearing_number: string;
  down_payment_id: string;
  invoice_id: string;
  amount: string;
  cleared_by: string | null;
  notes: string | null;
  created_at: string;
  // Joined fields
  deposit_number?: string;
  invoice_number?: string;
  customer_id?: string;
  customer_name?: string;
}

export interface OpenInvoiceDbRow {
  id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  total_amount: string;
  amount_paid: string;
  outstanding_balance: string;
  issue_date: string;
  due_date: string | null;
  status: string;
}

export interface OpenDepositDbRow {
  id: string;
  deposit_number: string;
  customer_id: string;
  customer_name: string;
  amount: string;
  amount_used: string;
  amount_available: string;
  payment_method: string;
  created_at: string;
}

type DbConn = Pool | PoolClient;

// ── Clearing Number Generation ──────────────────────────────

export async function generateClearingNumber(conn: DbConn): Promise<string> {
  await conn.query(`SELECT pg_advisory_xact_lock(hashtext('clearing_number_seq'))`);

  const year = getBusinessYear();
  const result = await conn.query(
    `SELECT clearing_number FROM down_payment_clearings
     WHERE clearing_number LIKE $1
     ORDER BY clearing_number DESC LIMIT 1`,
    [`CLR-${year}-%`]
  );

  if (result.rows.length === 0) {
    return `CLR-${year}-0001`;
  }

  const last = result.rows[0].clearing_number as string;
  const seq = parseInt(last.split('-')[2], 10) + 1;
  return `CLR-${year}-${seq.toString().padStart(4, '0')}`;
}

// ── Create Clearing Record ──────────────────────────────────

export async function createClearing(
  conn: DbConn,
  data: {
    clearingNumber: string;
    downPaymentId: string;
    invoiceId: string;
    amount: number;
    clearedBy?: string;
    notes?: string;
  }
): Promise<ClearingDbRow> {
  const result = await conn.query(
    `INSERT INTO down_payment_clearings
       (clearing_number, down_payment_id, invoice_id, amount, cleared_by, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [data.clearingNumber, data.downPaymentId, data.invoiceId, data.amount, data.clearedBy || null, data.notes || null]
  );
  return result.rows[0];
}

// ── Reduce Deposit Available Balance ────────────────────────

export async function reduceDepositBalance(
  conn: DbConn,
  depositId: string,
  amount: number
): Promise<void> {
  const result = await conn.query(
    `UPDATE pos_customer_deposits
     SET amount_used = amount_used + $2,
         amount_available = amount_available - $2,
         status = CASE
           WHEN amount_available - $2 <= 0 THEN 'DEPLETED'
           ELSE status
         END,
         updated_at = NOW()
     WHERE id = $1
       AND amount_available >= $2
       AND status = 'ACTIVE'
     RETURNING id`,
    [depositId, amount]
  );

  if (result.rows.length === 0) {
    throw new Error(`Failed to reduce deposit ${depositId} by ${amount} — insufficient balance or not active`);
  }
}

// ── Generate Receipt Number (for invoice_payments) ──────────

export async function generateReceiptNumber(conn: DbConn): Promise<string> {
  await conn.query(`SELECT pg_advisory_xact_lock(hashtext('receipt_number_seq'))`);
  const year = getBusinessYear();
  const result = await conn.query(
    `SELECT receipt_number FROM invoice_payments
     WHERE receipt_number LIKE $1
     ORDER BY receipt_number DESC LIMIT 1`,
    [`RCPT-${year}-%`]
  );
  if (result.rows.length === 0) return `RCPT-${year}-0001`;
  const last = result.rows[0].receipt_number as string;
  const seq = parseInt(last.split('-')[2], 10) + 1;
  return `RCPT-${year}-${seq.toString().padStart(4, '0')}`;
}

// ── Insert Clearing Payment into invoice_payments ───────────
// Creates a proper invoice_payments row so recalcInvoice stays consistent

export async function insertClearingPayment(
  conn: DbConn,
  data: {
    invoiceId: string;
    amount: number;
    clearingNumber: string;
    clearedBy?: string;
    paymentDate: string;
  }
): Promise<{ id: string; receiptNumber: string }> {
  const receiptNumber = await generateReceiptNumber(conn);
  const result = await conn.query(
    `INSERT INTO invoice_payments
       (receipt_number, invoice_id, payment_date, payment_method, amount, reference_number, notes, processed_by_id)
     VALUES ($1, $2, $3, 'DEPOSIT'::payment_method, $4, $5, $6, $7)
     RETURNING id, receipt_number`,
    [
      receiptNumber,
      data.invoiceId,
      data.paymentDate,
      data.amount,
      data.clearingNumber,
      `Down payment clearing: ${data.clearingNumber}`,
      data.clearedBy || null,
    ]
  );
  return { id: result.rows[0].id, receiptNumber: result.rows[0].receipt_number };
}

// ── Insert Cash Payment into invoice_payments ───────────────

export async function insertCashPayment(
  conn: DbConn,
  data: {
    invoiceId: string;
    amount: number;
    paymentMethod: string;
    referenceNumber?: string;
    clearedBy?: string;
    paymentDate: string;
    clearingNumber: string;
  }
): Promise<{ id: string; receiptNumber: string }> {
  const receiptNumber = await generateReceiptNumber(conn);
  const result = await conn.query(
    `INSERT INTO invoice_payments
       (receipt_number, invoice_id, payment_date, payment_method, amount, reference_number, notes, processed_by_id)
     VALUES ($1, $2, $3, $4::payment_method, $5, $6, $7, $8)
     RETURNING id, receipt_number`,
    [
      receiptNumber,
      data.invoiceId,
      data.paymentDate,
      data.paymentMethod,
      data.amount,
      data.referenceNumber || null,
      `Cash payment via clearing: ${data.clearingNumber}`,
      data.clearedBy || null,
    ]
  );
  return { id: result.rows[0].id, receiptNumber: result.rows[0].receipt_number };
}

// ── Recalculate Invoice Balance from invoice_payments ───────
// Aggregates from invoice_payments (single source of truth for paid amounts)

export async function recalcInvoiceBalance(
  conn: DbConn,
  invoiceId: string
): Promise<void> {
  // Step 1: Sum all payments
  const sumResult = await conn.query(
    `SELECT COALESCE(SUM(amount), 0) AS amount_paid
     FROM invoice_payments WHERE invoice_id = $1`,
    [invoiceId]
  );
  const amountPaid = Money.toNumber(Money.parseDb(sumResult.rows[0].amount_paid));

  // Step 2: Update invoice with recalculated values
  const result = await conn.query(
    `UPDATE invoices
     SET amount_paid = $1,
         amount_due = GREATEST(total_amount - $1, 0),
         status = CASE
           WHEN GREATEST(total_amount - $1, 0) = 0 AND $1 > 0 THEN 'PAID'
           WHEN GREATEST(total_amount - $1, 0) > 0 AND $1 > 0 THEN 'PARTIALLY_PAID'
           ELSE 'UNPAID'
         END,
         updated_at = NOW()
     WHERE id = $2
     RETURNING id`,
    [amountPaid, invoiceId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Failed to recalculate invoice ${invoiceId} — invoice not found`);
  }
}

// ── Get Open Invoices for Customer ──────────────────────────

export async function getOpenInvoicesForCustomer(
  conn: DbConn,
  customerId: string
): Promise<OpenInvoiceDbRow[]> {
  const result = await conn.query(
    `SELECT i.id AS id, i.invoice_number AS invoice_number,
            i.customer_id AS customer_id,
            c.name AS customer_name,
            i.total_amount AS total_amount,
            COALESCE(i.amount_paid, 0) AS amount_paid,
            COALESCE(i.amount_due, i.total_amount - COALESCE(i.amount_paid, 0)) AS outstanding_balance,
            i.issue_date AS issue_date,
            i.due_date AS due_date,
            i.status AS status
     FROM invoices i
     JOIN customers c ON c.id = i.customer_id
     WHERE i.customer_id = $1
       AND i.status NOT IN ('PAID', 'CANCELLED', 'VOIDED', 'DRAFT')
       AND COALESCE(i.amount_due, i.total_amount - COALESCE(i.amount_paid, 0)) > 0
     ORDER BY i.issue_date ASC`,
    [customerId]
  );
  return result.rows;
}

// ── Get Open Deposits for Customer ──────────────────────────

export async function getOpenDepositsForCustomer(
  conn: DbConn,
  customerId: string
): Promise<OpenDepositDbRow[]> {
  const result = await conn.query(
    `SELECT d.id, d.deposit_number, d.customer_id,
            c.name as customer_name,
            d.amount, d.amount_used, d.amount_available,
            d.payment_method, d.created_at
     FROM pos_customer_deposits d
     JOIN customers c ON c.id = d.customer_id
     WHERE d.customer_id = $1
       AND d.status = 'ACTIVE'
       AND d.amount_available > 0
     ORDER BY d.created_at ASC`,
    [customerId]
  );
  return result.rows;
}

// ── Get Clearings for Invoice ───────────────────────────────

export async function getClearingsForInvoice(
  conn: DbConn,
  invoiceId: string
): Promise<ClearingDbRow[]> {
  const result = await conn.query(
    `SELECT dpc.*, 
            d.deposit_number,
            i.invoice_number AS invoice_number,
            i.customer_id AS customer_id,
            c.name AS customer_name
     FROM down_payment_clearings dpc
     JOIN pos_customer_deposits d ON d.id = dpc.down_payment_id
     JOIN invoices i ON i.id = dpc.invoice_id
     JOIN customers c ON c.id = i.customer_id
     WHERE dpc.invoice_id = $1
     ORDER BY dpc.created_at ASC`,
    [invoiceId]
  );
  return result.rows;
}

// ── Get Clearings for Deposit ───────────────────────────────

export async function getClearingsForDeposit(
  conn: DbConn,
  depositId: string
): Promise<ClearingDbRow[]> {
  const result = await conn.query(
    `SELECT dpc.*, 
            d.deposit_number,
            i.invoice_number AS invoice_number,
            i.customer_id AS customer_id,
            c.name AS customer_name
     FROM down_payment_clearings dpc
     JOIN pos_customer_deposits d ON d.id = dpc.down_payment_id
     JOIN invoices i ON i.id = dpc.invoice_id
     JOIN customers c ON c.id = i.customer_id
     WHERE dpc.down_payment_id = $1
     ORDER BY dpc.created_at ASC`,
    [depositId]
  );
  return result.rows;
}

// ── Get All Clearings (paginated) ───────────────────────────

export async function listClearings(
  conn: DbConn,
  options: {
    customerId?: string;
    limit: number;
    offset: number;
  }
): Promise<{ rows: ClearingDbRow[]; count: number }> {
  let whereClause = '';
  const params: (string | number)[] = [];
  let paramIdx = 1;

  if (options.customerId) {
    whereClause = `WHERE i.customer_id = $${paramIdx}`;
    params.push(options.customerId);
    paramIdx++;
  }

  const countResult = await conn.query(
    `SELECT COUNT(*) as total
     FROM down_payment_clearings dpc
     JOIN invoices i ON i.id = dpc.invoice_id
     ${whereClause}`,
    params
  );

  const dataResult = await conn.query(
    `SELECT dpc.*,
            d.deposit_number,
            i.invoice_number AS invoice_number,
            i.customer_id AS customer_id,
            c.name AS customer_name
     FROM down_payment_clearings dpc
     JOIN pos_customer_deposits d ON d.id = dpc.down_payment_id
     JOIN invoices i ON i.id = dpc.invoice_id
     JOIN customers c ON c.id = i.customer_id
     ${whereClause}
     ORDER BY dpc.created_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, options.limit, options.offset]
  );

  return {
    rows: dataResult.rows,
    count: parseInt(countResult.rows[0].total, 10),
  };
}

// ── Deposit Liability Report ────────────────────────────────

export interface DepositLiabilityRow {
  customer_id: string;
  customer_name: string;
  total_deposited: string;
  total_cleared: string;
  total_remaining: string;
  active_deposit_count: number;
}

export async function getDepositLiabilityReport(
  conn: DbConn
): Promise<DepositLiabilityRow[]> {
  const result = await conn.query(
    `SELECT d.customer_id,
            c.name as customer_name,
            SUM(d.amount) as total_deposited,
            SUM(d.amount_used) as total_cleared,
            SUM(d.amount_available) as total_remaining,
            COUNT(*) FILTER (WHERE d.status = 'ACTIVE') as active_deposit_count
     FROM pos_customer_deposits d
     JOIN customers c ON c.id = d.customer_id
     WHERE d.status IN ('ACTIVE', 'DEPLETED')
     GROUP BY d.customer_id, c.name
     HAVING SUM(d.amount_available) > 0
     ORDER BY SUM(d.amount_available) DESC`
  );
  return result.rows;
}

// ── Sync Customer Balance After Clearing ────────────────────
// Delegates to the canonical SSOT utility

import { syncCustomerBalanceFromInvoices } from '../../utils/customerBalanceSync.js';

export async function syncCustomerBalance(
  conn: DbConn,
  customerId: string
): Promise<void> {
  await syncCustomerBalanceFromInvoices(conn, customerId, 'DOWN_PAYMENT_CLEARING');
}
