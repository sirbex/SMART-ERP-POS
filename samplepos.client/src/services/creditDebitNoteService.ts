/**
 * Credit/Debit Note API client.
 * Create payload shapes are SSOT from @shared/zod/creditDebitNote.
 */

import { api } from './api';
import type {
    CreateCustomerCreditNote,
    CreateCustomerDebitNote,
    CreateSupplierCreditNote,
    CreateSupplierDebitNote,
    NoteLineItem as ZodNoteLineItem,
    SupplierNoteLineItem,
} from '@shared/zod/creditDebitNote';

// ============================================================
// List / detail types (API responses)
// ============================================================

export interface CreditDebitNote {
    id: string;
    invoiceNumber: string;
    documentType: 'CREDIT_NOTE' | 'DEBIT_NOTE';
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
    createdAt: string;
    updatedAt: string;
}

export interface SupplierCreditDebitNote {
    id: string;
    invoiceNumber: string;
    documentType: 'SUPPLIER_CREDIT_NOTE' | 'SUPPLIER_DEBIT_NOTE';
    referenceInvoiceId: string;
    referenceInvoiceNumber?: string;
    supplierId: string;
    supplierName?: string;
    issueDate: string;
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
    /** Live remaining balance — SCN > 0 means on-account (unapplied) credit. */
    outstandingBalance: number;
    status: string;
    reason: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface NoteLineItem {
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

/** @deprecated Use Zod types from @shared/zod/creditDebitNote */
export type CreateNoteLineInput = ZodNoteLineItem;
/** @deprecated Use SupplierNoteLineItem from @shared/zod/creditDebitNote */
export type CreateSupplierNoteLineInput = SupplierNoteLineItem;
export type CreateCreditNoteRequest = CreateCustomerCreditNote;
export type CreateDebitNoteRequest = CreateCustomerDebitNote;
export type CreateSupplierCreditNoteRequest = CreateSupplierCreditNote;
export type CreateSupplierDebitNoteRequest = CreateSupplierDebitNote;

export const creditDebitNoteService = {
    async listCustomerNotes(params?: {
        page?: number;
        limit?: number;
        documentType?: 'CREDIT_NOTE' | 'DEBIT_NOTE';
        customerId?: string;
        referenceInvoiceId?: string;
        status?: string;
    }) {
        const response = await api.get('/credit-debit-notes/customer', { params });
        return response.data;
    },

    async getCustomerNote(id: string) {
        const response = await api.get(`/credit-debit-notes/customer/${id}`);
        return response.data;
    },

    async getNotesForInvoice(invoiceId: string) {
        const response = await api.get(`/credit-debit-notes/customer/invoice/${invoiceId}`);
        return response.data;
    },

    async createCustomerCreditNote(data: CreateCustomerCreditNote) {
        const response = await api.post('/credit-debit-notes/customer/credit-note', data);
        return response.data;
    },

    async createCustomerDebitNote(data: CreateCustomerDebitNote) {
        const response = await api.post('/credit-debit-notes/customer/debit-note', data);
        return response.data;
    },

    async postCustomerNote(id: string) {
        const response = await api.post(`/credit-debit-notes/customer/${id}/post`);
        return response.data;
    },

    async cancelCustomerNote(id: string, reason: string) {
        const response = await api.post(`/credit-debit-notes/customer/${id}/cancel`, { reason });
        return response.data;
    },

    async listSupplierNotes(params?: {
        page?: number;
        limit?: number;
        documentType?: 'SUPPLIER_CREDIT_NOTE' | 'SUPPLIER_DEBIT_NOTE';
        supplierId?: string;
        referenceInvoiceId?: string;
        status?: string;
    }) {
        const response = await api.get('/credit-debit-notes/supplier', { params });
        return response.data;
    },

    async getSupplierNote(id: string) {
        const response = await api.get(`/credit-debit-notes/supplier/${id}`);
        return response.data;
    },

    async getNotesForSupplierInvoice(invoiceId: string) {
        const response = await api.get(`/credit-debit-notes/supplier/invoice/${invoiceId}`);
        return response.data;
    },

    async createSupplierCreditNote(data: CreateSupplierCreditNote) {
        const response = await api.post('/credit-debit-notes/supplier/credit-note', data);
        return response.data;
    },

    async createSupplierDebitNote(data: CreateSupplierDebitNote) {
        const response = await api.post('/credit-debit-notes/supplier/debit-note', data);
        return response.data;
    },

    async postSupplierNote(id: string) {
        const response = await api.post(`/credit-debit-notes/supplier/${id}/post`);
        return response.data;
    },

    async cancelSupplierNote(id: string, reason: string) {
        const response = await api.post(`/credit-debit-notes/supplier/${id}/cancel`, { reason });
        return response.data;
    },

    async applySupplierCreditNoteFIFO(id: string): Promise<{
        success: boolean;
        data: {
            creditNoteId: string;
            totalApplied: number;
            residual: number;
            allocations: Array<{ billId: string; amount: number }>;
        };
        message?: string;
    }> {
        const response = await api.post(`/credit-debit-notes/supplier/${id}/apply`);
        return response.data;
    },
};
