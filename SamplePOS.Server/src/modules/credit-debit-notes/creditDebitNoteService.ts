/**
 * Credit/Debit Note Service
 * 
 * Business logic for creating, posting, and managing credit/debit notes.
 * Handles both customer (AR) and supplier (AP) sides.
 * 
 * WORKFLOW:
 * 1. Create note (DRAFT) → validates original invoice, calculates totals
 * 2. Post note (DRAFT → POSTED) → creates GL entries, adjusts balances
 */

import type { Pool } from 'pg';
import { UnitOfWork } from '../../db/unitOfWork.js';
import {
  creditDebitNoteRepository,
  supplierCreditDebitNoteRepository,
  type CreditDebitNoteRecord,
  type SupplierCreditDebitNoteRecord,
  type NoteLineItemRecord,
} from './creditDebitNoteRepository.js';
import {
  recordCustomerCreditNoteToGL,
  recordCustomerDebitNoteToGL,
  recordSupplierCreditNoteToGL,
  recordSupplierDebitNoteToGL,
} from '../../services/glEntryService.js';
import { AccountingCore, AccountingError } from '../../services/accountingCore.js';
import { Money } from '../../utils/money.js';
import logger from '../../utils/logger.js';
import { SYSTEM_USER_ID } from '../../utils/constants.js';
import type {
  CreateCustomerCreditNote,
  CreateCustomerDebitNote,
  CreateSupplierCreditNote,
  CreateSupplierDebitNote,
} from '../../../../shared/zod/creditDebitNote.js';

// ============================================================
// CUSTOMER SIDE
// ============================================================

export const creditDebitNoteService = {

  /**
   * Create a customer credit note (DRAFT).
   * Validates the original invoice exists, is INVOICE type, and cumulative notes
   * don't exceed the original invoice total.
   */
  async createCreditNote(
    pool: Pool,
    input: CreateCustomerCreditNote,
  ): Promise<{ note: CreditDebitNoteRecord; lineItems: NoteLineItemRecord[] }> {

    return UnitOfWork.run(pool, async (client) => {
      // 1. Validate original invoice
      const invoice = await creditDebitNoteRepository.getInvoiceById(client, input.invoiceId);
      if (!invoice) throw new Error('Original invoice not found');
      if (invoice.documentType !== 'INVOICE') throw new Error('Cannot create a note against another note');
      if (invoice.status === 'Cancelled' || invoice.status === 'CANCELLED') throw new Error('Cannot create a note against a cancelled invoice');

      // 2. Calculate note totals from lines
      let subtotal = Money.zero();
      let taxTotal = Money.zero();
      for (const line of input.lines) {
        const lineAmount = Money.multiply(Money.parseDb(line.quantity), Money.parseDb(line.unitPrice));
        const lineTax = Money.multiply(lineAmount, Money.divide(Money.parseDb(line.taxRate ?? 0), Money.parseDb(100)));
        subtotal = Money.add(subtotal, lineAmount);
        taxTotal = Money.add(taxTotal, lineTax);
      }
      const totalAmount = Money.add(subtotal, taxTotal);
      const total = Money.toNumber(totalAmount);

      // 3. Enforce noteType business rules (SAP/Odoo compliance)
      if (input.noteType === 'FULL' && total !== invoice.totalAmount) {
        throw new Error(
          `FULL credit note must equal invoice total (${invoice.totalAmount}), got ${total}`,
        );
      }

      // 4. Validate cumulative credit notes don't exceed invoice total
      const existingNotes = await creditDebitNoteRepository.getNotesForInvoice(client, input.invoiceId, 'CREDIT_NOTE');
      const existingTotalDec = existingNotes.reduce((sum, n) => Money.add(sum, Money.parseDb(n.totalAmount)), Money.zero());
      const cumulativeDec = Money.add(existingTotalDec, totalAmount);
      if (Money.toNumber(cumulativeDec) > invoice.totalAmount) {
        throw new Error(
          `Credit note total (${total}) plus existing notes (${Money.toNumber(existingTotalDec)}) would exceed invoice total (${invoice.totalAmount})`,
        );
      }

      // 4. Generate number and create note
      const noteNumber = await creditDebitNoteRepository.generateCreditNoteNumber(client);

      const note = await creditDebitNoteRepository.createNote(client, {
        invoiceNumber: noteNumber,
        documentType: 'CREDIT_NOTE',
        referenceInvoiceId: input.invoiceId,
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        issueDate: input.issueDate || new Date().toISOString().split('T')[0],
        subtotal: Money.toNumber(subtotal),
        taxAmount: Money.toNumber(taxTotal),
        totalAmount: total,
        reason: input.reason,
        notes: input.notes || null,
      });

      // 5. Create line items
      const lineItems = await creditDebitNoteRepository.createNoteLineItems(
        client,
        note.id,
        input.lines.map(l => ({
          productId: l.productId || '',
          productName: l.productName,
          description: l.description || null,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxRate: l.taxRate ?? 0,
        })),
      );

      logger.info('Credit note draft created', { noteId: note.id, noteNumber: note.invoiceNumber });
      return { note, lineItems };
    });
  },

  /**
   * Create a customer debit note (DRAFT).
   */
  async createDebitNote(
    pool: Pool,
    input: CreateCustomerDebitNote,
  ): Promise<{ note: CreditDebitNoteRecord; lineItems: NoteLineItemRecord[] }> {

    return UnitOfWork.run(pool, async (client) => {
      const invoice = await creditDebitNoteRepository.getInvoiceById(client, input.invoiceId);
      if (!invoice) throw new Error('Original invoice not found');
      if (invoice.documentType !== 'INVOICE') throw new Error('Cannot create a note against another note');
      if (invoice.status === 'Cancelled' || invoice.status === 'CANCELLED') throw new Error('Cannot create a note against a cancelled invoice');

      let subtotal = Money.zero();
      let taxTotal = Money.zero();
      for (const line of input.lines) {
        const lineAmount = Money.multiply(Money.parseDb(line.quantity), Money.parseDb(line.unitPrice));
        const lineTax = Money.multiply(lineAmount, Money.divide(Money.parseDb(line.taxRate ?? 0), Money.parseDb(100)));
        subtotal = Money.add(subtotal, lineAmount);
        taxTotal = Money.add(taxTotal, lineTax);
      }
      const totalAmount = Money.add(subtotal, taxTotal);

      const noteNumber = await creditDebitNoteRepository.generateDebitNoteNumber(client);

      const note = await creditDebitNoteRepository.createNote(client, {
        invoiceNumber: noteNumber,
        documentType: 'DEBIT_NOTE',
        referenceInvoiceId: input.invoiceId,
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        issueDate: input.issueDate || new Date().toISOString().split('T')[0],
        subtotal: Money.toNumber(subtotal),
        taxAmount: Money.toNumber(taxTotal),
        totalAmount: Money.toNumber(totalAmount),
        reason: input.reason,
        notes: input.notes || null,
      });

      const lineItems = await creditDebitNoteRepository.createNoteLineItems(
        client,
        note.id,
        input.lines.map(l => ({
          productId: l.productId || '',
          productName: l.productName,
          description: l.description || null,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxRate: l.taxRate ?? 0,
        })),
      );

      logger.info('Debit note draft created', { noteId: note.id, noteNumber: note.invoiceNumber });
      return { note, lineItems };
    });
  },

  /**
   * Post a customer credit/debit note (DRAFT → POSTED).
   * Creates GL entries and adjusts original invoice balance for credit notes.
   */
  async postNote(
    pool: Pool,
    noteId: string,
  ): Promise<CreditDebitNoteRecord> {

    return UnitOfWork.run(pool, async (client) => {
      // 1. Post (update status)
      const note = await creditDebitNoteRepository.postNote(client, noteId);
      if (!note) throw new Error('Note not found or cannot be posted (must be in Draft status)');

      // 2. GL entries
      const glData = {
        noteId: note.id,
        noteNumber: note.invoiceNumber,
        noteDate: typeof note.issueDate === 'string'
          ? note.issueDate.split('T')[0]
          : new Date().toISOString().split('T')[0],
        subtotal: note.subtotal,
        taxAmount: note.taxAmount,
        totalAmount: note.totalAmount,
        customerId: note.customerId,
        customerName: note.customerName,
      };

      if (note.documentType === 'CREDIT_NOTE') {
        await recordCustomerCreditNoteToGL(glData, pool);
        // 3. Reduce outstanding balance on original invoice
        await creditDebitNoteRepository.adjustOriginalInvoiceBalance(
          client,
          note.referenceInvoiceId,
          note.totalAmount,
          'CREDIT',
        );
      } else {
        await recordCustomerDebitNoteToGL(glData, pool);
        // Debit note increases the AR on the customer — also adjust original invoice
        await creditDebitNoteRepository.adjustOriginalInvoiceBalance(
          client,
          note.referenceInvoiceId,
          note.totalAmount,
          'DEBIT',
        );
      }

      logger.info('Note posted', { noteId: note.id, noteNumber: note.invoiceNumber, type: note.documentType });
      return note;
    });
  },

  /**
   * Cancel a posted customer note (POSTED → CANCELLED).
   * Reverses the GL journal entry and restores original invoice balance.
   * SAP/Odoo compliance: posted documents are cancelled via reversal, never deleted.
   */
  async cancelNote(
    pool: Pool,
    noteId: string,
    reason: string,
  ): Promise<CreditDebitNoteRecord> {

    return UnitOfWork.run(pool, async (client) => {
      // 1. Get the note to validate it
      const noteData = await creditDebitNoteRepository.getNoteById(client, noteId);
      if (!noteData) throw new Error('Note not found');
      if (noteData.status !== 'Posted') throw new Error('Only posted notes can be cancelled');

      // 2. Cancel the note record
      const cancelled = await creditDebitNoteRepository.cancelNote(client, noteId);
      if (!cancelled) throw new Error('Failed to cancel note');

      // 3. Reverse the GL journal entry
      const refType = noteData.documentType === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : 'DEBIT_NOTE';
      const glTxn = await pool.query(
        `SELECT "Id" FROM ledger_transactions
         WHERE "ReferenceType" = $1 AND "ReferenceId" = $2
           AND "IsReversed" = FALSE
         LIMIT 1`,
        [refType, noteId]
      );

      if (glTxn.rows.length > 0) {
        try {
          await AccountingCore.reverseTransaction({
            originalTransactionId: glTxn.rows[0].Id,
            reversalDate: new Date().toISOString().split('T')[0],
            reason: `CANCEL: ${noteData.invoiceNumber} — ${reason}`,
            userId: SYSTEM_USER_ID,
            idempotencyKey: `${refType}_CANCEL-${noteId}`,
          }, pool);
        } catch (error: unknown) {
          if (error instanceof AccountingError && error.code === 'ALREADY_REVERSED') {
            logger.info('Note GL already reversed (idempotent)', { noteId });
          } else {
            throw error;
          }
        }
      }

      // 4. Reverse the balance adjustment on the original invoice
      if (noteData.documentType === 'CREDIT_NOTE') {
        // Credit note was credited → reverse by debiting back
        await creditDebitNoteRepository.adjustOriginalInvoiceBalance(
          client,
          noteData.referenceInvoiceId,
          noteData.totalAmount,
          'DEBIT',
        );
      } else {
        // Debit note was debited → reverse by crediting back
        await creditDebitNoteRepository.adjustOriginalInvoiceBalance(
          client,
          noteData.referenceInvoiceId,
          noteData.totalAmount,
          'CREDIT',
        );
      }

      logger.info('Note cancelled with GL reversal', {
        noteId: cancelled.id,
        noteNumber: cancelled.invoiceNumber,
        type: cancelled.documentType,
        reason,
      });
      return cancelled;
    });
  },

  /**
   * List customer credit/debit notes with pagination.
   */
  async listNotes(
    pool: Pool,
    options: {
      documentType?: 'CREDIT_NOTE' | 'DEBIT_NOTE';
      customerId?: string;
      referenceInvoiceId?: string;
      status?: string;
      page: number;
      limit: number;
    },
  ) {
    return creditDebitNoteRepository.listNotes(pool, {
      ...options,
      documentType: options.documentType || undefined,
    });
  },

  /**
   * Get a single note with its line items.
   */
  async getNoteById(
    pool: Pool,
    noteId: string,
  ): Promise<{ note: CreditDebitNoteRecord; lineItems: NoteLineItemRecord[] } | null> {
    const note = await creditDebitNoteRepository.getNoteById(pool, noteId);
    if (!note) return null;
    const lineItems = await creditDebitNoteRepository.getNoteLineItems(pool, noteId);
    return { note, lineItems };
  },

  /**
   * Get all notes linked to a specific invoice.
   */
  async getNotesForInvoice(
    pool: Pool,
    invoiceId: string,
  ) {
    const creditNotes = await creditDebitNoteRepository.getNotesForInvoice(pool, invoiceId, 'CREDIT_NOTE');
    const debitNotes = await creditDebitNoteRepository.getNotesForInvoice(pool, invoiceId, 'DEBIT_NOTE');
    return { creditNotes, debitNotes };
  },
};

// ============================================================
// SUPPLIER SIDE
// ============================================================

export const supplierCreditDebitNoteService = {

  async createCreditNote(
    pool: Pool,
    input: CreateSupplierCreditNote,
  ): Promise<{ note: SupplierCreditDebitNoteRecord; lineItems: unknown[] }> {

    return UnitOfWork.run(pool, async (client) => {
      const invoice = await supplierCreditDebitNoteRepository.getSupplierInvoiceById(client, input.invoiceId);
      if (!invoice) throw new Error('Supplier invoice not found');
      if (invoice.documentType !== 'SUPPLIER_INVOICE') throw new Error('Cannot create a note against another note');
      if (invoice.status === 'CANCELLED' || invoice.status === 'Cancelled') throw new Error('Cannot create a note against a cancelled invoice');

      let subtotal = Money.zero();
      let taxTotal = Money.zero();
      for (const line of input.lines) {
        const lineAmount = Money.multiply(Money.parseDb(line.quantity), Money.parseDb(line.unitCost));
        const lineTax = Money.multiply(lineAmount, Money.divide(Money.parseDb(line.taxRate ?? 0), Money.parseDb(100)));
        subtotal = Money.add(subtotal, lineAmount);
        taxTotal = Money.add(taxTotal, lineTax);
      }
      const totalAmount = Money.add(subtotal, taxTotal);
      const total = Money.toNumber(totalAmount);

      // Enforce FULL noteType (SAP/Odoo compliance)
      if (input.noteType === 'FULL' && total !== invoice.totalAmount) {
        throw new Error(
          `FULL credit note must equal invoice total (${invoice.totalAmount}), got ${total}`,
        );
      }

      // Validate cumulative
      const existing = await supplierCreditDebitNoteRepository.getNotesForSupplierInvoice(
        client, input.invoiceId, 'SUPPLIER_CREDIT_NOTE',
      );
      const existingTotalDec = existing.reduce((sum, n) => Money.add(sum, Money.parseDb(n.totalAmount)), Money.zero());
      const cumulativeDec = Money.add(existingTotalDec, totalAmount);
      if (Money.toNumber(cumulativeDec) > invoice.totalAmount) {
        throw new Error(
          `Credit note total (${total}) plus existing notes (${Money.toNumber(existingTotalDec)}) would exceed invoice total (${invoice.totalAmount})`,
        );
      }

      const noteNumber = await supplierCreditDebitNoteRepository.generateSupplierCreditNoteNumber(client);

      const note = await supplierCreditDebitNoteRepository.createSupplierNote(client, {
        invoiceNumber: noteNumber,
        documentType: 'SUPPLIER_CREDIT_NOTE',
        referenceInvoiceId: input.invoiceId,
        supplierId: invoice.supplierId,
        issueDate: input.issueDate || new Date().toISOString().split('T')[0],
        subtotal: Money.toNumber(subtotal),
        taxAmount: Money.toNumber(taxTotal),
        totalAmount: total,
        reason: input.reason,
        notes: input.notes || null,
      });

      const lineItems = await supplierCreditDebitNoteRepository.createSupplierNoteLineItems(
        client,
        note.id,
        input.lines.map(l => ({
          productId: l.productId || '',
          productName: l.productName,
          description: l.description || null,
          quantity: l.quantity,
          unitCost: l.unitCost,
          taxRate: l.taxRate ?? 0,
        })),
      );

      logger.info('Supplier credit note draft created', { noteId: note.id, noteNumber: note.invoiceNumber });
      return { note, lineItems };
    });
  },

  async createDebitNote(
    pool: Pool,
    input: CreateSupplierDebitNote,
  ): Promise<{ note: SupplierCreditDebitNoteRecord; lineItems: unknown[] }> {

    return UnitOfWork.run(pool, async (client) => {
      const invoice = await supplierCreditDebitNoteRepository.getSupplierInvoiceById(client, input.invoiceId);
      if (!invoice) throw new Error('Supplier invoice not found');
      if (invoice.documentType !== 'SUPPLIER_INVOICE') throw new Error('Cannot create a note against another note');
      if (invoice.status === 'CANCELLED' || invoice.status === 'Cancelled') throw new Error('Cannot create a note against a cancelled invoice');

      let subtotal = Money.zero();
      let taxTotal = Money.zero();
      for (const line of input.lines) {
        const lineAmount = Money.multiply(Money.parseDb(line.quantity), Money.parseDb(line.unitCost));
        const lineTax = Money.multiply(lineAmount, Money.divide(Money.parseDb(line.taxRate ?? 0), Money.parseDb(100)));
        subtotal = Money.add(subtotal, lineAmount);
        taxTotal = Money.add(taxTotal, lineTax);
      }
      const totalAmount = Money.add(subtotal, taxTotal);

      const noteNumber = await supplierCreditDebitNoteRepository.generateSupplierDebitNoteNumber(client);

      const note = await supplierCreditDebitNoteRepository.createSupplierNote(client, {
        invoiceNumber: noteNumber,
        documentType: 'SUPPLIER_DEBIT_NOTE',
        referenceInvoiceId: input.invoiceId,
        supplierId: invoice.supplierId,
        issueDate: input.issueDate || new Date().toISOString().split('T')[0],
        subtotal: Money.toNumber(subtotal),
        taxAmount: Money.toNumber(taxTotal),
        totalAmount: Money.toNumber(totalAmount),
        reason: input.reason,
        notes: input.notes || null,
      });

      const lineItems = await supplierCreditDebitNoteRepository.createSupplierNoteLineItems(
        client,
        note.id,
        input.lines.map(l => ({
          productId: l.productId || '',
          productName: l.productName,
          description: l.description || null,
          quantity: l.quantity,
          unitCost: l.unitCost,
          taxRate: l.taxRate ?? 0,
        })),
      );

      logger.info('Supplier debit note draft created', { noteId: note.id, noteNumber: note.invoiceNumber });
      return { note, lineItems };
    });
  },

  async postNote(
    pool: Pool,
    noteId: string,
  ): Promise<SupplierCreditDebitNoteRecord> {

    return UnitOfWork.run(pool, async (client) => {
      const note = await supplierCreditDebitNoteRepository.postSupplierNote(client, noteId);
      if (!note) throw new Error('Supplier note not found or cannot be posted (must be in DRAFT status)');

      const glData = {
        noteId: note.id,
        noteNumber: note.invoiceNumber,
        noteDate: typeof note.issueDate === 'string'
          ? note.issueDate.split('T')[0]
          : new Date().toISOString().split('T')[0],
        subtotal: note.subtotal,
        taxAmount: note.taxAmount,
        totalAmount: note.totalAmount,
        supplierId: note.supplierId,
        supplierName: note.supplierName,
      };

      if (note.documentType === 'SUPPLIER_CREDIT_NOTE') {
        await recordSupplierCreditNoteToGL(glData, pool);
        // Reduce AP on original invoice (SAP/Odoo compliance)
        await supplierCreditDebitNoteRepository.adjustSupplierInvoiceBalance(
          client,
          note.referenceInvoiceId,
          note.totalAmount,
          'CREDIT',
        );
      } else {
        await recordSupplierDebitNoteToGL(glData, pool);
        // Increase AP on original invoice
        await supplierCreditDebitNoteRepository.adjustSupplierInvoiceBalance(
          client,
          note.referenceInvoiceId,
          note.totalAmount,
          'DEBIT',
        );
      }

      logger.info('Supplier note posted', {
        noteId: note.id, noteNumber: note.invoiceNumber, type: note.documentType,
      });
      return note;
    });
  },

  /**
   * Cancel a posted supplier note (POSTED → CANCELLED).
   * Reverses the GL journal entry and restores original invoice balance.
   * SAP/Odoo compliance: posted documents are cancelled via reversal, never deleted.
   */
  async cancelNote(
    pool: Pool,
    noteId: string,
    reason: string,
  ): Promise<SupplierCreditDebitNoteRecord> {

    return UnitOfWork.run(pool, async (client) => {
      // 1. Get the note to validate it
      const noteData = await supplierCreditDebitNoteRepository.getSupplierNoteById(client, noteId);
      if (!noteData) throw new Error('Supplier note not found');
      if (noteData.status !== 'POSTED') throw new Error('Only posted notes can be cancelled');

      // 2. Cancel the note record
      const cancelled = await supplierCreditDebitNoteRepository.cancelSupplierNote(client, noteId);
      if (!cancelled) throw new Error('Failed to cancel supplier note');

      // 3. Reverse the GL journal entry
      const refType = noteData.documentType === 'SUPPLIER_CREDIT_NOTE' ? 'SUPPLIER_CREDIT_NOTE' : 'SUPPLIER_DEBIT_NOTE';
      const glTxn = await pool.query(
        `SELECT "Id" FROM ledger_transactions
         WHERE "ReferenceType" = $1 AND "ReferenceId" = $2
           AND "IsReversed" = FALSE
         LIMIT 1`,
        [refType, noteId]
      );

      if (glTxn.rows.length > 0) {
        try {
          await AccountingCore.reverseTransaction({
            originalTransactionId: glTxn.rows[0].Id,
            reversalDate: new Date().toISOString().split('T')[0],
            reason: `CANCEL: ${noteData.invoiceNumber} — ${reason}`,
            userId: SYSTEM_USER_ID,
            idempotencyKey: `${refType}_CANCEL-${noteId}`,
          }, pool);
        } catch (error: unknown) {
          if (error instanceof AccountingError && error.code === 'ALREADY_REVERSED') {
            logger.info('Supplier note GL already reversed (idempotent)', { noteId });
          } else {
            throw error;
          }
        }
      }

      // 4. Reverse the balance adjustment on the original supplier invoice
      if (noteData.documentType === 'SUPPLIER_CREDIT_NOTE') {
        // Credit note reduced AP → reverse by increasing AP (debit direction)
        await supplierCreditDebitNoteRepository.adjustSupplierInvoiceBalance(
          client,
          noteData.referenceInvoiceId,
          noteData.totalAmount,
          'DEBIT',
        );
      } else {
        // Debit note increased AP → reverse by reducing AP (credit direction)
        await supplierCreditDebitNoteRepository.adjustSupplierInvoiceBalance(
          client,
          noteData.referenceInvoiceId,
          noteData.totalAmount,
          'CREDIT',
        );
      }

      logger.info('Supplier note cancelled with GL reversal', {
        noteId: cancelled.id,
        noteNumber: cancelled.invoiceNumber,
        type: cancelled.documentType,
        reason,
      });
      return cancelled;
    });
  },

  async listNotes(
    pool: Pool,
    options: {
      documentType?: 'SUPPLIER_CREDIT_NOTE' | 'SUPPLIER_DEBIT_NOTE';
      supplierId?: string;
      referenceInvoiceId?: string;
      status?: string;
      page: number;
      limit: number;
    },
  ) {
    return supplierCreditDebitNoteRepository.listSupplierNotes(pool, {
      ...options,
      documentType: options.documentType || undefined,
    });
  },

  async getNoteById(
    pool: Pool,
    noteId: string,
  ): Promise<{ note: SupplierCreditDebitNoteRecord; lineItems: unknown[] } | null> {
    const note = await supplierCreditDebitNoteRepository.getSupplierNoteById(pool, noteId);
    if (!note) return null;
    const lineItems = await supplierCreditDebitNoteRepository.getSupplierInvoiceLineItems(pool, noteId);
    return { note, lineItems };
  },
};
