/**
 * Sale tax restatement — data access (omit-VAT / document-tax correction).
 * All updates RETURNING / rowCount-checked — never silent no-op writes.
 */
import type { Pool, PoolClient } from 'pg';

export type TaxRestatementSaleRow = {
  id: string;
  saleNumber: string;
  status: string;
  customerId: string | null;
  customerName: string | null;
  paymentMethod: string | null;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  saleDate: string;
};

export type TaxRestatementSaleItemRow = {
  id: string;
  productId: string | null;
  productName: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  totalPrice: number;
  taxAmount: number;
  taxRate: number;
  isTaxable: boolean;
  taxDetermination: string | null;
};

export type TaxRestatementInvoiceRow = {
  id: string;
  invoiceNumber: string;
  status: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
};

const SALE_SELECT = `SELECT s.id::text AS id,
              s.sale_number AS "saleNumber",
              s.status,
              s.customer_id::text AS "customerId",
              c.name AS "customerName",
              s.payment_method AS "paymentMethod",
              COALESCE(s.subtotal, 0)::float8 AS subtotal,
              COALESCE(s.tax_amount, 0)::float8 AS "taxAmount",
              COALESCE(s.total_amount, 0)::float8 AS "totalAmount",
              COALESCE(s.amount_paid, 0)::float8 AS "amountPaid",
              s.sale_date::text AS "saleDate"
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id`;

export const saleTaxRestatementRepository = {
  async getSale(pool: Pool | PoolClient, saleId: string): Promise<TaxRestatementSaleRow | null> {
    const result = await pool.query(`${SALE_SELECT} WHERE s.id = $1::uuid`, [saleId]);
    return (result.rows[0] as TaxRestatementSaleRow) ?? null;
  },

  async lockSaleForUpdate(
    client: PoolClient,
    saleId: string,
  ): Promise<TaxRestatementSaleRow | null> {
    const result = await client.query(
      `${SALE_SELECT} WHERE s.id = $1::uuid FOR UPDATE OF s`,
      [saleId],
    );
    return (result.rows[0] as TaxRestatementSaleRow) ?? null;
  },

  async getSaleItems(
    pool: Pool | PoolClient,
    saleId: string,
  ): Promise<TaxRestatementSaleItemRow[]> {
    const result = await pool.query(
      `SELECT si.id::text AS id,
              si.product_id::text AS "productId",
              si.product_name AS "productName",
              COALESCE(si.quantity, 0)::float8 AS quantity,
              COALESCE(si.unit_price, 0)::float8 AS "unitPrice",
              COALESCE(si.discount_amount, 0)::float8 AS "discountAmount",
              COALESCE(si.total_price, 0)::float8 AS "totalPrice",
              COALESCE(si.tax_amount, 0)::float8 AS "taxAmount",
              COALESCE(si.tax_rate, 0)::float8 AS "taxRate",
              COALESCE(si.is_taxable, false) AS "isTaxable",
              si.tax_determination AS "taxDetermination"
       FROM sale_items si
       WHERE si.sale_id = $1::uuid
       ORDER BY si.created_at NULLS LAST, si.id`,
      [saleId],
    );
    return result.rows as TaxRestatementSaleItemRow[];
  },

  async getLinkedInvoices(
    pool: Pool | PoolClient,
    saleId: string,
  ): Promise<TaxRestatementInvoiceRow[]> {
    const result = await pool.query(
      `SELECT i.id::text AS id,
              i.invoice_number AS "invoiceNumber",
              i.status,
              COALESCE(i.subtotal, 0)::float8 AS subtotal,
              COALESCE(i.tax_amount, 0)::float8 AS "taxAmount",
              COALESCE(i.total_amount, 0)::float8 AS "totalAmount",
              COALESCE(i.amount_paid, 0)::float8 AS "amountPaid",
              COALESCE(i.amount_due, 0)::float8 AS "amountDue"
       FROM invoices i
       WHERE i.sale_id = $1::uuid
         AND UPPER(COALESCE(i.status, '')) NOT IN ('CANCELLED', 'VOID', 'VOIDED')`,
      [saleId],
    );
    return result.rows as TaxRestatementInvoiceRow[];
  },

  async countInvoiceLines(client: PoolClient, invoiceId: string): Promise<number> {
    const result = await client.query(
      `SELECT COUNT(*)::int AS n FROM invoice_line_items WHERE "InvoiceId" = $1::uuid`,
      [invoiceId],
    );
    return Number(result.rows[0]?.n ?? 0);
  },

  async getPostedTaxIntegrity(
    client: PoolClient,
    saleId: string,
  ): Promise<{ saleTax: number; lineTaxSum: number; primaryInvoiceTax: number | null }> {
    const sale = await client.query(
      `SELECT COALESCE(tax_amount, 0)::float8 AS tax FROM sales WHERE id = $1::uuid`,
      [saleId],
    );
    const lines = await client.query(
      `SELECT COALESCE(SUM(tax_amount), 0)::float8 AS tax
       FROM sale_items WHERE sale_id = $1::uuid`,
      [saleId],
    );
    const inv = await client.query(
      `SELECT COALESCE(tax_amount, 0)::float8 AS tax
       FROM invoices
       WHERE sale_id = $1::uuid
         AND UPPER(COALESCE(status, '')) NOT IN ('CANCELLED', 'VOID', 'VOIDED')
       ORDER BY created_at ASC NULLS LAST
       LIMIT 1`,
      [saleId],
    );
    return {
      saleTax: Number(sale.rows[0]?.tax ?? 0),
      lineTaxSum: Number(lines.rows[0]?.tax ?? 0),
      primaryInvoiceTax: inv.rows[0] ? Number(inv.rows[0].tax) : null,
    };
  },

  async updateSaleTax(
    client: PoolClient,
    saleId: string,
    data: { taxAmount: number; totalAmount: number },
  ): Promise<void> {
    const result = await client.query(
      `UPDATE sales
       SET tax_amount = $2,
           total_amount = $3
       WHERE id = $1::uuid
       RETURNING id`,
      [saleId, data.taxAmount, data.totalAmount],
    );
    if ((result.rowCount ?? 0) !== 1) {
      throw new Error(`updateSaleTax: expected 1 row for sale ${saleId}`);
    }
  },

  async updateSaleItemTax(
    client: PoolClient,
    itemId: string,
    data: {
      taxAmount: number;
      taxRate: number;
      isTaxable: boolean;
      taxDetermination: string;
    },
  ): Promise<void> {
    const result = await client.query(
      `UPDATE sale_items
       SET tax_amount = $2,
           tax_rate = $3,
           is_taxable = $4,
           tax_determination = $5
       WHERE id = $1::uuid
       RETURNING id`,
      [itemId, data.taxAmount, data.taxRate, data.isTaxable, data.taxDetermination],
    );
    if ((result.rowCount ?? 0) !== 1) {
      throw new Error(`updateSaleItemTax: expected 1 row for item ${itemId}`);
    }
  },

  async updateInvoiceTax(
    client: PoolClient,
    invoiceId: string,
    data: {
      taxAmount: number;
      totalAmount: number;
      amountDue: number;
      status: string;
    },
  ): Promise<void> {
    const result = await client.query(
      `UPDATE invoices
       SET tax_amount = $2,
           total_amount = $3,
           amount_due = $4,
           status = $5,
           updated_at = NOW()
       WHERE id = $1::uuid
       RETURNING id`,
      [invoiceId, data.taxAmount, data.totalAmount, data.amountDue, data.status],
    );
    if ((result.rowCount ?? 0) !== 1) {
      throw new Error(`updateInvoiceTax: expected 1 row for invoice ${invoiceId}`);
    }
  },

  async refreshInvoiceLinesFromSale(
    client: PoolClient,
    invoiceId: string,
    saleId: string,
  ): Promise<number> {
    const existing = await client.query(
      `SELECT COUNT(*)::int AS n FROM invoice_line_items WHERE "InvoiceId" = $1::uuid`,
      [invoiceId],
    );
    if (Number(existing.rows[0]?.n ?? 0) === 0) return 0;

    await client.query(`DELETE FROM invoice_line_items WHERE "InvoiceId" = $1::uuid`, [invoiceId]);

    const result = await client.query(
      `INSERT INTO invoice_line_items (
         "Id", "InvoiceId", "LineNumber", "ProductId", "ProductName",
         "Description", "Quantity", "UnitOfMeasure", "UnitPrice", "LineTotal",
         "TaxRate", "TaxAmount", "LineTotalIncludingTax"
       )
       SELECT
         gen_random_uuid(),
         $1::uuid,
         ROW_NUMBER() OVER (ORDER BY si.created_at NULLS LAST, si.id),
         COALESCE(si.product_id::text, ''),
         COALESCE(si.product_name, 'Item'),
         NULL,
         si.quantity,
         'EA',
         si.unit_price,
         si.total_price,
         COALESCE(si.tax_rate, 0),
         COALESCE(si.tax_amount, 0),
         COALESCE(si.total_price, 0) + COALESCE(si.tax_amount, 0)
       FROM sale_items si
       WHERE si.sale_id = $2::uuid
       RETURNING "Id"`,
      [invoiceId, saleId],
    );
    const count = result.rowCount ?? result.rows.length;
    if (count === 0) {
      throw new Error(
        `refreshInvoiceLinesFromSale: sale ${saleId} produced 0 invoice lines for ${invoiceId}`,
      );
    }
    return count;
  },

  async insertEvent(
    client: PoolClient,
    data: {
      saleId: string;
      postedTax: number;
      newTax: number;
      taxDelta: number;
      totalDelta: number;
      taxInclusive: boolean;
      glTransactionId: string | null;
      reason: string;
      createdBy: string;
    },
  ): Promise<string> {
    if (!data.glTransactionId) {
      throw new Error('insertEvent requires glTransactionId — refuse incomplete restatement audit');
    }
    const result = await client.query(
      `INSERT INTO sale_tax_restatement_events (
         sale_id, posted_tax, new_tax, tax_delta, total_delta, tax_inclusive,
         gl_transaction_id, reason, created_by
       ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::uuid, $8, $9::uuid)
       RETURNING id::text`,
      [
        data.saleId,
        data.postedTax,
        data.newTax,
        data.taxDelta,
        data.totalDelta,
        data.taxInclusive,
        data.glTransactionId,
        data.reason,
        data.createdBy,
      ],
    );
    if (!result.rows[0]?.id) {
      throw new Error('insertEvent: no id returned');
    }
    return result.rows[0].id as string;
  },
};
