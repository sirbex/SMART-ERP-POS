/**
 * Inventory Store
 * 
 * Zustand store for managing inventory with FEFO batch tracking.
 * Persists data to localStorage for session continuity.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import Decimal from 'decimal.js';
import type { InventoryBatch, Product } from '../types';
import { STORAGE_KEYS } from '../utils/constants';
import { isExpired, isExpiringSoon, daysUntilExpiry } from '../utils/validation';

interface InventoryStore {
  batches: InventoryBatch[];
  setBatches: (batches: InventoryBatch[]) => void;
  addBatch: (batch: InventoryBatch) => void;
  updateBatch: (batchId: string, updates: Partial<InventoryBatch>) => void;
  removeBatch: (batchId: string) => void;

  // FEFO Selection
  selectBatchesFEFO: (productId: string, quantity: Decimal) => InventoryBatch[];
  getBatchesForProduct: (productId: string) => InventoryBatch[];
  getAvailableQuantity: (productId: string) => Decimal;

  // Expiry Management
  getExpiringBatches: (days?: number) => InventoryBatch[];
  getExpiredBatches: () => InventoryBatch[];

  // Low Stock
  hasLowStock: (product: Product) => boolean;

  // Clear
  clearInventory: () => void;
}

/**
 * Sort batches by FEFO (First Expiry First Out)
 * Batches without expiry date go last
 */
function sortBatchesFEFO(batches: InventoryBatch[]): InventoryBatch[] {
  return [...batches].sort((a, b) => {
    // If both have expiry dates, sort by expiry date
    if (a.expiryDate && b.expiryDate) {
      return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
    }
    // If only a has expiry, it goes first
    if (a.expiryDate && !b.expiryDate) return -1;
    // If only b has expiry, it goes first
    if (!a.expiryDate && b.expiryDate) return 1;
    // If neither has expiry, sort by received date
    return new Date(a.receivedDate).getTime() - new Date(b.receivedDate).getTime();
  });
}

/**
 * Inventory Store
 */
export const useInventoryStore = create<InventoryStore>()(
  persist(
    (set, get) => ({
      batches: [],

      /**
       * Set all batches (typically from API sync)
       */
      setBatches: (batches) => {
        set({ batches });
      },

      /**
       * Add a new batch
       */
      addBatch: (batch) => {
        const state = get();
        set({ batches: [...state.batches, batch] });
      },

      /**
       * Update an existing batch
       */
      updateBatch: (batchId, updates) => {
        const state = get();
        const updatedBatches = state.batches.map(batch =>
          batch.id === batchId ? { ...batch, ...updates } : batch
        );
        set({ batches: updatedBatches });
      },

      /**
       * Remove a batch
       */
      removeBatch: (batchId) => {
        const state = get();
        const updatedBatches = state.batches.filter(batch => batch.id !== batchId);
        set({ batches: updatedBatches });
      },

      /**
       * Select batches using FEFO for a sale
       * Returns array of batches with quantity to take from each
       */
      selectBatchesFEFO: (productId, quantity) => {
        const state = get();

        // Get active batches for product
        const productBatches = state.batches.filter(
          batch =>
            batch.productId === productId &&
            batch.isActive &&
            new Decimal(batch.availableQuantity).greaterThan(0) &&
            !isExpired(batch.expiryDate || '')
        );

        // Sort by FEFO
        const sortedBatches = sortBatchesFEFO(productBatches);

        // Select batches to fulfill quantity
        const selectedBatches: InventoryBatch[] = [];
        let remainingQuantity = new Decimal(quantity);

        for (const batch of sortedBatches) {
          if (remainingQuantity.lessThanOrEqualTo(0)) break;

          const available = new Decimal(batch.availableQuantity);
          const toTake = Decimal.min(available, remainingQuantity);

          selectedBatches.push({
            ...batch,
            availableQuantity: toTake.toString()
          });

          remainingQuantity = remainingQuantity.minus(toTake);
        }

        return selectedBatches;
      },

      /**
       * Get all batches for a product
       */
      getBatchesForProduct: (productId) => {
        const state = get();
        return state.batches
          .filter(batch => batch.productId === productId && batch.isActive)
          .sort((a, b) => new Date(b.receivedDate).getTime() - new Date(a.receivedDate).getTime());
      },

      /**
       * Get total available quantity for a product
       */
      getAvailableQuantity: (productId) => {
        const state = get();
        return state.batches
          .filter(
            batch =>
              batch.productId === productId &&
              batch.isActive &&
              !isExpired(batch.expiryDate || '')
          )
          .reduce(
            (sum, batch) => sum.plus(new Decimal(batch.availableQuantity)),
            new Decimal(0)
          );
      },

      /**
       * Get batches expiring within specified days
       */
      getExpiringBatches: (days = 30) => {
        const state = get();
        return state.batches.filter(
          batch =>
            batch.isActive &&
            batch.expiryDate &&
            !isExpired(batch.expiryDate) &&
            isExpiringSoon(batch.expiryDate, Number(days)) &&
            new Decimal(batch.availableQuantity).greaterThan(0)
        ).sort((a, b) => {
          const daysA = daysUntilExpiry(a.expiryDate || '');
          const daysB = daysUntilExpiry(b.expiryDate || '');
          return daysA - daysB;
        });
      },

      /**
       * Get expired batches
       */
      getExpiredBatches: () => {
        const state = get();
        return state.batches.filter(
          batch =>
            batch.isActive &&
            batch.expiryDate &&
            isExpired(batch.expiryDate) &&
            new Decimal(batch.availableQuantity).greaterThan(0)
        );
      },

      /**
       * Check if product has low stock
       */
      hasLowStock: (product) => {
        const availableQty = get().getAvailableQuantity(product.id);
        const reorderLevel = product.reorderLevel ? new Decimal(product.reorderLevel) : new Decimal(0);
        return availableQty.lessThanOrEqualTo(reorderLevel);
      },

      /**
       * Clear all inventory
       */
      clearInventory: () => {
        set({ batches: [] });
      }
    }),
    {
      name: STORAGE_KEYS.INVENTORY,
      // Filter out product/batch nested objects to avoid circular references
      partialize: (state) => ({
        batches: state.batches.map(batch => ({
          ...batch,
          product: undefined // Don't persist nested product
        }))
      })
    }
  )
);
