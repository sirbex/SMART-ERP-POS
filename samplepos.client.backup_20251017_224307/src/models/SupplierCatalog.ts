/**
 * Enhanced supplier catalog models for better item tracking and purchase management
 */

// Supplier item catalog entry
export interface SupplierItem {
  id: string;
  supplierId: string;
  supplierName: string;
  productId: string;
  productName: string;
  supplierPartNumber?: string;
  supplierDescription?: string;
  unitOfMeasure: string;
  packSize?: number; // Items per pack/case
  minimumOrderQuantity: number;
  leadTimeDays: number;
  isActive: boolean;
  
  // Pricing information
  currentPrice: number;
  currency: string;
  priceValidUntil?: string;
  priceHistory: SupplierPriceHistory[];
  
  // Quality and delivery tracking
  qualityRating: number; // 1-5 stars
  deliveryReliability: number; // percentage
  lastDeliveryDate?: string;
  averageDeliveryTime: number; // in days
  
  // Additional details
  preferredSupplier: boolean;
  certifications?: string[];
  shelfLife?: number; // in days
  storageRequirements?: string;
  notes?: string;
  
  createdAt: string;
  updatedAt: string;
}

export interface SupplierPriceHistory {
  id: string;
  supplierId: string;
  supplierItemId: string;
  price: number;
  currency: string;
  effectiveDate: string;
  endDate?: string;
  changeReason?: string;
  priceChangePercentage?: number;
  recordedAt: string;
}

// Enhanced purchase order item with supplier details
export interface EnhancedPurchaseOrderItem {
  productId: string;
  productName: string;
  supplierId: string;
  supplierItemId?: string;
  supplierPartNumber?: string;
  
  // Quantities and pricing
  quantityOrdered: number;
  unitCost: number;
  totalCost: number;
  
  // Discounts and adjustments
  unitDiscount?: number;
  discountPercentage?: number;
  taxRate?: number;
  taxAmount?: number;
  
  // Delivery and quality
  expectedDeliveryDate?: string;
  deliveryPriority?: 'low' | 'medium' | 'high' | 'urgent';
  qualitySpecifications?: string;
  
  notes?: string;
}

// Purchase history with detailed supplier information
export interface DetailedPurchaseHistory {
  id: string;
  purchaseOrderId: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  orderDate: string;
  deliveryDate?: string;
  
  // Order summary
  itemCount: number;
  totalQuantity: number;
  subtotal: number;
  totalDiscount: number;
  totalTax: number;
  shippingCost: number;
  finalTotal: number;
  
  // Performance metrics
  onTimeDelivery: boolean;
  deliveryDelayDays?: number;
  qualityIssues: boolean;
  completenessScore: number; // percentage of items received vs ordered
  
  // Items with supplier details
  items: DetailedPurchaseItem[];
  
  status: 'completed' | 'partial' | 'cancelled' | 'returned';
  paymentStatus: 'pending' | 'paid' | 'overdue' | 'disputed';
  
  createdAt: string;
  receivedAt?: string;
}

export interface DetailedPurchaseItem {
  productId: string;
  productName: string;
  supplierPartNumber?: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  totalCost: number;
  discount: number;
  taxAmount: number;
  finalCost: number;
  
  // Quality tracking
  qualityScore?: number; // 1-5
  defectiveQuantity?: number;
  batchNumbers?: string[];
  expiryDates?: string[];
  
  // Price comparison
  previousPrice?: number;
  priceChange?: number;
  priceChangePercentage?: number;
  marketPrice?: number;
  costEfficiency?: 'excellent' | 'good' | 'average' | 'poor';
  
  notes?: string;
}

// Supplier performance analytics
export interface SupplierPerformanceMetrics {
  supplierId: string;
  supplierName: string;
  
  // Order statistics
  totalOrders: number;
  totalValue: number;
  averageOrderValue: number;
  orderFrequency: number; // orders per month
  
  // Delivery performance
  onTimeDeliveryRate: number;
  averageDeliveryTime: number;
  deliveryReliabilityScore: number;
  
  // Quality metrics
  averageQualityScore: number;
  defectRate: number;
  returnRate: number;
  complaintCount: number;
  
  // Financial performance
  totalSavings: number;
  averageDiscount: number;
  paymentTermsCompliance: number;
  priceStability: number;
  
  // Trend analysis
  performanceTrend: 'improving' | 'stable' | 'declining';
  costTrend: 'decreasing' | 'stable' | 'increasing';
  
  // Rankings
  overallRating: number; // 1-5 stars
  marketPosition: 'preferred' | 'standard' | 'backup' | 'probation';
  
  lastEvaluationDate: string;
  nextReviewDate: string;
}

// Enhanced calculation precision settings
export interface PurchaseCalculationSettings {
  // Rounding precision
  priceDecimalPlaces: number;
  quantityDecimalPlaces: number;
  taxDecimalPlaces: number;
  totalDecimalPlaces: number;
  
  // Tax calculation method
  taxCalculationMethod: 'line-item' | 'subtotal' | 'gross-up';
  taxRoundingMethod: 'round' | 'ceil' | 'floor';
  
  // Discount application order
  discountApplicationOrder: ('line-discount' | 'order-discount' | 'volume-discount')[];
  
  // Currency handling
  currencyCode: string;
  exchangeRateSource: 'manual' | 'api';
  exchangeRateUpdateFrequency: 'daily' | 'hourly' | 'real-time';
  
  // Validation rules
  minimumOrderValue: number;
  maximumOrderValue: number;
  requireApprovalThreshold: number;
  priceVarianceWarningThreshold: number; // percentage
  
  // Calculation audit
  enableCalculationAudit: boolean;
  auditDetailLevel: 'basic' | 'detailed' | 'comprehensive';
}