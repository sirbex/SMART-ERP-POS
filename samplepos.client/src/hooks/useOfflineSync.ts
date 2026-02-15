/**
 * Offline Sync Hook
 * 
 * Manages offline queue for API operations.
 * Automatically syncs when connection is restored.
 */

import { useState, useEffect, useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { STORAGE_KEYS } from '../utils/constants';

/**
 * Queued operation interface
 */
export interface QueuedOperation {
  id: string;
  type: 'CREATE' | 'UPDATE' | 'DELETE';
  entity: string;
  data: unknown;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

/**
 * Sync status
 */
export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  queueLength: number;
  lastSyncTime: number | null;
  errors: string[];
}

/**
 * Hook for managing offline operations queue
 * 
 * @returns Offline sync utilities
 * 
 * @example
 * ```tsx
 * function SalesPage() {
 *   const { addToQueue, sync, status } = useOfflineSync();
 *   
 *   const createSale = async (saleData) => {
 *     if (!status.isOnline) {
 *       await addToQueue('CREATE', 'sales', saleData);
 *       showNotification('Sale saved offline. Will sync when online.');
 *     } else {
 *       await api.sales.create(saleData);
 *     }
 *   };
 *   
 *   return <div>...</div>;
 * }
 * ```
 */
export function useOfflineSync() {
  const [queue, setQueue, clearQueue] = useLocalStorage<QueuedOperation[]>(
    STORAGE_KEYS.OFFLINE_QUEUE,
    []
  );
  
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      console.log('Network connection restored');
    };

    const handleOffline = () => {
      setIsOnline(false);
      console.log('Network connection lost');
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && queue.length > 0 && !isSyncing) {
      console.log(`Auto-syncing ${queue.length} queued operations`);
      sync();
    }
  }, [isOnline, queue.length]);

  /**
   * Add operation to offline queue
   */
  const addToQueue = useCallback(
    async (
      type: QueuedOperation['type'],
      entity: string,
      data: unknown,
      maxRetries = 3
    ): Promise<void> => {
      const operation: QueuedOperation = {
        id: `${entity}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type,
        entity,
        data,
        timestamp: Date.now(),
        retryCount: 0,
        maxRetries
      };

      setQueue(prev => [...prev, operation]);
      console.log(`Added ${type} operation for ${entity} to offline queue`);
    },
    [setQueue]
  );

  /**
   * Remove operation from queue
   */
  const removeFromQueue = useCallback(
    (operationId: string) => {
      setQueue(prev => prev.filter(op => op.id !== operationId));
    },
    [setQueue]
  );

  /**
   * Process a single queued operation
   */
  const processOperation = async (operation: QueuedOperation): Promise<boolean> => {
    try {
      // This would call the actual API based on entity and type
      // For now, we'll simulate it
      console.log(`Processing ${operation.type} for ${operation.entity}`, operation.data);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Success
      return true;
    } catch (error) {
      console.error(`Error processing operation ${operation.id}:`, error);
      return false;
    }
  };

  /**
   * Sync all queued operations
   */
  const sync = useCallback(async (): Promise<void> => {
    if (!isOnline) {
      console.warn('Cannot sync while offline');
      return;
    }

    if (isSyncing) {
      console.warn('Sync already in progress');
      return;
    }

    if (queue.length === 0) {
      console.log('No operations to sync');
      return;
    }

    setIsSyncing(true);
    setErrors([]);

    const failedOperations: QueuedOperation[] = [];
    const syncErrors: string[] = [];

    // Process operations in order
    for (const operation of queue) {
      const success = await processOperation(operation);

      if (success) {
        removeFromQueue(operation.id);
      } else {
        // Increment retry count
        const updatedOperation = {
          ...operation,
          retryCount: operation.retryCount + 1
        };

        if (updatedOperation.retryCount >= updatedOperation.maxRetries) {
          syncErrors.push(
            `Operation ${operation.type} ${operation.entity} failed after ${updatedOperation.maxRetries} retries`
          );
          removeFromQueue(operation.id);
        } else {
          failedOperations.push(updatedOperation);
        }
      }
    }

    // Update queue with failed operations
    if (failedOperations.length > 0) {
      setQueue(failedOperations);
    }

    setErrors(syncErrors);
    setLastSyncTime(Date.now());
    setIsSyncing(false);

    const successCount = queue.length - failedOperations.length;
    console.log(`Sync complete: ${successCount} succeeded, ${failedOperations.length} failed`);
  }, [isOnline, isSyncing, queue, removeFromQueue, setQueue]);

  /**
   * Clear all queued operations
   */
  const clearAll = useCallback(() => {
    clearQueue();
    setErrors([]);
    console.log('Offline queue cleared');
  }, [clearQueue]);

  /**
   * Get operations for specific entity
   */
  const getQueuedOperations = useCallback(
    (entity: string) => {
      return queue.filter(op => op.entity === entity);
    },
    [queue]
  );

  const status: SyncStatus = {
    isOnline,
    isSyncing,
    queueLength: queue.length,
    lastSyncTime,
    errors
  };

  return {
    status,
    addToQueue,
    removeFromQueue,
    sync,
    clearAll,
    getQueuedOperations,
    queue
  };
}

/**
 * Hook for checking if data has been modified offline
 */
export function useOfflineData<T>(key: string, initialValue: T) {
  const [data, setData, clearData] = useLocalStorage<T>(key, initialValue);
  const [hasOfflineChanges, setHasOfflineChanges] = useState(false);

  const updateData = useCallback(
    (value: T | ((prevValue: T) => T)) => {
      setData(value);
      setHasOfflineChanges(true);
    },
    [setData]
  );

  const markAsSynced = useCallback(() => {
    setHasOfflineChanges(false);
  }, []);

  return {
    data,
    updateData,
    clearData,
    hasOfflineChanges,
    markAsSynced
  };
}

/**
 * Network status hook (simple wrapper)
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, []);

  return isOnline;
}
