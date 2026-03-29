/**
 * Quotation System Types
 * Shared types for frontend and backend
 * 
 * SIMPLIFIED STATUS MODEL:
 *   OPEN → can be edited, converted, or cancelled
 *   CONVERTED → linked to a sale (locked)
 *   CANCELLED → soft-deleted (locked)
 * 
 * Legacy statuses (DRAFT, SENT, ACCEPTED, REJECTED, EXPIRED) are
 * mapped to OPEN for backward compatibility with existing DB rows.
 */

// ============================================================================
// ENUMS
// ============================================================================

/** Active statuses a user can work with */
export type QuotationStatus = 'OPEN' | 'CONVERTED' | 'CANCELLED';

/** Legacy statuses still in DB — treated as OPEN */
export type QuotationDbStatus =
  | 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED'
  | 'CONVERTED'
  | 'CANCELLED';

/** Normalize any DB status to the simplified 3-status model */
export function normalizeStatus(dbStatus: string): QuotationStatus {
  if (dbStatus === 'CONVERTED') return 'CONVERTED';
  if (dbStatus === 'CANCELLED') return 'CANCELLED';
  return 'OPEN'; // DRAFT, SENT, ACCEPTED, REJECTED, EXPIRED → OPEN
}

export type QuoteType = 'quick' | 'standard';
export type QuoteItemType = 'product' | 'service' | 'custom';
export type FulfillmentMode = 'RETAIL' | 'WHOLESALE';

// ============================================================================
// MAIN TYPES
// ============================================================================

export interface Quotation {
  id: string;
  quoteNumber: string;
  quoteType: QuoteType;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  reference: string | null;
  description: string | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  status: QuotationStatus;
  validFrom: string;
  validUntil: string;
  convertedToSaleId: string | null;
  convertedToSaleNumber?: string | null;
  convertedToInvoiceId: string | null;
  convertedToInvoiceNumber?: string | null;
  convertedAt: Date | null;
  createdById: string | null;
  internalNotes: string | null;
  fulfillmentMode: FulfillmentMode;
  createdAt: Date;
  updatedAt: Date;

  // Kept for backward compatibility but not used in new code
  assignedToId?: string | null;
  termsAndConditions?: string | null;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  rejectionReason?: string | null;
  requiresApproval?: boolean;
  approvedById?: string | null;
  approvedAt?: Date | null;
  parentQuoteId?: string | null;
  revisionNumber?: number;
}

export interface QuotationItem {
  id: string;
  quotationId: string;
  lineNumber: number;
  productId: string | null;
  itemType: QuoteItemType;
  sku: string | null;
  description: string;
  notes: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  subtotal: number;
  isTaxable: boolean;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  uomId: string | null;
  uomName: string | null;
  unitCost: number | null;
  costTotal: number | null;
  productType: string;
  createdAt: Date;
}

export interface QuotationDetail {
  quotation: Quotation;
  items: QuotationItem[];
}

// ============================================================================
// INPUT TYPES
// ============================================================================

/** Create a quotation — used by both POS quick-quote and management page */
export interface CreateQuotationInput {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  validityDays?: number;
  notes?: string;
  fulfillmentMode?: FulfillmentMode;
  items: QuotationItemInput[];
}

export interface QuotationItemInput {
  productId?: string | null;
  itemType?: QuoteItemType;
  sku?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  isTaxable?: boolean;
  taxRate?: number;
  discountAmount?: number;
  uomId?: string;
  uomName?: string;
  unitCost?: number;
  productType?: string;
}

/** Backward-compat aliases for POS code */
export type QuickQuoteItemInput = QuotationItemInput;
export type CreateQuickQuoteInput = CreateQuotationInput;

export interface UpdateQuotationInput {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  validFrom?: string;
  validUntil?: string;
  notes?: string;
  items?: QuotationItemInput[];
}

export interface ConvertQuotationInput {
  paymentOption: 'full' | 'partial' | 'none';
  depositAmount?: number;
  depositMethod?: 'CASH' | 'CARD' | 'MOBILE_MONEY';
  notes?: string;
}

export interface QuotationFilters {
  page?: number;
  limit?: number;
  customerId?: string;
  status?: string;
  quoteType?: QuoteType;
  searchTerm?: string;
  fromDate?: string;
  toDate?: string;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface QuotationListResponse {
  quotations: Quotation[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ConvertQuotationResponse {
  sale: Record<string, unknown>;
  invoice?: Record<string, unknown>;
  payment?: Record<string, unknown>;
}

// ============================================================================
// UI HELPERS
// ============================================================================

export interface QuoteStatusBadge {
  label: string;
  color: 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'purple';
}

export const getQuoteStatusBadge = (status: QuotationStatus | QuotationDbStatus | string): QuoteStatusBadge => {
  const normalized = normalizeStatus(status);
  switch (normalized) {
    case 'OPEN': return { label: 'Open', color: 'blue' };
    case 'CONVERTED': return { label: 'Converted', color: 'green' };
    case 'CANCELLED': return { label: 'Cancelled', color: 'gray' };
  }
};

export const isQuoteEditable = (status: QuotationStatus | QuotationDbStatus | string): boolean =>
  normalizeStatus(status) === 'OPEN';

/**
 * Conversion rules (SIMPLIFIED):
 * - OPEN (any non-converted, non-cancelled status)
 * - Not already linked to a sale
 * - Not expired
 */
export const isQuoteConvertible = (
  status: QuotationStatus | QuotationDbStatus | string,
  validUntil: string,
  convertedToSaleId?: string | null
): boolean => {
  if (normalizeStatus(status) !== 'OPEN') return false;
  if (convertedToSaleId) return false;
  const today = new Date().toISOString().split('T')[0];
  return validUntil >= today;
};

export const isQuoteFulfilled = (
  status: QuotationStatus | QuotationDbStatus | string,
  convertedToSaleId?: string | null
): boolean => normalizeStatus(status) === 'CONVERTED' || !!convertedToSaleId;

export const calculateQuoteAge = (createdAt: Date): number => {
  const now = new Date();
  const created = new Date(createdAt);
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
};

export const getDaysUntilExpiry = (validUntil: string): number => {
  const today = new Date().toISOString().split('T')[0];
  const expiry = new Date(validUntil);
  const now = new Date(today);
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};
