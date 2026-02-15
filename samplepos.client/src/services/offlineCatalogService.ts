/**
 * Offline Product Catalog Service
 *
 * Caches the full POS product catalog (with stock, prices, UoMs)
 * into localStorage so product search works without network.
 *
 * Storage key: 'pos_product_catalog'
 * Stock mirror:  'pos_local_stock'
 * Sync timestamp: 'pos_catalog_last_sync'
 */

import apiClient from '../utils/api';

// ── Storage keys ──────────────────────────────────────────────
const CATALOG_KEY = 'pos_product_catalog';
const STOCK_KEY = 'pos_local_stock';
const SYNC_KEY = 'pos_catalog_last_sync';
const CART_KEY = 'pos_persisted_cart_v1';

// ── Types ─────────────────────────────────────────────────────
export interface CachedProductUom {
    uomId: string;
    name: string;
    symbol?: string;
    conversionFactor: number;
    price: number;
    cost: number;
    isDefault: boolean;
}

export interface CachedProduct {
    id: string;
    name: string;
    sku: string;
    barcode: string;
    sellingPrice: number;
    costPrice: number;
    isTaxable: boolean;
    taxRate: number;
    stockOnHand: number;
    nearestExpiry?: string;
    uoms: CachedProductUom[];
    productType?: 'inventory' | 'consumable' | 'service';
}

export interface LocalStockMap {
    [productId: string]: number;
}

// ── Catalog: read / write ─────────────────────────────────────
export function getCachedCatalog(): CachedProduct[] {
    try {
        const raw = localStorage.getItem(CATALOG_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function setCachedCatalog(products: CachedProduct[]): void {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(products));
    localStorage.setItem(SYNC_KEY, Date.now().toString());
}

export function getLastSyncTime(): number {
    const ts = localStorage.getItem(SYNC_KEY);
    return ts ? parseInt(ts, 10) : 0;
}

// ── Stock mirror: read / write / decrement / restore ──────────
export function getLocalStock(): LocalStockMap {
    try {
        const raw = localStorage.getItem(STOCK_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

export function setLocalStock(stock: LocalStockMap): void {
    localStorage.setItem(STOCK_KEY, JSON.stringify(stock));
}

/**
 * Decrement local stock for a product.
 * Returns false if insufficient stock (prevents overselling).
 */
export function decrementLocalStock(productId: string, qty: number): boolean {
    const stock = getLocalStock();
    const current = stock[productId] ?? 0;
    if (current < qty) return false;
    stock[productId] = current - qty;
    setLocalStock(stock);
    return true;
}

/**
 * Restore local stock (e.g. when item removed from cart / sale cancelled).
 */
export function restoreLocalStock(productId: string, qty: number): void {
    const stock = getLocalStock();
    stock[productId] = (stock[productId] ?? 0) + qty;
    setLocalStock(stock);
}

// ── Cart persistence ──────────────────────────────────────────
export function getPersistedCart<T>(): T | null {
    try {
        const raw = localStorage.getItem(CART_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function persistCart<T>(cart: T): void {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

export function clearPersistedCart(): void {
    localStorage.removeItem(CART_KEY);
}

// ── Sync catalog from server ──────────────────────────────────
/**
 * Fetch the full POS-ready product catalog from the inventory
 * stock-levels endpoint and cache it locally together with a
 * stock mirror.
 *
 * Call on POS page load (when online).
 */
export async function syncProductCatalog(): Promise<CachedProduct[]> {
    try {
        const res = await apiClient.get('/inventory/stock-levels');
        const stockLevels: any[] = res.data?.data || [];

        const products: CachedProduct[] = stockLevels
            .filter((item: any) => item.total_stock > 0 || item.product_type === 'service')
            .map((item: any) => {
                const sellingPrice = parseFloat(item.selling_price || '0');
                const averageCost = parseFloat(item.average_cost || '0');

                let uoms: CachedProductUom[] = item.uoms || [];
                if (!uoms || uoms.length === 0) {
                    uoms = [{
                        uomId: `default-${item.product_id}`,
                        name: 'PIECE',
                        symbol: 'PIECE',
                        conversionFactor: 1,
                        isDefault: true,
                        price: sellingPrice,
                        cost: averageCost,
                    }];
                }

                return {
                    id: item.product_id,
                    name: item.product_name,
                    sku: item.sku || '',
                    barcode: item.barcode || '',
                    sellingPrice,
                    costPrice: averageCost,
                    isTaxable: item.is_taxable ?? false,
                    taxRate: parseFloat(item.tax_rate || '0'),
                    stockOnHand: parseFloat(item.total_stock || '0'),
                    nearestExpiry: item.nearest_expiry || undefined,
                    uoms,
                    productType: item.product_type || 'inventory',
                };
            });

        // Persist catalog
        setCachedCatalog(products);

        // Build stock mirror
        const stock: LocalStockMap = {};
        for (const p of products) {
            stock[p.id] = p.stockOnHand;
        }
        setLocalStock(stock);

        return products;
    } catch (err) {
        console.error('[OfflineCatalog] Failed to sync product catalog:', err);
        // Fall back to existing cache
        return getCachedCatalog();
    }
}

// ── Offline search ────────────────────────────────────────────
/**
 * Search the locally cached product catalog by name, SKU, or barcode.
 * Returns results filtered by local stock availability.
 */
export function searchCachedProducts(query: string): CachedProduct[] {
    if (!query || query.trim().length === 0) return [];

    const products = getCachedCatalog();
    const localStock = getLocalStock();
    const term = query.toLowerCase();

    return products
        .filter((p) => {
            // Services always show, inventory items need stock
            const hasStock = p.productType === 'service' || (localStock[p.id] ?? p.stockOnHand) > 0;
            if (!hasStock) return false;

            return (
                p.name.toLowerCase().includes(term) ||
                p.sku.toLowerCase().includes(term) ||
                p.barcode.toLowerCase().includes(term)
            );
        })
        .map((p) => ({
            ...p,
            // Reflect local stock (may have been decremented by offline sales)
            stockOnHand: localStock[p.id] ?? p.stockOnHand,
        }));
}
