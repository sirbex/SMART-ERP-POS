import type { Pool } from 'pg';
import Decimal from 'decimal.js';
import * as arPaymentRepository from './arPaymentRepository.js';
import * as openItemEngine from './openItemAllocationEngine.js';
import type { AllocationLineInput, AllocationType } from './openItemAllocationEngine.js';
import { invoiceRepository } from '../invoices/invoiceRepository.js';
import * as glEntryService from '../../services/glEntryService.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { checkAccountingPeriodOpen } from '../../utils/periodGuard.js';
import { ValidationError } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

export interface CreateArPaymentInput {
  customerId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  reference?: string;
  notes?: string;
  createdById: string;
  autoAllocate?: boolean;
  allocationType?: AllocationType;
  allocations?: AllocationLineInput[];
}

export async function createCustomerPayment(pool: Pool, input: CreateArPaymentInput) {
  const paymentAmount = new Decimal(input.amount);
  if (paymentAmount.lessThanOrEqualTo(0)) {
    throw new ValidationError('Payment amount must be greater than zero');
  }

  return UnitOfWork.run(pool, async (client) => {
    await checkAccountingPeriodOpen(client, input.paymentDate);

    await client.query(`SELECT id FROM customers WHERE id = $1 FOR UPDATE`, [input.customerId]);
    const cust = await client.query(`SELECT id, name FROM customers WHERE id = $1`, [
      input.customerId,
    ]);
    if (!cust.rows[0]) throw new ValidationError('Customer not found');
    const customerName = cust.rows[0].name as string;

    const paymentNumber = await arPaymentRepository.nextPaymentNumber(client);
    const payment = await arPaymentRepository.createPaymentHeader(client, {
      paymentNumber,
      customerId: input.customerId,
      paymentDate: input.paymentDate,
      paymentMethod: input.paymentMethod,
      totalAmount: paymentAmount.toNumber(),
      reference: input.reference,
      notes: input.notes,
      createdById: input.createdById,
    });

    await glEntryService.recordCustomerPaymentToGL(
      {
        paymentId: payment.id,
        paymentNumber: payment.paymentNumber,
        customerId: input.customerId,
        customerName,
        amount: paymentAmount.toNumber(),
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod,
        reducesAR: true,
      },
      pool,
      client,
    );

    let lines = input.allocations ?? [];
    if (input.autoAllocate && lines.length === 0) {
      const open = await openItemEngine.listOpenInvoicesForCustomer(client, input.customerId);
      lines = openItemEngine.buildFifoAllocations(open, paymentAmount);
    }

    const allocationResults =
      lines.length > 0
        ? await applyAllocations(client, {
            paymentId: payment.id,
            customerId: input.customerId,
            paymentDate: input.paymentDate,
            paymentMethod: input.paymentMethod,
            lines,
            allocationType: input.allocationType ?? (input.autoAllocate ? 'FIFO' : 'MANUAL'),
            createdById: input.createdById,
            processedById: input.createdById,
          })
        : [];

    await openItemEngine.syncCustomerBalanceFromOpenItems(
      client,
      input.customerId,
      'AR_PAYMENT_RECEIPT',
    );

    const updated = await arPaymentRepository.findPaymentById(client, payment.id);

    logger.info('AR customer payment posted', {
      paymentId: payment.id,
      paymentNumber,
      customerId: input.customerId,
      amount: paymentAmount.toNumber(),
      allocations: allocationResults.length,
    });

    return {
      payment: updated,
      allocations: allocationResults,
    };
  });
}

export async function allocatePayment(
  pool: Pool,
  paymentId: string,
  lines: AllocationLineInput[],
  options: {
    allocationType?: AllocationType;
    createdById: string;
    paymentMethod?: string;
    paymentDate?: string;
  },
) {
  return UnitOfWork.run(pool, async (client) => {
    const payment = await arPaymentRepository.findPaymentById(client, paymentId);
    if (!payment) throw new ValidationError('Payment not found');
    if (payment.status === 'REVERSED') {
      throw new ValidationError('Cannot allocate a reversed payment');
    }

    const paymentDate = options.paymentDate ?? payment.paymentDate;
    await checkAccountingPeriodOpen(client, paymentDate);

    const allocationType = options.allocationType ?? 'MANUAL';
    let allocLines = lines;
    if (allocLines.length === 0 && allocationType === 'FIFO') {
      const ledger = await openItemEngine.getPaymentLedger(client, paymentId);
      if (!ledger) throw new ValidationError('Payment not found');
      const open = await openItemEngine.listOpenInvoicesForCustomer(client, payment.customerId);
      allocLines = openItemEngine.buildFifoAllocations(open, ledger.unallocatedAmount);
    }
    if (!allocLines.length) {
      throw new ValidationError('No allocation lines — select invoices or use FIFO with open items');
    }

    const allocations = await applyAllocations(client, {
      paymentId,
      customerId: payment.customerId,
      paymentDate,
      paymentMethod: options.paymentMethod ?? payment.paymentMethod,
      lines: allocLines,
      allocationType,
      createdById: options.createdById,
      processedById: options.createdById,
    });

    await openItemEngine.syncCustomerBalanceFromOpenItems(
      client,
      payment.customerId,
      'AR_PAYMENT_ALLOCATE',
    );

    return {
      payment: await arPaymentRepository.findPaymentById(client, paymentId),
      allocations,
    };
  });
}

async function applyAllocations(
  client: import('pg').PoolClient,
  params: {
    paymentId: string;
    customerId: string;
    paymentDate: string;
    paymentMethod: string;
    lines: AllocationLineInput[];
    allocationType: AllocationType;
    createdById: string;
    processedById: string;
  },
) {
  const ledger = await openItemEngine.getPaymentLedger(client, params.paymentId);
  if (!ledger) throw new ValidationError('Payment not found');

  const invoiceOpenById = new Map<string, Decimal>();
  const invoiceCustomerById = new Map<string, string>();
  const invoiceStatusById = new Map<string, string>();

  for (const line of params.lines) {
    const inv = await client.query(
      `SELECT customer_id, status FROM invoices WHERE id = $1`,
      [line.invoiceId],
    );
    if (!inv.rows[0]) throw new ValidationError(`Invoice ${line.invoiceId} not found`);
    invoiceCustomerById.set(line.invoiceId, inv.rows[0].customer_id as string);
    invoiceStatusById.set(line.invoiceId, inv.rows[0].status as string);
    invoiceOpenById.set(line.invoiceId, await openItemEngine.getInvoiceOpenBalance(client, line.invoiceId));
  }

  openItemEngine.validateAllocationLines({
    paymentUnallocated: ledger.unallocatedAmount,
    lines: params.lines,
    invoiceOpenById,
    invoiceCustomerById,
    invoiceStatusById,
    customerId: params.customerId,
  });

  const results: arPaymentRepository.ArPaymentAllocation[] = [];

  for (const line of params.lines) {
    const ip = await invoiceRepository.addPayment(client, {
      invoiceId: line.invoiceId,
      amount: line.amount,
      paymentMethod: params.paymentMethod as 'CASH',
      paymentDate: params.paymentDate,
      processedById: params.processedById,
    });

    const alloc = await arPaymentRepository.createAllocationRow(client, {
      paymentId: params.paymentId,
      invoiceId: line.invoiceId,
      invoicePaymentId: ip.id,
      amount: line.amount,
      allocationType: params.allocationType,
      allocationDate: params.paymentDate,
      createdById: params.createdById,
    });

    await arPaymentRepository.bumpPaymentAllocated(client, params.paymentId, line.amount);
    await invoiceRepository.recalcInvoice(client, line.invoiceId);

    results.push(alloc);
  }

  return results;
}

export async function reverseAllocation(
  pool: Pool,
  allocationId: string,
  reversedById: string,
) {
  return UnitOfWork.run(pool, async (client) => {
    const allocRes = await client.query(
      `SELECT a.*, p.customer_id, p.payment_method, p.payment_date
       FROM ar_payment_allocations a
       JOIN ar_customer_payments p ON p.id = a.payment_id
       WHERE a.id = $1 AND a.status = 'ACTIVE'`,
      [allocationId],
    );
    if (!allocRes.rows[0]) throw new ValidationError('Active allocation not found');

    const row = allocRes.rows[0];
    await checkAccountingPeriodOpen(client, String(row.payment_date).slice(0, 10));

    // Immutable audit: keep invoice_payment row; settlement excludes non-ACTIVE allocations.
    await arPaymentRepository.reverseAllocation(client, allocationId, reversedById);
    await invoiceRepository.recalcInvoice(client, row.invoice_id as string);
    await openItemEngine.syncCustomerBalanceFromOpenItems(
      client,
      row.customer_id as string,
      'AR_ALLOCATION_REVERSAL',
    );

    return { success: true, allocationId };
  });
}

export async function getPaymentWithAllocations(pool: Pool, paymentId: string) {
  const payment = await arPaymentRepository.findPaymentById(pool, paymentId);
  if (!payment) return null;
  const allocations = await arPaymentRepository.findAllocationsByPaymentId(pool, paymentId);
  return { payment, allocations };
}

export async function listCustomerPayments(
  pool: Pool,
  filters: { customerId?: string; search?: string; limit?: number; offset?: number },
) {
  return arPaymentRepository.listPayments(pool, filters);
}

export async function listOpenInvoices(pool: Pool, customerId: string) {
  const client = await pool.connect();
  try {
    return openItemEngine.listOpenInvoicesForCustomer(client, customerId);
  } finally {
    client.release();
  }
}
