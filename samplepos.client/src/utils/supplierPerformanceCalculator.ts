/**
 * Supplier Performance Calculator
 * 
 * Client-side utility for calculating supplier performance metrics
 * from backend data (suppliers, purchases, and stats).
 * 
 * Replaces the getSupplierPerformance() method from PurchaseManagementService.
 * 
 * @module utils/supplierPerformanceCalculator
 */

import type { Supplier, Purchase } from '@/types/backend';

/**
 * Supplier performance metrics
 */
export interface SupplierPerformance {
  supplierId: string;
  supplierName: string;
  totalOrders: number;
  totalValue: number;
  averageOrderValue: number;
  onTimeDeliveryRate: number;
  lastOrderDate?: string;
}

/**
 * Calculate performance metrics for all suppliers based on their purchase history
 * 
 * @param suppliers - Array of suppliers from backend
 * @param purchases - Array of all purchases from backend
 * @returns Array of supplier performance metrics
 * 
 * @example
 * ```typescript
 * const { data: suppliersData } = useSuppliers();
 * const { data: purchasesData } = usePurchases();
 * 
 * const performance = calculateSupplierPerformance(
 *   suppliersData?.data || [],
 *   purchasesData?.data || []
 * );
 * ```
 */
export function calculateSupplierPerformance(
  suppliers: Supplier[],
  purchases: Purchase[]
): SupplierPerformance[] {
  return suppliers.map(supplier => {
    // Filter purchases for this supplier
    const supplierPurchases = purchases.filter(
      p => String(p.supplierId) === String(supplier.id)
    );
    
    // Calculate total value
    const totalValue = supplierPurchases.reduce(
      (sum, p) => sum + (Number(p.totalAmount) || 0), 
      0
    );
    
    // Filter completed orders (received)
    const completedOrders = supplierPurchases.filter(
      p => p.status === 'RECEIVED'
    );
    
    // Calculate on-time delivery rate
    // Simplified: assume all completed orders are on-time
    // In real implementation, compare actualDeliveryDate vs expectedDeliveryDate
    const onTimeDeliveries = completedOrders.filter(_p => {
      // If we have actual delivery tracking, compare dates:
      // const expected = new Date(p.expectedDeliveryDate);
      // const actual = new Date(p.actualDeliveryDate);
      // return actual <= expected;
      
      // For now, assume 100% on-time for received orders
      return true;
    });
    
    const onTimeDeliveryRate = completedOrders.length > 0 
      ? (onTimeDeliveries.length / completedOrders.length) * 100 
      : 100; // Default to 100% if no completed orders
    
    // Find last order date
    const lastPurchase = supplierPurchases.length > 0
      ? supplierPurchases.sort((a, b) => 
          new Date(b.orderDate || b.createdAt).getTime() - 
          new Date(a.orderDate || a.createdAt).getTime()
        )[0]
      : null;
    
    return {
      supplierId: String(supplier.id),
      supplierName: supplier.name,
      totalOrders: supplierPurchases.length,
      totalValue,
      averageOrderValue: supplierPurchases.length > 0 
        ? totalValue / supplierPurchases.length 
        : 0,
      onTimeDeliveryRate,
      lastOrderDate: lastPurchase ? 
        (lastPurchase.orderDate || lastPurchase.createdAt)?.toString() : 
        undefined
    };
  });
}

/**
 * Calculate performance metrics for a single supplier
 * 
 * @param supplier - Supplier from backend
 * @param purchases - Array of all purchases from backend
 * @returns Supplier performance metrics
 * 
 * @example
 * ```typescript
 * const { data: supplier } = useSupplier(supplierId);
 * const { data: purchasesData } = usePurchases({ supplierId });
 * 
 * const performance = calculateSingleSupplierPerformance(
 *   supplier!,
 *   purchasesData?.data || []
 * );
 * ```
 */
export function calculateSingleSupplierPerformance(
  supplier: Supplier,
  purchases: Purchase[]
): SupplierPerformance {
  const results = calculateSupplierPerformance([supplier], purchases);
  return results[0];
}

/**
 * Sort suppliers by performance metric
 * 
 * @param performance - Array of supplier performance metrics
 * @param sortBy - Metric to sort by
 * @param direction - Sort direction ('asc' or 'desc')
 * @returns Sorted array of supplier performance metrics
 * 
 * @example
 * ```typescript
 * const sorted = sortSupplierPerformance(
 *   performance, 
 *   'totalValue', 
 *   'desc'
 * );
 * ```
 */
export function sortSupplierPerformance(
  performance: SupplierPerformance[],
  sortBy: keyof SupplierPerformance,
  direction: 'asc' | 'desc' = 'desc'
): SupplierPerformance[] {
  return [...performance].sort((a, b) => {
    const aValue = a[sortBy];
    const bValue = b[sortBy];
    
    // Handle undefined/null values
    if (aValue === undefined || aValue === null) return direction === 'asc' ? -1 : 1;
    if (bValue === undefined || bValue === null) return direction === 'asc' ? 1 : -1;
    
    // Compare values
    if (aValue < bValue) return direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return direction === 'asc' ? 1 : -1;
    return 0;
  });
}

/**
 * Filter suppliers by performance threshold
 * 
 * @param performance - Array of supplier performance metrics
 * @param metric - Metric to filter by
 * @param threshold - Threshold value
 * @param comparison - Comparison operator ('gt', 'gte', 'lt', 'lte', 'eq')
 * @returns Filtered array of supplier performance metrics
 * 
 * @example
 * ```typescript
 * // Get suppliers with >90% on-time delivery
 * const goodSuppliers = filterSupplierPerformance(
 *   performance,
 *   'onTimeDeliveryRate',
 *   90,
 *   'gte'
 * );
 * ```
 */
export function filterSupplierPerformance(
  performance: SupplierPerformance[],
  metric: keyof SupplierPerformance,
  threshold: number,
  comparison: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' = 'gte'
): SupplierPerformance[] {
  return performance.filter(p => {
    const value = p[metric];
    
    // Skip if value is not a number
    if (typeof value !== 'number') return false;
    
    switch (comparison) {
      case 'gt': return value > threshold;
      case 'gte': return value >= threshold;
      case 'lt': return value < threshold;
      case 'lte': return value <= threshold;
      case 'eq': return value === threshold;
      default: return false;
    }
  });
}
