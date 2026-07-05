/**
 * Offline Product Catalog Service
 *
 * SAP/Odoo POS: one replication stream per session — deduplicated background sync.
 * Search always reads localStorage catalog (zero network per keystroke).
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
const CART_KEY = 'pos_persisted_cart_v2';

/** SAP/Odoo POS: background catalog refresh interval (not per keystroke). */
export const CATALOG_STALE_MS = 5 * 60 * 1000;

/** Fired on window after syncProductCatalog() succeeds — POS search listens. */
export const POS_CATALOG_SYNCED_EVENT = 'pos:catalog-synced';

let catalogSyncInFlight: Promise<CachedProduct[]> | null = null;

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
    category?: string;
    sellingPrice: number;
    costPrice: number;
    isTaxable: boolean;
    taxRate: number;
    stockOnHand: number;
    nearestExpiry?: string;
    uoms: CachedProductUom[];
    productType?: 'inventory' | 'consumable' | 'service';
    genericName?: string;
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

export function isCatalogAvailable(): boolean {
    return getCachedCatalog().length > 0;
}

export function isCatalogStale(maxAgeMs: number = CATALOG_STALE_MS): boolean {
    const last = getLastSyncTime();
    if (!last) return true;
    return Date.now() - last > maxAgeMs;
}

function notifyCatalogSynced(): void {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(POS_CATALOG_SYNCED_EVENT, {
            detail: { syncedAt: getLastSyncTime() },
        }));
    }
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
 * POS catalog endpoint and cache it locally together with a
 * stock mirror.
 *
 * Call on POS page load (when online).
 */
export async function syncProductCatalog(): Promise<CachedProduct[]> {
    if (catalogSyncInFlight) return catalogSyncInFlight;

    catalogSyncInFlight = syncProductCatalogOnce()
        .finally(() => {
            catalogSyncInFlight = null;
        });

    return catalogSyncInFlight;
}

async function syncProductCatalogOnce(): Promise<CachedProduct[]> {
    try {
        const res = await apiClient.get('/inventory/pos/catalog');
        interface StockLevelRow {
            product_id: string;
            product_name: string;
            sku?: string;
            barcode?: string;
            selling_price?: string;
            average_cost?: string;
            total_stock?: string;
            nearest_expiry?: string;
            is_taxable?: boolean;
            tax_rate?: string;
            product_type?: string;
            generic_name?: string;
            category?: string;
            uoms?: CachedProductUom[];
        }

        const stockLevels: StockLevelRow[] = res.data?.data || [];

        const missingUomProducts: string[] = [];

        const products: CachedProduct[] = stockLevels
            .map((item: StockLevelRow) => {
                const sellingPrice = parseFloat(item.selling_price || '0');
                const averageCost = parseFloat(item.average_cost || '0');

                let uoms: CachedProductUom[] = item.uoms || [];
                if (!uoms || uoms.length === 0) {
                    missingUomProducts.push(`${item.product_name} (${item.product_id})`);
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
                    category: item.category || undefined,
                    sellingPrice,
                    costPrice: averageCost,
                    isTaxable: item.is_taxable ?? false,
                    taxRate: parseFloat(item.tax_rate || '0'),
                    stockOnHand: parseFloat(item.total_stock || '0'),
                    nearestExpiry: item.nearest_expiry || undefined,
                    uoms,
                    productType: (item.product_type || 'inventory') as CachedProduct['productType'],
                    genericName: item.generic_name || undefined,
                };
            });

        if (missingUomProducts.length > 0) {
            console.warn(
                `[offlineCatalog] ${missingUomProducts.length} product(s) have no product_uoms and no base_uom_id — ` +
                'POS uses a synthetic PIECE fallback; repair product master data. Examples:',
                missingUomProducts.slice(0, 3).join('; '),
            );
        }

        // Persist catalog
        setCachedCatalog(products);

        // Build stock mirror
        const stock: LocalStockMap = {};
        for (const p of products) {
            stock[p.id] = p.stockOnHand;
        }
        setLocalStock(stock);

        notifyCatalogSynced();
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
            const stock = localStock[p.id] ?? p.stockOnHand;
            const hasStock = p.productType === 'service' || stock > 0;
            if (!hasStock) return false;

            if (p.nearestExpiry && p.productType !== 'service') {
                const today = new Date().toISOString().slice(0, 10);
                if (p.nearestExpiry <= today) return false;
            }

            return (
                p.name.toLowerCase().includes(term) ||
                p.sku.toLowerCase().includes(term) ||
                p.barcode.toLowerCase().includes(term) ||
                (p.genericName?.toLowerCase().includes(term) ?? false) ||
                (p.category?.toLowerCase().includes(term) ?? false)
            );
        })
        .map((p) => ({
            ...p,
            // Reflect local stock (may have been decremented by offline sales)
            stockOnHand: localStock[p.id] ?? p.stockOnHand,
        }));
}
