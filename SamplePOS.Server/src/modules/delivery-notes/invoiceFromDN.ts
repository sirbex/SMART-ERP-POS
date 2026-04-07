// Invoice from Delivery Note — wholesale invoicing path
// Creates an invoice from a POSTED delivery note.
// No sale record is created. GL posts at invoice time.

import { Pool, PoolClient } from 'pg';
import { Money } from '../../utils/money.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { invoiceRepository, InvoiceRecord } from '../invoices/invoiceRepository.js';
import { deliveryNoteRepository } from './deliveryNoteRepository.js';
import logger from '../../utils/logger.js';
import { NotFoundError, ValidationError, ConflictError } from '../../middleware/errorHandler.js';
import { recordDeliveryNoteInvoiceToGL } from '../../services/glEntryService.js';
import * as documentFlowService from '../document-flow/documentFlowService.js';
import Decimal from 'decimal.js';

/**
 * Create an invoice from a POSTED delivery note.
 *
 * Business rules:
 * - DN must be POSTED (stock already moved)
 * - DN must not already have an invoice
 * - Invoice total = DN total (sum of line totals)
 * - No sale record is created
 * - GL posting happens here (DR Accounts Receivable / CR Revenue)
 *
 * @returns The created invoice record
 */
export async function invoiceFromDeliveryNote(
  pool: Pool,
  deliveryNoteId: string,
  createdById: string
): Promise<InvoiceRecord> {
  // ── Validate outside transaction (read-only) ─────────────
  const dn = await deliveryNoteRepository.getById(pool, deliveryNoteId);
  if (!dn) {
    throw new NotFoundError(`Delivery note ${deliveryNoteId} not found`);
  }
  if (dn.status !== 'POSTED') {
    throw new ValidationError(
      `Delivery note ${dn.deliveryNoteNumber} must be POSTED before invoicing. Current status: ${dn.status}`
    );
  }

  // Check not already invoiced
  const existingInvoice = await pool.query(
    `SELECT "Id", "InvoiceNumber" FROM invoices WHERE delivery_note_id = $1 LIMIT 1`,
    [deliveryNoteId]
  );
  if (existingInvoice.rows.length > 0) {
    throw new ConflictError(
      `Delivery note ${dn.deliveryNoteNumber} already invoiced as ${existingInvoice.rows[0].InvoiceNumber}`
    );
  }

  // ── Calculate totals from DN lines ───────────────────────
  let subtotal = new Decimal(0);
  for (const line of dn.lines) {
    subtotal = subtotal.plus(new Decimal(line.lineTotal));
  }
  const totalAmount = subtotal.toNumber();

  // ── Fetch customer name ──────────────────────────────────
  const custResult = await pool.query(
    'SELECT name FROM customers WHERE id = $1',
    [dn.customerId]
  );
  const customerName = (custResult.rows[0]?.name as string) || dn.customerName || 'Unknown Customer';

  // ── Create invoice in transaction ────────────────────────
  const invoice = await UnitOfWork.run(pool, async (client: PoolClient) => {
    // Re-check uniqueness inside transaction
    const check = await client.query(
      `SELECT "Id" FROM invoices WHERE delivery_note_id = $1 LIMIT 1`,
      [deliveryNoteId]
    );
    if (check.rows.length > 0) {
      throw new ConflictError(`Invoice already exists for DN ${dn.deliveryNoteNumber}`);
    }

    // Create invoice (no sale_id, uses delivery_note_id)
    const inv = await invoiceRepository.createInvoice(client, {
      customerId: dn.customerId,
      customerName,
      saleId: null,
      quoteId: null,
      subtotal: totalAmount,
      taxAmount: 0, // Tax handled at quotation level if applicable
      totalAmount,
      notes: `Invoice for delivery note ${dn.deliveryNoteNumber} (Quotation ${dn.quotationNumber || ''})`,
      createdById,
    });

    // Link invoice to delivery note
    await client.query(
      `UPDATE invoices SET delivery_note_id = $1 WHERE "Id" = $2`,
      [deliveryNoteId, inv.id]
    );

    // Recalc invoice
    const freshInvoice = await invoiceRepository.recalcInvoice(client, inv.id);
    if (!freshInvoice) throw new Error('Failed to refresh invoice after creation');

    // Recalculate customer balance from invoices (replaces trg_sync_customer_balance_on_invoice)
    const balanceUpdate = await client.query(
      `WITH old AS (SELECT balance, name FROM customers WHERE id = $1)
       UPDATE customers SET balance = (
        SELECT COALESCE(SUM("OutstandingBalance"), 0)
        FROM invoices
        WHERE "CustomerId" = $1
        AND "Status" NOT IN ('Cancelled', 'Voided', 'Draft')
      ) WHERE id = $1
      RETURNING balance, (SELECT balance FROM old) AS old_balance, (SELECT name FROM old) AS customer_name`,
      [dn.customerId]
    );
    // Audit customer balance change (replaces trg_audit_customer_balance)
    if (balanceUpdate.rows[0] && balanceUpdate.rows[0].old_balance !== balanceUpdate.rows[0].balance) {
      const r = balanceUpdate.rows[0];
      await client.query(
        `INSERT INTO customer_balance_audit (customer_id, customer_name, old_balance, new_balance, change_amount, change_source)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [dn.customerId, r.customer_name, r.old_balance ?? 0, r.balance ?? 0,
        (r.balance ?? 0) - (r.old_balance ?? 0), 'INVOICE_FROM_DN']
      );
    }

    // Sync AR account balance (replaces trg_sync_customer_to_ar)
    await client.query(`
      UPDATE accounts SET "CurrentBalance" = COALESCE(
        (SELECT SUM(balance) FROM customers WHERE is_active = true), 0
      ), "UpdatedAt" = NOW()
      WHERE "AccountCode" = '1200'
    `);

    // Document flow: Delivery Note → Invoice
    await documentFlowService.linkDocuments(client, 'DELIVERY_NOTE', deliveryNoteId, 'INVOICE', freshInvoice.id, 'CREATED_FROM');

    return freshInvoice;
  });

  // GL posting AFTER transaction commits (same pattern as goodsReceiptService)
  // Uses glEntryService → AccountingCore (single source of truth for GL writes)
  try {
    await recordDeliveryNoteInvoiceToGL({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      invoiceDate: new Date().toLocaleDateString('en-CA'),
      totalAmount,
      deliveryNoteNumber: dn.deliveryNoteNumber,
      customerId: dn.customerId,
      customerName,
    }, pool);
  } catch (glError) {
    logger.error('GL posting failed for DN invoice', {
      invoiceId: invoice.id,
      deliveryNoteId,
      error: glError instanceof Error ? glError.message : String(glError),
    });
    // GL failure logged but does not block invoice creation
  }

  logger.info('Invoice created from delivery note', {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    deliveryNoteId,
    deliveryNoteNumber: dn.deliveryNoteNumber,
    totalAmount,
    customerId: dn.customerId,
  });

  return invoice;
}
