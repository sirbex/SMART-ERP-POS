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

// Purchase order for receiving new inventory
export interface PurchaseReceiving {
  id: string;
  purchaseOrderNumber?: string;
  supplier: string;
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
  quantityReceived: number;
  unitCost: number;
  totalCost: number;
  expiryDate?: string;
  manufacturingDate?: string;
  supplierBatchRef?: string;
  location?: string;
  notes?: string;
}

// FIFO release calculation result
export interface FIFOReleaseResult {
  success: boolean;
  message: string;
  releasedBatches: {
    batchId: string;
    batchNumber: string;
    quantityReleased: number;
    remainingQuantity: number;
    expiryDate?: string;
  }[];
  totalReleased: number;
  remainingRequested: number;
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