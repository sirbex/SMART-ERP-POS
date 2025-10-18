/**
 * Batch Controller Interface
 * 
 * This file defines the interface for the batch controller
 * which handles inventory batch operations.
 */

export interface BatchController {
  /**
   * Get all batches for a specific inventory item
   */
  getBatchesByItemId: (req: any, res: any) => Promise<any>;
  
  /**
   * Adjust the quantity of a specific batch
   */
  adjustBatchQuantity: (req: any, res: any) => Promise<any>;
  
  /**
   * Get the history of quantity adjustments for a batch
   */
  getBatchHistory: (req: any, res: any) => Promise<any>;
  
  /**
   * Get batches that are expiring soon
   */
  getExpiringBatches: (req: any, res: any) => Promise<any>;
}

/**
 * Batch quantity adjustment data
 */
export interface BatchAdjustmentData {
  quantity: number;
  reason: string;
  reference?: string;
  notes?: string;
}

/**
 * Batch movement history item
 */
export interface BatchMovementHistoryItem {
  id: string;
  batchId: string;
  quantity: number;
  movementType: string;
  reason: string;
  reference?: string;
  timestamp: string;
  user?: string;
}

/**
 * Inventory batch response
 */
export interface InventoryBatchResponse {
  id: string;
  inventoryItemId: string;
  quantity: number;
  unitCost: number;
  expiryDate?: string;
  lotNumber?: string;
  receivedDate: string;
  supplier?: string;
  purchaseOrder?: string;
  locationCode?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}