/**
 * Database Management Controller Interface
 * 
 * This file defines the interface for the database management controller
 * which handles operations on the PostgreSQL database.
 */

export interface MigrationController {
  /**
   * Get the current status of the database
   */
  getMigrationStatus: (req: any, res: any) => Promise<any>;
  
  /**
   * Migrate data from localStorage to the database
   */
  migrateFromLocalStorage: (req: any, res: any) => Promise<any>;
  
  /**
   * Clear all data from the database (for testing/reset purposes)
   */
  clearAllData: (req: any, res: any) => Promise<any>;
}

/**
 * Batch data from localStorage for migration
 */
export interface BatchMigrationData {
  id?: string;
  inventoryItemId: string;
  quantity: number;
  unitCost?: number;
  expiryDate?: string; 
  lotNumber?: string;
  receivedDate?: string;
  supplier?: string; 
  purchaseOrder?: string;
  locationCode?: string;
  notes?: string;
}

/**
 * Inventory Item data from localStorage for migration
 */
export interface ItemMigrationData {
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
 * Migration status response
 */
export interface MigrationStatusResponse {
  inProgress: boolean;
  completed: boolean;
  itemsProcessed: number;
  totalItems: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

/**
 * Migration request body
 */
export interface MigrationRequestBody {
  items: ItemMigrationData[];
  batches?: BatchMigrationData[];
}