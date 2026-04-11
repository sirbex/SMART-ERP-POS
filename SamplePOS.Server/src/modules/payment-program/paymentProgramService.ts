/**
 * Payment Program Service (Batch AP Payments)
 * 
 * SAP-style automated payment run for Accounts Payable.
 * 
 * Workflow:
 *   1. DRAFT: User configures run parameters (due date cutoff, payment method, min/max amounts)
 *   2. PROPOSED: System identifies eligible invoices and proposes payments
 *   3. APPROVED: Manager reviews and approves the payment run
 *   4. EXECUTED: Payments are processed, GL entries posted, supplier balances updated
 *   5. CANCELLED: Run can be cancelled at DRAFT or PROPOSED stage
 */

import { pool as globalPool } from '../../db/pool.js';
import type pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { Money } from '../../utils/money.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { AccountingCore, JournalLine } from '../../services/accountingCore.js';
import { AccountCodes } from '../../services/glEntryService.js';
import { ValidationError, NotFoundError } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

export interface PaymentRun {
  id: string;
  runNumber: string;
  runDate: string;
  paymentMethod: string;
  status: 'DRAFT' | 'PROPOSED' | 'APPROVED' | 'EXECUTED' | 'CANCELLED';
  totalAmount: number;
  totalItems: number;
  bankAccountCode: string | null;
  dueDateCutoff: string | null;
  minAmount: number;
  maxAmount: number | null;
  notes: string | null;
  proposedBy: string | null;
  approvedBy: string | null;
  executedBy: string | null;
  createdBy: string;
  createdAt: string;
}

export interface PaymentRunItem {
  id: string;
  paymentRunId: string;
  supplierId: string;
  supplierName?: string;
  invoiceId: string | null;
  amount: number;
  paymentReference: string | null;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'SKIPPED';
  glTransactionId: string | null;
  errorMessage: string | null;
}

// =============================================================================
// PAYMENT RUN MANAGEMENT
// =============================================================================

export const createPaymentRun = async (
  data: {
    runDate: string;
    paymentMethod: string;
    bankAccountCode?: string;
    dueDateCutoff?: string;
    minAmount?: number;
    maxAmount?: number;
    notes?: string;
    userId: string;
  },
  pool?: pg.Pool
): Promise<PaymentRun> => {
  const dbPool = pool || globalPool;

  // Generate run number
  const numResult = await dbPool.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(run_number FROM 9) AS INTEGER)), 0) + 1 as next_num
     FROM payment_runs WHERE run_number LIKE 'PR-____-%'`
  );
  const year = new Date().getFullYear();
  const nextNum = parseInt(numResult.rows[0].next_num);
  const runNumber = `PR-${year}-${String(nextNum).padStart(4, '0')}`;

  const result = await dbPool.query(
    `INSERT INTO payment_runs (id, run_number, run_date, payment_method, status, bank_account_code,
     due_date_cutoff, min_amount, max_amount, notes, created_by)
     VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [uuidv4(), runNumber, data.runDate, data.paymentMethod,
    data.bankAccountCode || null, data.dueDateCutoff || null,
    data.minAmount || 0, data.maxAmount || null, data.notes || null, data.userId]
  );

  logger.info('Payment run created', { runNumber, method: data.paymentMethod });
  return normalizeRun(result.rows[0]);
};

/**
 * Propose payments — identify eligible supplier invoices.
 */
export const proposePayments = async (
  runId: string,
  userId: string,
  pool?: pg.Pool
): Promise<PaymentRun> => {
  const dbPool = pool || globalPool;

  return UnitOfWork.run(dbPool, async (client) => {
    // Lock the run
    const runResult = await client.query(
      `SELECT * FROM payment_runs WHERE id = $1 FOR UPDATE`,
      [runId]
    );
    if (runResult.rows.length === 0) throw new NotFoundError('Payment run');
    const run = normalizeRun(runResult.rows[0]);

    if (run.status !== 'DRAFT') {
      throw new ValidationError(`Cannot propose payments for ${run.status} run`);
    }

    // Find eligible supplier invoices
    // Invoices that are due (by cutoff), unpaid/partially paid, within amount range
    let invoiceQuery = `
      SELECT 
        si."Id" as invoice_id,
        si."SupplierId" as supplier_id,
        s."CompanyName" as supplier_name,
        si."TotalAmount" as total_amount,
        COALESCE(si."AmountPaid", 0) as amount_paid,
        si."TotalAmount" - COALESCE(si."AmountPaid", 0) as amount_due
      FROM supplier_invoices si
      JOIN suppliers s ON si."SupplierId" = s."Id"
      WHERE si."Status" IN ('Pending', 'PartiallyPaid', 'Overdue')
        AND si."TotalAmount" > COALESCE(si."AmountPaid", 0)
    `;
    const params: unknown[] = [];
    let idx = 1;

    if (run.dueDateCutoff) {
      invoiceQuery += ` AND si."DueDate" <= $${idx++}`;
      params.push(run.dueDateCutoff);
    }

    invoiceQuery += ` ORDER BY si."DueDate" ASC`;

    const invoiceResult = await client.query(invoiceQuery, params);

    // Clear existing items
    await client.query(`DELETE FROM payment_run_items WHERE payment_run_id = $1`, [runId]);

    let totalAmount = 0;
    let totalItems = 0;

    for (const inv of invoiceResult.rows) {
      const amountDue = Number(inv.amount_due);

      // Apply min/max filters
      if (run.minAmount && amountDue < run.minAmount) continue;
      if (run.maxAmount && amountDue > run.maxAmount) continue;

      await client.query(
        `INSERT INTO payment_run_items (id, payment_run_id, supplier_id, invoice_id, amount, status)
         VALUES ($1, $2, $3, $4, $5, 'PENDING')`,
        [uuidv4(), runId, inv.supplier_id, inv.invoice_id, amountDue]
      );

      totalAmount = Money.toNumber(Money.add(totalAmount, amountDue));
      totalItems++;
    }

    // Update run
    const updatedResult = await client.query(
      `UPDATE payment_runs SET status = 'PROPOSED', total_amount = $1, total_items = $2,
       proposed_by = $3, proposed_at = NOW(), updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [totalAmount, totalItems, userId, runId]
    );

    logger.info('Payment run proposed', { runNumber: run.runNumber, items: totalItems, total: totalAmount });
    return normalizeRun(updatedResult.rows[0]);
  });
};

/**
 * Approve a proposed payment run.
 */
export const approvePaymentRun = async (
  runId: string,
  userId: string,
  pool?: pg.Pool
): Promise<PaymentRun> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(
    `UPDATE payment_runs SET status = 'APPROVED', approved_by = $1, approved_at = NOW(), updated_at = NOW()
     WHERE id = $2 AND status = 'PROPOSED' RETURNING *`,
    [userId, runId]
  );
  if (result.rows.length === 0) throw new ValidationError('Run must be in PROPOSED status to approve');
  logger.info('Payment run approved', { runId, userId });
  return normalizeRun(result.rows[0]);
};

/**
 * Execute an approved payment run — process all payments and post GL entries.
 */
export const executePaymentRun = async (
  runId: string,
  userId: string,
  pool?: pg.Pool
): Promise<{ run: PaymentRun; paid: number; failed: number }> => {
  const dbPool = pool || globalPool;

  return UnitOfWork.run(dbPool, async (client) => {
    const runResult = await client.query(
      `SELECT * FROM payment_runs WHERE id = $1 FOR UPDATE`,
      [runId]
    );
    if (runResult.rows.length === 0) throw new NotFoundError('Payment run');
    const run = normalizeRun(runResult.rows[0]);

    if (run.status !== 'APPROVED') {
      throw new ValidationError(`Cannot execute ${run.status} run — must be APPROVED`);
    }

    const items = await client.query(
      `SELECT pri.*, s."CompanyName" as supplier_name
       FROM payment_run_items pri
       JOIN suppliers s ON pri.supplier_id = s."Id"
       WHERE pri.payment_run_id = $1 AND pri.status = 'PENDING'`,
      [runId]
    );

    let paid = 0;
    let failed = 0;

    const sourceAccount = run.bankAccountCode || AccountCodes.CASH;

    for (const item of items.rows) {
      try {
        const amount = Number(item.amount);

        // Post GL: DR AP, CR Bank/Cash
        const lines: JournalLine[] = [
          {
            accountCode: AccountCodes.ACCOUNTS_PAYABLE,
            description: `Batch payment to ${item.supplier_name}`,
            debitAmount: amount,
            creditAmount: 0,
            entityType: 'SUPPLIER',
            entityId: item.supplier_id,
          },
          {
            accountCode: sourceAccount,
            description: `Payment run ${run.runNumber} - ${item.supplier_name}`,
            debitAmount: 0,
            creditAmount: amount,
            entityType: 'PAYMENT_RUN',
            entityId: runId,
          },
        ];

        const glResult = await AccountingCore.createJournalEntry({
          entryDate: run.runDate,
          description: `Batch AP payment - ${run.runNumber} - ${item.supplier_name}`,
          referenceType: 'PAYMENT_RUN',
          referenceId: item.id,
          referenceNumber: `${run.runNumber}-${String(paid + 1).padStart(3, '0')}`,
          lines,
          userId,
          idempotencyKey: `PAYRUN-${item.id}`,
        }, undefined, client);

        // Update item status
        await client.query(
          `UPDATE payment_run_items SET status = 'PAID', gl_transaction_id = $1,
           payment_reference = $2 WHERE id = $3`,
          [glResult.transactionId, glResult.transactionNumber, item.id]
        );

        // Update invoice paid amount if invoice exists
        if (item.invoice_id) {
          await client.query(
            `UPDATE supplier_invoices SET "AmountPaid" = COALESCE("AmountPaid", 0) + $1,
             "Status" = CASE WHEN COALESCE("AmountPaid", 0) + $1 >= "TotalAmount" THEN 'Paid' ELSE 'PartiallyPaid' END
             WHERE "Id" = $2`,
            [amount, item.invoice_id]
          );
        }

        paid++;
      } catch (error) {
        // Mark item as failed
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        await client.query(
          `UPDATE payment_run_items SET status = 'FAILED', error_message = $1 WHERE id = $2`,
          [errMsg, item.id]
        );
        failed++;
        logger.error('Payment run item failed', { itemId: item.id, error: errMsg });
      }
    }

    // Update run status
    const updatedResult = await client.query(
      `UPDATE payment_runs SET status = 'EXECUTED', executed_by = $1, executed_at = NOW(), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [userId, runId]
    );

    logger.info('Payment run executed', { runNumber: run.runNumber, paid, failed });
    return { run: normalizeRun(updatedResult.rows[0]), paid, failed };
  });
};

/**
 * Cancel a payment run (only DRAFT or PROPOSED).
 */
export const cancelPaymentRun = async (
  runId: string,
  userId: string,
  pool?: pg.Pool
): Promise<PaymentRun> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(
    `UPDATE payment_runs SET status = 'CANCELLED', updated_at = NOW()
     WHERE id = $1 AND status IN ('DRAFT', 'PROPOSED') RETURNING *`,
    [runId]
  );
  if (result.rows.length === 0) throw new ValidationError('Can only cancel DRAFT or PROPOSED runs');
  return normalizeRun(result.rows[0]);
};

// =============================================================================
// QUERY METHODS
// =============================================================================

export const getPaymentRuns = async (
  filters: { status?: string; page: number; limit: number },
  pool?: pg.Pool
): Promise<{ data: PaymentRun[]; total: number }> => {
  const dbPool = pool || globalPool;
  let query = `SELECT * FROM payment_runs WHERE 1=1`;
  const params: unknown[] = [];
  let idx = 1;

  if (filters.status) { query += ` AND status = $${idx++}`; params.push(filters.status); }

  const countResult = await dbPool.query(query.replace('SELECT *', 'SELECT COUNT(*) as total'), params);
  const total = parseInt(countResult.rows[0].total);

  query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(filters.limit, (filters.page - 1) * filters.limit);

  const result = await dbPool.query(query, params);
  return { data: result.rows.map(normalizeRun), total };
};

export const getPaymentRunById = async (id: string, pool?: pg.Pool): Promise<PaymentRun> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(`SELECT * FROM payment_runs WHERE id = $1`, [id]);
  if (result.rows.length === 0) throw new NotFoundError('Payment run');
  return normalizeRun(result.rows[0]);
};

export const getPaymentRunItems = async (runId: string, pool?: pg.Pool): Promise<PaymentRunItem[]> => {
  const dbPool = pool || globalPool;
  const result = await dbPool.query(
    `SELECT pri.*, s."CompanyName" as supplier_name
     FROM payment_run_items pri
     JOIN suppliers s ON pri.supplier_id = s."Id"
     WHERE pri.payment_run_id = $1
     ORDER BY s."CompanyName"`,
    [runId]
  );
  return result.rows.map(normalizeItem);
};

// =============================================================================
// NORMALIZERS
// =============================================================================

function normalizeRun(row: Record<string, unknown>): PaymentRun {
  return {
    id: row.id as string,
    runNumber: row.run_number as string,
    runDate: row.run_date as string,
    paymentMethod: row.payment_method as string,
    status: row.status as PaymentRun['status'],
    totalAmount: Number(row.total_amount || 0),
    totalItems: Number(row.total_items || 0),
    bankAccountCode: row.bank_account_code as string | null,
    dueDateCutoff: row.due_date_cutoff as string | null,
    minAmount: Number(row.min_amount || 0),
    maxAmount: row.max_amount != null ? Number(row.max_amount) : null,
    notes: row.notes as string | null,
    proposedBy: row.proposed_by as string | null,
    approvedBy: row.approved_by as string | null,
    executedBy: row.executed_by as string | null,
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
  };
}

function normalizeItem(row: Record<string, unknown>): PaymentRunItem {
  return {
    id: row.id as string,
    paymentRunId: row.payment_run_id as string,
    supplierId: row.supplier_id as string,
    supplierName: row.supplier_name as string | undefined,
    invoiceId: row.invoice_id as string | null,
    amount: Number(row.amount),
    paymentReference: row.payment_reference as string | null,
    status: row.status as PaymentRunItem['status'],
    glTransactionId: row.gl_transaction_id as string | null,
    errorMessage: row.error_message as string | null,
  };
}
