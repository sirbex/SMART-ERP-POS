/**
 * Offline Data Mappers (Single Source of Truth)
 *
 * Normalises raw API responses (snake_case) into the typed IndexedDB
 * shapes (camelCase).  Used by both:
 *   • OfflineContext  → prewarm helpers
 *   • useOfflineData  → React-Query queryFn persist step
 *
 * IMPORTANT: If you change a mapper here, both code-paths benefit
 * automatically — no need to update two places.
 */

import type {
  OfflineProduct,
  OfflineStockLevel,
  OfflineCustomer,
  OfflineBatch,
} from './offlineDb';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiRow = Record<string, any>;

// ── Products ──────────────────────────────────────────────────

export function mapApiProduct(item: ApiRow): OfflineProduct {
  return {
    id: item.id,
    name: item.name || '',
    sku: item.sku || '',
    barcode: item.barcode || '',
    category: item.category || '',
    description: item.description || '',
    sellingPrice: parseFloat(item.selling_price || item.sellingPrice || '0'),
    costPrice: parseFloat(item.cost_price || item.costPrice || '0'),
    costingMethod: item.costing_method || item.costingMethod || 'FIFO',
    isTaxable: !!item.is_taxable || !!item.isTaxable,
    taxRate: parseFloat(item.tax_rate || item.taxRate || '0'),
    isActive: item.is_active ?? item.isActive ?? true,
    trackExpiry: !!item.track_expiry || !!item.trackExpiry,
    reorderLevel: parseFloat(item.reorder_level || item.reorderLevel || '0'),
    productType: item.product_type || item.productType || 'inventory',
    quantityOnHand: parseFloat(item.quantity_on_hand || item.quantityOnHand || '0'),
    uoms: item.product_uoms || item.uoms || [],
  };
}

// ── Stock Levels ──────────────────────────────────────────────

export function mapApiStockLevel(item: ApiRow): OfflineStockLevel {
  return {
    productId: item.product_id || item.productId,
    productName: item.product_name || item.productName || '',
    sku: item.sku || '',
    totalStock: parseFloat(item.total_stock || item.totalStock || '0'),
    averageCost: parseFloat(item.average_cost || item.averageCost || '0'),
    sellingPrice: parseFloat(item.selling_price || item.sellingPrice || '0'),
    nearestExpiry: item.nearest_expiry || item.nearestExpiry || undefined,
    productType: item.product_type || item.productType || 'inventory',
    batchCount: parseInt(item.batch_count || item.batchCount || '0', 10),
  };
}

// ── Customers ─────────────────────────────────────────────────

export function mapApiCustomer(item: ApiRow): OfflineCustomer {
  return {
    id: item.id,
    name: item.name || '',
    email: item.email || '',
    phone: item.phone || '',
    address: item.address || '',
    balance: parseFloat(item.balance || '0'),
    creditLimit: parseFloat(item.credit_limit || item.creditLimit || '0'),
    customerGroupId: item.customer_group_id || item.customerGroupId || undefined,
    isActive: item.is_active ?? item.isActive ?? true,
  };
}

// ── Batches ───────────────────────────────────────────────────

export function mapApiBatch(item: ApiRow): OfflineBatch {
  return {
    id: item.id,
    productId: item.product_id || item.productId,
    productName: item.product_name || item.productName || '',
    batchNumber: item.batch_number || item.batchNumber || '',
    expiryDate: item.expiry_date || item.expiryDate || undefined,
    remainingQuantity: parseFloat(item.remaining_quantity || item.remainingQuantity || '0'),
    unitCost: parseFloat(item.unit_cost || item.unitCost || '0'),
  };
}
