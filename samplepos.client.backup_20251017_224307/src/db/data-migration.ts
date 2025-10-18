/**
 * Data Migration Tool - localStorage to PostgreSQL
 * 
 * This script migrates inventory data from localStorage to the PostgreSQL database
 */

import pool from '../db/pool';
import { InventoryItemRepository } from '../repositories/inventory-item-repository';
import { InventoryBatchRepository } from '../repositories/inventory-batch-repository';
import type { InventoryItem } from '../models/InventoryItem';

const STORAGE_KEYS = {
  INVENTORY_ITEMS: 'inventory_items',
  INVENTORY_PRODUCTS: 'inventory_products',
  POS_INVENTORY: 'pos_inventory_v3'
};

/**
 * Migrate all inventory data from localStorage to PostgreSQL
 */
export async function migrateInventoryData(): Promise<{
  success: boolean;
  migratedItems: number;
  errors: string[];
}> {
  const client = await pool.connect();
  let migratedItems = 0;
  const errors: string[] = [];

  try {
    await client.query('BEGIN');

    // Get inventory repositories
    const itemRepo = new InventoryItemRepository();
    const batchRepo = new InventoryBatchRepository();

    // 1. First try loading from pos_inventory_v3
    console.log('Migrating data from localStorage key:', STORAGE_KEYS.POS_INVENTORY);
    let inventoryData = loadFromLocalStorage(STORAGE_KEYS.POS_INVENTORY);

    // 2. If not available, try inventory_products
    if (!inventoryData || inventoryData.length === 0) {
      console.log('Migrating data from localStorage key:', STORAGE_KEYS.INVENTORY_PRODUCTS);
      inventoryData = loadFromLocalStorage(STORAGE_KEYS.INVENTORY_PRODUCTS);
    }

    // 3. If still not available, try inventory_items
    if (!inventoryData || inventoryData.length === 0) {
      console.log('Migrating data from localStorage key:', STORAGE_KEYS.INVENTORY_ITEMS);
      inventoryData = loadFromLocalStorage(STORAGE_KEYS.INVENTORY_ITEMS);
    }

    // If no data found in any storage key
    if (!inventoryData || inventoryData.length === 0) {
      console.log('No inventory data found in localStorage');
      return { success: false, migratedItems: 0, errors: ['No inventory data found in localStorage'] };
    }

    console.log(`Found ${inventoryData.length} inventory items to migrate`);

    // Process each inventory item
    for (const item of inventoryData) {
      try {
        // 1. Create the inventory item
        const newItem = await itemRepo.create({
          sku: item.sku || `SKU-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: item.name,
          description: item.notes || '',
          category: item.category || 'General',
          base_price: typeof item.price === 'number' ? item.price : parseFloat(String(item.price)) || 0,
          tax_rate: 0, // Default tax rate
          reorder_level: typeof item.reorderLevel === 'number' ? item.reorderLevel : parseFloat(String(item.reorderLevel)) || 10,
          is_active: true,
          metadata: {
            unit: item.unit || 'piece',
            hasExpiry: item.hasExpiry || false,
            expiryAlertDays: item.expiryAlertDays || 30,
            uomOptions: item.uomOptions || [],
            purchaseInfo: item.purchaseInfo || null,
            salesPricing: item.salesPricing || null,
            defaultUnit: item.defaultUnit || 'piece',
            conversions: item.conversions || {},
            location: item.location || '',
            barcode: item.barcode || '',
            additionalBarcodes: item.additionalBarcodes || [],
            supplier: item.supplier || '',
            minPrice: item.minPrice || 0,
            costPrice: item.costPrice || 0,
            lastCountDate: item.lastCountDate || null,
            physicalCount: item.physicalCount || 0
          }
        });

        if (!newItem) {
          throw new Error(`Failed to create inventory item: ${item.name}`);
        }

        // 2. Create a batch if the item has quantity
        if (typeof item.quantity === 'number' && item.quantity > 0) {
          const newBatch = await batchRepo.create({
            inventory_item_id: newItem.id,
            batch_number: item.batch || `BATCH-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            quantity: item.quantity,
            remaining_quantity: item.quantity,
            unit_cost: typeof item.costPrice === 'number' ? item.costPrice : parseFloat(String(item.costPrice)) || 0,
            expiry_date: item.expiry || undefined,
            received_date: new Date().toISOString(),
            supplier: item.supplier || '',
            metadata: {}
          });

          if (!newBatch) {
            throw new Error(`Failed to create batch for item: ${item.name}`);
          }
        }

        migratedItems++;
        console.log(`Migrated: ${item.name}`);
      } catch (error) {
        const errorMessage = `Error migrating item ${item.name}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMessage);
        console.error(errorMessage);
      }
    }

    // Commit transaction if we successfully migrated at least some items
    if (migratedItems > 0) {
      await client.query('COMMIT');
      console.log(`Migration complete. Successfully migrated ${migratedItems}/${inventoryData.length} items`);
      if (errors.length > 0) {
        console.warn(`${errors.length} errors occurred during migration`);
      }
      return { success: true, migratedItems, errors };
    } else {
      await client.query('ROLLBACK');
      console.error('Migration failed. No items were migrated successfully.');
      return { success: false, migratedItems: 0, errors };
    }
  } catch (error) {
    await client.query('ROLLBACK');
    const errorMessage = `Migration failed: ${error instanceof Error ? error.message : String(error)}`;
    errors.push(errorMessage);
    console.error(errorMessage);
    return { success: false, migratedItems: 0, errors };
  } finally {
    client.release();
  }
}

/**
 * Load data from localStorage
 * @param key The localStorage key to load from
 * @returns Array of inventory items or null if not found
 */
function loadFromLocalStorage(key: string): InventoryItem[] | null {
  try {
    if (typeof window === 'undefined') {
      return null;
    }
    
    const data = window.localStorage.getItem(key);
    
    if (!data) {
      return null;
    }
    
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error loading data from localStorage key ${key}:`, error);
    return null;
  }
}

/**
 * Clear localStorage after successful migration
 * @param confirm Confirmation to clear data (must be true)
 */
export function clearLocalStorageAfterMigration(confirm: boolean): boolean {
  if (!confirm) {
    console.warn('Confirmation required to clear localStorage');
    return false;
  }
  
  try {
    if (typeof window === 'undefined') {
      return false;
    }
    
    window.localStorage.removeItem(STORAGE_KEYS.POS_INVENTORY);
    window.localStorage.removeItem(STORAGE_KEYS.INVENTORY_PRODUCTS);
    window.localStorage.removeItem(STORAGE_KEYS.INVENTORY_ITEMS);
    
    console.log('Successfully cleared inventory data from localStorage');
    return true;
  } catch (error) {
    console.error('Error clearing localStorage:', error);
    return false;
  }
}