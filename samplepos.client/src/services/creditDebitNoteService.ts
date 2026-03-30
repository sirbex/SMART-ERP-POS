/**
 * Credit/Debit Note API Service
 * 
 * Frontend API client for credit notes and debit notes.
 * Covers both customer (AR) and supplier (AP) sides.
 */

import { api } from './api';

// ============================================================
// Types
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

export interface CreateNoteLineInput {
  productId?: string;
  productName: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

export interface CreateSupplierNoteLineInput {
  productId?: string;
  productName: string;
  description?: string;
  quantity: number;
  unitCost: number;
  taxRate: number;
}

export interface CreateCreditNoteRequest {
  invoiceId: string;
  reason: string;
  noteType: 'FULL' | 'PARTIAL' | 'PRICE_CORRECTION';
  issueDate?: string;
  lines: CreateNoteLineInput[];
  notes?: string;
}

export interface CreateDebitNoteRequest {
  invoiceId: string;
  reason: string;
  issueDate?: string;
  lines: CreateNoteLineInput[];
  notes?: string;
}

export interface CreateSupplierCreditNoteRequest {
  invoiceId: string;
  reason: string;
  noteType: 'FULL' | 'PARTIAL' | 'PRICE_CORRECTION';
  issueDate?: string;
  lines: CreateSupplierNoteLineInput[];
  notes?: string;
}

export interface CreateSupplierDebitNoteRequest {
  invoiceId: string;
  reason: string;
  issueDate?: string;
  lines: CreateSupplierNoteLineInput[];
  notes?: string;
}

// ============================================================
// Customer Credit/Debit Note Service
// ============================================================

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

  async createCustomerCreditNote(data: CreateCreditNoteRequest) {
    const response = await api.post('/credit-debit-notes/customer/credit-note', data);
    return response.data;
  },

  async createCustomerDebitNote(data: CreateDebitNoteRequest) {
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

  // ============================================================
  // Supplier Credit/Debit Notes
  // ============================================================

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

  async createSupplierCreditNote(data: CreateSupplierCreditNoteRequest) {
    const response = await api.post('/credit-debit-notes/supplier/credit-note', data);
    return response.data;
  },

  async createSupplierDebitNote(data: CreateSupplierDebitNoteRequest) {
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
};
