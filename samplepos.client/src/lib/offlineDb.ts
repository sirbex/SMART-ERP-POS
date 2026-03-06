/**
 * Offline IndexedDB Storage Layer
 *
 * Uses the `idb` library (already in package.json) to provide persistent
 * offline storage for products, inventory stock levels, customers, and
 * batches.  Data cached here powers POS and Inventory pages when the
 * network is unavailable.
 *
 * Each store keeps a `_lastSync` meta timestamp so the app can decide
 * whether to show stale data or force a refresh.
 *
 * IMPORTANT: This module is purely a data-access layer.  It does NOT
 * initiate network requests — callers (hooks / services) are responsible
 * for fetching from the API and calling the `put*` helpers here.
 */

import { openDB, type IDBPDatabase } from 'idb';

// ── Database Config ───────────────────────────────────────────

const DB_NAME = 'pos_offline';
const DB_VERSION = 1;

// Store names
export const STORES = {
  PRODUCTS: 'products',
  STOCK_LEVELS: 'stockLevels',
  CUSTOMERS: 'customers',
  BATCHES: 'batches',
  META: 'meta',
} as const;

// ── Types ─────────────────────────────────────────────────────

export interface OfflineProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  description: string;
  sellingPrice: number;
  costPrice: number;
  costingMethod: string;
  isTaxable: boolean;
  taxRate: number;
  isActive: boolean;
  trackExpiry: boolean;
  reorderLevel: number;
  productType: string;
  quantityOnHand: number;
  uoms: Array<{
    uomId: string;
    name: string;
    symbol?: string;
    conversionFactor: number;
    price: number;
    cost: number;
    isDefault: boolean;
  }>;
}

export interface OfflineStockLevel {
  productId: string;
  productName: string;
  sku: string;
  totalStock: number;
  averageCost: number;
  sellingPrice: number;
  nearestExpiry?: string;
  productType: string;
  batchCount: number;
}

export interface OfflineCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  balance: number;
  creditLimit: number;
  customerGroupId?: string;
  isActive: boolean;
}

export interface OfflineBatch {
  id: string;
  productId: string;
  productName: string;
  batchNumber: string;
  expiryDate?: string;
  remainingQuantity: number;
  unitCost: number;
}

export interface SyncMeta {
  store: string;
  lastSync: number;
}

// ── Database Initialization ───────────────────────────────────

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Products store — keyed by id
        if (!db.objectStoreNames.contains(STORES.PRODUCTS)) {
          const productStore = db.createObjectStore(STORES.PRODUCTS, { keyPath: 'id' });
          productStore.createIndex('sku', 'sku', { unique: false });
          productStore.createIndex('barcode', 'barcode', { unique: false });
          productStore.createIndex('name', 'name', { unique: false });
        }

        // Stock levels store — keyed by productId
        if (!db.objectStoreNames.contains(STORES.STOCK_LEVELS)) {
          db.createObjectStore(STORES.STOCK_LEVELS, { keyPath: 'productId' });
        }

        // Customers store — keyed by id
        if (!db.objectStoreNames.contains(STORES.CUSTOMERS)) {
          const customerStore = db.createObjectStore(STORES.CUSTOMERS, { keyPath: 'id' });
          customerStore.createIndex('name', 'name', { unique: false });
        }

        // Batches store — keyed by id
        if (!db.objectStoreNames.contains(STORES.BATCHES)) {
          const batchStore = db.createObjectStore(STORES.BATCHES, { keyPath: 'id' });
          batchStore.createIndex('productId', 'productId', { unique: false });
        }

        // Meta store — tracks last sync time per store
        if (!db.objectStoreNames.contains(STORES.META)) {
          db.createObjectStore(STORES.META, { keyPath: 'store' });
        }
      },
    });
  }
  return dbPromise;
}

// ── Sync Timestamp Helpers ────────────────────────────────────

export async function getLastSync(store: string): Promise<number> {
  const db = await getDb();
  const meta = await db.get(STORES.META, store) as SyncMeta | undefined;
  return meta?.lastSync ?? 0;
}

async function setLastSync(store: string): Promise<void> {
  const db = await getDb();
  await db.put(STORES.META, { store, lastSync: Date.now() } as SyncMeta);
}

// ── Products ──────────────────────────────────────────────────

export async function getAllProducts(): Promise<OfflineProduct[]> {
  const db = await getDb();
  return db.getAll(STORES.PRODUCTS);
}

export async function getProduct(id: string): Promise<OfflineProduct | undefined> {
  const db = await getDb();
  return db.get(STORES.PRODUCTS, id);
}

export async function putProducts(products: OfflineProduct[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORES.PRODUCTS, 'readwrite');
  // Clear then bulk-insert for consistency
  await tx.store.clear();
  for (const p of products) {
    await tx.store.put(p);
  }
  await tx.done;
  await setLastSync(STORES.PRODUCTS);
}

export async function searchProducts(query: string): Promise<OfflineProduct[]> {
  if (!query || query.trim().length === 0) return [];
  const all = await getAllProducts();
  const term = query.toLowerCase();
  return all.filter(
    (p) =>
      p.name.toLowerCase().includes(term) ||
      p.sku.toLowerCase().includes(term) ||
      (p.barcode && p.barcode.toLowerCase().includes(term))
  );
}

// ── Stock Levels ──────────────────────────────────────────────

export async function getAllStockLevels(): Promise<OfflineStockLevel[]> {
  const db = await getDb();
  return db.getAll(STORES.STOCK_LEVELS);
}

export async function putStockLevels(levels: OfflineStockLevel[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORES.STOCK_LEVELS, 'readwrite');
  await tx.store.clear();
  for (const l of levels) {
    await tx.store.put(l);
  }
  await tx.done;
  await setLastSync(STORES.STOCK_LEVELS);
}

// ── Customers ─────────────────────────────────────────────────

export async function getAllCustomers(): Promise<OfflineCustomer[]> {
  const db = await getDb();
  return db.getAll(STORES.CUSTOMERS);
}

export async function getCustomer(id: string): Promise<OfflineCustomer | undefined> {
  const db = await getDb();
  return db.get(STORES.CUSTOMERS, id);
}

export async function putCustomers(customers: OfflineCustomer[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORES.CUSTOMERS, 'readwrite');
  await tx.store.clear();
  for (const c of customers) {
    await tx.store.put(c);
  }
  await tx.done;
  await setLastSync(STORES.CUSTOMERS);
}

export async function searchCustomers(query: string): Promise<OfflineCustomer[]> {
  if (!query || query.trim().length === 0) return [];
  const all = await getAllCustomers();
  const term = query.toLowerCase();
  return all.filter(
    (c) =>
      c.name.toLowerCase().includes(term) ||
      (c.email && c.email.toLowerCase().includes(term)) ||
      (c.phone && c.phone.includes(term))
  );
}

// ── Batches ───────────────────────────────────────────────────

export async function getAllBatches(): Promise<OfflineBatch[]> {
  const db = await getDb();
  return db.getAll(STORES.BATCHES);
}

export async function getBatchesByProduct(productId: string): Promise<OfflineBatch[]> {
  const db = await getDb();
  const index = db.transaction(STORES.BATCHES).store.index('productId');
  return index.getAll(productId);
}

export async function putBatches(batches: OfflineBatch[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORES.BATCHES, 'readwrite');
  await tx.store.clear();
  for (const b of batches) {
    await tx.store.put(b);
  }
  await tx.done;
  await setLastSync(STORES.BATCHES);
}

// ── Clear All ─────────────────────────────────────────────────

export async function clearAllOfflineData(): Promise<void> {
  const db = await getDb();
  const storeNames = [STORES.PRODUCTS, STORES.STOCK_LEVELS, STORES.CUSTOMERS, STORES.BATCHES, STORES.META];
  for (const store of storeNames) {
    const tx = db.transaction(store, 'readwrite');
    await tx.store.clear();
    await tx.done;
  }
}
