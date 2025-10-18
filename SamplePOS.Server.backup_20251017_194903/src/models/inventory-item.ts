/**
 * Type definitions for the Inventory Item model
 */

export interface InventoryItem {
  id: number;
  sku: string;
  name: string;
  description?: string;
  category?: string;
  basePrice: number;
  taxRate: number;
  reorderLevel: number;
  isActive: boolean;
  metadata?: InventoryItemMetadata;
  createdAt: string;
  updatedAt: string;
  // Computed/aggregated fields
  quantity?: number;
  batches?: InventoryBatch[];
}

export interface InventoryItemMetadata {
  unit?: string;
  hasExpiry?: boolean;
  expiryAlertDays?: number;
  uomOptions?: UnitOfMeasure[];
  purchaseInfo?: {
    defaultSupplierId?: string;
    defaultSupplierName?: string;
    lastPurchaseDate?: string;
    lastPurchaseCost?: number;
  };
  salesPricing?: {
    [key: string]: number; // unit -> price mapping
  };
  defaultUnit?: string;
  conversions?: {
    [key: string]: number; // unit -> conversion factor mapping
  };
  location?: string;
  barcode?: string;
  additionalBarcodes?: string[];
  supplier?: string;
  minPrice?: number;
  costPrice?: number;
  lastCountDate?: string;
  physicalCount?: number;
  createdBy?: string;
  updatedBy?: string;
}

export interface UnitOfMeasure {
  id: string;
  name: string;
  abbreviation: string;
  conversionFactor: number;
  isBaseUnit: boolean;
}