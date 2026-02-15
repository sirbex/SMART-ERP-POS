// Shared Zod Schemas - Invoices
// Used by both frontend and backend for validation

import { z } from 'zod';

export const InvoiceStatusEnum = z.enum(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED']);
export type InvoiceStatus = z.infer<typeof InvoiceStatusEnum>;

export const InvoiceSchema = z
  .object({
    id: z.string().uuid(),
    invoiceNumber: z.string(),
    customerId: z.string().uuid(),
    saleId: z.string().uuid().optional().nullable(),
    issueDate: z.string(),
    dueDate: z.string().optional().nullable(),
    status: InvoiceStatusEnum,
    subtotal: z.number().nonnegative(),
    taxAmount: z.number().nonnegative().default(0),
    totalAmount: z.number().nonnegative(),
    amountPaid: z.number().nonnegative().default(0),
    balance: z.number().nonnegative().default(0),
    notes: z.string().optional().nullable(),
    createdById: z.string().uuid().optional().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

// Line items associated with an invoice (via linked sale)
export const InvoiceLineItemSchema = z
  .object({
    id: z.string().uuid().optional(),
    productId: z.string().uuid(),
    productName: z.string().optional().nullable(),
    quantity: z.number().nonnegative(),
    unitPrice: z.number().nonnegative(),
    lineTotal: z.number().nonnegative(),
    unitCost: z.number().nonnegative().optional(),
  })
  .strict();

export const InvoiceDetailSchema = z
  .object({
    invoice: InvoiceSchema,
    items: z.array(InvoiceLineItemSchema).default([]),
    payments: z.array(
      z.object({
        id: z.string().uuid(),
        receiptNumber: z.string().optional(),
        receipt_number: z.string().optional(),
        paymentDate: z.string().datetime().optional(),
        payment_date: z.string().datetime().optional(),
        paymentMethod: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CREDIT']).optional(),
        payment_method: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CREDIT']).optional(),
        amount: z.number().positive(),
        referenceNumber: z.string().optional().nullable(),
        reference_number: z.string().optional().nullable(),
        createdAt: z.string().datetime().optional(),
        created_at: z.string().datetime().optional(),
      })
    ).default([]),
  })
  .strict();

export const CreateInvoiceSchema = z
  .object({
    customerId: z.string().uuid(),
    saleId: z.string().uuid().optional(),
    issueDate: z.string().optional(),
    dueDate: z.string().optional(),
    notes: z.string().max(1000).optional(),
    initialPaymentAmount: z.number().nonnegative().optional(),
  })
  .strict();

export const RecordInvoicePaymentSchema = z
  .object({
    amount: z.number().positive('Payment amount must be positive'),
    paymentMethod: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CREDIT', 'DEPOSIT']),
    paymentDate: z.string().datetime().optional(),
    referenceNumber: z.string().max(200).optional(),
    notes: z.string().max(1000).optional(),
  })
  .strict();

export const InvoicePaymentSchema = z
  .object({
    id: z.string().uuid(),
    receiptNumber: z.string(),
    invoiceId: z.string().uuid(),
    paymentDate: z.string().datetime(),
    paymentMethod: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CREDIT', 'DEPOSIT']),
    amount: z.number().positive(),
    referenceNumber: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    processedById: z.string().uuid().optional().nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();

export type Invoice = z.infer<typeof InvoiceSchema>;
export type CreateInvoice = z.infer<typeof CreateInvoiceSchema>;
export type InvoicePayment = z.infer<typeof InvoicePaymentSchema>;
export type RecordInvoicePayment = z.infer<typeof RecordInvoicePaymentSchema>;
export type InvoiceLineItem = z.infer<typeof InvoiceLineItemSchema>;
export type InvoiceDetail = z.infer<typeof InvoiceDetailSchema>;
