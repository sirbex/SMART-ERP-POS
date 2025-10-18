/**
 * Enhanced inventory item model with UoM support
 */

import type { ProductUoM } from './UnitOfMeasure';

/**
 * Purchase information for bulk buying scenarios
 */
export interface PurchaseUoM {
  purchaseUnitId: string;      // ID of the purchase unit (e.g., 'box')
  purchaseUnitName: string;    // Display name (e.g., 'Box')
  quantityPerPurchaseUnit: number; // How many base units in one purchase unit (e.g., 24 bottles per box)
  costPerPurchaseUnit: number; // Cost paid for one purchase unit (e.g., $12 per box)
  costPerBaseUnit: number;     // Auto-calculated cost per base unit (e.g., $0.50 per bottle)
  supplierInfo?: string;       // Supplier reference for this purchase unit
}

/**
 * Sales markup and pricing strategy
 */
export interface SalesPricing {
  markupPercentage: number;    // Markup percentage over cost (e.g., 25%)
  minimumSellingPrice?: number; // Minimum price allowed for sales
  maxDiscountPercentage?: number; // Maximum discount allowed
}

export interface InventoryItem {
  id?: string;
  name: string;
  batch: string;
  expiry?: string;           // Now optional
  hasExpiry: boolean;        // Flag to indicate if this item needs expiry tracking
  expiryAlertDays?: number;  // Days before expiry when alerts should appear
  quantity: number | '';
  
  // Basic unit information (for backward compatibility)
  unit: string;
  
  // Enhanced UoM support
  uomOptions?: ProductUoM[];   // Available units of measure with pricing
  baseUomId?: string;          // Base unit of measure ID
  defaultUomId?: string;       // Default unit of measure ID for sales
  
  // NEW: Enhanced Purchase & Cost Management
  purchaseInfo?: PurchaseUoM;  // Purchase unit information for bulk buying
  salesPricing?: SalesPricing; // Sales pricing strategy
  lastPurchaseDate?: string;   // When this item was last purchased
  lastPurchaseCost?: number;   // Last purchase cost per purchase unit
  
  // Legacy conversion support (for backward compatibility)
  defaultUnit?: string;
  conversions?: Record<string, number | ''>; // e.g. { box: 12 } means 1 box = 12 pcs
  
  // Other inventory fields
  reorderLevel?: number | '';
  price?: number | '';         // Base price (in default unit)
  basePrice?: number | '';     // Added: basePrice property (used for API compatibility)
  physicalCount?: number | '';
  variance?: number;
  lastCountDate?: string;
  category?: string;
  location?: string;
  sku?: string;
  barcode?: string;            // Main barcode
  additionalBarcodes?: Record<string, string>; // Barcodes for different UoMs
  supplier?: string;
  costPrice?: number | '';     // Cost price (in base unit)
  minPrice?: number | '';      // Minimum selling price
  notes?: string;
  
  // Metadata
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
}