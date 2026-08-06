/**
 * Sale customer reassignment — data access (wrong-customer correction).
 */
import type { Pool, PoolClient } from 'pg';

export type SaleCustomerRow = {
  id: string;
  saleNumber: string;
  status: string;
  customerId: string | null;
  customerName: string | null;
  totalAmount: number;
  amountPaid: number;
  saleDate: string;
};

export type LinkedInvoiceRow = {
  id: string;
  invoiceNumber: string;
  status: string;
  customerId: string | null;
  totalAmount: number;
  amountPaid: number;
  outstandingBalance: number;
};

export const saleCustomerReassignmentRepository = {
  async getSale(pool: Pool | PoolClient, saleId: string): Promise<SaleCustomerRow | null> {
    const result = await pool.query(
      `SELECT s.id::text AS id,
              s.sale_number AS "saleNumber",
              s.status,
              s.customer_id::text AS "customerId",
              c.name AS "customerName",
              COALESCE(s.total_amount, 0)::float8 AS "totalAmount",
              COALESCE(s.amount_paid, 0)::float8 AS "amountPaid",
              s.sale_date::text AS "saleDate"
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.id = $1::uuid`,
      [saleId],
    );
    return (result.rows[0] as SaleCustomerRow) ?? null;
  },

  async getCustomerActive(
    pool: Pool | PoolClient,
    customerId: string,
  ): Promise<{
    id: string;
    name: string;
    isActive: boolean;
    vatRegistered: boolean;
    taxExempt: boolean;
    taxProfile: string;
  } | null> {
    const result = await pool.query(
      `SELECT id::text AS id,
              name,
              COALESCE(is_active, true) AS "isActive",
              COALESCE(vat_registered, false) AS "vatRegistered",
              COALESCE(tax_exempt, false) AS "taxExempt",
              COALESCE(tax_profile, 'STANDARD') AS "taxProfile"
       FROM customers WHERE id = $1::uuid`,
      [customerId],
    );
    return (
      (result.rows[0] as {
        id: string;
        name: string;
        isActive: boolean;
        vatRegistered: boolean;
        taxExempt: boolean;
        taxProfile: string;
      }) ?? null
    );
  },

  async getLinkedInvoices(pool: Pool | PoolClient, saleId: string): Promise<LinkedInvoiceRow[]> {
    const result = await pool.query(
      `SELECT i.id::text AS id,
              i.invoice_number AS "invoiceNumber",
              i.status,
              i.customer_id::text AS "customerId",
              COALESCE(i.total_amount, 0)::float8 AS "totalAmount",
              COALESCE(i.amount_paid, 0)::float8 AS "amountPaid",
              GREATEST(
                0,
                COALESCE(i.total_amount, 0) - COALESCE(i.amount_paid, 0)
              )::float8 AS "outstandingBalance"
       FROM invoices i
       WHERE i.sale_id = $1::uuid
         AND UPPER(COALESCE(i.status, '')) NOT IN ('CANCELLED', 'VOID', 'VOIDED')`,
      [saleId],
    );
    return result.rows as LinkedInvoiceRow[];
  },

  /**
   * Open AR (1200) for this sale under the from-customer entity (debit net).
   * Walk-in (null entity) uses IS NULL entity tag match when possible.
   */
  async getOpenArForSale(
    pool: Pool | PoolClient,
    saleId: string,
    fromCustomerId: string | null,
  ): Promise<number> {
    if (!fromCustomerId) {
      // Cash walk-in rarely posts open AR with customer entity; bill outstanding is SSOT.
      return 0;
    }
    const result = await pool.query(
      `SELECT COALESCE(SUM(le."DebitAmount"::numeric - le."CreditAmount"::numeric), 0)::numeric AS net
       FROM ledger_entries le
       JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
       JOIN accounts a ON a."Id" = le."AccountId"
       WHERE a."AccountCode" = '1200'
         AND UPPER(COALESCE(le."EntityType", '')) = 'CUSTOMER'
         AND le."EntityId"::text = $1::text
         AND (
           (lt."ReferenceType" IN ('SALE', 'SALE_INVOICE') AND lt."ReferenceId" = $2::uuid)
           OR (
             lt."ReferenceType" IN ('INVOICE', 'CUSTOMER_INVOICE')
             AND lt."ReferenceId" IN (SELECT id FROM invoices WHERE sale_id = $2::uuid)
           )
         )
         AND COALESCE(lt."IsReversed", false) = false
         AND lt."Status" = 'POSTED'`,
      [fromCustomerId, saleId],
    );
    return Math.max(0, Number(result.rows[0]?.net ?? 0));
  },

  async updateSaleCustomer(
    client: PoolClient,
    saleId: string,
    toCustomerId: string,
  ): Promise<boolean> {
    // sales is created_at-only — touch customer_id exclusively
    const result = await client.query(
      `UPDATE sales
       SET customer_id = $2::uuid
       WHERE id = $1::uuid
       RETURNING id`,
      [saleId, toCustomerId],
    );
    return (result.rowCount ?? 0) > 0;
  },

  async updateInvoiceCustomers(
    client: PoolClient,
    saleId: string,
    toCustomerId: string,
    toCustomerName: string,
  ): Promise<number> {
    const result = await client.query(
      `UPDATE invoices
       SET customer_id = $2::uuid,
           customer_name = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE sale_id = $1::uuid
         AND UPPER(COALESCE(status, '')) NOT IN ('CANCELLED', 'VOID', 'VOIDED')
       RETURNING id`,
      [saleId, toCustomerId, toCustomerName],
    );
    return result.rowCount ?? 0;
  },

  async insertEvent(
    client: PoolClient,
    data: {
      saleId: string;
      fromCustomerId: string | null;
      toCustomerId: string;
      amount: number;
      accountScope: 'AR' | 'NONE';
      glTransactionId: string | null;
      reason: string;
      createdBy: string;
    },
  ): Promise<string> {
    const result = await client.query(
      `INSERT INTO sale_customer_reassignment_events (
          sale_id, from_customer_id, to_customer_id, amount,
          account_scope, gl_transaction_id, reason, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        data.saleId,
        data.fromCustomerId,
        data.toCustomerId,
        data.amount,
        data.accountScope,
        data.glTransactionId,
        data.reason,
        data.createdBy,
      ],
    );
    return result.rows[0].id as string;
  },
};
