/**
 * Centralized Type Definitions for SamplePOS
 * 
 * Consolidated type definitions to eliminate duplication across the codebase.
 * This is the single source of truth for all domain models.
 * 
 * NOTE: For backend API types (aligned with Prisma schema), use types from ./backend.ts
 */

// Re-export backend types for convenience
export * from './backend';

// ============================================================
// CUSTOMER TYPES
// ============================================================

/**
 * Standard Customer interface (used across the application)
 * NOTE: id is number (from PostgreSQL autoincrement)
 */
export interface Customer {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  contact?: string; // Alias for phone (for backwards compatibility)
  address?: string;
  accountBalance?: number;
  balance?: number; // Alias for accountBalance (for backwards compatibility)
  creditLimit?: number;
  type?: 'individual' | 'business' | 'wholesale' | 'retail';
  loyaltyDiscount?: number;
  isActive?: boolean;
  is_active?: boolean; // Backend format
  notes?: string;
  joinDate?: string;
  createdAt?: string;
  created_at?: string; // Backend format
  updatedAt?: string;
  updated_at?: string; // Backend format
  // Aggregated fields
  totalTransactions?: number;
  total_transactions?: number; // Backend format
  totalSpent?: number;
  total_spent?: number; // Backend format
  lastPurchaseDate?: string;
  last_purchase_date?: string; // Backend format
  metadata?: Record<string, unknown>;
}

/**
 * Customer list request parameters
 */
export interface CustomerListParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filter?: {
    is_active?: boolean;
    type?: string;
  };
}

/**
 * Customer list response with pagination
 */
export interface CustomerListResponse {
  data: Customer[];
  pagination: PaginationMetadata;
}

// ============================================================
// PRODUCT / INVENTORY TYPES
// ============================================================

/**
 * Standard Product/Inventory Item interface
 * NOTE: id is number (from PostgreSQL autoincrement)
 */
export interface Product {
  id: number;
  name: string;
  sku?: string;
  barcode?: string;
  category?: string;
  description?: string;
  baseUnit?: string;
  unit?: string; // Alias for baseUnit
  sellingPrice?: number;
  price?: number; // Alias for sellingPrice
  costPrice?: number;
  basePrice?: number; // Alias for costPrice
  currentStock?: number;
  quantity?: number; // Alias for currentStock
  reorderLevel?: number;
  isActive?: boolean;
  is_active?: boolean; // Backend format
  hasExpiry?: boolean;
  expiryDate?: string;
  supplierId?: number;
  supplier_id?: number; // Backend format
  createdAt?: string;
  created_at?: string; // Backend format
  updatedAt?: string;
  updated_at?: string; // Backend format
  metadata?: Record<string, unknown>;
}

/**
 * Inventory batch for FIFO tracking
 */
export interface InventoryBatch {
  id: number;
  productId: number;
  product_id?: number; // Backend format
  batchNumber?: string;
  quantity: number;
  costPrice: number;
  cost_price?: number; // Backend format
  receivedDate: string;
  received_date?: string; // Backend format
  expiryDate?: string;
  expiry_date?: string; // Backend format
  supplierId?: number;
  supplier_id?: number; // Backend format
  remainingQuantity?: number;
  remaining_quantity?: number; // Backend format
  notes?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Product list request parameters
 */
export interface ProductListParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filter?: {
    category?: string;
    is_active?: boolean;
    low_stock?: boolean;
  };
}

// ============================================================
// TRANSACTION / SALE TYPES
// ============================================================

/**
 * Line item in a sale/transaction
 * NOTE: IDs are numbers (from PostgreSQL autoincrement)
 */
export interface SaleItem {
  id?: number;
  transactionId?: number;
  transaction_id?: number; // Backend format
  productId?: number;
  inventory_item_id?: number; // Backend format
  productName?: string;
  product_name?: string; // Backend format
  name?: string; // Alias for productName
  sku?: string;
  quantity: number;
  unit?: string;
  uomDisplayName?: string;
  conversionFactor?: number;
  unitPrice?: number;
  price?: number; // Alias for unitPrice
  discount?: number;
  subtotal?: number;
  tax?: number;
  lineTotal?: number;
  total?: number; // Alias for lineTotal
  costPrice?: number;
  notes?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Standard Transaction/Sale interface
 * NOTE: id is number (from PostgreSQL autoincrement)
 */
export interface Transaction {
  id: number;
  invoiceNumber?: string;
  customerId?: number;
  customer_id?: number; // Backend format
  customerName?: string;
  customer_name?: string; // Backend format
  items: SaleItem[];
  subtotal: number;
  tax: number;
  taxAmount?: number; // Alias for tax
  discount: number;
  discountAmount?: number; // Alias for discount
  total: number;
  totalAmount?: number; // Alias for total
  itemCount?: number; // Computed from items.length
  paymentStatus: 'paid' | 'unpaid' | 'partial';
  payment_status?: string; // Backend format
  paymentMethod?: string;
  payment_method?: string; // Backend format
  amountPaid?: number;
  change?: number;
  status?: string;
  voided?: boolean;
  saleDate?: string;
  date?: string; // Alias for saleDate
  timestamp?: string; // Alias for saleDate
  createdBy?: string;
  created_by?: string; // Backend format
  cashier?: string;
  notes?: string;
  createdAt?: string;
  created_at?: string; // Backend format
  updatedAt?: string;
  updated_at?: string; // Backend format
  metadata?: Record<string, unknown>;
}

/**
 * Payment information
 */
export interface Payment {
  id?: number | string;
  transactionId?: number;
  transaction_id?: number; // Backend format
  customerId?: number;
  customer_id?: number; // Backend format
  amount: number;
  method: string;
  paymentMethod?: string; // Alias for method
  reference?: string;
  paymentReference?: string; // Alias for reference
  paymentDate?: string;
  timestamp?: string;
  notes?: string;
  status?: 'pending' | 'completed' | 'failed';
  metadata?: Record<string, unknown>;
}

/**
 * Transaction list request parameters
 */
export interface TransactionListParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filter?: {
    payment_status?: 'paid' | 'unpaid' | 'partial';
    customer_id?: number;
    start_date?: string;
    end_date?: string;
    date_from?: string;
    date_to?: string;
  };
}

/**
 * Transaction list response with pagination
 */
export interface TransactionListResponse {
  data: Transaction[];
  pagination: PaginationMetadata;
}

// ============================================================
// SUPPLIER TYPES
// ============================================================

/**
 * Standard Supplier interface
 */
export interface Supplier {
  id: number;
  name: string;
  contactPerson?: string;
  contact_person?: string; // Backend format
  contact?: string; // Alias
  email?: string;
  phone?: string;
  address?: string;
  paymentTerms?: string;
  payment_terms?: string; // Backend format
  isActive?: boolean;
  is_active?: boolean; // Backend format
  notes?: string;
  createdAt?: string;
  created_at?: string; // Backend format
  updatedAt?: string;
  updated_at?: string; // Backend format
  metadata?: Record<string, unknown>;
}

/**
 * Purchase Order
 */
export interface PurchaseOrder {
  id: number;
  supplierId: number;
  supplier_id?: number; // Backend format
  supplierName?: string;
  supplier_name?: string; // Backend format
  orderNumber: string;
  order_number?: string; // Backend format
  orderDate: string;
  order_date?: string; // Backend format
  expectedDeliveryDate?: string;
  expected_delivery_date?: string; // Backend format
  receivedDate?: string;
  received_date?: string; // Backend format
  status: 'draft' | 'pending' | 'received' | 'partial' | 'cancelled';
  items: PurchaseOrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  totalValue?: number; // Alias for total
  notes?: string;
  createdAt?: string;
  created_at?: string; // Backend format
  updatedAt?: string;
  updated_at?: string; // Backend format
  metadata?: Record<string, unknown>;
}

/**
 * Purchase Order Item (line item)
 */
export interface PurchaseOrderItem {
  id?: number;
  purchaseOrderId?: number;
  purchase_order_id?: number; // Backend format
  productId?: number;
  inventory_item_id?: number; // Backend format
  productName?: string;
  product_name?: string; // Backend format
  quantity: number;
  quantityOrdered?: number; // Alias for quantity
  unitPrice: number;
  unit_price?: number; // Backend format
  unitCost?: number; // Alias for unitPrice
  total: number;
  totalCost?: number; // Alias for total
  receivedQuantity?: number;
  received_quantity?: number; // Backend format
  notes?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Supplier list request parameters
 */
export interface SupplierListParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filter?: {
    is_active?: boolean;
  };
}

// ============================================================
// USER / AUTH TYPES
// ============================================================

/**
 * User interface
 */
export interface User {
  id: number | string;
  username: string;
  email?: string;
  firstName?: string;
  first_name?: string; // Backend format
  lastName?: string;
  last_name?: string; // Backend format
  role: 'ADMIN' | 'MANAGER' | 'CASHIER';
  isActive?: boolean;
  is_active?: boolean; // Backend format
  createdAt?: string;
  created_at?: string; // Backend format
  updatedAt?: string;
  updated_at?: string; // Backend format
}

/**
 * Authentication credentials
 */
export interface LoginCredentials {
  username: string;
  password: string;
}

/**
 * Authentication response
 */
export interface AuthResponse {
  token: string;
  user: User;
}

// ============================================================
// PAGINATION TYPES
// ============================================================

/**
 * Standard pagination metadata
 */
export interface PaginationMetadata {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext?: boolean;
  hasPrev?: boolean;
}

/**
 * Paginated API response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMetadata;
}

/**
 * Common pagination parameters
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  filters?: Record<string, any>;
}

// ============================================================
// API ERROR TYPES
// ============================================================

/**
 * API Error structure
 */
export interface ApiError {
  message: string;
  statusCode?: number;
  errors?: Record<string, string[]>;
  originalError?: unknown;
}

// ============================================================
// STATISTICS / ANALYTICS TYPES
// ============================================================

/**
 * Customer statistics
 */
export interface CustomerStats {
  totalCustomers: number;
  total_customers?: number; // Backend format
  activeCustomers: number;
  active_customers?: number; // Backend format
  inactiveCustomers?: number;
  inactive_customers?: number; // Backend format
  totalTransactions: number;
  total_transactions?: number; // Backend format
  totalRevenue: number;
  total_revenue?: number; // Backend format
  averageTransaction: number;
  average_transaction?: number; // Backend format
}

/**
 * Transaction statistics
 */
export interface TransactionStats {
  totalTransactions: number;
  total_transactions?: number; // Backend format
  totalSales: number;
  total_sales?: number; // Backend format
  totalTax: number;
  total_tax?: number; // Backend format
  totalDiscount: number;
  total_discount?: number; // Backend format
  averageTransaction: number;
  average_transaction?: number; // Backend format
  paidCount: number;
  paid_count?: number; // Backend format
  unpaidCount: number;
  unpaid_count?: number; // Backend format
  partialCount?: number;
  partial_count?: number; // Backend format
}

/**
 * Top customer data
 */
export interface TopCustomer {
  customerId: number;
  customer_id?: number; // Backend format
  name: string;
  totalSpent: number;
  total_spent?: number; // Backend format
  transactionCount?: number;
  transaction_count?: number; // Backend format
}

/**
 * Top product data
 */
export interface TopProduct {
  productId: number;
  inventory_item_id?: number; // Backend format
  productName: string;
  product_name?: string; // Backend format
  quantitySold: number;
  quantity_sold?: number; // Backend format
  totalRevenue: number;
  total_revenue?: number; // Backend format
  transactionCount?: number;
  transaction_count?: number; // Backend format
}

// ============================================================
// CATEGORY TYPES
// ============================================================

/**
 * Product category
 */
export interface Category {
  id: number | string;
  name: string;
  description?: string;
  parentId?: number | string;
  parent_id?: number; // Backend format
}

// ============================================================
// LEDGER / ACCOUNT TYPES
// ============================================================

/**
 * Customer ledger entry
 */
export interface LedgerEntry {
  id?: number | string;
  customer: string;
  customerId?: number | string;
  customer_id?: number; // Backend format
  date: string;
  amount: number;
  type: 'credit' | 'debit';
  note: string;
  category?: string;
  paymentMethod?: string;
  payment_method?: string; // Backend format
  status?: 'pending' | 'completed' | 'overdue';
  dueDate?: string;
  due_date?: string; // Backend format
  relatedInvoice?: string;
  related_invoice?: string; // Backend format
}

// ============================================================
// TYPE GUARDS
// ============================================================

/**
 * Check if value is a valid Customer
 */
export function isCustomer(value: any): value is Customer {
  return value && typeof value === 'object' && 'name' in value && ('id' in value || 'name' in value);
}

/**
 * Check if value is a valid Product
 */
export function isProduct(value: any): value is Product {
  return value && typeof value === 'object' && 'name' in value && ('id' in value || 'sku' in value);
}

/**
 * Check if value is a valid Transaction
 */
export function isTransaction(value: any): value is Transaction {
  return value && typeof value === 'object' && 'items' in value && 'total' in value;
}

// ============================================================
// UTILITY TYPES
// ============================================================

/**
 * Make all properties optional except specified keys
 */
export type PartialExcept<T, K extends keyof T> = Partial<T> & Pick<T, K>;

/**
 * Make all properties required except specified keys
 */
export type RequiredExcept<T, K extends keyof T> = Required<Omit<T, K>> & Pick<T, K>;

/**
 * API response wrapper
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
}

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

// ============================================================
// TYPE ALIASES FOR BACKWARDS COMPATIBILITY
// ============================================================

/**
 * InventoryItem is an alias for Product
 */
export type InventoryItem = Product;

/**
 * TransactionItem is an alias for SaleItem
 */
export type TransactionItem = SaleItem;

/**
 * Purchase Receiving interface
 */
export interface PurchaseReceiving {
  id: number;
  purchaseOrderId?: number;
  supplierId: number;
  receivedDate: string;
  totalQuantity: number;
  totalCost: number;
  notes?: string;
  items: PurchaseReceivingItem[];
  createdAt?: string;
}

/**
 * Purchase Receiving Item
 */
export interface PurchaseReceivingItem {
  id?: number;
  purchaseReceivingId?: number;
  productId: number;
  productName?: string;
  quantity: number;
  unitCost: number;
  batchNumber?: string;
  expiryDate?: string;
  total: number;
}

/**
 * Product Stock Summary
 */
export interface ProductStockSummary {
  productId: number;
  productName: string;
  totalQuantity: number;
  totalValue: number;
  batches: InventoryBatch[];
  reorderLevel?: number;
  needsReorder: boolean;
}

// ============================================================
// UNIT OF MEASURE (UoM) TYPES
// ============================================================

/**
 * UoM Category (e.g., Weight, Volume, Length)
 */
export interface UoMCategory {
  id: string;
  name: string;
  description?: string;
  baseUoMId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  baseUoM?: UnitOfMeasure;
  uoms?: UnitOfMeasure[];
}

/**
 * Unit of Measure (e.g., Kilogram, Liter, Meter)
 */
export interface UnitOfMeasure {
  id: string;
  categoryId: string;
  name: string;
  abbreviation: string;
  conversionFactor: number;
  isBase: boolean;
  isActive: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
  category?: {
    id: string;
    name: string;
  };
}

/**
 * Product-UoM Association (per-product UoM configuration)
 */
export interface ProductUoM {
  id: string;
  productId: string;
  uomId: string;
  conversionFactor: number;
  priceMultiplier: number;
  isDefault: boolean;
  isSaleAllowed: boolean;
  isPurchaseAllowed: boolean;
  barcode?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  uom: UnitOfMeasure;
}

/**
 * Product with UoM data included
 */
export interface ProductWithUoMs extends Product {
  productUoMs?: ProductUoM[];
}

/**
 * UoM Conversion Result
 */
export interface UoMConversionResult {
  quantityInBaseUnit: number;
  unit: string;
  unitId: string;
  conversionFactor: number;
  priceMultiplier: number;
}

/**
 * UoM Price Calculation Result
 */
export interface UoMPriceCalculation {
  unitPrice: number;
  total: number;
  priceMultiplier: number;
  basePrice: number;
}

/**
 * Allowed UoM (simplified for dropdowns)
 */
export interface AllowedUoM {
  id: string;
  name: string;
  abbreviation: string;
  conversionFactor: number;
  priceMultiplier: number;
  isDefault: boolean;
  barcode?: string;
}

export default {
  // Export all types for convenience
  // (TypeScript will still recognize named exports)
};
