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
import { Money } from '../../utils/money.js';
import logger from '../../utils/logger.js';
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
      if (invoice.status === 'Cancelled') throw new Error('Cannot create a note against a cancelled invoice');

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

      // 3. Validate cumulative credit notes don't exceed invoice total
      if (input.noteType !== 'FULL') {
        const existingNotes = await creditDebitNoteRepository.getNotesForInvoice(client, input.invoiceId, 'CREDIT_NOTE');
        const existingTotalDec = existingNotes.reduce((sum, n) => Money.add(sum, Money.parseDb(n.totalAmount)), Money.zero());
        const cumulativeDec = Money.add(existingTotalDec, totalAmount);
        if (Money.toNumber(cumulativeDec) > invoice.totalAmount) {
          throw new Error(
            `Credit note total (${total}) plus existing notes (${Money.toNumber(existingTotalDec)}) would exceed invoice total (${invoice.totalAmount})`,
          );
        }
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
      if (invoice.status === 'Cancelled') throw new Error('Cannot create a note against a cancelled invoice');

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
        // Debit notes create a new AR charge — no adjustment on original
      }

      logger.info('Note posted', { noteId: note.id, noteNumber: note.invoiceNumber, type: note.documentType });
      return note;
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
      if (invoice.status === 'CANCELLED') throw new Error('Cannot create a note against a cancelled invoice');

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

      // Validate cumulative
      if (input.noteType !== 'FULL') {
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
      if (invoice.status === 'CANCELLED') throw new Error('Cannot create a note against a cancelled invoice');

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
      } else {
        await recordSupplierDebitNoteToGL(glData, pool);
      }

      logger.info('Supplier note posted', {
        noteId: note.id, noteNumber: note.invoiceNumber, type: note.documentType,
      });
      return note;
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
