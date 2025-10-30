/**
 * Backend API Type Definitions
 * 
 * Types aligned with Prisma schema and backend API responses.
 * All IDs are numbers (from PostgreSQL autoincrement).
 * All monetary values use Decimal type from backend.
 */

import { Decimal } from 'decimal.js';

// ============================================================
// API RESPONSE WRAPPERS
// ============================================================

/**
 * Standard API success response
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp?: string;
}

/**
 * Standard API error response
 */
export interface ApiError {
  error: string;
  details?: any;
  statusCode: number;
  timestamp?: string;
  path?: string;
}

/**
 * Paginated API response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

/**
 * Pagination request parameters
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ============================================================
// CUSTOMER TYPES (Aligned with Prisma Schema)
// ============================================================

/**
 * Customer Account Status (from Prisma enum)
 */
export type CustomerAccountStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

/**
 * Customer Type (from Prisma enum)
 */
export type CustomerType = 'INDIVIDUAL' | 'BUSINESS' | 'WHOLESALE' | 'RETAIL';

/**
 * Customer model from backend (matches Prisma schema)
 */
export interface Customer {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  creditLimit: Decimal;
  currentBalance: Decimal;
  depositBalance: Decimal;
  creditUsed: Decimal;
  paymentTermsDays: number;
  interestRate: Decimal;
  accountStatus: CustomerAccountStatus;
  creditScore?: number | null;
  lifetimeValue: Decimal;
  lastPurchaseDate?: Date | null;
  lastPaymentDate?: Date | null;
  isActive: boolean;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Customer balance summary
 */
export interface CustomerBalance {
  customerId: number;
  currentBalance: Decimal;
  depositBalance: Decimal;
  creditLimit: Decimal;
  creditUsed: Decimal;
  availableCredit: Decimal;
  accountStatus: CustomerAccountStatus;
}

/**
 * Customer credit information
 */
export interface CustomerCreditInfo {
  customerId: number;
  creditLimit: Decimal;
  creditUsed: Decimal;
  availableCredit: Decimal;
  creditUtilization: number; // percentage
  accountStatus: CustomerAccountStatus;
  paymentTermsDays: number;
  interestRate: Decimal;
  creditScore?: number | null;
  canPurchase: boolean;
  message?: string;
}

/**
 * Customer aging analysis
 */
export interface CustomerAging {
  customerId: number;
  customerName: string;
  totalOutstanding: Decimal;
  current: Decimal; // 0-30 days
  days30: Decimal; // 31-60 days
  days60: Decimal; // 61-90 days
  days90: Decimal; // 91-120 days
  over90: Decimal; // 121+ days
  oldestInvoiceDate?: Date | null;
  daysPastDue: number;
  collectionPriority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  riskScore: number; // 0-100
  recommendedAction?: string;
}

/**
 * Customer statement
 */
export interface CustomerStatement {
  customerId: number;
  customerName: string;
  startDate: Date;
  endDate: Date;
  openingBalance: Decimal;
  closingBalance: Decimal;
  totalSales: Decimal;
  totalPayments: Decimal;
  totalCredits: Decimal;
  transactions: CustomerTransaction[];
}

// ============================================================
// TRANSACTION TYPES
// ============================================================

/**
 * Customer Transaction Type (from Prisma enum)
 */
export type CustomerTransactionType = 
  | 'SALE'
  | 'PAYMENT'
  | 'DEPOSIT'
  | 'CREDIT_ADJUSTMENT'
  | 'REFUND'
  | 'INTEREST_CHARGE'
  | 'LATE_FEE';

/**
 * Customer Transaction (matches Prisma schema)
 */
export interface CustomerTransaction {
  id: number;
  customerId: number;
  type: CustomerTransactionType;
  amount: Decimal;
  balance: Decimal;
  description?: string | null;
  referenceId?: string | null;
  documentNumber?: string | null;
  createdAt: Date;
}

// ============================================================
// PAYMENT TYPES
// ============================================================

/**
 * Payment Method (from Prisma enum)
 */
export type PaymentMethod = 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CHEQUE' | 'OTHER';

/**
 * Payment Status (from Prisma enum)
 */
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';

/**
 * Payment (matches Prisma schema)
 */
export interface Payment {
  id: number;
  saleId: number;
  customerId: number;
  amount: Decimal;
  paymentMethod: PaymentMethod;
  reference?: string | null;
  status: PaymentStatus;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Payment recording request
 */
export interface RecordPaymentRequest {
  saleId: number;
  customerId: number;
  amount: number;
  paymentMethod: PaymentMethod;
  reference?: string;
  notes?: string;
}

/**
 * Split payment request
 */
export interface SplitPaymentRequest {
  saleId: number;
  payments: {
    amount: number;
    method: PaymentMethod;
    reference?: string;
  }[];
}

/**
 * Refund request
 */
export interface RefundRequest {
  paymentId: number;
  amount: number;
  reason: string;
  method: PaymentMethod;
}

// ============================================================
// INSTALLMENT TYPES
// ============================================================

/**
 * Installment Frequency (from Prisma enum)
 */
export type InstallmentFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY';

/**
 * Installment Status (from Prisma enum)
 */
export type InstallmentStatus = 'ACTIVE' | 'COMPLETED' | 'DEFAULTED' | 'CANCELLED';

/**
 * Installment Plan (matches Prisma schema)
 */
export interface InstallmentPlan {
  id: number;
  saleId: number;
  customerId: number;
  totalAmount: Decimal;
  downPayment: Decimal;
  installmentAmount: Decimal;
  numberOfInstallments: number;
  frequency: InstallmentFrequency;
  interestRate: Decimal;
  startDate: Date;
  nextDueDate?: Date | null;
  paidInstallments: number;
  remainingBalance: Decimal;
  status: InstallmentStatus;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Installment Payment (matches Prisma schema)
 */
export interface InstallmentPayment {
  id: number;
  installmentPlanId: number;
  amount: Decimal;
  paymentMethod: PaymentMethod;
  reference?: string | null;
  dueDate: Date;
  paidDate?: Date | null;
  lateFee: Decimal;
  notes?: string | null;
  createdAt: Date;
}

/**
 * Create installment plan request
 */
export interface CreateInstallmentPlanRequest {
  saleId: number;
  customerId: number;
  downPayment: number;
  numberOfInstallments: number;
  frequency: InstallmentFrequency;
  interestRate: number;
  startDate: string; // ISO date
}

// ============================================================
// SALE TYPES
// ============================================================

/**
 * Payment Status for Sales (from Prisma enum)
 */
export type SalePaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'REFUNDED';

/**
 * Sale (matches Prisma schema)
 */
export interface Sale {
  id: number;
  invoiceNumber: string;
  customerId?: number | null;
  subtotal: Decimal;
  tax: Decimal;
  discount: Decimal;
  total: Decimal;
  totalCost: Decimal;
  profit: Decimal;
  profitMargin: Decimal;
  amountPaid: Decimal;
  paymentStatus: SalePaymentStatus;
  paymentDueDate?: Date | null;
  invoiceGenerated: boolean;
  receiptGenerated: boolean;
  notes?: string | null;
  saleDate: Date;
  createdAt: Date;
  updatedAt: Date;
  items: SaleItem[];
}

/**
 * Sale Item (matches Prisma schema)
 */
export interface SaleItem {
  id: number;
  saleId: number;
  productId: number;
  productName: string;
  quantity: Decimal;
  unit: string;
  unitPrice: Decimal;
  unitCost: Decimal;
  lineCost: Decimal;
  discount: Decimal;
  lineTotal: Decimal;
  batchAllocation?: any; // JSON field
}

// ============================================================
// DOCUMENT TYPES
// ============================================================

/**
 * Document Type (from Prisma enum)
 */
export type DocumentType = 'INVOICE' | 'RECEIPT' | 'CREDIT_NOTE' | 'STATEMENT';

/**
 * Document (matches Prisma schema)
 */
export interface Document {
  id: number;
  documentType: DocumentType;
  documentNumber: string;
  customerId?: number | null;
  saleId?: number | null;
  content: any; // JSON field
  pdfPath?: string | null;
  generatedAt: Date;
}

/**
 * Generate invoice request
 */
export interface GenerateInvoiceRequest {
  saleId: number;
  dueDate?: string; // ISO date
  notes?: string;
  includePaymentTerms?: boolean;
}

/**
 * Generate receipt request
 */
export interface GenerateReceiptRequest {
  saleId: number;
  paymentMethod: PaymentMethod;
  amountPaid: number;
  notes?: string;
}

/**
 * Generate credit note request
 */
export interface GenerateCreditNoteRequest {
  saleId: number;
  amount: number;
  reason: string;
  items: {
    productId: number;
    quantity: number;
    unitPrice: number;
  }[];
}

// ============================================================
// REPORT TYPES
// ============================================================

/**
 * Aging report entry
 */
export interface AgingReportEntry {
  customerId: number;
  customerName: string;
  totalOutstanding: Decimal;
  current: Decimal;
  days30: Decimal;
  days60: Decimal;
  days90: Decimal;
  over90: Decimal;
  daysPastDue: number;
  collectionPriority: string;
}

/**
 * Aging report
 */
export interface AgingReport {
  asOfDate: Date;
  totalOutstanding: Decimal;
  byBucket: {
    current: Decimal;
    days30: Decimal;
    days60: Decimal;
    days90: Decimal;
    over90: Decimal;
  };
  entries: AgingReportEntry[];
}

/**
 * Profitability report
 */
export interface ProfitabilityReport {
  startDate: Date;
  endDate: Date;
  totalRevenue: Decimal;
  totalCost: Decimal;
  totalProfit: Decimal;
  profitMargin: number; // percentage
  byProduct?: {
    productId: number;
    productName: string;
    revenue: Decimal;
    cost: Decimal;
    profit: Decimal;
    margin: number;
  }[];
  byCategory?: {
    category: string;
    revenue: Decimal;
    cost: Decimal;
    profit: Decimal;
    margin: number;
  }[];
}

/**
 * Cash flow report
 */
export interface CashFlowReport {
  startDate: Date;
  endDate: Date;
  openingBalance: Decimal;
  closingBalance: Decimal;
  totalInflows: Decimal;
  totalOutflows: Decimal;
  netCashFlow: Decimal;
  inflows: {
    sales: Decimal;
    deposits: Decimal;
    payments: Decimal;
    other: Decimal;
  };
  outflows: {
    purchases: Decimal;
    expenses: Decimal;
    refunds: Decimal;
    other: Decimal;
  };
}

/**
 * AR summary report
 */
export interface ARSummaryReport {
  asOfDate: Date;
  totalReceivables: Decimal;
  totalOverdue: Decimal;
  averageDaysPastDue: number;
  numberOfCustomers: number;
  customersWithOverdue: number;
  largestOutstanding: {
    customerId: number;
    customerName: string;
    amount: Decimal;
  };
  byStatus: {
    current: number;
    overdue30: number;
    overdue60: number;
    overdue90: number;
    over90: number;
  };
}

// ============================================================
// PRODUCT/INVENTORY TYPES
// ============================================================

/**
 * Product (matches Prisma schema)
 */
export interface Product {
  id: number;
  name: string;
  sku: string;
  barcode?: string | null;
  category?: string | null;
  description?: string | null;
  baseUnit: string;
  sellingPrice: Decimal;
  costPrice: Decimal;
  currentStock: Decimal;
  reorderLevel: Decimal;
  hasMultipleUnits: boolean;
  alternateUnit?: string | null;
  conversionFactor: Decimal;
  isActive: boolean;
  supplierId?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Stock Batch (matches Prisma schema)
 */
export interface StockBatch {
  id: number;
  productId: number;
  batchNumber: string;
  quantity: Decimal;
  quantityRemaining: Decimal;
  unitCost: Decimal;
  receivedDate: Date;
  expiryDate?: Date | null;
  supplierId?: number | null;
  notes?: string | null;
  createdAt: Date;
}

// ============================================================
// SUPPLIER TYPES
// ============================================================

/**
 * Supplier (matches Prisma schema)
 */
export interface Supplier {
  id: number;
  name: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  paymentTerms?: string | null;
  currentBalance: Decimal;
  totalPurchases: Decimal;
  lastPurchaseDate?: Date | null;
  lastPaymentDate?: Date | null;
  isActive: boolean;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// HELPER TYPES
// ============================================================

/**
 * Date range filter
 */
export interface DateRangeFilter {
  startDate: string; // ISO date
  endDate: string; // ISO date
}

/**
 * Search filter
 */
export interface SearchFilter extends PaginationParams {
  search?: string;
  filter?: Record<string, any>;
}

/**
 * Deposit request
 */
export interface DepositRequest {
  amount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
}

/**
 * Credit adjustment request
 */
export interface CreditAdjustmentRequest {
  newLimit: number;
  reason: string;
}

// ============================================================
// PURCHASES & SUPPLIERS
// ============================================================

/**
 * Purchase status enum
 */
export type PurchaseStatus = 'PENDING' | 'RECEIVED' | 'PARTIAL' | 'CANCELLED';

/**
 * Purchase (matches Prisma schema)
 */
export interface Purchase {
  id: number;
  purchaseNumber: string;
  orderNumber?: string; // Alias
  supplierId: number;
  supplierName?: string; // Denormalized for UI
  orderDate: Date;
  receivedDate?: Date | null;
  status: PurchaseStatus;
  subtotal: Decimal;
  taxAmount: Decimal;
  totalAmount: Decimal;
  totalValue?: Decimal; // Alias for totalAmount
  amountPaid: Decimal;
  paymentMethod?: PaymentMethod | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdById: number;
}

/**
 * Purchase Item (matches Prisma schema)
 */
export interface PurchaseItem {
  id: number;
  purchaseId: number;
  productId: number;
  quantity: Decimal;
  unit: string;
  quantityInBase: Decimal;
  unitCost: Decimal;
  totalCost: Decimal;
  receivedQuantity: Decimal;
}

/**
 * Supplier (matches Prisma schema)
 */
export interface Supplier {
  id: number;
  name: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  taxId?: string | null;
  paymentTerms?: string | null;
  creditLimit?: Decimal | null;
  currentBalance: Decimal;
  isActive: boolean;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Supplier statistics
 */
export interface SupplierStats {
  totalSuppliers: number;
  activeSuppliers: number;
  totalPurchases: Decimal;
  totalBalance: Decimal;
}

// ============================================================
// TYPE GUARDS
// ============================================================

/**
 * Check if error is API error
 */
export function isApiError(error: any): error is ApiError {
  return error && typeof error.error === 'string' && typeof error.statusCode === 'number';
}

/**
 * Convert Decimal to number (for display)
 */
export function decimalToNumber(decimal: Decimal | number): number {
  if (typeof decimal === 'number') return decimal;
  return decimal.toNumber();
}

/**
 * Convert number to Decimal (for API requests)
 */
export function numberToDecimal(num: number): Decimal {
  return new Decimal(num);
}
