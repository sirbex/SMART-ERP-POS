// Legacy re-exports for batch inventory and purchasing types
export type {
  InventoryBatch,
  Product,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseReceiving,
  PurchaseReceivingItem,
  ProductStockSummary,
  Supplier
} from '../types';

// Provide a placeholder type for FIFO release operation results expected by services
export interface FIFOReleaseResult {
  success: boolean;
  releasedQuantity: number;
  batchesUsed: Array<{ batchId: string | number; quantity: number }>;
  message?: string;
}
