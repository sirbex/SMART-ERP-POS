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

    // BR-INV-003: Customer balance is handled by trigger
    // trg_sync_customer_balance_on_invoice fires on INSERT/UPDATE

    // GL posting: DR Accounts Receivable, CR Revenue
    // Use savepoint so GL failure doesn't block invoice creation
    try {
      await client.query('SAVEPOINT gl_dn_invoice');

      // Find account IDs
      const arAccount = await client.query(
        `SELECT id FROM accounts WHERE account_code = '1200' LIMIT 1`
      );
      const revenueAccount = await client.query(
        `SELECT id FROM accounts WHERE account_code = '4000' LIMIT 1`
      );

      if (arAccount.rows.length > 0 && revenueAccount.rows.length > 0) {
        await client.query(
          `INSERT INTO ledger_entries (account_id, entry_date, debit, credit, description, reference_type, reference_id)
           VALUES ($1, CURRENT_DATE, $3, 0, $4, 'DELIVERY_NOTE_INVOICE', $5),
                  ($2, CURRENT_DATE, 0, $3, $4, 'DELIVERY_NOTE_INVOICE', $5)`,
          [
            arAccount.rows[0].id,
            revenueAccount.rows[0].id,
            totalAmount,
            `DN Invoice ${inv.invoice_number} from ${dn.deliveryNoteNumber}`,
            inv.id,
          ]
        );
      }

      await client.query('RELEASE SAVEPOINT gl_dn_invoice');
    } catch (glError) {
      logger.error('GL posting failed for DN invoice', {
        invoiceId: inv.id,
        deliveryNoteId,
        error: glError instanceof Error ? glError.message : String(glError),
      });
      await client.query('ROLLBACK TO SAVEPOINT gl_dn_invoice');
    }

    // Recalc invoice
    const freshInvoice = await invoiceRepository.recalcInvoice(client, inv.id);
    if (!freshInvoice) throw new Error('Failed to refresh invoice after creation');

    return freshInvoice;
  });

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
