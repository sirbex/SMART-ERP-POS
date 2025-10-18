/**
 * Background Sync Service
 * Handles syncing offline transactions to the server
 */

import {
  getPendingTransactions,
  updateTransactionSyncStatus,
  deleteOfflineTransaction,
  getTransactionCount,
} from './offlineDB';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// ============================================================
// TYPES
// ============================================================

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

export type SyncCallback = (result: SyncResult) => void;

// ============================================================
// SYNC STATE
// ============================================================

let isSyncing = false;
let syncCallbacks: SyncCallback[] = [];

/**
 * Register callback for sync events
 */
export function onSyncComplete(callback: SyncCallback): () => void {
  syncCallbacks.push(callback);
  
  // Return unsubscribe function
  return () => {
    syncCallbacks = syncCallbacks.filter(cb => cb !== callback);
  };
}

/**
 * Notify all callbacks
 */
function notifySyncComplete(result: SyncResult): void {
  syncCallbacks.forEach(callback => {
    try {
      callback(result);
    } catch (error) {
      console.error('Error in sync callback:', error);
    }
  });
}

// ============================================================
// NETWORK DETECTION
// ============================================================

/**
 * Check if online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Wait for online connection
 */
export function waitForOnline(): Promise<void> {
  return new Promise((resolve) => {
    if (isOnline()) {
      resolve();
      return;
    }

    const handleOnline = () => {
      window.removeEventListener('online', handleOnline);
      resolve();
    };

    window.addEventListener('online', handleOnline);
  });
}

// ============================================================
// SYNC OPERATIONS
// ============================================================

/**
 * Sync a single transaction to the server
 */
async function syncTransaction(transaction: any): Promise<void> {
  const response = await fetch(`${API_BASE}/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customer_id: transaction.customerId,
      items: transaction.items.map((item: any) => ({
        inventory_item_id: item.inventoryItemId,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
      })),
      subtotal: transaction.subtotal,
      tax: transaction.tax,
      discount: transaction.discount,
      total: transaction.total,
      payment_status: transaction.paymentStatus,
      payment_method: transaction.paymentMethod,
      metadata: {
        ...transaction.metadata,
        offline_id: transaction.id,
        offline_created_at: transaction.createdAt,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Sync all pending offline transactions
 */
export async function syncOfflineTransactions(): Promise<SyncResult> {
  if (isSyncing) {
    console.log('⚠️ Sync already in progress');
    return {
      success: false,
      synced: 0,
      failed: 0,
      errors: [{ id: 'system', error: 'Sync already in progress' }],
    };
  }

  if (!isOnline()) {
    console.log('⚠️ Cannot sync while offline');
    return {
      success: false,
      synced: 0,
      failed: 0,
      errors: [{ id: 'system', error: 'Device is offline' }],
    };
  }

  isSyncing = true;
  console.log('🔄 Starting offline transaction sync...');

  const result: SyncResult = {
    success: true,
    synced: 0,
    failed: 0,
    errors: [],
  };

  try {
    const pendingTransactions = await getPendingTransactions();
    
    if (pendingTransactions.length === 0) {
      console.log('✅ No transactions to sync');
      isSyncing = false;
      return result;
    }

    console.log(`📤 Syncing ${pendingTransactions.length} transactions...`);

    for (const transaction of pendingTransactions) {
      try {
        // Update status to syncing
        await updateTransactionSyncStatus(transaction.id, 'syncing');

        // Attempt to sync
        await syncTransaction(transaction);

        // Mark as synced
        await updateTransactionSyncStatus(transaction.id, 'synced');

        // Delete synced transaction after a delay (for audit purposes)
        setTimeout(() => {
          deleteOfflineTransaction(transaction.id).catch(console.error);
        }, 5000);

        result.synced++;
        console.log(`✅ Synced transaction ${transaction.id}`);
      } catch (error: any) {
        // Mark as error
        await updateTransactionSyncStatus(
          transaction.id,
          'error',
          error.message || 'Unknown error'
        );

        result.failed++;
        result.errors.push({
          id: transaction.id,
          error: error.message || 'Unknown error',
        });

        console.error(`❌ Failed to sync transaction ${transaction.id}:`, error);

        // If max attempts reached, mark as pending again for manual review
        if (transaction.syncAttempts >= 3) {
          console.warn(`⚠️ Transaction ${transaction.id} failed 3 times, needs manual review`);
        }
      }
    }

    console.log(`✅ Sync complete: ${result.synced} synced, ${result.failed} failed`);
  } catch (error: any) {
    console.error('❌ Sync process error:', error);
    result.success = false;
    result.errors.push({
      id: 'system',
      error: error.message || 'Unknown error',
    });
  } finally {
    isSyncing = false;
    notifySyncComplete(result);
  }

  return result;
}

/**
 * Auto-sync when coming online
 */
export function enableAutoSync(): void {
  window.addEventListener('online', () => {
    console.log('🌐 Device is back online, starting auto-sync...');
    
    // Wait a bit before syncing to ensure connection is stable
    setTimeout(() => {
      syncOfflineTransactions();
    }, 2000);
  });

  console.log('✅ Auto-sync enabled');
}

/**
 * Get sync status
 */
export async function getSyncStatus(): Promise<{
  isSyncing: boolean;
  isOnline: boolean;
  counts: Awaited<ReturnType<typeof getTransactionCount>>;
}> {
  const counts = await getTransactionCount();
  
  return {
    isSyncing,
    isOnline: isOnline(),
    counts,
  };
}

/**
 * Retry failed transactions
 */
export async function retryFailedTransactions(): Promise<SyncResult> {
  if (!isOnline()) {
    return {
      success: false,
      synced: 0,
      failed: 0,
      errors: [{ id: 'system', error: 'Device is offline' }],
    };
  }

  // Reset error transactions to pending
  const db = await import('./offlineDB').then(m => m);
  const allTransactions = await db.getAllOfflineTransactions();
  const errorTransactions = allTransactions.filter(t => t.syncStatus === 'error');

  for (const transaction of errorTransactions) {
    await updateTransactionSyncStatus(transaction.id, 'pending');
  }

  console.log(`♻️ Reset ${errorTransactions.length} failed transactions to pending`);

  // Sync again
  return syncOfflineTransactions();
}

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Initialize background sync on app start
 */
export function initializeBackgroundSync(): void {
  console.log('🔄 Initializing background sync...');

  // Enable auto-sync
  enableAutoSync();

  // Sync on page load if online
  if (isOnline()) {
    setTimeout(() => {
      syncOfflineTransactions();
    }, 3000);
  }

  // Periodic sync check (every 5 minutes)
  setInterval(() => {
    if (isOnline() && !isSyncing) {
      getSyncStatus().then(status => {
        if (status.counts.pending > 0) {
          console.log(`📊 ${status.counts.pending} pending transactions, starting sync...`);
          syncOfflineTransactions();
        }
      });
    }
  }, 5 * 60 * 1000);

  console.log('✅ Background sync initialized');
}

// Auto-initialize when module is imported
if (typeof window !== 'undefined') {
  initializeBackgroundSync();
}
