// Legacy model re-export for InventoryItem
export type { InventoryItem, Product as InventoryProduct, ProductUoM } from '../types';

// Additional purchasing-related types expected by utils
export interface PurchaseUoM {
  purchaseUnitId: string;
  purchaseUnitName: string;
  quantityPerPurchaseUnit: number;
  costPerPurchaseUnit: number;
  costPerBaseUnit?: number;
  supplierInfo?: string;
  // Legacy compatibility
  uomId?: string;
  conversionFactor?: number;
  unitCost?: number;
}

export interface SalesPricing {
  baseUnitPrice: number;
  uomPrices?: Record<string, number>;
  marginPercentage?: number;
  markupPercentage?: number;
  minimumSellingPrice?: number;
}
