/**
 * Inventory Controller Interface
 * 
 * This file defines the interface for the inventory controller
 * which handles inventory item CRUD operations.
 */

export interface InventoryController {
  /**
   * Get all inventory items, with optional pagination
   */
  getAllItems: (req: any, res: any) => Promise<any>;
  
  /**
   * Get a specific inventory item by ID
   */
  getItemById: (req: any, res: any) => Promise<any>;
  
  /**
   * Create a new inventory item
   */
  createItem: (req: any, res: any) => Promise<any>;
  
  /**
   * Update an existing inventory item
   */
  updateItem: (req: any, res: any) => Promise<any>;
  
  /**
   * Delete an inventory item
   */
  deleteItem: (req: any, res: any) => Promise<any>;
  
  /**
   * Search for inventory items by various criteria
   */
  searchItems: (req: any, res: any) => Promise<any>;
  
  /**
   * Get inventory items that are below their reorder level
   */
  getLowStockItems: (req: any, res: any) => Promise<any>;
}

/**
 * Inventory item data
 */
export interface InventoryItemData {
  id?: string;
  sku: string;
  name: string;
  description?: string;
  category?: string;
  basePrice: number;
  taxRate?: number;
  reorderLevel?: number;
  isActive?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Inventory item search parameters
 */
export interface InventorySearchParams {
  search?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}