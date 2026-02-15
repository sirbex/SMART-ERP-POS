// Shared Zod Schemas - Quotations System
// Used by both frontend and backend for validation
// Integrates with existing invoice/sale schemas

import { z } from 'zod';

// ============================================================================
// ENUMS
// ============================================================================

export const QuotationStatusEnum = z.enum([
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CONVERTED',
  'CANCELLED',
]);
export type QuotationStatus = z.infer<typeof QuotationStatusEnum>;

export const QuoteTypeEnum = z.enum(['quick', 'standard']);
export type QuoteType = z.infer<typeof QuoteTypeEnum>;

export const QuoteItemTypeEnum = z.enum(['product', 'service', 'custom']);
export type QuoteItemType = z.infer<typeof QuoteItemTypeEnum>;

// ============================================================================
// QUOTATION ITEM SCHEMA
// ============================================================================

export const QuotationItemSchema = z
  .object({
    id: z.string().uuid().optional(),
    quotationId: z.string().uuid().optional(),
    lineNumber: z.number().int().positive(),

    // Product link (optional) - handles null for custom/service items
    productId: z.string().uuid().nullable().optional(),

    // Item details
    itemType: QuoteItemTypeEnum.default('product'),
    sku: z.string().max(100).nullable().optional(),
    description: z.string().min(1).max(500),
    notes: z.string().max(500).optional().or(z.null()).transform(val => val ?? undefined),

    // Quantities and pricing
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative(),
    discountAmount: z.number().nonnegative().default(0),
    subtotal: z.number().nonnegative(),

    // Tax
    isTaxable: z.boolean().default(true),
    taxRate: z.number().nonnegative().max(100).default(0),
    taxAmount: z.number().nonnegative().default(0),

    // Total
    lineTotal: z.number().nonnegative(),

    // UOM
    uomId: z.string().uuid().optional().nullable(),
    uomName: z.string().max(50).optional().nullable(),

    // Cost (for margin calc)
    unitCost: z.number().nonnegative().optional(),
    costTotal: z.number().nonnegative().optional(),

    // Product type
    productType: z.string().max(20).optional().default('inventory'),

    createdAt: z.string().datetime().optional(),
  })
  .strict();

export type QuotationItem = z.infer<typeof QuotationItemSchema>;

// ============================================================================
// QUOTATION SCHEMA (Main)
// ============================================================================

export const QuotationSchema = z
  .object({
    // Primary identification
    id: z.string().uuid(),
    quoteNumber: z.string(),
    quoteType: QuoteTypeEnum.default('standard'),

    // Customer
    customerId: z.string().uuid().optional().nullable(),
    customerName: z.string().max(255).optional().nullable(),
    customerPhone: z.string().max(50).optional().nullable(),
    customerEmail: z.string().email().optional().nullable(),

    // Reference
    reference: z.string().max(255).optional().nullable(),
    description: z.string().optional().nullable(),

    // Amounts
    subtotal: z.number().nonnegative(),
    discountAmount: z.number().nonnegative().default(0),
    taxAmount: z.number().nonnegative().default(0),
    totalAmount: z.number().nonnegative(),

    // Status and dates
    status: QuotationStatusEnum.default('DRAFT'),
    validFrom: z.string(), // DATE
    validUntil: z.string(), // DATE

    // Conversion tracking
    convertedToSaleId: z.string().uuid().optional().nullable(),
    convertedToInvoiceId: z.string().uuid().optional().nullable(),
    convertedAt: z.string().datetime().optional().nullable(),

    // Ownership
    createdById: z.string().uuid().optional().nullable(),
    assignedToId: z.string().uuid().optional().nullable(),

    // Terms
    termsAndConditions: z.string().optional().nullable(),
    paymentTerms: z.string().optional().nullable(),
    deliveryTerms: z.string().optional().nullable(),

    // Notes
    internalNotes: z.string().optional().nullable(),
    rejectionReason: z.string().optional().nullable(),

    // Approval
    requiresApproval: z.boolean().default(false),
    approvedById: z.string().uuid().optional().nullable(),
    approvedAt: z.string().datetime().optional().nullable(),

    // Revision
    parentQuoteId: z.string().uuid().optional().nullable(),
    revisionNumber: z.number().int().positive().default(1),

    // Audit
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type Quotation = z.infer<typeof QuotationSchema>;

// ============================================================================
// QUOTATION WITH ITEMS (For detail views)
// ============================================================================

export const QuotationDetailSchema = z
  .object({
    quotation: QuotationSchema,
    items: z.array(QuotationItemSchema).default([]),
  })
  .strict();

export type QuotationDetail = z.infer<typeof QuotationDetailSchema>;

// ============================================================================
// CREATE QUOTATION INPUT
// ============================================================================

export const CreateQuotationInputSchema = z
  .object({
    // Quote type
    quoteType: QuoteTypeEnum.optional().default('standard'),

    // Customer (either ID or details for walk-in)
    customerId: z.string().uuid().optional(),
    customerName: z.string().max(255).optional(),
    customerPhone: z.string().max(50).optional(),
    customerEmail: z.string().email().optional(),

    // Reference
    reference: z.string().max(255).optional(),
    description: z.string().optional(),

    // Validity
    validFrom: z.string().optional(), // DATE, defaults to today
    validUntil: z.string().optional(), // DATE, defaults to +30 days

    // Terms
    termsAndConditions: z.string().optional(),
    paymentTerms: z.string().optional(),
    deliveryTerms: z.string().optional(),

    // Internal notes
    internalNotes: z.string().optional(),

    // Approval
    requiresApproval: z.boolean().optional().default(false),
    assignedToId: z.string().uuid().optional(),

    // Items
    items: z
      .array(
        z.object({
          productId: z.string().uuid().nullable().optional(),
          itemType: QuoteItemTypeEnum.default('product'),
          sku: z.string().max(100).nullable().optional(),
          description: z.string().min(1).max(500),
          notes: z.string().max(500).optional().or(z.null()).transform(val => val ?? undefined),
          quantity: z.number().positive(),
          unitPrice: z.number().nonnegative(),
          discountAmount: z.number().nonnegative().optional().default(0),
          isTaxable: z.boolean().optional().default(true),
          taxRate: z.number().nonnegative().max(100).optional().default(0),
          uomId: z.string().uuid().optional(),
          uomName: z.string().max(50).optional(),
          unitCost: z.number().nonnegative().optional(),
          productType: z.string().max(20).optional().default('inventory'),
        })
      )
      .min(1, 'At least one item is required'),
  })
  .strict()
  .refine(
    (data) => {
      // Must have either customerId or customerName
      return !!(data.customerId || data.customerName);
    },
    {
      message: 'Either customerId or customerName is required',
      path: ['customerId'],
    }
  );

export type CreateQuotationInput = z.infer<typeof CreateQuotationInputSchema>;

// ============================================================================
// UPDATE QUOTATION INPUT
// ============================================================================

export const UpdateQuotationInputSchema = z
  .object({
    // Customer
    customerId: z.string().uuid().optional(),
    customerName: z.string().max(255).optional(),
    customerPhone: z.string().max(50).optional(),
    customerEmail: z.string().email().optional().or(z.literal('')).or(z.null()).transform(val => val === '' || val === null ? undefined : val),

    // Reference
    reference: z.string().max(255).optional(),
    description: z.string().optional(),

    // Validity
    validFrom: z.string().optional(),
    validUntil: z.string().optional(),

    // Status
    status: QuotationStatusEnum.optional(),

    // Terms
    termsAndConditions: z.string().optional(),
    paymentTerms: z.string().optional(),
    deliveryTerms: z.string().optional(),

    // Notes
    internalNotes: z.string().optional(),
    rejectionReason: z.string().optional(),

    // Assignment
    assignedToId: z.string().uuid().optional(),

    // Approval
    requiresApproval: z.boolean().optional(),

    // Items (optional - separate endpoint may be preferred)
    items: z
      .array(
        z.object({
          id: z.string().uuid().optional(), // Existing item
          productId: z.string().uuid().nullable().optional(),
          itemType: QuoteItemTypeEnum.optional(),
          sku: z.string().max(100).nullable().optional(),
          description: z.string().min(1).max(500),
          notes: z.string().max(500).optional().or(z.null()).transform(val => val ?? undefined),
          quantity: z.number().positive(),
          unitPrice: z.number().nonnegative(),
          discountAmount: z.number().nonnegative().optional(),
          isTaxable: z.boolean().optional(),
          taxRate: z.number().nonnegative().max(100).optional(),
          uomId: z.string().uuid().optional().nullable(),
          uomName: z.string().max(50).optional().nullable(),
          unitCost: z.number().nonnegative().optional(),
          productType: z.string().max(20).optional(),
        })
      )
      .optional(),
  })
  .strict();

export type UpdateQuotationInput = z.infer<typeof UpdateQuotationInputSchema>;

// ============================================================================
// CONVERT QUOTATION TO SALE INPUT
// ============================================================================

export const ConvertQuotationInputSchema = z
  .object({
    // Payment option
    paymentOption: z.enum(['full', 'partial', 'none']).default('none'),

    // If partial, specify deposit
    depositAmount: z.number().positive().optional(),
    depositMethod: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER']).optional(),
    depositReference: z.string().max(255).optional(),

    // Sale details
    saleDate: z.string().optional(), // DATE, defaults to today
    notes: z.string().optional(),

    // Invoice details
    invoiceDueDate: z.string().optional(), // DATE
  })
  .strict()
  .refine(
    (data) => {
      // If paymentOption is 'partial', depositAmount is required
      if (data.paymentOption === 'partial') {
        return !!data.depositAmount && data.depositAmount > 0;
      }
      return true;
    },
    {
      message: 'Deposit amount required for partial payment',
      path: ['depositAmount'],
    }
  )
  .refine(
    (data) => {
      // If depositAmount provided, depositMethod is required
      if (data.depositAmount && data.depositAmount > 0) {
        return !!data.depositMethod;
      }
      return true;
    },
    {
      message: 'Deposit method required when deposit amount is provided',
      path: ['depositMethod'],
    }
  );

export type ConvertQuotationInput = z.infer<typeof ConvertQuotationInputSchema>;

// ============================================================================
// SEND QUOTATION EMAIL INPUT
// ============================================================================

export const SendQuotationEmailInputSchema = z
  .object({
    recipientEmail: z.string().email(),
    recipientName: z.string().max(255).optional(),
    subject: z.string().min(1).max(500).optional(),
    body: z.string().optional(),
    includeTerms: z.boolean().default(true),
    attachPDF: z.boolean().default(true),
  })
  .strict();

export type SendQuotationEmailInput = z.infer<typeof SendQuotationEmailInputSchema>;

// ============================================================================
// QUOTATION STATUS HISTORY
// ============================================================================

export const QuotationStatusHistorySchema = z
  .object({
    id: z.string().uuid(),
    quotationId: z.string().uuid(),
    fromStatus: QuotationStatusEnum.optional().nullable(),
    toStatus: QuotationStatusEnum,
    notes: z.string().optional().nullable(),
    changedById: z.string().uuid().optional().nullable(),
    changedAt: z.string().datetime(),
  })
  .strict();

export type QuotationStatusHistory = z.infer<typeof QuotationStatusHistorySchema>;

// ============================================================================
// QUOTATION ATTACHMENT
// ============================================================================

export const QuotationAttachmentSchema = z
  .object({
    id: z.string().uuid(),
    quotationId: z.string().uuid(),
    fileName: z.string().max(255),
    filePath: z.string().max(500),
    fileSize: z.number().int().nonnegative().optional(),
    mimeType: z.string().max(100).optional(),
    description: z.string().optional().nullable(),
    uploadedById: z.string().uuid().optional().nullable(),
    uploadedAt: z.string().datetime(),
  })
  .strict();

export type QuotationAttachment = z.infer<typeof QuotationAttachmentSchema>;

// ============================================================================
// QUOTATION LIST FILTERS
// ============================================================================

export const QuotationListFiltersSchema = z
  .object({
    page: z.number().int().positive().default(1),
    limit: z.number().int().positive().max(100).default(20),
    customerId: z.string().uuid().optional(),
    status: QuotationStatusEnum.optional(),
    quoteType: QuoteTypeEnum.optional(),
    assignedToId: z.string().uuid().optional(),
    createdById: z.string().uuid().optional(),
    fromDate: z.string().optional(), // DATE
    toDate: z.string().optional(), // DATE
    searchTerm: z.string().optional(), // Search in quote_number, customer_name, reference
  })
  .strict();

export type QuotationListFilters = z.infer<typeof QuotationListFiltersSchema>;

// ============================================================================
// QUICK QUOTE (POS) INPUT
// ============================================================================

export const CreateQuickQuoteInputSchema = z
  .object({
    // Customer (optional for walk-ins)
    customerId: z.string().uuid().optional(),
    customerName: z.string().max(255).optional(),
    customerPhone: z.string().max(50).optional(),

    // Items from cart
    items: z
      .array(
        z.object({
          productId: z.string().uuid().nullable().optional(),
          itemType: z.enum(['product', 'service', 'custom']).default('product'),
          sku: z.string().max(100).nullable().optional(),
          description: z.string().min(1),
          quantity: z.number().positive(),
          unitPrice: z.number().nonnegative(),
          isTaxable: z.boolean().optional().default(true),
          taxRate: z.number().nonnegative().optional().default(0),
          uomId: z.string().uuid().optional(),
          uomName: z.string().optional(),
          unitCost: z.number().nonnegative().optional(),
          productType: z.string().optional(),
        })
      )
      .min(1),

    // Quick quote doesn't need terms - uses defaults
    validityDays: z.number().int().positive().default(30),
    notes: z.string().optional(),
  })
  .strict();

export type CreateQuickQuoteInput = z.infer<typeof CreateQuickQuoteInputSchema>;
