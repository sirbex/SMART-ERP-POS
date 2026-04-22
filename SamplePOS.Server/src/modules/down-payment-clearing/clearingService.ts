/**
 * Down Payment Clearing Service — SAP-Style Clearing Logic
 *
 * Handles 3 clearing cases:
 *   Case A: Apply deposit to invoice (DR Customer Deposits / CR AR)
 *   Case B: Cash payment to invoice (DR Cash / CR AR) — delegates to invoiceService
 *   Case C: Mixed (deposit + cash for same invoice)
 *
 * System NEVER auto-clears. Accountant must explicitly choose.
 */

import { Pool } from 'pg';
import Decimal from 'decimal.js';
import * as clearingRepo from './clearingRepository.js';
import * as glEntryService from '../../services/glEntryService.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { Money } from '../../utils/money.js';
import { getBusinessDate } from '../../utils/dateRange.js';
import logger from '../../utils/logger.js';

// ── Types ───────────────────────────────────────────────────

export interface Clearing {
  id: string;
  clearingNumber: string;
  downPaymentId: string;
  invoiceId: string;
  amount: number;
  clearedBy: string | null;
  notes: string | null;
  createdAt: string;
  depositNumber?: string;
  invoiceNumber?: string;
  customerId?: string;
  customerName?: string;
}

export interface OpenInvoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  totalAmount: number;
  amountPaid: number;
  outstandingBalance: number;
  issueDate: string;
  dueDate: string | null;
  status: string;
}

export interface OpenDeposit {
  id: string;
  depositNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  amountUsed: number;
  amountAvailable: number;
  paymentMethod: string;
  createdAt: string;
}

export interface ClearingInput {
  customerId: string;
  invoiceId: string;
  depositAllocations: Array<{
    depositId: string;
    amount: number;
  }>;
  cashPayment?: {
    amount: number;
    paymentMethod: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER';
    referenceNumber?: string;
  };
  notes?: string;
  clearedBy?: string;
}

export interface DepositLiability {
  customerId: string;
  customerName: string;
  totalDeposited: number;
  totalCleared: number;
  totalRemaining: number;
  activeDepositCount: number;
}

// ── Normalize Helpers ───────────────────────────────────────

function normalizeClearing(row: clearingRepo.ClearingDbRow): Clearing {
  return {
    id: row.id,
    clearingNumber: row.clearing_number,
    downPaymentId: row.down_payment_id,
    invoiceId: row.invoice_id,
    amount: Money.toNumber(Money.parseDb(row.amount)),
    clearedBy: row.cleared_by,
    notes: row.notes,
    createdAt: row.created_at,
    depositNumber: row.deposit_number,
    invoiceNumber: row.invoice_number,
    customerId: row.customer_id,
    customerName: row.customer_name,
  };
}

function normalizeOpenInvoice(row: clearingRepo.OpenInvoiceDbRow): OpenInvoice {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    customerId: row.customer_id,
    customerName: row.customer_name,
    totalAmount: Money.toNumber(Money.parseDb(row.total_amount)),
    amountPaid: Money.toNumber(Money.parseDb(row.amount_paid)),
    outstandingBalance: Money.toNumber(Money.parseDb(row.outstanding_balance)),
    issueDate: row.issue_date,
    dueDate: row.due_date,
    status: row.status,
  };
}

function normalizeOpenDeposit(row: clearingRepo.OpenDepositDbRow): OpenDeposit {
  return {
    id: row.id,
    depositNumber: row.deposit_number,
    customerId: row.customer_id,
    customerName: row.customer_name,
    amount: Money.toNumber(Money.parseDb(row.amount)),
    amountUsed: Money.toNumber(Money.parseDb(row.amount_used)),
    amountAvailable: Money.toNumber(Money.parseDb(row.amount_available)),
    paymentMethod: row.payment_method,
    createdAt: row.created_at,
  };
}

// ── Service Methods ─────────────────────────────────────────

/**
 * Get clearing screen data — open invoices + open deposits for a customer
 */
export async function getClearingScreenData(
  pool: Pool,
  customerId: string
): Promise<{ invoices: OpenInvoice[]; deposits: OpenDeposit[] }> {
  const [invoiceRows, depositRows] = await Promise.all([
    clearingRepo.getOpenInvoicesForCustomer(pool, customerId),
    clearingRepo.getOpenDepositsForCustomer(pool, customerId),
  ]);

  return {
    invoices: invoiceRows.map(normalizeOpenInvoice),
    deposits: depositRows.map(normalizeOpenDeposit),
  };
}

/**
 * Process clearing — the main SAP-style clearing operation
 *
 * ALL writes happen in ONE atomic transaction:
 * 1. Creates clearing records for each deposit allocation
 * 2. Reduces deposit balances
 * 3. Inserts invoice_payments rows (so recalcInvoice stays consistent)
 * 4. Handles optional cash payment in same transaction
 * 5. Recalculates invoice balance from SUM(invoice_payments)
 * 6. Syncs customer balance
 *
 * GL entries are posted AFTER the transaction (idempotent via keys).
 */
export async function processClearing(
  pool: Pool,
  input: ClearingInput
): Promise<{ clearings: Clearing[]; cashPaymentId?: string; totalCleared: number }> {
  const businessDate = getBusinessDate();

  // ── Pre-validation (read-only, outside transaction) ──────

  // 1. Validate invoice exists and has outstanding balance
  const invoiceRows = await clearingRepo.getOpenInvoicesForCustomer(pool, input.customerId);
  const targetInvoice = invoiceRows.find(i => i.id === input.invoiceId);
  if (!targetInvoice) {
    throw new Error(`Invoice ${input.invoiceId} not found or has no outstanding balance for customer ${input.customerId}`);
  }
  const invoiceOutstanding = Money.parseDb(targetInvoice.outstanding_balance);

  // 2. Calculate total deposit allocation
  let totalDepositAllocation = new Decimal(0);
  for (const alloc of input.depositAllocations) {
    if (alloc.amount <= 0) {
      throw new Error('Deposit allocation amount must be positive');
    }
    totalDepositAllocation = totalDepositAllocation.plus(alloc.amount);
  }

  // 3. Calculate total cash
  const cashAmount = input.cashPayment ? new Decimal(input.cashPayment.amount) : new Decimal(0);
  if (input.cashPayment && cashAmount.lessThanOrEqualTo(0)) {
    throw new Error('Cash payment amount must be positive');
  }

  // 4. Validate total does not exceed outstanding
  const totalClearing = totalDepositAllocation.plus(cashAmount);
  if (totalClearing.greaterThan(invoiceOutstanding)) {
    throw new Error(
      `Total clearing ${totalClearing.toFixed(2)} exceeds invoice outstanding balance ${invoiceOutstanding.toFixed(2)}`
    );
  }

  // 5. Validate each deposit has sufficient balance
  if (input.depositAllocations.length > 0) {
    const depositRows = await clearingRepo.getOpenDepositsForCustomer(pool, input.customerId);
    const depositMap = new Map(depositRows.map(d => [d.id, d]));

    for (const alloc of input.depositAllocations) {
      const deposit = depositMap.get(alloc.depositId);
      if (!deposit) {
        throw new Error(`Deposit ${alloc.depositId} not found or not active for customer ${input.customerId}`);
      }
      const available = Money.parseDb(deposit.amount_available);
      if (available.lessThan(alloc.amount)) {
        throw new Error(
          `Deposit ${deposit.deposit_number} has ${available.toFixed(2)} available, but ${alloc.amount} was requested`
        );
      }
    }
  }

  // Must have at least one allocation method
  if (input.depositAllocations.length === 0 && !input.cashPayment) {
    throw new Error('At least one deposit allocation or cash payment is required');
  }

  // ── Execute ALL writes atomically ────────────────────────

  const clearings: Clearing[] = [];
  let cashPaymentId: string | undefined;
  let cashReceiptNumber: string | undefined;

  await UnitOfWork.run(pool, async (client) => {
    // Step 1: Process each deposit allocation
    for (const alloc of input.depositAllocations) {
      const clearingNumber = await clearingRepo.generateClearingNumber(client);

      // Create clearing record
      const clearingRow = await clearingRepo.createClearing(client, {
        clearingNumber,
        downPaymentId: alloc.depositId,
        invoiceId: input.invoiceId,
        amount: alloc.amount,
        clearedBy: input.clearedBy,
        notes: input.notes,
      });

      // Reduce deposit balance (validates sufficient balance with WHERE clause)
      await clearingRepo.reduceDepositBalance(client, alloc.depositId, alloc.amount);

      // Insert invoice_payments row so recalcInvoice includes this amount
      await clearingRepo.insertClearingPayment(client, {
        invoiceId: input.invoiceId,
        amount: alloc.amount,
        clearingNumber,
        clearedBy: input.clearedBy,
        paymentDate: businessDate,
      });

      clearings.push(normalizeClearing(clearingRow));

      logger.info('Deposit clearing created', {
        clearingNumber,
        depositId: alloc.depositId,
        invoiceId: input.invoiceId,
        amount: alloc.amount,
      });
    }

    // Step 2: Insert cash payment into invoice_payments (same transaction)
    if (input.cashPayment) {
      const cashResult = await clearingRepo.insertCashPayment(client, {
        invoiceId: input.invoiceId,
        amount: input.cashPayment.amount,
        paymentMethod: input.cashPayment.paymentMethod,
        referenceNumber: input.cashPayment.referenceNumber,
        clearedBy: input.clearedBy,
        paymentDate: businessDate,
        clearingNumber: clearings[0]?.clearingNumber || 'CLR-CASH',
      });
      cashPaymentId = cashResult.id;
      cashReceiptNumber = cashResult.receiptNumber;

      logger.info('Cash payment inserted for clearing', {
        paymentId: cashPaymentId,
        receiptNumber: cashReceiptNumber,
        amount: input.cashPayment.amount,
        method: input.cashPayment.paymentMethod,
      });
    }

    // Step 3: Recalculate invoice balance from SUM(invoice_payments) — single source of truth
    await clearingRepo.recalcInvoiceBalance(client, input.invoiceId);

    // Step 4: Sync customer balance (derives from outstanding invoices)
    await clearingRepo.syncCustomerBalance(client, input.customerId);

    // Step 5: GL entries INSIDE transaction — atomic with clearing
    // GL for deposit clearings: DR Customer Deposits (2200) / CR AR (1200)
    for (const clearing of clearings) {
      await glEntryService.recordDownPaymentClearingToGL({
        clearingId: clearing.id,
        clearingNumber: clearing.clearingNumber,
        clearingDate: businessDate,
        amount: clearing.amount,
        depositNumber: clearing.depositNumber || '',
        invoiceNumber: targetInvoice.invoice_number,
        customerId: input.customerId,
        customerName: targetInvoice.customer_name || '',
      }, pool, client);
    }

    // GL for cash payment: DR Cash/Bank / CR AR (1200)
    if (input.cashPayment && cashPaymentId && cashReceiptNumber) {
      await glEntryService.recordInvoicePaymentToGL({
        paymentId: cashPaymentId,
        receiptNumber: cashReceiptNumber,
        paymentDate: businessDate,
        amount: input.cashPayment.amount,
        paymentMethod: input.cashPayment.paymentMethod,
        invoiceId: input.invoiceId,
        invoiceNumber: targetInvoice.invoice_number,
      }, pool, client);
    }
  });

  return {
    clearings,
    cashPaymentId,
    totalCleared: Money.toNumber(totalClearing),
  };
}

/**
 * Get clearing history for an invoice
 */
export async function getClearingsForInvoice(
  pool: Pool,
  invoiceId: string
): Promise<Clearing[]> {
  const rows = await clearingRepo.getClearingsForInvoice(pool, invoiceId);
  return rows.map(normalizeClearing);
}

/**
 * Get clearing history for a deposit
 */
export async function getClearingsForDeposit(
  pool: Pool,
  depositId: string
): Promise<Clearing[]> {
  const rows = await clearingRepo.getClearingsForDeposit(pool, depositId);
  return rows.map(normalizeClearing);
}

/**
 * List all clearings (paginated)
 */
export async function listClearings(
  pool: Pool,
  options: { customerId?: string; page?: number; limit?: number }
): Promise<{ clearings: Clearing[]; total: number; page: number; limit: number; totalPages: number }> {
  const page = options.page || 1;
  const limit = options.limit || 20;
  const offset = (page - 1) * limit;

  const { rows, count } = await clearingRepo.listClearings(pool, {
    customerId: options.customerId,
    limit,
    offset,
  });

  return {
    clearings: rows.map(normalizeClearing),
    total: count,
    page,
    limit,
    totalPages: Math.ceil(count / limit),
  };
}

/**
 * Deposit liability report — total open deposits per customer
 */
export async function getDepositLiabilityReport(
  pool: Pool
): Promise<DepositLiability[]> {
  const rows = await clearingRepo.getDepositLiabilityReport(pool);
  return rows.map(r => ({
    customerId: r.customer_id,
    customerName: r.customer_name,
    totalDeposited: Money.toNumber(Money.parseDb(r.total_deposited)),
    totalCleared: Money.toNumber(Money.parseDb(r.total_cleared)),
    totalRemaining: Money.toNumber(Money.parseDb(r.total_remaining)),
    activeDepositCount: r.active_deposit_count,
  }));
}
