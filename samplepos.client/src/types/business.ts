/**
 * Business Domain Types
 * 
 * TypeScript interfaces matching backend database schema and business entities.
 * Uses Decimal.js types for precise currency/quantity handling.
 */

import Decimal from 'decimal.js';

/**
 * User
 */
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Product
 */
export interface Product {
  id: string;
  sku: string;
  barcode?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  unitOfMeasure: string;
  conversionFactor: number;
  costPrice: string | Decimal;
  sellingPrice: string | Decimal;
  costingMethod: 'FIFO' | 'AVCO' | 'STANDARD';
  averageCost: string | Decimal;
  lastCost: string | Decimal;
  taxRate: string | Decimal;
  pricingFormula?: string | null;
  autoUpdatePrice: boolean;
  quantityOnHand: string | Decimal;
  reorderLevel: string | Decimal;
  trackExpiry: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // Legacy/deprecated fields (kept for backward compat)
  categoryId?: string;
  uom?: string; // Alias for unitOfMeasure
  minStock?: string | Decimal;
  maxStock?: string | Decimal;
  imageUrl?: string;
}

/**
 * Product with Stock Info
 */
export interface ProductWithStock extends Product {
  totalQuantity: string | Decimal;
  availableQuantity: string | Decimal;
  reservedQuantity: string | Decimal;
  batches: InventoryBatch[];
}

/**
 * Customer
 */
export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  groupId?: string;
  creditLimit: string | Decimal;
  currentBalance: string | Decimal;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Customer Group
 */
export interface CustomerGroup {
  id: string;
  name: string;
  discountPercent: string | Decimal;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Supplier
 */
export interface Supplier {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  contactPerson?: string;
  paymentTerms?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Purchase Order
 */
export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplier?: Supplier;
  status: 'DRAFT' | 'PENDING' | 'COMPLETED' | 'CANCELLED';
  orderDate: string;
  expectedDeliveryDate?: string;
  totalAmount: string | Decimal;
  notes?: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  items?: PurchaseOrderItem[];
}

/**
 * Purchase Order Item
 */
export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  productId: string;
  product?: Product;
  quantity: string | Decimal;
  unitCost: string | Decimal;
  totalCost: string | Decimal;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Goods Receipt
 */
export interface GoodsReceipt {
  id: string;
  grNumber: string;
  purchaseOrderId: string;
  purchaseOrder?: PurchaseOrder;
  status: 'DRAFT' | 'FINALIZED';
  receivedDate: string;
  notes?: string;
  receivedById: string;
  finalizedAt?: string;
  createdAt: string;
  updatedAt: string;
  items?: GoodsReceiptItem[];
}

/**
 * Goods Receipt Item
 */
export interface GoodsReceiptItem {
  id: string;
  goodsReceiptId: string;
  productId: string;
  product?: Product;
  quantityOrdered: string | Decimal;
  quantityReceived: string | Decimal;
  unitCost: string | Decimal;
  batchNumber?: string;
  expiryDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Inventory Batch
 */
export interface InventoryBatch {
  id: string;
  productId: string;
  product?: Product;
  batchNumber: string;
  quantity: string | Decimal;
  availableQuantity: string | Decimal;
  reservedQuantity: string | Decimal;
  unitCost: string | Decimal;
  expiryDate?: string;
  receivedDate: string;
  goodsReceiptId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Sale
 */
export interface Sale {
  id: string;
  saleNumber: string;
  customerId?: string;
  customer?: Customer;
  saleDate: string;
  subtotal: string | Decimal;
  taxAmount: string | Decimal;
  discountAmount: string | Decimal;
  totalAmount: string | Decimal;
  amountPaid: string | Decimal;
  changeAmount: string | Decimal;
  paymentMethod: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'CREDIT' | 'BANK_TRANSFER';
  status: 'COMPLETED' | 'PENDING' | 'CANCELLED';
  notes?: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  items?: SaleItem[];
}

/**
 * Sale Item
 */
export interface SaleItem {
  id: string;
  saleId: string;
  productId: string;
  product?: Product;
  batchId?: string;
  batch?: InventoryBatch;
  quantity: string | Decimal;
  unitPrice: string | Decimal;
  subtotal: string | Decimal;
  discountPercent: string | Decimal;
  discountAmount: string | Decimal;
  taxPercent: string | Decimal;
  taxAmount: string | Decimal;
  totalAmount: string | Decimal;
  createdAt: string;
  updatedAt: string;
}

/**
 * Stock Movement
 */
export interface StockMovement {
  id: string;
  productId: string;
  product?: Product;
  batchId?: string;
  batch?: InventoryBatch;
  type: 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'TRANSFER' | 'RETURN' | 'DAMAGE' | 'EXPIRY';
  quantity: string | Decimal;
  balanceAfter: string | Decimal;
  referenceId?: string;
  referenceType?: string;
  notes?: string;
  createdById: string;
  createdAt: string;
}

/**
 * Cost Layer
 */
export interface CostLayer {
  id: string;
  productId: string;
  product?: Product;
  quantity: string | Decimal;
  remainingQuantity: string | Decimal;
  unitCost: string | Decimal;
  totalCost: string | Decimal;
  layerDate: string;
  goodsReceiptId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Pricing Tier
 */
export interface PricingTier {
  id: string;
  productId: string;
  product?: Product;
  customerGroupId?: string;
  customerGroup?: CustomerGroup;
  minQuantity: string | Decimal;
  maxQuantity?: string | Decimal;
  price: string | Decimal;
  discountPercent?: string | Decimal;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Cart Item (frontend only)
 */
export interface CartItem {
  productId: string;
  product: Product;
  batchId?: string;
  batch?: InventoryBatch;
  quantity: Decimal;
  unitPrice: Decimal;
  discountPercent: Decimal;
  discountAmount: Decimal;
  taxPercent: Decimal;
  taxAmount: Decimal;
  subtotal: Decimal;
  total: Decimal;
}

/**
 * Cart (frontend only)
 */
export interface Cart {
  items: CartItem[];
  subtotal: Decimal;
  discountAmount: Decimal;
  taxAmount: Decimal;
  total: Decimal;
  customerId?: string;
  customer?: Customer;
  paymentMethod?: string;
  notes?: string;
}

/**
 * Stock Level Summary
 */
export interface StockLevelSummary {
  productId: string;
  product: Product;
  totalQuantity: Decimal;
  availableQuantity: Decimal;
  reservedQuantity: Decimal;
  reorderLevel: Decimal;
  isLowStock: boolean;
  batchCount: number;
  oldestBatchDate?: string;
  nearestExpiry?: string;
}

/**
 * Summary Statistics
 */
export interface DashboardStats {
  totalSalesToday: Decimal;
  totalSalesThisMonth: Decimal;
  totalSalesThisYear: Decimal;
  salesCount: number;
  lowStockCount: number;
  expiringItemsCount: number;
  pendingPOsCount: number;
  customersCount: number;
  productsCount: number;
}

/**
 * Report Filters
 */
export interface ReportFilters {
  startDate?: string;
  endDate?: string;
  productId?: string;
  customerId?: string;
  supplierId?: string;
  categoryId?: string;
  status?: string;
  type?: string;
}

/**
 * Audit Log
 */
export interface AuditLog {
  id: string;
  userId: string;
  user?: User;
  action: string;
  entity: string;
  entityId: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

/**
 * System Settings
 */
export interface SystemSettings {
  id: string;
  key: string;
  value: string;
  category: string;
  description?: string;
  isPublic: boolean;
  updatedAt: string;
}
