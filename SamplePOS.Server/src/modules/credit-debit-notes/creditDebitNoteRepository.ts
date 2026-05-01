/**
 * Credit/Debit Note Repository
 * 
 * Handles all database operations for credit notes and debit notes.
 * Extends the invoices and supplier_invoices tables using document_type column.
 * 
 * ARCHITECTURE:
 * - Credit/debit notes are stored IN the invoices/supplier_invoices tables
 * - Differentiated by document_type column
 * - Always reference an original invoice via reference_invoice_id
 * - Line items stored in invoice_line_items / supplier_invoice_line_items
 */

import type { Pool, PoolClient } from 'pg';
import { Money } from '../../utils/money.js';
import { getBusinessYear, getBusinessDate } from '../../utils/dateRange.js';

// ============================================================
// TYPES
// ============================================================

export type CustomerDocumentType = 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE';
export type SupplierDocumentType = 'SUPPLIER_INVOICE' | 'SUPPLIER_CREDIT_NOTE' | 'SUPPLIER_DEBIT_NOTE';
export type NoteStatus = 'DRAFT' | 'POSTED' | 'CANCELLED';

export interface CreditDebitNoteRecord {
    id: string;
    invoiceNumber: string;
    documentType: CustomerDocumentType;
    referenceInvoiceId: string;
    referenceInvoiceNumber?: string;
    customerId: string;
    customerName: string;
    issueDate: string;
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
    status: string;
    reason: string | null;
    notes: string | null;
    returnsGoods: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface SupplierCreditDebitNoteRecord {
    id: string;
    invoiceNumber: string;
    documentType: SupplierDocumentType;
    referenceInvoiceId: string;
    referenceInvoiceNumber?: string;
    supplierId: string;
    supplierName?: string;
    issueDate: string;
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
    status: string;
    reason: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface NoteLineItemRecord {
    id: string;
    invoiceId: string;
    lineNumber: number;
    productId: string;
    productName: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    taxRate: number;
    taxAmount: number;
    lineTotalIncludingTax: number;
}

// ============================================================
// CUSTOMER SIDE REPOSITORY
// ============================================================

export const creditDebitNoteRepository = {

    // ----------------------------------------------------------
    // Number generation
    // ----------------------------------------------------------

    async generateCreditNoteNumber(client: Pool | PoolClient): Promise<string> {
        const year = getBusinessYear();
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('credit_note_number_seq'))`);
        const result = await client.query(
            `SELECT invoice_number FROM invoices 
       WHERE document_type = 'CREDIT_NOTE' AND invoice_number LIKE $1 
       ORDER BY invoice_number DESC LIMIT 1`,
            [`CN-${year}-%`]
        );
        if (result.rows.length === 0) return `CN-${year}-0001`;
        const last = result.rows[0].invoice_number as string;
        const seq = parseInt(last.split('-')[2]) + 1;
        return `CN-${year}-${seq.toString().padStart(4, '0')}`;
    },

    async generateDebitNoteNumber(client: Pool | PoolClient): Promise<string> {
        const year = getBusinessYear();
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('debit_note_number_seq'))`);
        const result = await client.query(
            `SELECT invoice_number FROM invoices 
       WHERE document_type = 'DEBIT_NOTE' AND invoice_number LIKE $1 
       ORDER BY invoice_number DESC LIMIT 1`,
            [`DN-${year}-%`]
        );
        if (result.rows.length === 0) return `DN-${year}-0001`;
        const last = result.rows[0].invoice_number as string;
        const seq = parseInt(last.split('-')[2]) + 1;
        return `DN-${year}-${seq.toString().padStart(4, '0')}`;
    },

    // ----------------------------------------------------------
    // Get original invoice (for validation)
    // ----------------------------------------------------------

    async getInvoiceById(client: Pool | PoolClient, invoiceId: string) {
        const result = await client.query(
            `SELECT i.id, i.invoice_number, i.customer_id, i.customer_name,
              i.subtotal, i.tax_amount, i.total_amount, i.amount_paid,
              i.amount_due, i.status, i.document_type, i.issue_date
       FROM invoices i WHERE i.id = $1`,
            [invoiceId]
        );
        if (!result.rows[0]) return null;
        const r = result.rows[0];
        return {
            id: r.id as string,
            invoiceNumber: r.invoice_number as string,
            customerId: r.customer_id as string,
            customerName: r.customer_name as string,
            subtotal: Money.toNumber(Money.parseDb(r.subtotal)),
            taxAmount: Money.toNumber(Money.parseDb(r.tax_amount)),
            totalAmount: Money.toNumber(Money.parseDb(r.total_amount)),
            amountPaid: Money.toNumber(Money.parseDb(r.amount_paid)),
            outstandingBalance: Money.toNumber(Money.parseDb(r.amount_due)),
            status: r.status as string,
            documentType: (r.document_type || 'INVOICE') as CustomerDocumentType,
            issueDate: r.issue_date as string,
        };
    },

    async getInvoiceLineItems(client: Pool | PoolClient, invoiceId: string): Promise<NoteLineItemRecord[]> {
        const result = await client.query(
            `SELECT "Id", "InvoiceId", "LineNumber", "ProductId", "ProductName",
              "Description", "Quantity", "UnitPrice", "LineTotal",
              "TaxRate", "TaxAmount", "LineTotalIncludingTax"
       FROM invoice_line_items WHERE "InvoiceId" = $1 ORDER BY "LineNumber"`,
            [invoiceId]
        );
        return result.rows.map((r: Record<string, unknown>) => ({
            id: r.Id as string,
            invoiceId: r.InvoiceId as string,
            lineNumber: r.LineNumber as number,
            productId: r.ProductId as string,
            productName: r.ProductName as string,
            description: r.Description as string | null,
            quantity: Money.toNumber(Money.parseDb(r.Quantity)),
            unitPrice: Money.toNumber(Money.parseDb(r.UnitPrice)),
            lineTotal: Money.toNumber(Money.parseDb(r.LineTotal)),
            taxRate: Money.toNumber(Money.parseDb(r.TaxRate)),
            taxAmount: Money.toNumber(Money.parseDb(r.TaxAmount)),
            lineTotalIncludingTax: Money.toNumber(Money.parseDb(r.LineTotalIncludingTax)),
        }));
    },

    // ----------------------------------------------------------
    // Get existing notes for an invoice (to check cumulative limits)
    // ----------------------------------------------------------

    async getNotesForInvoice(client: Pool | PoolClient, invoiceId: string, documentType: 'CREDIT_NOTE' | 'DEBIT_NOTE') {
        const result = await client.query(
            `SELECT id, invoice_number, total_amount, status
       FROM invoices 
       WHERE reference_invoice_id = $1 
         AND document_type = $2
         AND UPPER(status) != 'CANCELLED'`,
            [invoiceId, documentType]
        );
        return result.rows.map((r: Record<string, unknown>) => ({
            id: r.id as string,
            invoiceNumber: r.invoice_number as string,
            totalAmount: Money.toNumber(Money.parseDb(r.total_amount)),
            status: r.status as string,
        }));
    },

    // ----------------------------------------------------------
    // Create credit/debit note (in invoices table)
    // ----------------------------------------------------------

    async createNote(
        client: Pool | PoolClient,
        data: {
            invoiceNumber: string;
            documentType: CustomerDocumentType;
            referenceInvoiceId: string;
            customerId: string;
            customerName: string;
            issueDate: string;
            subtotal: number;
            taxAmount: number;
            totalAmount: number;
            reason: string;
            notes: string | null;
            returnsGoods?: boolean;
        }
    ): Promise<CreditDebitNoteRecord> {
        const uuidResult = await client.query('SELECT gen_random_uuid() as id');
        const noteId = uuidResult.rows[0].id;
        const now = new Date();

        const result = await client.query(
            `INSERT INTO invoices (
        id, invoice_number, customer_id, customer_name, sale_id,
        issue_date, due_date, subtotal, tax_amount, total_amount,
        amount_paid, amount_due, status, payment_terms,
        notes, created_at, updated_at,
        document_type, reference_invoice_id, reason, returns_goods
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, NULL,
        $4, $4, $5, $6, $7,
        0, $7, 'DRAFT', 0,
        $8, $9, $9,
        $10, $11, $12, $13
      ) RETURNING *`,
            [
                data.invoiceNumber, data.customerId, data.customerName,
                data.issueDate || getBusinessDate(),
                data.subtotal, data.taxAmount, data.totalAmount,
                data.notes || null, now,
                data.documentType, data.referenceInvoiceId, data.reason,
                data.returnsGoods ?? false,
            ]
        );

        const r = result.rows[0];
        return {
            id: r.id,
            invoiceNumber: r.invoice_number,
            documentType: r.document_type,
            referenceInvoiceId: r.reference_invoice_id,
            customerId: r.customer_id,
            customerName: r.customer_name,
            issueDate: r.issue_date,
            subtotal: Money.toNumber(Money.parseDb(r.subtotal)),
            taxAmount: Money.toNumber(Money.parseDb(r.tax_amount)),
            totalAmount: Money.toNumber(Money.parseDb(r.total_amount)),
            status: r.status,
            reason: r.reason,
            notes: r.notes,
            returnsGoods: r.returns_goods ?? false,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        };
    },

    // ----------------------------------------------------------
    // Create line items for a note
    // ----------------------------------------------------------

    async createNoteLineItems(
        client: Pool | PoolClient,
        noteId: string,
        lines: Array<{
            productId: string;
            productName: string;
            description?: string | null;
            quantity: number;
            unitPrice: number;
            taxRate: number;
        }>
    ): Promise<NoteLineItemRecord[]> {
        const items: NoteLineItemRecord[] = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineTotal = Money.toNumber(Money.multiply(Money.parseDb(line.quantity), Money.parseDb(line.unitPrice)));
            const taxAmount = Money.toNumber(Money.multiply(Money.parseDb(lineTotal), Money.divide(Money.parseDb(line.taxRate), Money.parseDb(100))));
            const lineTotalIncTax = Money.toNumber(Money.add(Money.parseDb(lineTotal), Money.parseDb(taxAmount)));

            const uuidResult = await client.query('SELECT gen_random_uuid() as id');
            const lineId = uuidResult.rows[0].id;

            await client.query(
                `INSERT INTO invoice_line_items (
          "Id", "InvoiceId", "LineNumber", "ProductId", "ProductName",
          "Description", "Quantity", "UnitOfMeasure", "UnitPrice", "LineTotal",
          "TaxRate", "TaxAmount", "LineTotalIncludingTax"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'EA', $8, $9, $10, $11, $12)`,
                [
                    lineId, noteId, i + 1, line.productId || '', line.productName,
                    line.description || null, line.quantity, line.unitPrice, lineTotal,
                    line.taxRate, taxAmount, lineTotalIncTax,
                ]
            );

            items.push({
                id: lineId, invoiceId: noteId, lineNumber: i + 1,
                productId: line.productId || '', productName: line.productName,
                description: line.description || null,
                quantity: line.quantity, unitPrice: line.unitPrice, lineTotal,
                taxRate: line.taxRate, taxAmount, lineTotalIncludingTax: lineTotalIncTax,
            });
        }
        return items;
    },

    // ----------------------------------------------------------
    // Post note (DRAFT → POSTED)
    // ----------------------------------------------------------

    async postNote(client: Pool | PoolClient, noteId: string): Promise<CreditDebitNoteRecord | null> {
        const result = await client.query(
            `UPDATE invoices
       SET status = 'POSTED', updated_at = NOW()
       WHERE id = $1 AND status = 'DRAFT' AND document_type IN ('CREDIT_NOTE', 'DEBIT_NOTE')
       RETURNING *`,
            [noteId]
        );
        if (!result.rows[0]) return null;
        const r = result.rows[0];
        return {
            id: r.id, invoiceNumber: r.invoice_number, documentType: r.document_type,
            referenceInvoiceId: r.reference_invoice_id,
            customerId: r.customer_id, customerName: r.customer_name,
            issueDate: r.issue_date,
            subtotal: Money.toNumber(Money.parseDb(r.subtotal)),
            taxAmount: Money.toNumber(Money.parseDb(r.tax_amount)),
            totalAmount: Money.toNumber(Money.parseDb(r.total_amount)),
            status: r.status, reason: r.reason, notes: r.notes,
            returnsGoods: r.returns_goods ?? false,
            createdAt: r.created_at, updatedAt: r.updated_at,
        };
    },

    // ----------------------------------------------------------
    // Update AR on original invoice after credit note posted
    // Credit note reduces outstanding balance on original invoice
    // Debit note increases it
    // ----------------------------------------------------------

    async adjustOriginalInvoiceBalance(
        client: Pool | PoolClient,
        originalInvoiceId: string,
        adjustmentAmount: number,
        direction: 'CREDIT' | 'DEBIT'
    ): Promise<void> {
        if (direction === 'CREDIT') {
            // Credit note: reduce outstanding balance (as if payment was made)
            await client.query(
                `UPDATE invoices
         SET amount_paid = amount_paid + $2,
             amount_due = GREATEST(total_amount - (amount_paid + $2), 0),
             status = CASE
               WHEN GREATEST(total_amount - (amount_paid + $2), 0) = 0 THEN 'PAID'
               WHEN (amount_paid + $2) > 0 THEN 'PARTIALLY_PAID'
               ELSE status
             END,
             updated_at = NOW()
         WHERE id = $1`,
                [originalInvoiceId, adjustmentAmount]
            );
        } else {
            // Debit note reversal: restore previously credited amount on original invoice
            await client.query(
                `UPDATE invoices
         SET amount_paid = GREATEST(amount_paid - $2, 0),
             amount_due = total_amount - GREATEST(amount_paid - $2, 0),
             status = CASE
               WHEN total_amount - GREATEST(amount_paid - $2, 0) <= 0 THEN 'PAID'
               WHEN GREATEST(amount_paid - $2, 0) > 0 THEN 'PARTIALLY_PAID'
               ELSE 'UNPAID'
             END,
             updated_at = NOW()
         WHERE id = $1`,
                [originalInvoiceId, adjustmentAmount]
            );
        }
    },

    // ----------------------------------------------------------
    // List notes
    // ----------------------------------------------------------

    async listNotes(
        client: Pool | PoolClient,
        options: {
            documentType?: CustomerDocumentType;
            customerId?: string;
            referenceInvoiceId?: string;
            status?: string;
            page: number;
            limit: number;
        }
    ): Promise<{ notes: CreditDebitNoteRecord[]; total: number }> {
        const where: string[] = [`i.document_type IN ('CREDIT_NOTE', 'DEBIT_NOTE')`];
        const values: unknown[] = [];
        let idx = 1;

        if (options.documentType && options.documentType !== 'INVOICE') {
            where.push(`i.document_type = $${idx++}`);
            values.push(options.documentType);
        }
        if (options.customerId) {
            where.push(`i.customer_id = $${idx++}`);
            values.push(options.customerId);
        }
        if (options.referenceInvoiceId) {
            where.push(`i.reference_invoice_id = $${idx++}`);
            values.push(options.referenceInvoiceId);
        }
        if (options.status) {
            where.push(`i.status = $${idx++}`);
            values.push(options.status);
        }

        const whereClause = `WHERE ${where.join(' AND ')}`;

        const countRes = await client.query(
            `SELECT COUNT(*) FROM invoices i ${whereClause}`, values
        );

        const offset = (options.page - 1) * options.limit;
        const res = await client.query(
            `SELECT i.*, ref.invoice_number as ref_invoice_number
       FROM invoices i
       LEFT JOIN invoices ref ON ref.id = i.reference_invoice_id
       ${whereClause}
       ORDER BY i.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
            [...values, options.limit, offset]
        );

        return {
            total: parseInt(countRes.rows[0].count),
            notes: res.rows.map((r: Record<string, unknown>) => ({
                id: r.id as string,
                invoiceNumber: r.invoice_number as string,
                documentType: r.document_type as CustomerDocumentType,
                referenceInvoiceId: r.reference_invoice_id as string,
                referenceInvoiceNumber: r.ref_invoice_number as string | undefined,
                customerId: r.customer_id as string,
                customerName: r.customer_name as string,
                issueDate: r.issue_date as string,
                subtotal: Money.toNumber(Money.parseDb(r.subtotal)),
                taxAmount: Money.toNumber(Money.parseDb(r.tax_amount)),
                totalAmount: Money.toNumber(Money.parseDb(r.total_amount)),
                status: r.status as string,
                reason: r.reason as string | null,
                notes: r.notes as string | null,
                returnsGoods: (r.returns_goods as boolean) ?? false,
                createdAt: r.created_at as string,
                updatedAt: r.updated_at as string,
            })),
        };
    },

    async getNoteById(client: Pool | PoolClient, noteId: string): Promise<CreditDebitNoteRecord | null> {
        const result = await client.query(
            `SELECT i.*, ref.invoice_number as ref_invoice_number
       FROM invoices i
       LEFT JOIN invoices ref ON ref.id = i.reference_invoice_id
       WHERE i.id = $1 AND i.document_type IN ('CREDIT_NOTE', 'DEBIT_NOTE')`,
            [noteId]
        );
        if (!result.rows[0]) return null;
        const r = result.rows[0];
        return {
            id: r.id, invoiceNumber: r.invoice_number, documentType: r.document_type,
            referenceInvoiceId: r.reference_invoice_id,
            referenceInvoiceNumber: r.ref_invoice_number,
            customerId: r.customer_id, customerName: r.customer_name,
            issueDate: r.issue_date,
            subtotal: Money.toNumber(Money.parseDb(r.subtotal)),
            taxAmount: Money.toNumber(Money.parseDb(r.tax_amount)),
            totalAmount: Money.toNumber(Money.parseDb(r.total_amount)),
            status: r.status, reason: r.reason, notes: r.notes,
            returnsGoods: r.returns_goods ?? false,
            createdAt: r.created_at, updatedAt: r.updated_at,
        };
    },

    async getNoteLineItems(client: Pool | PoolClient, noteId: string): Promise<NoteLineItemRecord[]> {
        return this.getInvoiceLineItems(client, noteId);
    },

    // ----------------------------------------------------------
    // Cancel a posted note (POSTED → CANCELLED)
    // ----------------------------------------------------------

    async cancelNote(client: Pool | PoolClient, noteId: string): Promise<CreditDebitNoteRecord | null> {
        const result = await client.query(
            `UPDATE invoices
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE id = $1 AND status = 'POSTED' AND document_type IN ('CREDIT_NOTE', 'DEBIT_NOTE')
       RETURNING *`,
            [noteId]
        );
        if (!result.rows[0]) return null;
        const r = result.rows[0];
        return {
            id: r.id, invoiceNumber: r.invoice_number, documentType: r.document_type,
            referenceInvoiceId: r.reference_invoice_id,
            customerId: r.customer_id, customerName: r.customer_name,
            issueDate: r.issue_date,
            subtotal: Money.toNumber(Money.parseDb(r.subtotal)),
            taxAmount: Money.toNumber(Money.parseDb(r.tax_amount)),
            totalAmount: Money.toNumber(Money.parseDb(r.total_amount)),
            status: r.status, reason: r.reason, notes: r.notes,
            returnsGoods: r.returns_goods ?? false,
            createdAt: r.created_at, updatedAt: r.updated_at,
        };
    },
};

// ============================================================
// SUPPLIER SIDE REPOSITORY
// ============================================================

export const supplierCreditDebitNoteRepository = {

    async generateSupplierCreditNoteNumber(client: Pool | PoolClient): Promise<string> {
        const year = getBusinessYear();
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('supplier_cn_number_seq'))`);
        const result = await client.query(
            `SELECT "SupplierInvoiceNumber" FROM supplier_invoices
       WHERE document_type = 'SUPPLIER_CREDIT_NOTE' AND "SupplierInvoiceNumber" LIKE $1
       ORDER BY "SupplierInvoiceNumber" DESC LIMIT 1`,
            [`SCN-${year}-%`]
        );
        if (result.rows.length === 0) return `SCN-${year}-0001`;
        const last = result.rows[0].SupplierInvoiceNumber as string;
        const seq = parseInt(last.split('-')[2]) + 1;
        return `SCN-${year}-${seq.toString().padStart(4, '0')}`;
    },

    async generateSupplierDebitNoteNumber(client: Pool | PoolClient): Promise<string> {
        const year = getBusinessYear();
        await client.query(`SELECT pg_advisory_xact_lock(hashtext('supplier_dn_number_seq'))`);
        const result = await client.query(
            `SELECT "SupplierInvoiceNumber" FROM supplier_invoices
       WHERE document_type = 'SUPPLIER_DEBIT_NOTE' AND "SupplierInvoiceNumber" LIKE $1
       ORDER BY "SupplierInvoiceNumber" DESC LIMIT 1`,
            [`SDN-${year}-%`]
        );
        if (result.rows.length === 0) return `SDN-${year}-0001`;
        const last = result.rows[0].SupplierInvoiceNumber as string;
        const seq = parseInt(last.split('-')[2]) + 1;
        return `SDN-${year}-${seq.toString().padStart(4, '0')}`;
    },

    async getSupplierInvoiceById(client: Pool | PoolClient, invoiceId: string) {
        const result = await client.query(
            `SELECT si."Id", si."SupplierInvoiceNumber", si."SupplierId",
              si."Subtotal", si."TaxAmount", si."TotalAmount", si."AmountPaid",
              si."OutstandingBalance", si."Status", si.document_type, si."InvoiceDate",
              s."CompanyName" as supplier_name
       FROM supplier_invoices si
       LEFT JOIN suppliers s ON s."Id" = si."SupplierId"
       WHERE si."Id" = $1`,
            [invoiceId]
        );
        if (!result.rows[0]) return null;
        const r = result.rows[0];
        return {
            id: r.Id as string,
            invoiceNumber: r.SupplierInvoiceNumber as string,
            supplierId: r.SupplierId as string,
            supplierName: r.supplier_name as string,
            subtotal: Money.toNumber(Money.parseDb(r.Subtotal)),
            taxAmount: Money.toNumber(Money.parseDb(r.TaxAmount)),
            totalAmount: Money.toNumber(Money.parseDb(r.TotalAmount)),
            amountPaid: Money.toNumber(Money.parseDb(r.AmountPaid)),
            outstandingBalance: Money.toNumber(Money.parseDb(r.OutstandingBalance)),
            status: r.Status as string,
            documentType: (r.document_type || 'SUPPLIER_INVOICE') as SupplierDocumentType,
            issueDate: r.InvoiceDate as string,
        };
    },

    async getSupplierInvoiceLineItems(client: Pool | PoolClient, invoiceId: string) {
        const result = await client.query(
            `SELECT "Id", "SupplierInvoiceId", "LineNumber", "ProductId", "ProductName",
              "Description", "Quantity", "UnitCost", "LineTotal",
              "TaxRate", "TaxAmount", "LineTotalIncludingTax"
       FROM supplier_invoice_line_items WHERE "SupplierInvoiceId" = $1 ORDER BY "LineNumber"`,
            [invoiceId]
        );
        return result.rows.map((r: Record<string, unknown>) => ({
            id: r.Id as string,
            invoiceId: r.SupplierInvoiceId as string,
            lineNumber: r.LineNumber as number,
            productId: r.ProductId as string,
            productName: r.ProductName as string,
            description: r.Description as string | null,
            quantity: Money.toNumber(Money.parseDb(r.Quantity)),
            unitCost: Money.toNumber(Money.parseDb(r.UnitCost)),
            lineTotal: Money.toNumber(Money.parseDb(r.LineTotal)),
            taxRate: Money.toNumber(Money.parseDb(r.TaxRate)),
            taxAmount: Money.toNumber(Money.parseDb(r.TaxAmount)),
            lineTotalIncludingTax: Money.toNumber(Money.parseDb(r.LineTotalIncludingTax)),
        }));
    },

    async getNotesForSupplierInvoice(client: Pool | PoolClient, invoiceId: string, documentType: 'SUPPLIER_CREDIT_NOTE' | 'SUPPLIER_DEBIT_NOTE') {
        const result = await client.query(
            `SELECT "Id", "SupplierInvoiceNumber", "TotalAmount", "Status"
       FROM supplier_invoices
       WHERE reference_invoice_id = $1
         AND document_type = $2
         AND "Status" != 'CANCELLED'`,
            [invoiceId, documentType]
        );
        return result.rows.map((r: Record<string, unknown>) => ({
            id: r.Id as string,
            invoiceNumber: r.SupplierInvoiceNumber as string,
            totalAmount: Money.toNumber(Money.parseDb(r.TotalAmount)),
            status: r.Status as string,
        }));
    },

    async createSupplierNote(
        client: Pool | PoolClient,
        data: {
            invoiceNumber: string;
            documentType: SupplierDocumentType;
            referenceInvoiceId: string | null | undefined;
            supplierId: string;
            issueDate: string;
            subtotal: number;
            taxAmount: number;
            totalAmount: number;
            reason: string;
            notes: string | null;
            returnGrnId?: string | null;
        }
    ): Promise<SupplierCreditDebitNoteRecord> {
        const uuidResult = await client.query('SELECT gen_random_uuid() as id');
        const noteId = uuidResult.rows[0].id;
        const now = new Date();

        const result = await client.query(
            `INSERT INTO supplier_invoices (
        "Id", "SupplierInvoiceNumber", "InternalReferenceNumber", "SupplierId",
        "InvoiceDate", "DueDate", "Subtotal", "TaxAmount", "TotalAmount",
        "AmountPaid", "OutstandingBalance", "Status", "CurrencyCode",
        "Notes", "CreatedAt", "UpdatedAt",
        document_type, reference_invoice_id, reason, return_grn_id
      ) VALUES (
        $1, $2, $2, $3,
        $4, $4, $5, $6, $7,
        0, $7, 'DRAFT', 'UGX',
        $8, $9, $9,
        $10, $11, $12, $13
      ) RETURNING *`,
            [
                noteId, data.invoiceNumber, data.supplierId,
                data.issueDate || getBusinessDate(),
                data.subtotal, data.taxAmount, data.totalAmount,
                data.notes || null, now,
                data.documentType, data.referenceInvoiceId, data.reason,
                data.returnGrnId || null,
            ]
        );

        const r = result.rows[0];
        return {
            id: r.Id,
            invoiceNumber: r.SupplierInvoiceNumber,
            documentType: r.document_type,
            referenceInvoiceId: r.reference_invoice_id,
            supplierId: r.SupplierId,
            issueDate: r.InvoiceDate,
            subtotal: Money.toNumber(Money.parseDb(r.Subtotal)),
            taxAmount: Money.toNumber(Money.parseDb(r.TaxAmount)),
            totalAmount: Money.toNumber(Money.parseDb(r.TotalAmount)),
            status: r.Status,
            reason: r.reason,
            notes: r.Notes,
            createdAt: r.CreatedAt,
            updatedAt: r.UpdatedAt,
        };
    },

    async createSupplierNoteLineItems(
        client: Pool | PoolClient,
        noteId: string,
        lines: Array<{
            productId: string;
            productName: string;
            description?: string | null;
            quantity: number;
            unitCost: number;
            taxRate: number;
        }>
    ) {
        const items = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineTotal = Money.toNumber(Money.multiply(Money.parseDb(line.quantity), Money.parseDb(line.unitCost)));
            const taxAmount = Money.toNumber(Money.multiply(Money.parseDb(lineTotal), Money.divide(Money.parseDb(line.taxRate), Money.parseDb(100))));
            const lineTotalIncTax = Money.toNumber(Money.add(Money.parseDb(lineTotal), Money.parseDb(taxAmount)));

            const uuidResult = await client.query('SELECT gen_random_uuid() as id');
            const lineId = uuidResult.rows[0].id;

            await client.query(
                `INSERT INTO supplier_invoice_line_items (
          "Id", "SupplierInvoiceId", "LineNumber", "ProductId", "ProductName",
          "Description", "Quantity", "UnitOfMeasure", "UnitCost", "LineTotal",
          "TaxRate", "TaxAmount", "LineTotalIncludingTax"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'EA', $8, $9, $10, $11, $12)`,
                [
                    lineId, noteId, i + 1, line.productId || '', line.productName,
                    line.description || null, line.quantity, line.unitCost, lineTotal,
                    line.taxRate, taxAmount, lineTotalIncTax,
                ]
            );

            items.push({
                id: lineId, invoiceId: noteId, lineNumber: i + 1,
                productId: line.productId || '', productName: line.productName,
                description: line.description || null,
                quantity: line.quantity, unitCost: line.unitCost, lineTotal,
                taxRate: line.taxRate, taxAmount, lineTotalIncludingTax: lineTotalIncTax,
            });
        }
        return items;
    },

    async postSupplierNote(client: Pool | PoolClient, noteId: string): Promise<SupplierCreditDebitNoteRecord | null> {
        const result = await client.query(
            `UPDATE supplier_invoices
       SET "Status" = 'POSTED', "UpdatedAt" = NOW()
       WHERE "Id" = $1 AND "Status" = 'DRAFT' AND document_type IN ('SUPPLIER_CREDIT_NOTE', 'SUPPLIER_DEBIT_NOTE')
       RETURNING *`,
            [noteId]
        );
        if (!result.rows[0]) return null;
        const r = result.rows[0];
        return {
            id: r.Id, invoiceNumber: r.SupplierInvoiceNumber, documentType: r.document_type,
            referenceInvoiceId: r.reference_invoice_id,
            supplierId: r.SupplierId,
            issueDate: r.InvoiceDate,
            subtotal: Money.toNumber(Money.parseDb(r.Subtotal)),
            taxAmount: Money.toNumber(Money.parseDb(r.TaxAmount)),
            totalAmount: Money.toNumber(Money.parseDb(r.TotalAmount)),
            status: r.Status, reason: r.reason, notes: r.Notes,
            createdAt: r.CreatedAt, updatedAt: r.UpdatedAt,
        };
    },

    async listSupplierNotes(
        client: Pool | PoolClient,
        options: {
            documentType?: SupplierDocumentType;
            supplierId?: string;
            referenceInvoiceId?: string;
            status?: string;
            page: number;
            limit: number;
        }
    ): Promise<{ notes: SupplierCreditDebitNoteRecord[]; total: number }> {
        const where: string[] = [`si.document_type IN ('SUPPLIER_CREDIT_NOTE', 'SUPPLIER_DEBIT_NOTE')`];
        const values: unknown[] = [];
        let idx = 1;

        if (options.documentType && options.documentType !== 'SUPPLIER_INVOICE') {
            where.push(`si.document_type = $${idx++}`);
            values.push(options.documentType);
        }
        if (options.supplierId) {
            where.push(`si."SupplierId" = $${idx++}`);
            values.push(options.supplierId);
        }
        if (options.referenceInvoiceId) {
            where.push(`si.reference_invoice_id = $${idx++}`);
            values.push(options.referenceInvoiceId);
        }
        if (options.status) {
            where.push(`si."Status" = $${idx++}`);
            values.push(options.status);
        }

        const whereClause = `WHERE ${where.join(' AND ')}`;
        const countRes = await client.query(
            `SELECT COUNT(*) FROM supplier_invoices si ${whereClause}`, values
        );

        const offset = (options.page - 1) * options.limit;
        const res = await client.query(
            `SELECT si.*, ref."SupplierInvoiceNumber" as ref_invoice_number,
              s."CompanyName" as supplier_name
       FROM supplier_invoices si
       LEFT JOIN supplier_invoices ref ON ref."Id" = si.reference_invoice_id
       LEFT JOIN suppliers s ON s."Id" = si."SupplierId"
       ${whereClause}
       ORDER BY si."CreatedAt" DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
            [...values, options.limit, offset]
        );

        return {
            total: parseInt(countRes.rows[0].count),
            notes: res.rows.map((r: Record<string, unknown>) => ({
                id: r.Id as string,
                invoiceNumber: r.SupplierInvoiceNumber as string,
                documentType: r.document_type as SupplierDocumentType,
                referenceInvoiceId: r.reference_invoice_id as string,
                referenceInvoiceNumber: r.ref_invoice_number as string | undefined,
                supplierId: r.SupplierId as string,
                supplierName: r.supplier_name as string | undefined,
                issueDate: r.InvoiceDate as string,
                subtotal: Money.toNumber(Money.parseDb(r.Subtotal)),
                taxAmount: Money.toNumber(Money.parseDb(r.TaxAmount)),
                totalAmount: Money.toNumber(Money.parseDb(r.TotalAmount)),
                status: r.Status as string,
                reason: r.reason as string | null,
                notes: r.Notes as string | null,
                createdAt: r.CreatedAt as string,
                updatedAt: r.UpdatedAt as string,
            })),
        };
    },

    // ----------------------------------------------------------
    // Update AP on original supplier invoice after credit/debit note posted
    // Mirrors customer-side adjustOriginalInvoiceBalance
    // ----------------------------------------------------------

    async adjustSupplierInvoiceBalance(
        client: Pool | PoolClient,
        originalInvoiceId: string,
        adjustmentAmount: number,
        direction: 'CREDIT' | 'DEBIT'
    ): Promise<void> {
        if (direction === 'CREDIT') {
            // Supplier credit note: reduce what we owe (reduces AP)
            await client.query(
                `UPDATE supplier_invoices
         SET "AmountPaid" = "AmountPaid" + $2,
             "OutstandingBalance" = GREATEST("TotalAmount" - ("AmountPaid" + $2), 0),
             "Status" = CASE
               WHEN GREATEST("TotalAmount" - ("AmountPaid" + $2), 0) = 0 THEN 'PAID'
               WHEN ("AmountPaid" + $2) > 0 THEN 'PARTIALLY_PAID'
               ELSE "Status"
             END,
             "UpdatedAt" = NOW()
         WHERE "Id" = $1`,
                [originalInvoiceId, adjustmentAmount]
            );
        } else {
            // Supplier debit note reversal: restore previously credited amount
            await client.query(
                `UPDATE supplier_invoices
         SET "AmountPaid" = GREATEST("AmountPaid" - $2, 0),
             "OutstandingBalance" = "TotalAmount" - GREATEST("AmountPaid" - $2, 0),
             "Status" = CASE
               WHEN "TotalAmount" - GREATEST("AmountPaid" - $2, 0) <= 0 THEN 'PAID'
               WHEN GREATEST("AmountPaid" - $2, 0) > 0 THEN 'PARTIALLY_PAID'
               ELSE 'RECEIVED'
             END,
             "UpdatedAt" = NOW()
         WHERE "Id" = $1`,
                [originalInvoiceId, adjustmentAmount]
            );
        }
    },

    // ----------------------------------------------------------
    // Cancel a posted supplier note (POSTED → CANCELLED)
    // ----------------------------------------------------------

    async cancelSupplierNote(client: Pool | PoolClient, noteId: string): Promise<SupplierCreditDebitNoteRecord | null> {
        const result = await client.query(
            `UPDATE supplier_invoices
       SET "Status" = 'CANCELLED', "UpdatedAt" = NOW()
       WHERE "Id" = $1 AND "Status" = 'POSTED' AND document_type IN ('SUPPLIER_CREDIT_NOTE', 'SUPPLIER_DEBIT_NOTE')
       RETURNING *`,
            [noteId]
        );
        if (!result.rows[0]) return null;
        const r = result.rows[0];
        return {
            id: r.Id, invoiceNumber: r.SupplierInvoiceNumber, documentType: r.document_type,
            referenceInvoiceId: r.reference_invoice_id,
            supplierId: r.SupplierId,
            issueDate: r.InvoiceDate,
            subtotal: Money.toNumber(Money.parseDb(r.Subtotal)),
            taxAmount: Money.toNumber(Money.parseDb(r.TaxAmount)),
            totalAmount: Money.toNumber(Money.parseDb(r.TotalAmount)),
            status: r.Status, reason: r.reason, notes: r.Notes,
            createdAt: r.CreatedAt, updatedAt: r.UpdatedAt,
        };
    },

    async getSupplierNoteById(client: Pool | PoolClient, noteId: string): Promise<SupplierCreditDebitNoteRecord | null> {
        const result = await client.query(
            `SELECT si.*, ref."SupplierInvoiceNumber" as ref_invoice_number,
              s."CompanyName" as supplier_name
       FROM supplier_invoices si
       LEFT JOIN supplier_invoices ref ON ref."Id" = si.reference_invoice_id
       LEFT JOIN suppliers s ON s."Id" = si."SupplierId"
       WHERE si."Id" = $1 AND si.document_type IN ('SUPPLIER_CREDIT_NOTE', 'SUPPLIER_DEBIT_NOTE')`,
            [noteId]
        );
        if (!result.rows[0]) return null;
        const r = result.rows[0];
        return {
            id: r.Id, invoiceNumber: r.SupplierInvoiceNumber, documentType: r.document_type,
            referenceInvoiceId: r.reference_invoice_id,
            referenceInvoiceNumber: r.ref_invoice_number,
            supplierId: r.SupplierId,
            supplierName: r.supplier_name,
            issueDate: r.InvoiceDate,
            subtotal: Money.toNumber(Money.parseDb(r.Subtotal)),
            taxAmount: Money.toNumber(Money.parseDb(r.TaxAmount)),
            totalAmount: Money.toNumber(Money.parseDb(r.TotalAmount)),
            status: r.Status, reason: r.reason, notes: r.Notes,
            createdAt: r.CreatedAt, updatedAt: r.UpdatedAt,
        };
    },
};
