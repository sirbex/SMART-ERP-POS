/**
 * Offline Transaction Database
 * Uses IndexedDB to store transactions when offline
 */

import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

// ============================================================
// DATABASE SCHEMA
// ============================================================

export interface OfflineTransaction {
  id: string; // UUID for offline transaction
  localId: string; // Local unique ID
  customerId: number;
  customerName?: string;
  items: Array<{
    inventoryItemId: number;
    productName: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentStatus: 'paid' | 'unpaid' | 'partial';
  paymentMethod?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  syncStatus: 'pending' | 'syncing' | 'synced' | 'error';
  syncError?: string;
  syncAttempts: number;
  lastSyncAttempt?: string;
}

interface OfflineDBSchema extends DBSchema {
  transactions: {
    key: string;
    value: OfflineTransaction;
    indexes: {
      'by-sync-status': string;
      'by-created-at': string;
      'by-customer': number;
    };
  };
  settings: {
    key: string;
    value: {
      key: string;
      value: unknown;
      updatedAt: string;
    };
  };
  cache: {
    key: string;
    value: {
      key: string;
      data: unknown;
      expiresAt: number;
      updatedAt: string;
    };
  };
}

// ============================================================
// DATABASE CONNECTION
// ============================================================

const DB_NAME = 'samplepos-offline';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<OfflineDBSchema> | null = null;

/**
 * Initialize and get database connection
 */
async function getDB(): Promise<IDBPDatabase<OfflineDBSchema>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<OfflineDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion) {
      console.log(`📦 Upgrading IndexedDB from v${oldVersion} to v${newVersion}`);

      // Create transactions store
      if (!db.objectStoreNames.contains('transactions')) {
        const transactionStore = db.createObjectStore('transactions', { keyPath: 'id' });
        transactionStore.createIndex('by-sync-status', 'syncStatus');
        transactionStore.createIndex('by-created-at', 'createdAt');
        transactionStore.createIndex('by-customer', 'customerId');
        console.log('✅ Created transactions store');
      }

      // Create settings store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
        console.log('✅ Created settings store');
      }

      // Create cache store
      if (!db.objectStoreNames.contains('cache')) {
        db.createObjectStore('cache', { keyPath: 'key' });
        console.log('✅ Created cache store');
      }
    },
    blocked() {
      console.warn('⚠️ IndexedDB upgrade blocked. Close other tabs.');
    },
    blocking() {
      console.warn('⚠️ IndexedDB blocking other connections.');
    },
    terminated() {
      console.error('❌ IndexedDB connection terminated unexpectedly.');
      dbInstance = null;
    },
  });

  console.log('✅ IndexedDB initialized successfully');
  return dbInstance;
}

// ============================================================
// OFFLINE TRANSACTION OPERATIONS
// ============================================================

/**
 * Save transaction for offline sync
 */
export async function saveOfflineTransaction(
  transaction: Omit<OfflineTransaction, 'id' | 'syncStatus' | 'syncAttempts' | 'createdAt'>
): Promise<string> {
  const db = await getDB();
  
  const offlineTransaction: OfflineTransaction = {
    ...transaction,
    id: `offline-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    createdAt: new Date().toISOString(),
    syncStatus: 'pending',
    syncAttempts: 0,
  };

  await db.add('transactions', offlineTransaction);
  
  console.log('💾 Saved offline transaction:', offlineTransaction.id);
  return offlineTransaction.id;
}

/**
 * Get all pending offline transactions
 */
export async function getPendingTransactions(): Promise<OfflineTransaction[]> {
  const db = await getDB();
  return db.getAllFromIndex('transactions', 'by-sync-status', 'pending');
}

/**
 * Get all offline transactions
 */
export async function getAllOfflineTransactions(): Promise<OfflineTransaction[]> {
  const db = await getDB();
  return db.getAll('transactions');
}

/**
 * Get offline transaction by ID
 */
export async function getOfflineTransaction(id: string): Promise<OfflineTransaction | undefined> {
  const db = await getDB();
  return db.get('transactions', id);
}

/**
 * Update transaction sync status
 */
export async function updateTransactionSyncStatus(
  id: string,
  status: OfflineTransaction['syncStatus'],
  error?: string
): Promise<void> {
  const db = await getDB();
  const transaction = await db.get('transactions', id);
  
  if (!transaction) {
    throw new Error(`Transaction ${id} not found`);
  }

  transaction.syncStatus = status;
  transaction.syncAttempts += 1;
  transaction.lastSyncAttempt = new Date().toISOString();
  
  if (error) {
    transaction.syncError = error;
  }

  await db.put('transactions', transaction);
  console.log(`📝 Updated transaction ${id} status to ${status}`);
}

/**
 * Delete synced transaction
 */
export async function deleteOfflineTransaction(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('transactions', id);
  console.log(`🗑️ Deleted offline transaction ${id}`);
}

/**
 * Clear all synced transactions
 */
export async function clearSyncedTransactions(): Promise<number> {
  const db = await getDB();
  const syncedTransactions = await db.getAllFromIndex('transactions', 'by-sync-status', 'synced');
  
  for (const transaction of syncedTransactions) {
    await db.delete('transactions', transaction.id);
  }
  
  console.log(`🧹 Cleared ${syncedTransactions.length} synced transactions`);
  return syncedTransactions.length;
}

/**
 * Get offline transaction count by status
 */
export async function getTransactionCount(): Promise<{
  total: number;
  pending: number;
  syncing: number;
  synced: number;
  error: number;
}> {
  const db = await getDB();
  const all = await db.getAll('transactions');
  
  return {
    total: all.length,
    pending: all.filter(t => t.syncStatus === 'pending').length,
    syncing: all.filter(t => t.syncStatus === 'syncing').length,
    synced: all.filter(t => t.syncStatus === 'synced').length,
    error: all.filter(t => t.syncStatus === 'error').length,
  };
}

// ============================================================
// SETTINGS OPERATIONS
// ============================================================

/**
 * Save app setting
 */
export async function saveSetting(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  await db.put('settings', {
    key,
    value,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Get app setting
 */
export async function getSetting<T = unknown>(key: string): Promise<T | undefined> {
  const db = await getDB();
  const setting = await db.get('settings', key);
  return setting?.value as T | undefined;
}

// ============================================================
// CACHE OPERATIONS
// ============================================================

/**
 * Save data to cache with expiration
 */
export async function saveToCache(
  key: string,
  data: unknown,
  ttlMinutes: number = 60
): Promise<void> {
  const db = await getDB();
  const expiresAt = Date.now() + (ttlMinutes * 60 * 1000);
  
  await db.put('cache', {
    key,
    data,
    expiresAt,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Get data from cache
 */
export async function getFromCache<T = unknown>(key: string): Promise<T | null> {
  const db = await getDB();
  const cached = await db.get('cache', key);
  
  if (!cached) {
    return null;
  }

  // Check if expired
  if (cached.expiresAt < Date.now()) {
    await db.delete('cache', key);
    return null;
  }

  return cached.data as T;
}

/**
 * Clear expired cache entries
 */
export async function clearExpiredCache(): Promise<number> {
  const db = await getDB();
  const all = await db.getAll('cache');
  const now = Date.now();
  let cleared = 0;
  
  for (const item of all) {
    if (item.expiresAt < now) {
      await db.delete('cache', item.key);
      cleared++;
    }
  }
  
  console.log(`🧹 Cleared ${cleared} expired cache entries`);
  return cleared;
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Get database statistics
 */
export async function getDBStats(): Promise<{
  transactions: number;
  settings: number;
  cache: number;
  totalSize?: number;
}> {
  const db = await getDB();
  
  const [transactions, settings, cache] = await Promise.all([
    db.count('transactions'),
    db.count('settings'),
    db.count('cache'),
  ]);

  return {
    transactions,
    settings,
    cache,
  };
}

/**
 * Clear all data (use with caution!)
 */
export async function clearAllData(): Promise<void> {
  const db = await getDB();
  
  await Promise.all([
    db.clear('transactions'),
    db.clear('settings'),
    db.clear('cache'),
  ]);
  
  console.log('🧹 Cleared all IndexedDB data');
}

/**
 * Export all offline transactions (for debugging)
 */
export async function exportOfflineData(): Promise<{
  transactions: OfflineTransaction[];
  stats: Awaited<ReturnType<typeof getDBStats>>;
  counts: Awaited<ReturnType<typeof getTransactionCount>>;
}> {
  const db = await getDB();
  
  const [transactions, stats, counts] = await Promise.all([
    db.getAll('transactions'),
    getDBStats(),
    getTransactionCount(),
  ]);

  return {
    transactions,
    stats,
    counts,
  };
}

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Initialize offline database on app start
 */
export async function initializeOfflineDB(): Promise<void> {
  try {
    await getDB();
    
    // Clear expired cache on startup
    await clearExpiredCache();
    
    // Log statistics
    const stats = await getDBStats();
    const counts = await getTransactionCount();
    
    console.log('📊 Offline DB Stats:', stats);
    console.log('📊 Transaction Counts:', counts);
    
    if (counts.pending > 0) {
      console.log(`⚠️ ${counts.pending} pending transactions need sync`);
    }
  } catch (error) {
    console.error('❌ Failed to initialize offline DB:', error);
    throw error;
  }
}

// Auto-initialize when module is imported
if (typeof window !== 'undefined') {
  initializeOfflineDB().catch(console.error);
}
