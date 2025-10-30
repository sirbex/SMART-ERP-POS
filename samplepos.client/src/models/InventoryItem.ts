// Legacy model re-export for InventoryItem
export type { InventoryItem, Product as InventoryProduct, ProductUoM } from '../types';

// Additional purchasing-related types expected by utils
export interface PurchaseUoM {
  uomId: string;
  conversionFactor: number;
  unitCost: number;
}

export interface SalesPricing {
  baseUnitPrice: number;
  uomPrices?: Record<string, number>;
}
