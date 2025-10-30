import type { InventoryBatch, Product, ProductStockSummary, PurchaseReceiving } from '../models/BatchInventory';

class InventoryBatchService {
  private static instance: InventoryBatchService;

  static getInstance(): InventoryBatchService {
    if (!InventoryBatchService.instance) {
      InventoryBatchService.instance = new InventoryBatchService();
    }
    return InventoryBatchService.instance;
  }

  // Stub: process a receiving record into inventory batches
  receivePurchase(_receiving: PurchaseReceiving): boolean {
    // TODO: Integrate with real inventory logic or backend API
    return true;
  }

  // Stub: return list of products from local storage or empty
  getProducts(): Product[] {
    try {
      const raw = localStorage.getItem('products');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  // Stub: compute stock summary for a product
  getProductStockSummary(_productId: string | number): ProductStockSummary {
    return {
      productId: _productId,
      productName: 'Unknown',
      totalQuantity: 0,
      totalValue: 0,
      batches: [],
      needsReorder: false,
      availableQuantity: 0,
      expiredQuantity: 0,
      batchCount: 0,
      isLowStock: false,
      hasExpiredStock: false,
      hasExpiringSoonStock: false,
      averageCost: 0
    };
  }

  // Stub: list batches for a product
  getProductBatches(_productId: string | number, _includeExpired = false): InventoryBatch[] {
    return [];
  }
}

export default InventoryBatchService;
