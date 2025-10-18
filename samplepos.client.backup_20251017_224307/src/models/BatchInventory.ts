/**
 * Enhanced inventory models with proper batch management and FIFO system
 */

// Batch tracking for inventory items
export interface InventoryBatch {
  id: string;
  batchNumber: string;
  productId: string;
  productName: string;
  quantity: number;
  originalQuantity: number;
  costPrice: number;
  sellingPrice: number;
  expiryDate?: string;
  manufacturingDate?: string;
  supplierBatchRef?: string;
  receivedDate: string;
  receivedBy: string;
  supplier?: string;
  location?: string;
  status: 'active' | 'expired' | 'recalled' | 'depleted';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Product master data (separate from batches)
export interface Product {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  category?: string;
  unit: string;
  hasExpiry: boolean;
  expiryAlertDays: number;
  reorderLevel: number;
  maxStockLevel?: number;
  description?: string;
  supplier?: string;
  location?: string;
  isActive: boolean;
  price?: number;
  costPrice?: number;
  minPrice?: number;
  additionalBarcodes?: string[];
  uomOptions?: any[];
  conversions?: any;
  defaultUnit?: string;
  salesPricing?: any;
  purchaseInfo?: any;
  batch?: string;
  expiry?: string;
  physicalCount?: number;
  lastCountDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Inventory movement tracking
export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  batchId?: string;
  batchNumber?: string;
  movementType: 'purchase' | 'sale' | 'adjustment' | 'transfer' | 'waste' | 'return';
  quantity: number;
  unitCost?: number;
  totalValue?: number;
  fromLocation?: string;
  toLocation?: string;
  reason?: string;
  referenceNumber?: string;
  userId: string;
  userName: string;
  timestamp: string;
  notes?: string;
}

// Supplier information
export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  paymentTerms?: string;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Purchase Order (before receiving)
export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  items: PurchaseOrderItem[];
  subtotal: number;
  tax: number;
  shippingCost: number;
  totalValue: number;
  status: 'draft' | 'sent' | 'confirmed' | 'partial' | 'received' | 'cancelled';
  paymentTerms?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderItem {
  productId: string;
  productName: string;
  quantityOrdered: number;
  unitCost: number;
  totalCost: number;
  notes?: string;
}

// Purchase Receiving (after receiving goods)
export interface PurchaseReceiving {
  id: string;
  purchaseOrderId?: string;
  purchaseOrderNumber?: string;
  supplier: string;
  supplierId?: string;
  receivedBy: string;
  receivedDate: string;
  items: PurchaseReceivingItem[];
  totalValue: number;
  status: 'pending' | 'partial' | 'complete';
  notes?: string;
  createdAt: string;
}

export interface PurchaseReceivingItem {
  productId: string;
  productName: string;
  batchNumber: string;
  quantityOrdered?: number;
  quantityReceived: number;
  unitCost: number;
  totalCost: number;
  expiryDate?: string;
  manufacturingDate?: string;
  supplierBatchRef?: string;
  location?: string;
  notes?: string;
}

// FIFO release calculation result with ultra-precise tracking
export interface FIFOReleaseResult {
  success: boolean;
  message: string;
  releasedBatches: {
    batchId: string;
    batchNumber: string;
    quantityReleased: number;
    remainingQuantity: number;
    expiryDate?: string;
    daysToExpiry?: number;
    hoursToExpiry?: number;
    costPrice?: number;
    batchCost?: number;
  }[];
  totalReleased: number;
  remainingRequested: number;
  averageCost?: number;
  totalCost?: number;
  expiryRiskLevel?: 'low' | 'medium' | 'high' | 'critical';
  earliestExpiryDays?: number;
}

// Current stock summary for a product
export interface ProductStockSummary {
  productId: string;
  productName: string;
  totalQuantity: number;
  availableQuantity: number;
  expiredQuantity: number;
  expiringSoonQuantity: number;
  batchCount: number;
  earliestExpiry?: string;
  latestExpiry?: string;
  averageCost: number;
  totalValue: number;
  reorderLevel: number;
  isLowStock: boolean;
  hasExpiredStock: boolean;
  hasExpiringSoonStock: boolean;
}