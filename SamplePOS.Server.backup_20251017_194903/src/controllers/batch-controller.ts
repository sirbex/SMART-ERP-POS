import { Request, Response } from 'express';
import { InventoryBatchRepository } from '../repositories/inventory-batch-repository';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types/api';
import { InventoryBatch } from '../models/inventory-batch';

const batchRepo = new InventoryBatchRepository();

/**
 * Get all batches for an inventory item
 */
export const getBatchesByItemId = async (req: Request, res: Response): Promise<void> => {
  try {
    const itemId = parseInt(req.params.itemId);
    
    if (isNaN(itemId)) {
      const response: ApiResponse = {
        success: false,
        message: 'Invalid item ID format',
        errors: ['Item ID must be a number']
      };
      
      res.status(400).json(response);
      return;
    }
    
    // Get options from query params
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const includeEmpty = req.query.includeEmpty === 'true';
    
    const options = {
      page,
      limit,
      filters: [
        {
          field: 'inventoryItemId',
          operator: 'eq' as const,
          value: itemId
        }
      ]
    };
    
    // Add non-empty filter if needed
    if (!includeEmpty) {
      options.filters.push({
        field: 'remainingQuantity',
        operator: 'gt' as const,
        value: 0
      });
    }
    
    const result = await batchRepo.findByItemId(itemId, options);
    
    if (result.success) {
      // Get total count for pagination
      const countResult = await batchRepo.findByItemId(itemId, { includeEmpty });
      const totalItems = countResult.success ? countResult.data?.length || 0 : 0;
      const totalPages = Math.ceil(totalItems / limit);
      
      const response: ApiResponse<InventoryBatch[]> = {
        success: true,
        data: result.data,
        meta: {
          pagination: {
            page,
            limit,
            total: totalItems,
            totalPages
          }
        }
      };
      
      res.json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        message: 'Failed to retrieve inventory batches',
        errors: [result.error || 'Unknown error']
      };
      
      res.status(500).json(response);
    }
  } catch (error) {
    logger.error('Error in getBatchesByItemId controller:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'An unexpected error occurred',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
    
    res.status(500).json(response);
  }
};

/**
 * Get batch by ID
 */
export const getBatchById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      const response: ApiResponse = {
        success: false,
        message: 'Invalid batch ID format',
        errors: ['Batch ID must be a number']
      };
      
      res.status(400).json(response);
      return;
    }
    
    const result = await batchRepo.findById(id);
    
    if (result.success && result.data) {
      const response: ApiResponse<InventoryBatch> = {
        success: true,
        data: result.data
      };
      
      res.json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        message: result.error || 'Batch not found',
        errors: [result.error || 'Not found']
      };
      
      res.status(result.error?.includes('not found') ? 404 : 500).json(response);
    }
  } catch (error) {
    logger.error('Error in getBatchById controller:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'An unexpected error occurred',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
    
    res.status(500).json(response);
  }
};

/**
 * Create a new batch
 */
export const createBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const batchData: Partial<InventoryBatch> = {
      inventoryItemId: req.body.inventoryItemId,
      quantity: req.body.quantity,
      remainingQuantity: req.body.quantity, // Initially, remaining = total
      unitCost: req.body.unitCost,
      expirationDate: req.body.expirationDate ? new Date(req.body.expirationDate) : undefined,
      lotNumber: req.body.lotNumber,
      receivedDate: req.body.receivedDate ? new Date(req.body.receivedDate) : new Date(),
      supplierId: req.body.supplierId,
      purchaseOrderId: req.body.purchaseOrderId,
      locationCode: req.body.locationCode,
      notes: req.body.notes
    };
    
    const result = await batchRepo.create(batchData);
    
    if (result.success && result.data) {
      const response: ApiResponse<InventoryBatch> = {
        success: true,
        message: 'Inventory batch created successfully',
        data: result.data
      };
      
      res.status(201).json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        message: 'Failed to create inventory batch',
        errors: [result.error || 'Unknown error']
      };
      
      res.status(500).json(response);
    }
  } catch (error) {
    logger.error('Error in createBatch controller:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'An unexpected error occurred',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
    
    res.status(500).json(response);
  }
};

/**
 * Update a batch
 */
export const updateBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      const response: ApiResponse = {
        success: false,
        message: 'Invalid batch ID format',
        errors: ['Batch ID must be a number']
      };
      
      res.status(400).json(response);
      return;
    }
    
    // First get the current batch
    const currentBatchResult = await batchRepo.findById(id);
    
    if (!currentBatchResult.success || !currentBatchResult.data) {
      const response: ApiResponse = {
        success: false,
        message: 'Batch not found',
        errors: ['The requested batch does not exist']
      };
      
      res.status(404).json(response);
      return;
    }
    
    // Calculate the new remaining quantity if the total quantity is being updated
    let newRemainingQuantity = currentBatchResult.data.remainingQuantity;
    if (req.body.quantity !== undefined) {
      // If the total quantity is being changed, adjust the remaining quantity proportionally
      const quantityDifference = req.body.quantity - currentBatchResult.data.quantity;
      newRemainingQuantity = Math.max(0, currentBatchResult.data.remainingQuantity + quantityDifference);
    }
    
    const batchData: Partial<InventoryBatch> = {
      quantity: req.body.quantity,
      remainingQuantity: req.body.remainingQuantity !== undefined ? req.body.remainingQuantity : newRemainingQuantity,
      unitCost: req.body.unitCost,
      expirationDate: req.body.expirationDate ? new Date(req.body.expirationDate) : currentBatchResult.data.expirationDate,
      lotNumber: req.body.lotNumber,
      receivedDate: req.body.receivedDate ? new Date(req.body.receivedDate) : currentBatchResult.data.receivedDate,
      supplierId: req.body.supplierId,
      purchaseOrderId: req.body.purchaseOrderId,
      locationCode: req.body.locationCode,
      notes: req.body.notes
    };
    
    const result = await batchRepo.update(id, batchData);
    
    if (result.success && result.data) {
      const response: ApiResponse<InventoryBatch> = {
        success: true,
        message: 'Inventory batch updated successfully',
        data: result.data
      };
      
      res.json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        message: result.error || 'Failed to update inventory batch',
        errors: [result.error || 'Unknown error']
      };
      
      res.status(result.error?.includes('not found') ? 404 : 500).json(response);
    }
  } catch (error) {
    logger.error('Error in updateBatch controller:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'An unexpected error occurred',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
    
    res.status(500).json(response);
  }
};

/**
 * Delete a batch
 */
export const deleteBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      const response: ApiResponse = {
        success: false,
        message: 'Invalid batch ID format',
        errors: ['Batch ID must be a number']
      };
      
      res.status(400).json(response);
      return;
    }
    
    const result = await batchRepo.delete(id);
    
    if (result.success) {
      const response: ApiResponse = {
        success: true,
        message: 'Inventory batch deleted successfully'
      };
      
      res.json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        message: result.error || 'Failed to delete inventory batch',
        errors: [result.error || 'Unknown error']
      };
      
      res.status(result.error?.includes('not found') ? 404 : 500).json(response);
    }
  } catch (error) {
    logger.error('Error in deleteBatch controller:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'An unexpected error occurred',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
    
    res.status(500).json(response);
  }
};

/**
 * Adjust batch quantity
 */
export const adjustBatchQuantity = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      const response: ApiResponse = {
        success: false,
        message: 'Invalid batch ID format',
        errors: ['Batch ID must be a number']
      };
      
      res.status(400).json(response);
      return;
    }
    
    const { quantity, reason, reference } = req.body;
    
    if (typeof quantity !== 'number') {
      const response: ApiResponse = {
        success: false,
        message: 'Invalid quantity',
        errors: ['Quantity must be a number']
      };
      
      res.status(400).json(response);
      return;
    }
    
    const result = await batchRepo.adjustQuantity(id, quantity, reason, reference);
    
    if (result.success && result.data) {
      const response: ApiResponse<InventoryBatch> = {
        success: true,
        message: 'Batch quantity adjusted successfully',
        data: result.data
      };
      
      res.json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        message: result.error || 'Failed to adjust batch quantity',
        errors: [result.error || 'Unknown error']
      };
      
      res.status(result.error?.includes('not found') ? 404 : 
                result.error?.includes('insufficient') ? 422 : 500).json(response);
    }
  } catch (error) {
    logger.error('Error in adjustBatchQuantity controller:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'An unexpected error occurred',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
    
    res.status(500).json(response);
  }
};

/**
 * Get batch transaction history
 */
export const getBatchHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const batchId = parseInt(req.params.id);
    
    if (isNaN(batchId)) {
      const response: ApiResponse = {
        success: false,
        message: 'Invalid batch ID format',
        errors: ['Batch ID must be a number']
      };
      
      res.status(400).json(response);
      return;
    }
    
    const result = await batchRepo.getTransactionHistory(batchId);
    
    if (result.success) {
      const response: ApiResponse<any[]> = { // Using any[] for transaction history type
        success: true,
        data: result.data
      };
      
      res.json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        message: 'Failed to retrieve batch history',
        errors: [result.error || 'Unknown error']
      };
      
      res.status(result.error?.includes('not found') ? 404 : 500).json(response);
    }
  } catch (error) {
    logger.error('Error in getBatchHistory controller:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'An unexpected error occurred',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
    
    res.status(500).json(response);
  }
};