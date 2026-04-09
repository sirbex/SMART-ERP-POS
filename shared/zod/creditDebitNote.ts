/**
 * Credit/Debit Note Zod Schemas
 * Validates credit and debit note creation for both customer and supplier sides
 */
import { z } from 'zod';

// ============================================================
// CUSTOMER SIDE: Credit Notes & Debit Notes
// ============================================================

export const CustomerDocumentType = z.enum(['INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE']);
export type CustomerDocumentType = z.infer<typeof CustomerDocumentType>;

export const NoteLineItemSchema = z.object({
    invoiceLineItemId: z.string().uuid().optional(),
    productId: z.string().optional(),
    productName: z.string().min(1).max(200),
    description: z.string().max(500).optional(),
    quantity: z.number().positive('Quantity must be positive'),
    unitPrice: z.number().nonnegative('Unit price must be non-negative'),
    taxRate: z.number().min(0).max(100).default(0),
}).strict();

export const CreateCustomerCreditNoteSchema = z.object({
    invoiceId: z.string().uuid('Invoice ID must be a valid UUID'),
    reason: z.string().min(1, 'Reason is required').max(500),
    noteType: z.enum(['FULL', 'PARTIAL', 'PRICE_CORRECTION']),
    returnsGoods: z.boolean().optional().default(false),
    issueDate: z.string().optional(),
    lines: z.array(NoteLineItemSchema).min(1, 'At least one line item is required'),
    notes: z.string().max(1000).optional(),
}).strict();

export const CreateCustomerDebitNoteSchema = z.object({
    invoiceId: z.string().uuid('Invoice ID must be a valid UUID'),
    reason: z.string().min(1, 'Reason is required').max(500),
    issueDate: z.string().optional(),
    lines: z.array(NoteLineItemSchema).min(1, 'At least one line item is required'),
    notes: z.string().max(1000).optional(),
}).strict();

// ============================================================
// SUPPLIER SIDE: Credit Notes & Debit Notes
// ============================================================

export const SupplierDocumentType = z.enum(['SUPPLIER_INVOICE', 'SUPPLIER_CREDIT_NOTE', 'SUPPLIER_DEBIT_NOTE']);
export type SupplierDocumentType = z.infer<typeof SupplierDocumentType>;

export const SupplierNoteLineItemSchema = z.object({
    invoiceLineItemId: z.string().uuid().optional(),
    productId: z.string().optional(),
    productName: z.string().min(1).max(200),
    description: z.string().max(500).optional(),
    quantity: z.number().positive('Quantity must be positive'),
    unitCost: z.number().nonnegative('Unit cost must be non-negative'),
    taxRate: z.number().min(0).max(100).default(0),
}).strict();

export const CreateSupplierCreditNoteSchema = z.object({
    invoiceId: z.string().uuid('Supplier Invoice ID must be a valid UUID'),
    reason: z.string().min(1, 'Reason is required').max(500),
    noteType: z.enum(['FULL', 'PARTIAL', 'PRICE_CORRECTION']),
    returnGrnId: z.string().uuid().optional(),
    issueDate: z.string().optional(),
    lines: z.array(SupplierNoteLineItemSchema).min(1, 'At least one line item is required'),
    notes: z.string().max(1000).optional(),
}).strict();

export const CreateSupplierDebitNoteSchema = z.object({
    invoiceId: z.string().uuid('Supplier Invoice ID must be a valid UUID'),
    reason: z.string().min(1, 'Reason is required').max(500),
    issueDate: z.string().optional(),
    lines: z.array(SupplierNoteLineItemSchema).min(1, 'At least one line item is required'),
    notes: z.string().max(1000).optional(),
}).strict();

// Post note schema (transitions DRAFT → POSTED)
export const PostNoteSchema = z.object({
    id: z.string().uuid(),
}).strict();

export type CreateCustomerCreditNote = z.infer<typeof CreateCustomerCreditNoteSchema>;
export type CreateCustomerDebitNote = z.infer<typeof CreateCustomerDebitNoteSchema>;
export type CreateSupplierCreditNote = z.infer<typeof CreateSupplierCreditNoteSchema>;
export type CreateSupplierDebitNote = z.infer<typeof CreateSupplierDebitNoteSchema>;
export type NoteLineItem = z.infer<typeof NoteLineItemSchema>;
export type SupplierNoteLineItem = z.infer<typeof SupplierNoteLineItemSchema>;
