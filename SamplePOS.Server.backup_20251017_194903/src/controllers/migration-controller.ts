import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types/api';
import { InventoryItemRepository } from '../repositories/inventory-item-repository';
import { InventoryBatchRepository } from '../repositories/inventory-batch-repository';
import { InventoryItem } from '../models/inventory-item';
import { InventoryBatch } from '../models/inventory-batch';

const inventoryRepo = new InventoryItemRepository();
const batchRepo = new InventoryBatchRepository();

/**
 * Migrate data from client localStorage to the PostgreSQL database
 */
export const migrateFromLocalStorage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { items, batches } = req.body;
    
    if (!items || !Array.isArray(items)) {
      const response: ApiResponse = {
        success: false,
        message: 'Invalid items data',
        errors: ['Items data is required and must be an array']
      };
      res.status(400).json(response);
      return;
    }
    
    // Begin migration
    logger.info(`Starting migration of ${items.length} items and ${batches?.length || 0} batches`);
    
    // Keep track of results
    const results = {
      success: true,
      itemsProcessed: 0,
      itemsSucceeded: 0,
      itemsFailed: 0,
      batchesProcessed: 0,
      batchesSucceeded: 0,
      batchesFailed: 0,
      errors: [] as string[]
    };
    
    // Map of old item IDs to new item IDs for reference in batches
    const idMapping = new Map<string, number>();
    
    // Process items
    for (const item of items) {
      try {
        results.itemsProcessed++;
        
        // Check if item with the same SKU already exists
        const existingItem = await inventoryRepo.findBySku(item.sku);
        
        if (existingItem.success && existingItem.data) {
          // Item with SKU already exists, update the mapping and skip creation
          idMapping.set(item.id.toString(), existingItem.data.id!);
          logger.info(`Item with SKU ${item.sku} already exists, mapped old ID ${item.id} to existing ID ${existingItem.data.id}`);
          results.itemsSucceeded++;
          continue;
        }
        
        // Prepare item data for PostgreSQL
        const itemData: Partial<InventoryItem> = {
          sku: item.sku,
          name: item.name,
          description: item.description || '',
          category: item.category || '',
          basePrice: parseFloat(item.basePrice) || 0,
          taxRate: parseFloat(item.taxRate) || 0,
          reorderLevel: parseInt(item.reorderLevel) || 0,
          isActive: item.isActive === undefined ? true : Boolean(item.isActive),
          metadata: item.metadata || {}
        };
        
        // Create item in PostgreSQL
        const createdItem = await inventoryRepo.create(itemData);
        
        if (createdItem.success && createdItem.data) {
          // Store mapping of old ID to new ID
          idMapping.set(item.id.toString(), createdItem.data.id!);
          logger.info(`Migrated item ${item.name} (${item.id}) to new ID ${createdItem.data.id}`);
          results.itemsSucceeded++;
        } else {
          throw new Error(`Failed to create item ${item.name}: ${createdItem.error}`);
        }
      } catch (error) {
        results.itemsFailed++;
        const errorMessage = `Error migrating item ${item.name || item.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        logger.error(errorMessage);
        results.errors.push(errorMessage);
      }
    }
    
    // Process batches if provided
    if (batches && Array.isArray(batches)) {
      for (const batch of batches) {
        try {
          results.batchesProcessed++;
          
          // Get the new item ID from our mapping
          const newItemId = idMapping.get(batch.inventoryItemId.toString());
          
          if (!newItemId) {
            throw new Error(`No mapping found for original item ID ${batch.inventoryItemId}`);
          }
          
          // Prepare batch data for PostgreSQL
          const batchData: Partial<InventoryBatch> = {
            inventoryItemId: newItemId,
            quantity: parseInt(batch.quantity) || 0,
            remainingQuantity: parseInt(batch.remainingQuantity) || 0,
            unitCost: parseFloat(batch.unitCost) || 0,
            lotNumber: batch.lotNumber || '',
            locationCode: batch.locationCode || '',
            notes: batch.notes || ''
          };
          
          // Add dates if they exist
          if (batch.expirationDate) {
            batchData.expirationDate = new Date(batch.expirationDate);
          }
          
          if (batch.receivedDate) {
            batchData.receivedDate = new Date(batch.receivedDate);
          } else {
            batchData.receivedDate = new Date();
          }
          
          // Add optional fields if they exist
          if (batch.supplierId) {
            batchData.supplierId = batch.supplierId;
          }
          
          if (batch.purchaseOrderId) {
            batchData.purchaseOrderId = batch.purchaseOrderId;
          }
          
          // Create batch in PostgreSQL
          const createdBatch = await batchRepo.create(batchData);
          
          if (createdBatch.success) {
            logger.info(`Migrated batch ID ${batch.id} for item ${newItemId}`);
            results.batchesSucceeded++;
          } else {
            throw new Error(`Failed to create batch: ${createdBatch.error}`);
          }
        } catch (error) {
          results.batchesFailed++;
          const errorMessage = `Error migrating batch ${batch.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          logger.error(errorMessage);
          results.errors.push(errorMessage);
        }
      }
    }
    
    // Set overall success based on failures
    if (results.itemsFailed > 0 || results.batchesFailed > 0) {
      results.success = false;
    }
    
    // Return response with migration results
    const response: ApiResponse<typeof results> = {
      success: results.success,
      message: results.success 
        ? `Successfully migrated ${results.itemsSucceeded} items and ${results.batchesSucceeded} batches` 
        : `Migration completed with some errors: ${results.itemsFailed} items and ${results.batchesFailed} batches failed`,
      data: results,
      errors: results.errors.length > 0 ? results.errors : undefined
    };
    
    res.status(results.success ? 200 : 207).json(response);
    
  } catch (error) {
    logger.error('Error in migrateFromLocalStorage controller:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'An unexpected error occurred during migration',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
    
    res.status(500).json(response);
  }
};

/**
 * Check migration status
 */
export const getMigrationStatus = async (_req: Request, res: Response): Promise<void> => {
  try {
    // Count items and batches in the database
    const itemsResult = await inventoryRepo.findAll();
    const batchesCount = await batchRepo.getTotalCount();
    
    const status = {
      itemsCount: itemsResult.success ? itemsResult.data?.length || 0 : 0,
      batchesCount: batchesCount.success ? batchesCount.data || 0 : 0,
      lastMigrationDate: null, // Would need to store this information somewhere
      databaseStatus: 'connected'
    };
    
    const response: ApiResponse<typeof status> = {
      success: true,
      data: status
    };
    
    res.json(response);
    
  } catch (error) {
    logger.error('Error in getMigrationStatus controller:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'An unexpected error occurred',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
    
    res.status(500).json(response);
  }
};

/**
 * Clear all data (for testing/development purposes only)
 * This should be disabled in production
 */
export const clearAllData = async (_req: Request, res: Response): Promise<void> => {
  try {
    // Check if we're in development mode
    if (process.env.NODE_ENV !== 'development') {
      const response: ApiResponse = {
        success: false,
        message: 'This operation is only allowed in development mode',
        errors: ['Operation not permitted in current environment']
      };
      
      res.status(403).json(response);
      return;
    }
    
    // Clear batches first due to foreign key constraints
    const batchesResult = await batchRepo.deleteAll();
    
    if (!batchesResult.success) {
      throw new Error(`Failed to clear batches: ${batchesResult.error}`);
    }
    
    // Then clear items
    const itemsResult = await inventoryRepo.deleteAll();
    
    if (!itemsResult.success) {
      throw new Error(`Failed to clear items: ${itemsResult.error}`);
    }
    
    const response: ApiResponse = {
      success: true,
      message: 'All data has been cleared successfully'
    };
    
    res.json(response);
    
  } catch (error) {
    logger.error('Error in clearAllData controller:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'An unexpected error occurred',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
    
    res.status(500).json(response);
  }
};