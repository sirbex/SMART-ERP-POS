/**
 * Quotation System Types
 * Shared types for frontend and backend
 */

// ============================================================================
// ENUMS
// ============================================================================

export type QuotationStatus =
  | 'DRAFT'
  | 'SENT'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CONVERTED'
  | 'CANCELLED';

export type QuoteType = 'quick' | 'standard';

export type QuoteItemType = 'product' | 'service' | 'custom';

// ============================================================================
// MAIN TYPES
// ============================================================================

export interface Quotation {
  id: string;
  quoteNumber: string;
  quoteType: QuoteType;

  // Customer
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;

  // Details
  reference: string | null;
  description: string | null;

  // Amounts
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;

  // Status & Validity
  status: QuotationStatus;
  validFrom: string; // YYYY-MM-DD
  validUntil: string; // YYYY-MM-DD

  // Conversion
  convertedToSaleId: string | null;
  convertedToSaleNumber?: string | null; // Human-readable sale number (e.g., SALE-2025-0001)
  convertedToInvoiceId: string | null;
  convertedToInvoiceNumber?: string | null; // Human-readable invoice number (e.g., INV-00001)
  convertedAt: Date | null;

  // Workflow
  createdById: string | null;
  assignedToId: string | null;
  termsAndConditions: string | null;
  paymentTerms: string | null;
  deliveryTerms: string | null;
  internalNotes: string | null;
  rejectionReason: string | null;

  // Approval
  requiresApproval: boolean;
  approvedById: string | null;
  approvedAt: Date | null;

  // Revisions
  parentQuoteId: string | null;
  revisionNumber: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface QuotationItem {
  id: string;
  quotationId: string;
  lineNumber: number;

  // Item Details
  productId: string | null;
  itemType: QuoteItemType;
  sku: string | null;
  description: string;
  notes: string | null;

  // Pricing
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  subtotal: number;

  // Tax
  isTaxable: boolean;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;

  // UOM
  uomId: string | null;
  uomName: string | null;

  // Cost
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
// INPUT TYPES (for API calls)
// ============================================================================

export interface CreateQuotationInput {
  // Customer (customerId OR customerName required)
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;

  // Details
  reference?: string;
  description?: string;
  validFrom: string; // YYYY-MM-DD
  validUntil: string; // YYYY-MM-DD

  // Workflow
  assignedToId?: string;
  termsAndConditions?: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  internalNotes?: string;
  requiresApproval?: boolean;

  // Items
  items: CreateQuotationItemInput[];
}

export interface CreateQuotationItemInput {
  productId?: string;
  itemType: QuoteItemType;
  sku?: string;
  description: string;
  notes?: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  isTaxable?: boolean;
  taxRate?: number;
  uomId?: string;
  uomName?: string;
  unitCost?: number;
  productType?: string;
}

export interface CreateQuickQuoteInput {
  // Customer (optional for walk-ins)
  customerId?: string;
  customerName?: string;
  customerPhone?: string;

  // Items from cart
  items: QuickQuoteItemInput[];

  // Quick quote settings
  validityDays?: number; // Default 30
  notes?: string;
}

export interface QuickQuoteItemInput {
  productId?: string;
  itemType?: QuoteItemType;
  sku?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  isTaxable?: boolean;
  taxRate?: number;
  uomId?: string;
  uomName?: string;
  unitCost?: number;
  productType?: string;
}

export interface UpdateQuotationInput {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  reference?: string;
  description?: string;
  validFrom?: string;
  validUntil?: string;
  status?: QuotationStatus;
  termsAndConditions?: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  internalNotes?: string;
  rejectionReason?: string;
  assignedToId?: string;
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
  status?: QuotationStatus;
  quoteType?: QuoteType;
  assignedToId?: string;
  createdById?: string;
  fromDate?: string;
  toDate?: string;
  searchTerm?: string;
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
  sale: any; // Sale type from existing sales module
  invoice?: any; // Invoice type from existing invoices module
  payment?: any; // Payment type
}

// ============================================================================
// UI HELPER TYPES
// ============================================================================

export interface QuoteStatusBadge {
  label: string;
  color: 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'purple';
}

export const getQuoteStatusBadge = (status: QuotationStatus): QuoteStatusBadge => {
  switch (status) {
    case 'DRAFT':
      return { label: 'Draft', color: 'gray' };
    case 'SENT':
      return { label: 'Sent', color: 'blue' };
    case 'ACCEPTED':
      return { label: 'Accepted', color: 'green' };
    case 'REJECTED':
      return { label: 'Rejected', color: 'red' };
    case 'EXPIRED':
      return { label: 'Expired', color: 'yellow' };
    case 'CONVERTED':
      return { label: 'Converted', color: 'purple' };
    case 'CANCELLED':
      return { label: 'Cancelled', color: 'gray' };
  }
};

export const isQuoteEditable = (status: QuotationStatus): boolean => {
  return status === 'DRAFT';
};

export const isQuoteConvertible = (
  status: QuotationStatus,
  validUntil: string,
  convertedToSaleId?: string | null
): boolean => {
  // Business Rule: Only ACCEPTED quotations that haven't been converted can be converted
  // - CONVERTED status means already processed
  // - convertedToSaleId also indicates already processed (double-check)
  // - This prevents duplicate orders and maintains clear workflow

  if (status === 'CONVERTED' || status === 'CANCELLED') {
    return false;
  }

  // Safety check: even if status isn't CONVERTED, check the sale ID
  if (convertedToSaleId) {
    return false;
  }

  const today = new Date().toISOString().split('T')[0];
  const isExpired = validUntil < today;

  // Only ACCEPTED quotes can be converted - customer must explicitly accept terms
  return !isExpired && status === 'ACCEPTED';
};

/**
 * Business Rule: Check if quotation is fulfilled (converted to sale)
 * Used to display "Fulfilled" badge and link to sale/invoice
 */
export const isQuoteFulfilled = (status: QuotationStatus, convertedToSaleId?: string | null): boolean => {
  return status === 'CONVERTED' || !!convertedToSaleId;
};

export const calculateQuoteAge = (createdAt: Date): number => {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

export const getDaysUntilExpiry = (validUntil: string): number => {
  const today = new Date().toISOString().split('T')[0];
  const expiry = new Date(validUntil);
  const now = new Date(today);
  const diffMs = expiry.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};
