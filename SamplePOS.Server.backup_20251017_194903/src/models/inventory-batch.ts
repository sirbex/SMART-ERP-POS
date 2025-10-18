/**
 * Type definitions for the Inventory Batch model
 */

export interface InventoryBatch {
  id: number;
  inventoryItemId: number;
  batchNumber: string;
  quantity: number;
  remainingQuantity: number;
  unitCost: number;
  expiryDate?: string;
  receivedDate: string;
  supplier?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  // Optional joined fields
  itemName?: string;
}