// Placeholder types for supplier catalog related models
export interface SupplierCatalogItem {
  supplierId: number | string;
  productId: number | string;
  supplierSku?: string;
  unitCost?: number;
  packSize?: number;
}

export interface SupplierPricingRule {
  supplierId: number | string;
  category?: string;
  minQuantity?: number;
  discountPercent?: number;
}

// Enhanced purchase order item used for calculations
export interface EnhancedPurchaseOrderItem {
  productId: string;
  productName: string;
  quantityOrdered: number;
  unitCost: number;
  taxRate?: number; // percentage
  unitDiscount?: number; // fixed per-unit discount
  discountPercentage?: number; // percentage discount at line level
}

// Settings used by the enhanced purchase calculation service
export interface PurchaseCalculationSettings {
  priceDecimalPlaces: number;
  quantityDecimalPlaces: number;
  taxDecimalPlaces: number;
  totalDecimalPlaces: number;
  taxCalculationMethod: 'line-item' | 'subtotal';
  taxRoundingMethod: 'round' | 'ceil' | 'floor';
  discountApplicationOrder: ('line-discount' | 'volume-discount' | 'order-discount')[];
  currencyCode: string;
  exchangeRateSource: 'manual' | 'external';
  exchangeRateUpdateFrequency: 'realtime' | 'hourly' | 'daily';
  minimumOrderValue: number;
  maximumOrderValue: number;
  requireApprovalThreshold: number;
  priceVarianceWarningThreshold: number; // percentage
  enableCalculationAudit: boolean;
  auditDetailLevel: 'basic' | 'detailed';
}
