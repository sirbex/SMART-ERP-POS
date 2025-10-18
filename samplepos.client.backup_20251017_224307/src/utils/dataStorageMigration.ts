/**
 * Data Storage Migration Utility
 * 
 * This utility helps migrate data between different localStorage keys
 * to ensure compatibility with standardized STORAGE_KEYS usage.
 */

import { STORAGE_KEYS } from "../services/UnifiedDataService";
import type { InventoryItem } from "../models/InventoryItem";

/**
 * Migrate inventory data between different storage keys
 * This ensures data is available in the primary STORAGE_KEYS.INVENTORY location
 */
export function migrateInventoryData(): { 
  success: boolean; 
  migrated: boolean; 
  source?: string; 
  count?: number; 
  message: string 
} {
  try {
    // Check all possible inventory sources
    const items = JSON.parse(localStorage.getItem(STORAGE_KEYS.INVENTORY) || '[]');
    const products = JSON.parse(localStorage.getItem(STORAGE_KEYS.INVENTORY_PRODUCTS) || '[]');
    const posInv = JSON.parse(localStorage.getItem(STORAGE_KEYS.INVENTORY_LEGACY) || '[]');
    
    console.log(`Checking inventory sources:
      - ${STORAGE_KEYS.INVENTORY}: ${items.length} items
      - ${STORAGE_KEYS.INVENTORY_PRODUCTS}: ${products.length} items
      - ${STORAGE_KEYS.INVENTORY_LEGACY}: ${posInv.length} items
    `);
    
    // If primary inventory is empty but other sources have data
    if (items.length === 0) {
      let sourceData: InventoryItem[] = [];
      let sourceName = '';
      
      // Use products as primary source if available
      if (products.length > 0) {
        sourceData = products;
        sourceName = STORAGE_KEYS.INVENTORY_PRODUCTS;
      }
      // Otherwise use legacy inventory
      else if (posInv.length > 0) {
        sourceData = posInv;
        sourceName = STORAGE_KEYS.INVENTORY_LEGACY;
      }
      
      // Only migrate if we have a valid source
      if (sourceData.length > 0) {
        localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(sourceData));
        
        // Dispatch storage event to notify all components
        window.dispatchEvent(new Event('storage'));
        
        console.log(`✅ Migrated ${sourceData.length} items from ${sourceName} to ${STORAGE_KEYS.INVENTORY}`);
        
        return {
          success: true,
          migrated: true,
          source: sourceName,
          count: sourceData.length,
          message: `Successfully migrated ${sourceData.length} items from ${sourceName}`
        };
      }
      
      // No data to migrate
      return {
        success: true,
        migrated: false,
        message: 'No inventory data to migrate. All sources are empty.'
      };
    }
    
    // No migration needed
    return {
      success: true,
      migrated: false,
      message: `Primary inventory already has ${items.length} items. No migration needed.`
    };
  } catch (error) {
    console.error('Failed to migrate inventory data:', error);
    return {
      success: false,
      migrated: false,
      message: `Error migrating inventory data: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Check if any inventory data exists in any of the storage keys
 */
export function checkInventoryDataExists(): boolean {
  try {
    const items = JSON.parse(localStorage.getItem(STORAGE_KEYS.INVENTORY) || '[]');
    const products = JSON.parse(localStorage.getItem(STORAGE_KEYS.INVENTORY_PRODUCTS) || '[]');
    const posInv = JSON.parse(localStorage.getItem(STORAGE_KEYS.INVENTORY_LEGACY) || '[]');
    
    return items.length > 0 || products.length > 0 || posInv.length > 0;
  } catch (error) {
    console.error('Error checking inventory data:', error);
    return false;
  }
}

/**
 * Standardize all inventory data to use the primary storage key
 */
export function standardizeInventoryStorage(): { success: boolean; message: string } {
  try {
    // First migrate any data to ensure primary storage has data
    const migrationResult = migrateInventoryData();
    
    // If migration failed, return early with error
    if (!migrationResult.success) {
      return {
        success: false,
        message: `Migration failed: ${migrationResult.message}`
      };
    }
    
    // Get the latest data from primary storage
    const items = JSON.parse(localStorage.getItem(STORAGE_KEYS.INVENTORY) || '[]');
    
    if (items.length === 0) {
      return {
        success: false,
        message: 'No inventory data available to standardize.'
      };
    }
    
    // Sync the data to all storage locations
    localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(items));
    localStorage.setItem(STORAGE_KEYS.INVENTORY_PRODUCTS, JSON.stringify(items));
    localStorage.setItem(STORAGE_KEYS.INVENTORY_LEGACY, JSON.stringify(items));
    
    console.log(`✅ Standardized inventory data (${items.length} items) across all storage keys`);
    
    return {
      success: true,
      message: `Successfully standardized ${items.length} inventory items across all storage keys.`
    };
  } catch (error) {
    console.error('Failed to standardize inventory storage:', error);
    return {
      success: false,
      message: `Error standardizing inventory storage: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}