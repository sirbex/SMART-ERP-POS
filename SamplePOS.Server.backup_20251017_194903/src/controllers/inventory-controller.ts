import { Request, Response } from 'express';
import { InventoryItemRepository } from '../repositories/inventory-item-repository';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types/api';
import { InventoryItem } from '../models/inventory-item';

const inventoryRepo = new InventoryItemRepository();

/**
 * Get all inventory items
 */
export const getAllItems = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const sortBy = req.query.sortBy as string || 'name';
    const sortDirection = req.query.sortDirection as 'asc' | 'desc' || 'asc';
    const category = req.query.category as string;
    
    // Build options for repository
    const options = {
      page,
      limit,
      sort: [{ field: sortBy, direction: sortDirection }],
      filters: []
    };
    
    // Add category filter if provided
    if (category) {
      options.filters.push({
        field: 'category',
        operator: 'eq',
        value: category
      });
    }
    
    const result = await inventoryRepo.findAll(options);
    
    if (result.success) {
      // Calculate total items and pages for pagination
      const countResult = await inventoryRepo.findAll();
      const totalItems = countResult.success ? countResult.data?.length || 0 : 0;
      const totalPages = Math.ceil(totalItems / limit);
      
      const response: ApiResponse<InventoryItem[]> = {
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
        message: 'Failed to retrieve inventory items',
        errors: [result.error || 'Unknown error']
      };
      
      res.status(500).json(response);
    }
  } catch (error) {
    logger.error('Error in getAllItems controller:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'An unexpected error occurred',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
    
    res.status(500).json(response);
  }
};

/**
 * Get inventory item by ID
 */
export const getItemById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      const response: ApiResponse = {
        success: false,
        message: 'Invalid ID format',
        errors: ['ID must be a number']
      };
      
      res.status(400).json(response);
      return;
    }
    
    const result = await inventoryRepo.findById(id);
    
    if (result.success && result.data) {
      const response: ApiResponse<InventoryItem> = {
        success: true,
        data: result.data
      };
      
      res.json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        message: result.error || 'Item not found',
        errors: [result.error || 'Not found']
      };
      
      res.status(result.error?.includes('not found') ? 404 : 500).json(response);
    }
  } catch (error) {
    logger.error('Error in getItemById controller:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'An unexpected error occurred',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
    
    res.status(500).json(response);
  }
};

/**
 * Create a new inventory item
 */
export const createItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const itemData: Partial<InventoryItem> = {
      sku: req.body.sku,
      name: req.body.name,
      description: req.body.description,
      category: req.body.category,
      basePrice: req.body.basePrice,
      taxRate: req.body.taxRate,
      reorderLevel: req.body.reorderLevel,
      isActive: req.body.isActive !== undefined ? req.body.isActive : true,
      metadata: req.body.metadata
    };
    
    const result = await inventoryRepo.create(itemData);
    
    if (result.success && result.data) {
      const response: ApiResponse<InventoryItem> = {
        success: true,
        message: 'Inventory item created successfully',
        data: result.data
      };
      
      res.status(201).json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        message: 'Failed to create inventory item',
        errors: [result.error || 'Unknown error']
      };
      
      res.status(500).json(response);
    }
  } catch (error) {
    logger.error('Error in createItem controller:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'An unexpected error occurred',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
    
    res.status(500).json(response);
  }
};

/**
 * Update an inventory item
 */
export const updateItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      const response: ApiResponse = {
        success: false,
        message: 'Invalid ID format',
        errors: ['ID must be a number']
      };
      
      res.status(400).json(response);
      return;
    }
    
    const itemData: Partial<InventoryItem> = {
      name: req.body.name,
      description: req.body.description,
      category: req.body.category,
      basePrice: req.body.basePrice,
      taxRate: req.body.taxRate,
      reorderLevel: req.body.reorderLevel,
      isActive: req.body.isActive,
      metadata: req.body.metadata
    };
    
    const result = await inventoryRepo.update(id, itemData);
    
    if (result.success && result.data) {
      const response: ApiResponse<InventoryItem> = {
        success: true,
        message: 'Inventory item updated successfully',
        data: result.data
      };
      
      res.json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        message: result.error || 'Failed to update inventory item',
        errors: [result.error || 'Unknown error']
      };
      
      res.status(result.error?.includes('not found') ? 404 : 500).json(response);
    }
  } catch (error) {
    logger.error('Error in updateItem controller:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'An unexpected error occurred',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
    
    res.status(500).json(response);
  }
};

/**
 * Delete an inventory item
 */
export const deleteItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      const response: ApiResponse = {
        success: false,
        message: 'Invalid ID format',
        errors: ['ID must be a number']
      };
      
      res.status(400).json(response);
      return;
    }
    
    const result = await inventoryRepo.delete(id);
    
    if (result.success) {
      const response: ApiResponse = {
        success: true,
        message: 'Inventory item deleted successfully'
      };
      
      res.json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        message: result.error || 'Failed to delete inventory item',
        errors: [result.error || 'Unknown error']
      };
      
      res.status(result.error?.includes('not found') ? 404 : 500).json(response);
    }
  } catch (error) {
    logger.error('Error in deleteItem controller:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'An unexpected error occurred',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
    
    res.status(500).json(response);
  }
};

/**
 * Search inventory items
 */
export const searchItems = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.q as string;
    
    if (!query || query.trim().length < 2) {
      const response: ApiResponse = {
        success: false,
        message: 'Invalid search query',
        errors: ['Search query must be at least 2 characters']
      };
      
      res.status(400).json(response);
      return;
    }
    
    const result = await inventoryRepo.search(query);
    
    if (result.success) {
      const response: ApiResponse<InventoryItem[]> = {
        success: true,
        data: result.data
      };
      
      res.json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        message: 'Failed to search inventory items',
        errors: [result.error || 'Unknown error']
      };
      
      res.status(500).json(response);
    }
  } catch (error) {
    logger.error('Error in searchItems controller:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'An unexpected error occurred',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
    
    res.status(500).json(response);
  }
};

/**
 * Get low stock items
 */
export const getLowStockItems = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await inventoryRepo.findLowStock();
    
    if (result.success) {
      const response: ApiResponse<InventoryItem[]> = {
        success: true,
        data: result.data
      };
      
      res.json(response);
    } else {
      const response: ApiResponse = {
        success: false,
        message: 'Failed to retrieve low stock items',
        errors: [result.error || 'Unknown error']
      };
      
      res.status(500).json(response);
    }
  } catch (error) {
    logger.error('Error in getLowStockItems controller:', error);
    
    const response: ApiResponse = {
      success: false,
      message: 'An unexpected error occurred',
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
    
    res.status(500).json(response);
  }
};