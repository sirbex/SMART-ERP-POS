import type { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';

export interface ArCustomerPayment {
  id: string;
  paymentNumber: string;
  customerId: string;
  paymentDate: string;
  paymentMethod: string;
  totalAmount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  status: string;
  reference: string | null;
  notes: string | null;
  createdById?: string | null;
  createdByName?: string | null;
}

export interface ArPaymentAllocation {
  id: string;
  paymentId: string;
  invoiceId: string;
  invoicePaymentId: string | null;
  amountAllocated: number;
  allocationType: string;
  status: string;
  allocationDate: string;
}

export async function nextPaymentNumber(client: PoolClient): Promise<string> {
  const seq = await client.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(payment_number FROM 'CRP-([0-9]+)') AS INTEGER)), 0) + 1 AS n
     FROM ar_customer_payments`,
  );
  const n = Number(seq.rows[0]?.n ?? 1);
  return `CRP-${String(n).padStart(6, '0')}`;
}

export async function createPaymentHeader(
  client: PoolClient,
  data: {
    paymentNumber: string;
    customerId: string;
    paymentDate: string;
    paymentMethod: string;
    totalAmount: number;
    reference?: string;
    notes?: string;
    createdById?: string;
    currencyCode?: string;
    exchangeRate?: number;
  },
): Promise<ArCustomerPayment> {
  const amt = new Decimal(data.totalAmount);
  const res = await client.query(
    `INSERT INTO ar_customer_payments (
       payment_number, customer_id, payment_method, currency_code, exchange_rate,
       payment_date, reference, notes, total_amount, allocated_amount, unallocated_amount,
       status, created_by_id, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$9,'POSTED',$10,NOW(),NOW())
     RETURNING *`,
    [
      data.paymentNumber,
      data.customerId,
      data.paymentMethod,
      data.currencyCode ?? 'UGX',
      data.exchangeRate ?? 1,
      data.paymentDate,
      data.reference ?? null,
      data.notes ?? null,
      amt.toNumber(),
      data.createdById ?? null,
    ],
  );
  return mapPayment(res.rows[0]);
}

export async function listPayments(
  client: Pool | PoolClient,
  filters: { customerId?: string; search?: string; limit?: number; offset?: number },
): Promise<(ArCustomerPayment & { customerName: string })[]> {
  const params: unknown[] = [];
  const conditions: string[] = [`p.status != 'REVERSED'`];
  if (filters.customerId) {
    params.push(filters.customerId);
    conditions.push(`p.customer_id = $${params.length}`);
  }
  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim()}%`);
    const i = params.length;
    conditions.push(
      `(p.payment_number ILIKE $${i} OR p.reference ILIKE $${i} OR c.name ILIKE $${i})`,
    );
  }
  const limit = Math.min(filters.limit ?? 100, 500);
  const offset = filters.offset ?? 0;
  params.push(limit, offset);

  const res = await client.query(
    `SELECT p.*, c.name AS customer_name,
            COALESCE(u.full_name, u.email, 'Unknown') AS created_by_name
     FROM ar_customer_payments p
     JOIN customers c ON c.id = p.customer_id
     LEFT JOIN users u ON u.id = p.created_by_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.payment_date DESC, p.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return res.rows.map((row) => ({
    ...mapPayment(row),
    customerName: row.customer_name as string,
    createdByName: row.created_by_name as string,
  }));
}

export async function findPaymentById(
  client: Pool | PoolClient,
  id: string,
): Promise<ArCustomerPayment | null> {
  const res = await client.query(`SELECT * FROM ar_customer_payments WHERE id = $1`, [id]);
  return res.rows[0] ? mapPayment(res.rows[0]) : null;
}

export async function findAllocationsByPaymentId(
  client: Pool | PoolClient,
  paymentId: string,
): Promise<ArPaymentAllocation[]> {
  const res = await client.query(
    `SELECT a.*, i.invoice_number
     FROM ar_payment_allocations a
     JOIN invoices i ON i.id = a.invoice_id
     WHERE a.payment_id = $1
     ORDER BY a.created_at ASC`,
    [paymentId],
  );
  return res.rows.map(mapAllocation);
}

export async function createAllocationRow(
  client: PoolClient,
  data: {
    paymentId: string;
    invoiceId: string;
    invoicePaymentId: string;
    amount: number;
    allocationType: string;
    allocationDate: string;
    createdById?: string;
  },
): Promise<ArPaymentAllocation> {
  const res = await client.query(
    `INSERT INTO ar_payment_allocations (
       payment_id, invoice_id, invoice_payment_id, amount_allocated,
       allocation_date, allocation_type, status, created_by_id, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE',$7,NOW(),NOW())
     RETURNING *`,
    [
      data.paymentId,
      data.invoiceId,
      data.invoicePaymentId,
      data.amount,
      data.allocationDate,
      data.allocationType,
      data.createdById ?? null,
    ],
  );
  return mapAllocation(res.rows[0]);
}

export async function bumpPaymentAllocated(
  client: PoolClient,
  paymentId: string,
  delta: number,
): Promise<void> {
  await client.query(
    `UPDATE ar_customer_payments
     SET allocated_amount = allocated_amount + $2,
         unallocated_amount = total_amount - (allocated_amount + $2),
         status = CASE
           WHEN total_amount - (allocated_amount + $2) <= 0.009 THEN 'FULLY_ALLOCATED'
           WHEN (allocated_amount + $2) > 0.009 THEN 'PARTIALLY_ALLOCATED'
           ELSE status
         END,
         updated_at = NOW()
     WHERE id = $1`,
    [paymentId, delta],
  );
}

export async function reverseAllocation(
  client: PoolClient,
  allocationId: string,
  reversedById: string,
): Promise<ArPaymentAllocation | null> {
  const cur = await client.query(
    `SELECT * FROM ar_payment_allocations WHERE id = $1 AND status = 'ACTIVE'`,
    [allocationId],
  );
  if (!cur.rows[0]) return null;

  const row = cur.rows[0];
  await client.query(
    `UPDATE ar_payment_allocations
     SET status = 'REVERSED', reversed_by_id = $2, reversed_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [allocationId, reversedById],
  );

  const amt = Number(row.amount_allocated);
  await bumpPaymentAllocated(client, row.payment_id as string, -amt);

  return mapAllocation({ ...row, status: 'REVERSED' });
}

function mapPayment(row: Record<string, unknown>): ArCustomerPayment {
  return {
    id: row.id as string,
    paymentNumber: row.payment_number as string,
    customerId: row.customer_id as string,
    paymentDate: String(row.payment_date).slice(0, 10),
    paymentMethod: row.payment_method as string,
    totalAmount: Number(row.total_amount),
    allocatedAmount: Number(row.allocated_amount),
    unallocatedAmount: Number(row.unallocated_amount),
    status: row.status as string,
    reference: (row.reference as string) ?? null,
    notes: (row.notes as string) ?? null,
    createdById: (row.created_by_id as string) ?? null,
    createdByName: (row.created_by_name as string) ?? undefined,
  };
}

function mapAllocation(row: Record<string, unknown>): ArPaymentAllocation {
  return {
    id: row.id as string,
    paymentId: row.payment_id as string,
    invoiceId: row.invoice_id as string,
    invoicePaymentId: (row.invoice_payment_id as string) ?? null,
    amountAllocated: Number(row.amount_allocated),
    allocationType: row.allocation_type as string,
    status: row.status as string,
    allocationDate: String(row.allocation_date).slice(0, 10),
  };
}
