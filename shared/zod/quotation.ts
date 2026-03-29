// Shared Zod Schemas - Quotations System
// SIMPLIFIED: 3 statuses (OPEN, CONVERTED, CANCELLED)
// Legacy DB statuses (DRAFT, SENT, etc.) are mapped to OPEN at read time.

import { z } from 'zod';

// ============================================================================
// ENUMS
// ============================================================================

// DB still holds legacy values; we accept them for reads
export const QuotationDbStatusEnum = z.enum([
  'DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED',
  'CONVERTED', 'CANCELLED',
]);

// Application-level status (after normalization)
export const QuotationStatusEnum = z.enum(['OPEN', 'CONVERTED', 'CANCELLED']);
export type QuotationStatus = z.infer<typeof QuotationStatusEnum>;

export const QuoteTypeEnum = z.enum(['quick', 'standard']);
export type QuoteType = z.infer<typeof QuoteTypeEnum>;

export const QuoteItemTypeEnum = z.enum(['product', 'service', 'custom']);
export type QuoteItemType = z.infer<typeof QuoteItemTypeEnum>;

export const FulfillmentModeEnum = z.enum(['RETAIL', 'WHOLESALE']);
export type FulfillmentMode = z.infer<typeof FulfillmentModeEnum>;

// ============================================================================
// QUOTATION ITEM SCHEMA (read model)
// ============================================================================

export const QuotationItemSchema = z.object({
  id: z.string().uuid().optional(),
  quotationId: z.string().uuid().optional(),
  lineNumber: z.number().int().positive(),
  productId: z.string().min(1).nullable().optional(),
  itemType: QuoteItemTypeEnum.default('product'),
  sku: z.preprocess(val => val != null ? String(val) : val, z.string().max(100).nullable().optional()),
  description: z.string().min(1).max(500),
  notes: z.string().max(500).optional().or(z.null()).transform(val => val ?? undefined),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  discountAmount: z.number().nonnegative().default(0),
  subtotal: z.number().nonnegative(),
  isTaxable: z.boolean().default(true),
  taxRate: z.number().nonnegative().max(100).default(0),
  taxAmount: z.number().nonnegative().default(0),
  lineTotal: z.number().nonnegative(),
  uomId: z.string().uuid().optional().nullable(),
  uomName: z.string().max(50).optional().nullable(),
  unitCost: z.number().nonnegative().optional(),
  costTotal: z.number().nonnegative().optional(),
  productType: z.string().max(20).optional().default('inventory'),
  createdAt: z.string().datetime().optional(),
}).strict();

export type QuotationItemZod = z.infer<typeof QuotationItemSchema>;

// ============================================================================
// QUOTATION SCHEMA (read model)
// ============================================================================

export const QuotationSchema = z.object({
  id: z.string().uuid(),
  quoteNumber: z.string(),
  quoteType: QuoteTypeEnum.default('standard'),
  customerId: z.string().uuid().optional().nullable(),
  customerName: z.string().max(255).optional().nullable(),
  customerPhone: z.string().max(50).optional().nullable(),
  customerEmail: z.string().email().optional().nullable(),
  reference: z.string().max(255).optional().nullable(),
  description: z.string().optional().nullable(),
  subtotal: z.number().nonnegative(),
  discountAmount: z.number().nonnegative().default(0),
  taxAmount: z.number().nonnegative().default(0),
  totalAmount: z.number().nonnegative(),
  status: QuotationDbStatusEnum.default('DRAFT'), // Raw DB status
  validFrom: z.string(),
  validUntil: z.string(),
  convertedToSaleId: z.string().uuid().optional().nullable(),
  convertedToInvoiceId: z.string().uuid().optional().nullable(),
  convertedAt: z.string().datetime().optional().nullable(),
  createdById: z.string().uuid().optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  termsAndConditions: z.string().optional().nullable(),
  paymentTerms: z.string().optional().nullable(),
  deliveryTerms: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  rejectionReason: z.string().optional().nullable(),
  requiresApproval: z.boolean().default(false),
  approvedById: z.string().uuid().optional().nullable(),
  approvedAt: z.string().datetime().optional().nullable(),
  parentQuoteId: z.string().uuid().optional().nullable(),
  revisionNumber: z.number().int().positive().default(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().optional(),
  fulfillmentMode: FulfillmentModeEnum.default('RETAIL'),
}).strict();

// ============================================================================
// ITEM INPUT (shared between create / update / quick-quote)
// ============================================================================

const QuotationItemInputSchema = z.object({
  productId: z.string().min(1).nullable().optional(),
  itemType: QuoteItemTypeEnum.default('product'),
  sku: z.preprocess(val => val != null ? String(val) : val, z.string().max(100).nullable().optional()),
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
});

// ============================================================================
// CREATE QUOTATION INPUT (unified — works for POS quick-quote AND standard)
// ============================================================================

export const CreateQuotationInputSchema = z.object({
  quoteType: QuoteTypeEnum.optional().default('standard'),
  customerId: z.string().uuid().optional(),
  customerName: z.string().max(255).optional(),
  customerPhone: z.string().max(50).optional(),
  customerEmail: z.string().email().optional().or(z.literal('')).or(z.null())
    .transform(val => (val === '' || val === null) ? undefined : val),
  validityDays: z.number().int().positive().default(30),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
  fulfillmentMode: FulfillmentModeEnum.optional().default('RETAIL'),
  items: z.array(QuotationItemInputSchema).min(1, 'At least one item is required'),
}).strict();

export type CreateQuotationInput = z.infer<typeof CreateQuotationInputSchema>;

/** Backward-compat alias for POS code */
export const CreateQuickQuoteInputSchema = CreateQuotationInputSchema;
export type CreateQuickQuoteInput = CreateQuotationInput;

// ============================================================================
// UPDATE QUOTATION INPUT
// ============================================================================

export const UpdateQuotationInputSchema = z.object({
  customerId: z.string().uuid().optional(),
  customerName: z.string().max(255).optional(),
  customerPhone: z.string().max(50).optional(),
  customerEmail: z.string().email().optional().or(z.literal('')).or(z.null())
    .transform(val => (val === '' || val === null) ? undefined : val),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(
    QuotationItemInputSchema.extend({
      id: z.string().uuid().optional(), // existing item ID
    })
  ).optional(),
}).strict();

export type UpdateQuotationInput = z.infer<typeof UpdateQuotationInputSchema>;

// ============================================================================
// CONVERT QUOTATION TO SALE
// ============================================================================

export const ConvertQuotationInputSchema = z.object({
  paymentOption: z.enum(['full', 'partial', 'none']).default('none'),
  depositAmount: z.number().positive().optional(),
  depositMethod: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER']).optional(),
  depositReference: z.string().max(255).optional(),
  saleDate: z.string().optional(),
  notes: z.string().optional(),
  invoiceDueDate: z.string().optional(),
}).strict().refine(
  data => {
    if (data.paymentOption === 'partial') return !!data.depositAmount && data.depositAmount > 0;
    return true;
  },
  { message: 'Deposit amount required for partial payment', path: ['depositAmount'] }
).refine(
  data => {
    if (data.depositAmount && data.depositAmount > 0) return !!data.depositMethod;
    return true;
  },
  { message: 'Deposit method required when deposit amount is provided', path: ['depositMethod'] }
);

export type ConvertQuotationInputZod = z.infer<typeof ConvertQuotationInputSchema>;

// ============================================================================
// LIST FILTERS
// ============================================================================

export const QuotationListFiltersSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  customerId: z.string().uuid().optional(),
  status: z.string().optional(), // accepts legacy or normalized
  quoteType: QuoteTypeEnum.optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  searchTerm: z.string().optional(),
}).strict();

export type QuotationListFilters = z.infer<typeof QuotationListFiltersSchema>;
