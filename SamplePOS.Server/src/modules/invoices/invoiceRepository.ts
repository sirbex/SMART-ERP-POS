import { Pool } from 'pg';

// Helper to normalize Pascal case database columns to camelCase
function normalizeInvoiceRow(row: any): InvoiceRecord {
  return {
    id: row.Id,
    invoice_number: row.InvoiceNumber,
    customer_id: row.CustomerId,
    sale_id: row.SaleId,
    issue_date: row.InvoiceDate,
    due_date: row.DueDate,
    status: row.Status.toUpperCase() === 'PAID' ? 'PAID' : row.Status.toUpperCase() === 'PARTIALLYPAID' ? 'PARTIALLY_PAID' : 'UNPAID',
    subtotal: row.Subtotal,
    tax_amount: row.TaxAmount,
    total_amount: row.TotalAmount,
    amount_paid: row.AmountPaid,
    balance: row.OutstandingBalance,
    notes: row.Notes,
    created_by_id: null,
    created_at: row.CreatedAt,
    updated_at: row.UpdatedAt,
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
  async findBySaleId(pool: Pool, saleId: string): Promise<InvoiceRecord | null> {
    const res = await pool.query('SELECT * FROM invoices WHERE "SaleId" = $1 LIMIT 1', [saleId]);
    return res.rows[0] ? normalizeInvoiceRow(res.rows[0]) : null;
  },
  async generateInvoiceNumber(pool: Pool): Promise<string> {
    const year = new Date().getFullYear();
    const result = await pool.query(
      `SELECT "InvoiceNumber" FROM invoices 
       WHERE "InvoiceNumber" LIKE $1 
       ORDER BY "InvoiceNumber" DESC 
       LIMIT 1`,
      [`INV-${year}-%`]
    );

    if (result.rows.length === 0) {
      return `INV-${year}-0001`;
    }

    const last = result.rows[0].InvoiceNumber as string;
    const seq = parseInt(last.split('-')[2]) + 1;
    return `INV-${year}-${seq.toString().padStart(4, '0')}`;
  },

  async generateReceiptNumber(pool: Pool): Promise<string> {
    const year = new Date().getFullYear();
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
    pool: Pool,
    data: {
      customerId: string;
      customerName: string;
      saleId?: string | null;
      quoteId?: string | null;
      issueDate?: Date | null;
      dueDate?: Date | null;
      subtotal: number;
      taxAmount: number;
      totalAmount: number;
      notes?: string | null;
      createdById?: string | null;
    }
  ): Promise<InvoiceRecord> {
    const invoiceNumber = await this.generateInvoiceNumber(pool);

    // Generate UUID for Id column (EF Core/C# convention - no default in database)
    const uuidResult = await pool.query('SELECT gen_random_uuid() as id');
    const invoiceId = uuidResult.rows[0].id;
    const now = new Date();

    const result = await pool.query(
      `INSERT INTO invoices (
        "Id", "InvoiceNumber", "CustomerId", "CustomerName", "SaleId", "InvoiceDate", "DueDate",
        "Subtotal", "TaxAmount", "TotalAmount", "AmountPaid", "OutstandingBalance", 
        "Notes", "Status", "PaymentTerms", "CreatedAt", "UpdatedAt"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$10,$11,'Draft',30,$12,$12)
      RETURNING *`,
      [
        invoiceId,
        invoiceNumber,
        data.customerId,
        data.customerName,
        data.saleId || null,
        data.issueDate || now,
        data.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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
    pool: Pool,
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

    // Generate UUID for Id column (EF Core/C# convention - no default in database)
    const uuidResult = await pool.query('SELECT gen_random_uuid() as id');
    const invoiceId = uuidResult.rows[0].id;
    const now = new Date();

    const result = await pool.query(
      `INSERT INTO invoices (
        "Id", "InvoiceNumber", "CustomerId", "CustomerName", "SaleId", "InvoiceDate", "DueDate",
        "Subtotal", "TaxAmount", "TotalAmount", "AmountPaid", "OutstandingBalance", 
        "Notes", "Status", "PaymentTerms", "CreatedAt", "UpdatedAt"
      ) VALUES ($1,$2,$3,$4,$5,NOW(),NOW() + INTERVAL '30 days',
                $6, 0, $6, 0, $6, $7, 'Draft', 30, $8, $8)
      RETURNING *`,
      [
        invoiceId,
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

  async getInvoiceById(pool: Pool, id: string): Promise<InvoiceRecord | null> {
    const result = await pool.query(
      `SELECT i.* FROM invoices i 
       WHERE i."Id" = $1`,
      [id]
    );

    if (!result.rows[0]) return null;
    return normalizeInvoiceRow(result.rows[0]);
  },

  async listInvoices(
    pool: Pool,
    page: number,
    limit: number,
    filters?: { customerId?: string; status?: string }
  ): Promise<{ invoices: InvoiceRecord[]; total: number }> {
    const offset = (page - 1) * limit;
    const where: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (filters?.customerId) {
      where.push(`i."CustomerId" = $${idx++}`);
      values.push(filters.customerId);
    }
    if (filters?.status) {
      where.push(`i."Status" = $${idx++}`);
      values.push(filters.status);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRes = await pool.query(`SELECT COUNT(*) FROM invoices i ${whereClause}`, values);
    const res = await pool.query(
      `SELECT i.* FROM invoices i 
       ${whereClause} 
       ORDER BY i."CreatedAt" DESC 
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset]
    );

    return {
      invoices: res.rows.map(normalizeInvoiceRow),
      total: parseInt(countRes.rows[0].count)
    };
  },

  async addPayment(
    pool: Pool,
    data: {
      invoiceId: string;
      amount: number;
      paymentMethod: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CREDIT' | 'DEPOSIT';
      paymentDate?: Date | null;
      referenceNumber?: string | null;
      notes?: string | null;
      processedById?: string | null;
    }
  ): Promise<InvoicePaymentRecord> {
    const receiptNumber = await this.generateReceiptNumber(pool);

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

  async listPayments(pool: Pool, invoiceId: string): Promise<InvoicePaymentRecord[]> {
    const res = await pool.query(
      'SELECT * FROM invoice_payments WHERE invoice_id = $1 ORDER BY created_at ASC',
      [invoiceId]
    );
    return res.rows;
  },

  /**
   * Recalculate and persist aggregate payment metrics & status for an invoice.
   */
  async recalcInvoice(pool: Pool, invoiceId: string): Promise<InvoiceRecord | null> {
    const payAgg = await pool.query(
      'SELECT COALESCE(SUM(amount),0) AS amount_paid FROM invoice_payments WHERE invoice_id = $1',
      [invoiceId]
    );
    const amountPaid = parseFloat(payAgg.rows[0].amount_paid);
    const updated = await pool.query(
      `UPDATE invoices
         SET "AmountPaid" = $1,
             "OutstandingBalance" = GREATEST("TotalAmount" - $1, 0),
             "Status" = (
                        CASE
                          WHEN GREATEST("TotalAmount" - $1, 0) = 0 AND $1 > 0 THEN 'Paid'
                          WHEN GREATEST("TotalAmount" - $1, 0) > 0 AND $1 > 0 THEN 'PartiallyPaid'
                          ELSE 'Unpaid'
                        END
                      ),
             "UpdatedAt" = NOW()
       WHERE "Id" = $2
       RETURNING *`,
      [amountPaid, invoiceId]
    );
    return updated.rows[0] ? normalizeInvoiceRow(updated.rows[0]) : null;
  },
};
