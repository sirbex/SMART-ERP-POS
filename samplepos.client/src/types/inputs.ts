/**
 * Input/Payload Types
 * 
 * TypeScript interfaces for API request payloads (create/update operations).
 * These match the backend Zod schemas and controller expectations.
 */

// ─── Product ───────────────────────────────────────────────────────────

export interface CreateProductInput {
  sku?: string;
  barcode?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  unitOfMeasure?: string;
  conversionFactor?: number;
  costPrice: number | string;
  sellingPrice: number | string;
  costingMethod?: 'FIFO' | 'AVCO' | 'STANDARD';
  taxRate?: number | string;
  pricingFormula?: string | null;
  autoUpdatePrice?: boolean;
  reorderLevel?: number | string;
  trackExpiry?: boolean;
  isActive?: boolean;
  supplierId?: string;
}

export type UpdateProductInput = Partial<CreateProductInput>;

// ─── Customer ──────────────────────────────────────────────────────────

export interface CreateCustomerInput {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  groupId?: string;
  creditLimit?: number | string;
  isActive?: boolean;
}

export type UpdateCustomerInput = Partial<CreateCustomerInput>;

// ─── Supplier ──────────────────────────────────────────────────────────

export interface CreateSupplierInput {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  contactPerson?: string;
  paymentTerms?: string;
  isActive?: boolean;
}

export type UpdateSupplierInput = Partial<CreateSupplierInput>;

// ─── Sale ──────────────────────────────────────────────────────────────

export interface CreateSaleItemInput {
  productId: string;
  batchId?: string;
  quantity: number | string;
  unitPrice: number | string;
  discountPercent?: number | string;
  taxPercent?: number | string;
  uomId?: string;
}

export interface CreateSaleInput {
  customerId?: string;
  items: CreateSaleItemInput[];
  paymentMethod: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'CREDIT' | 'BANK_TRANSFER';
  amountPaid?: number | string;
  notes?: string;
  discountAmount?: number | string;
  taxAmount?: number | string;
  saleDate?: string;
  holdId?: string;
}

// ─── Purchase Order ────────────────────────────────────────────────────

export interface CreatePurchaseOrderItemInput {
  productId: string;
  quantity: number | string;
  unitCost: number | string;
  notes?: string;
}

export interface CreatePurchaseOrderInput {
  supplierId: string;
  items: CreatePurchaseOrderItemInput[];
  expectedDeliveryDate?: string;
  notes?: string;
}

// ─── Goods Receipt ─────────────────────────────────────────────────────

export interface CreateGoodsReceiptItemInput {
  productId: string;
  quantityReceived?: number | string;
  receivedQuantity?: number | string;
  unitCost: number | string;
  batchNumber?: string | null;
  expiryDate?: string | null;
  notes?: string;
  poItemId?: string;
  productName?: string;
  orderedQuantity?: number | string;
}

export interface CreateGoodsReceiptInput {
  purchaseOrderId?: string | null;
  supplierId?: string;
  source?: string;
  items?: CreateGoodsReceiptItemInput[];
  notes?: string | null;
  receivedDate?: string;
  receiptDate?: string;
  receivedBy?: string;
}

export interface UpdateGoodsReceiptItemInput {
  quantityReceived?: number | string;
  receivedQuantity?: number | string;
  unitCost?: number | string;
  batchNumber?: string | null;
  expiryDate?: string | null;
  notes?: string;
  isBonus?: boolean;
}

// ─── Inventory ─────────────────────────────────────────────────────────

export interface InventoryAdjustmentInput {
  productId: string;
  adjustment: number | string;
  reason: string;
  userId?: string;
  batchId?: string;
}

export interface RecordStockMovementInput {
  productId: string;
  batchId?: string;
  type: 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'TRANSFER' | 'RETURN' | 'DAMAGE' | 'EXPIRY';
  quantity: number | string;
  referenceId?: string;
  referenceType?: string;
  notes?: string;
  createdBy?: string;
}

// ─── Invoice ───────────────────────────────────────────────────────────

export interface CreateInvoiceInput {
  customerId: string;
  saleId?: string;
  issueDate?: string;
  dueDate?: string;
  notes?: string;
  initialPaymentAmount?: number;
}

export interface RecordInvoicePaymentInput {
  amount: number;
  paymentMethod: string;
  paymentDate?: string;
  referenceNumber?: string;
  notes?: string;
}

// ─── Payments ──────────────────────────────────────────────────────────

export interface SplitPaymentInput {
  saleData: CreateSaleInput;
  payments: Array<{
    method: string;
    amount: number | string;
    reference?: string;
  }>;
  customerId?: string;
}

export interface RecordCustomerPaymentInput {
  amount: number | string;
  paymentMethod: string;
  reference?: string;
  notes?: string;
}

// ─── Hold Orders ───────────────────────────────────────────────────────

export interface CreateHoldOrderInput {
  items: CreateSaleItemInput[];
  customerId?: string;
  notes?: string;
  terminalId?: string;
}

// ─── Settings ──────────────────────────────────────────────────────────

export interface InvoiceSettingsInput {
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  logoUrl?: string;
  taxId?: string;
  paymentTerms?: string;
  footerNote?: string;
  prefix?: string;
  [key: string]: string | undefined;
}

// ─── PO Invoices/Payments (Supplier) ───────────────────────────────────

export interface CreatePOInvoiceInput {
  purchaseOrderId: string;
  invoiceNumber: string;
  amount: number | string;
  dueDate?: string;
  notes?: string;
}

export interface RecordPOPaymentInput {
  invoiceId: string;
  amount: number | string;
  paymentMethod: string;
  reference?: string;
  notes?: string;
}

// ─── Sales Filters ─────────────────────────────────────────────────────

export interface SaleListFilters {
  startDate?: string;
  endDate?: string;
  customerId?: string;
  paymentMethod?: string;
  status?: string;
}

// ─── Generic Filter Record (for URL params) ────────────────────────────

export type FilterRecord = Record<string, string | number | boolean | undefined>;
