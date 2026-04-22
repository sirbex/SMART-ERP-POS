import { Pool, PoolClient } from 'pg';
import { Money } from '../../utils/money.js';
import { checkAccountingPeriodOpen } from '../../utils/periodGuard.js';
import { getBusinessYear, getBusinessDate, formatDateBusiness } from '../../utils/dateRange.js';

// Normalize snake_case database columns to InvoiceRecord
function normalizeInvoiceRow(row: Record<string, unknown>): InvoiceRecord {
  const status = String(row.status || 'UNPAID').toUpperCase();
  return {
    id: row.id as string,
    invoice_number: row.invoice_number as string,
    customer_id: row.customer_id as string,
    sale_id: (row.sale_id as string) || null,
    issue_date: row.issue_date as Date,
    due_date: row.due_date as Date,
    status: status === 'PAID' ? 'PAID' : status === 'PARTIALLY_PAID' ? 'PARTIALLY_PAID' : 'UNPAID',
    subtotal: row.subtotal as number,
    tax_amount: row.tax_amount as number,
    total_amount: row.total_amount as number,
    amount_paid: row.amount_paid as number,
    balance: row.amount_due as number,
    notes: (row.notes as string) || null,
    created_by_id: (row.created_by_id as string) || null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

export interface InvoiceRecord {
  id: string;
  invoice_number: string;
  customer_id: string;
  sale_id: string | null;
  issue_date: Date;
  due_date: Date | null;
  status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
  payment_method?: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CREDIT' | 'DEPOSIT' | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  balance: number;
  notes: string | null;
  created_by_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface InvoicePaymentRecord {
  id: string;
  receipt_number: string;
  invoice_id: string;
  payment_date: Date;
  payment_method: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CREDIT' | 'DEPOSIT';
  amount: number;
  reference_number: string | null;
  notes: string | null;
  processed_by_id: string | null;
  created_at: Date;
}

export const invoiceRepository = {
  async findBySaleId(pool: Pool | PoolClient, saleId: string): Promise<InvoiceRecord | null> {
    const res = await pool.query('SELECT * FROM invoices WHERE sale_id = $1 LIMIT 1', [saleId]);
    return res.rows[0] ? normalizeInvoiceRow(res.rows[0]) : null;
  },
  async generateInvoiceNumber(pool: Pool | PoolClient): Promise<string> {
    const year = getBusinessYear();
    // Advisory lock prevents concurrent duplicate invoice number generation
    // NOTE: Only fully effective when caller wraps in a transaction (passes client as pool)
    await pool.query(`SELECT pg_advisory_xact_lock(hashtext('invoice_number_seq'))`);
    const result = await pool.query(
      `SELECT invoice_number FROM invoices 
       WHERE invoice_number LIKE $1 
       ORDER BY invoice_number DESC 
       LIMIT 1`,
      [`INV-${year}-%`]
    );

    if (result.rows.length === 0) {
      return `INV-${year}-0001`;
    }

    const last = result.rows[0].invoice_number as string;
    const seq = parseInt(last.split('-')[2]) + 1;
    return `INV-${year}-${seq.toString().padStart(4, '0')}`;
  },

  async generateReceiptNumber(pool: Pool | PoolClient): Promise<string> {
    const year = getBusinessYear();
    // Advisory lock prevents concurrent duplicate receipt number generation
    // NOTE: Only fully effective when caller wraps in a transaction (passes client as pool)
    await pool.query(`SELECT pg_advisory_xact_lock(hashtext('receipt_number_seq'))`);
    const result = await pool.query(
      `SELECT receipt_number FROM invoice_payments 
       WHERE receipt_number LIKE $1 
       ORDER BY receipt_number DESC 
       LIMIT 1`,
      [`RCPT-${year}-%`]
    );

    if (result.rows.length === 0) {
      return `RCPT-${year}-0001`;
    }

    const last = result.rows[0].receipt_number as string;
    const seq = parseInt(last.split('-')[2]) + 1;
    return `RCPT-${year}-${seq.toString().padStart(4, '0')}`;
  },

  async createInvoice(
    pool: Pool | PoolClient,
    data: {
      customerId: string;
      customerName: string;
      saleId?: string | null;
      quoteId?: string | null;
      issueDate?: string | Date | null;
      dueDate?: string | Date | null;
      subtotal: number;
      taxAmount: number;
      totalAmount: number;
      notes?: string | null;
      createdById?: string | null;
    }
  ): Promise<InvoiceRecord> {
    const invoiceNumber = await this.generateInvoiceNumber(pool);

    const now = new Date();

    const result = await pool.query(
      `INSERT INTO invoices (
        invoice_number, customer_id, customer_name, sale_id, issue_date, due_date,
        subtotal, tax_amount, total_amount, amount_paid, amount_due, 
        notes, status, payment_terms, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$9,$10,'DRAFT',30,$11,$11)
      RETURNING *`,
      [
        invoiceNumber,
        data.customerId,
        data.customerName,
        data.saleId || null,
        data.issueDate || getBusinessDate(),
        data.dueDate || (() => { const d = new Date(getBusinessDate() + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 30); return formatDateBusiness(d); })(),
        data.subtotal,
        data.taxAmount,
        data.totalAmount,
        data.notes || null,
        now,
      ]
    );
    return normalizeInvoiceRow(result.rows[0]);
  },

  /**
   * Create invoice from sale (for quote conversion)
   */
  async createInvoiceFromSale(
    pool: Pool | PoolClient,
    data: {
      saleId: string;
      saleNumber: string;
      customerId: string;
      customerName: string;
      totalAmount: number;
      quoteId?: string | null;
    }
  ): Promise<InvoiceRecord> {
    const invoiceNumber = await this.generateInvoiceNumber(pool);

    const now = new Date();

    const result = await pool.query(
      `INSERT INTO invoices (
        invoice_number, customer_id, customer_name, sale_id, issue_date, due_date,
        subtotal, tax_amount, total_amount, amount_paid, amount_due, 
        notes, status, payment_terms, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,NOW(),NOW() + INTERVAL '30 days',
                $5, 0, $5, 0, $5, $6, 'DRAFT', 30, $7, $7)
      RETURNING *`,
      [
        invoiceNumber,
        data.customerId,
        data.customerName,
        data.saleId,
        data.totalAmount,
        `Invoice for sale ${data.saleNumber}`,
        now,
      ]
    );
    return normalizeInvoiceRow(result.rows[0]);
  },

  async getInvoiceById(pool: Pool | PoolClient, id: string): Promise<InvoiceRecord | null> {
    const result = await pool.query(
      `SELECT i.* FROM invoices i 
       WHERE i.id = $1`,
      [id]
    );

    if (!result.rows[0]) return null;
    return normalizeInvoiceRow(result.rows[0]);
  },

  async listInvoices(
    pool: Pool | PoolClient,
    page: number,
    limit: number,
    filters?: { customerId?: string; status?: string }
  ): Promise<{ invoices: InvoiceRecord[]; total: number }> {
    const offset = (page - 1) * limit;
    const where: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters?.customerId) {
      where.push(`i.customer_id = $${idx++}`);
      values.push(filters.customerId);
    }
    if (filters?.status) {
      where.push(`i.status = $${idx++}`);
      values.push(filters.status);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRes = await pool.query(`SELECT COUNT(*) FROM invoices i ${whereClause}`, values);
    const res = await pool.query(
      `SELECT i.* FROM invoices i 
       ${whereClause} 
       ORDER BY i.created_at DESC 
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset]
    );

    return {
      invoices: res.rows.map(normalizeInvoiceRow),
      total: parseInt(countRes.rows[0].count)
    };
  },

  async addPayment(
    pool: Pool | PoolClient,
    data: {
      invoiceId: string;
      amount: number;
      paymentMethod: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CREDIT' | 'DEPOSIT';
      paymentDate?: Date | string | null;
      referenceNumber?: string | null;
      notes?: string | null;
      processedById?: string | null;
    }
  ): Promise<InvoicePaymentRecord> {
    const receiptNumber = await this.generateReceiptNumber(pool);

    // Period enforcement (replaces trg_enforce_period_invoice_payments)
    const periodDate = typeof data.paymentDate === 'string'
      ? data.paymentDate
      : (data.paymentDate ? formatDateBusiness(data.paymentDate instanceof Date ? data.paymentDate : new Date(data.paymentDate)) : getBusinessDate());
    await checkAccountingPeriodOpen(pool, periodDate);

    // invoice_payments table has lowercase columns with uuid_generate_v4() default for id
    const res = await pool.query(
      `INSERT INTO invoice_payments (
        receipt_number, invoice_id, payment_date, payment_method, amount, reference_number, notes, processed_by_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *`,
      [
        receiptNumber,
        data.invoiceId,
        data.paymentDate || new Date(),
        data.paymentMethod,
        data.amount,
        data.referenceNumber || null,
        data.notes || null,
        data.processedById || null,
      ]
    );
    return res.rows[0];
  },

  async listPayments(pool: Pool | PoolClient, invoiceId: string, limit = 200): Promise<InvoicePaymentRecord[]> {
    const res = await pool.query(
      'SELECT * FROM invoice_payments WHERE invoice_id = $1 ORDER BY created_at ASC LIMIT $2',
      [invoiceId, limit]
    );
    return res.rows;
  },

  /**
   * Recalculate and persist aggregate payment metrics & status for an invoice.
   */
  async recalcInvoice(pool: Pool | PoolClient, invoiceId: string): Promise<InvoiceRecord | null> {
    const payAgg = await pool.query(
      'SELECT COALESCE(SUM(amount),0) AS amount_paid FROM invoice_payments WHERE invoice_id = $1',
      [invoiceId]
    );
    const amountPaid = Money.toNumber(Money.parseDb(payAgg.rows[0].amount_paid));
    const updated = await pool.query(
      `UPDATE invoices
         SET amount_paid = $1,
             amount_due = GREATEST(total_amount - $1, 0),
             status = (
                        CASE
                          WHEN GREATEST(total_amount - $1, 0) = 0 AND $1 > 0 THEN 'PAID'
                          WHEN GREATEST(total_amount - $1, 0) > 0 AND $1 > 0 THEN 'PARTIALLY_PAID'
                          ELSE 'UNPAID'
                        END
                      ),
             updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [amountPaid, invoiceId]
    );
    return updated.rows[0] ? normalizeInvoiceRow(updated.rows[0]) : null;
  },
};
