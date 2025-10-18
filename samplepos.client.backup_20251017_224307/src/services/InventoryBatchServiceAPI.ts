/**
 * Inventory Batch Service API Client
 * 
 * This service interacts with the backend API for inventory batch management.
 */

import api from '../config/api.config';
import type { 
  Product, 
  InventoryBatch, 
  PurchaseReceiving,
  FIFOReleaseResult,
  ProductStockSummary
} from '../models/BatchInventory';

class InventoryBatchServiceAPI {
  /**
   * Load all products
   */
  async getProducts(): Promise<Product[]> {
    try {
      const response = await api.get('/inventory/products');
      return response.data;
    } catch (error) {
      console.error('Error loading products from API:', error);
      return [];
    }
  }

  /**
   * Get product by ID
   */
  async getProduct(id: string): Promise<Product | null> {
    try {
      const response = await api.get(`/inventory/products/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Error getting product ${id} from API:`, error);
      return null;
    }
  }

  /**
   * Save a new product
   */
  async saveProduct(product: Product): Promise<boolean> {
    try {
      const response = await api.post('/inventory/products', product);
      return response.status === 201;
    } catch (error) {
      console.error('Error saving product to API:', error);
      return false;
    }
  }

  /**
   * Update an existing product
   */
  async updateProduct(product: Product): Promise<boolean> {
    try {
      const response = await api.put(`/inventory/products/${product.id}`, product);
      return response.status === 200;
    } catch (error) {
      console.error(`Error updating product ${product.id} via API:`, error);
      return false;
    }
  }

  /**
   * Delete a product
   */
  async deleteProduct(id: string): Promise<boolean> {
    try {
      const response = await api.delete(`/inventory/products/${id}`);
      return response.status === 200;
    } catch (error) {
      console.error(`Error deleting product ${id} via API:`, error);
      return false;
    }
  }

  /**
   * Get all batches for a product
   */
  async getProductBatches(productId: string, includeExpired: boolean = false): Promise<InventoryBatch[]> {
    try {
      const response = await api.get(`/inventory/batches/product/${productId}`, {
        params: { includeExpired }
      });
      return response.data;
    } catch (error) {
      console.error(`Error getting batches for product ${productId} from API:`, error);
      return [];
    }
  }

  /**
   * Get a batch by ID
   */
  async getBatch(batchId: string): Promise<InventoryBatch | null> {
    try {
      const response = await api.get(`/inventory/batches/${batchId}`);
      return response.data;
    } catch (error) {
      console.error(`Error getting batch ${batchId} from API:`, error);
      return null;
    }
  }

  /**
   * Get all batches
   */
  async getBatches(includeExpired: boolean = false): Promise<InventoryBatch[]> {
    try {
      const response = await api.get('/inventory/batches', {
        params: { includeExpired }
      });
      return response.data;
    } catch (error) {
      console.error('Error getting all batches from API:', error);
      return [];
    }
  }

  /**
   * Receive a purchase with batch tracking
   */
  async receivePurchase(purchase: PurchaseReceiving): Promise<boolean> {
    try {
      // Transform PurchaseReceiving to the format the backend expects
      const batches = purchase.items.map(item => ({
        productId: item.productId,
        batchNumber: item.batchNumber,
        quantity: item.quantityReceived,
        costPrice: item.unitCost,
        expiryDate: item.expiryDate,
        receivedDate: purchase.receivedDate,
        supplier: purchase.supplier,
        sellingPrice: item.unitCost, // You might want to adjust this based on your business logic
        manufacturingDate: item.manufacturingDate,
        location: item.location,
        notes: item.supplierBatchRef || purchase.notes
      }));

      const response = await api.post('/inventory/batches/receive', { batches });
      return response.status === 201;
    } catch (error) {
      console.error('Error receiving purchase via API:', error);
      return false;
    }
  }

  /**
   * Release inventory using FIFO (First-In-First-Out)
   */
  async releaseFIFO(
    productId: string, 
    quantity: number, 
    reason: string, 
    reference: string, 
    performedBy: string
  ): Promise<FIFOReleaseResult> {
    const defaultResult: FIFOReleaseResult = {
      success: false,
      message: 'Failed to release inventory',
      releasedBatches: [],
      totalReleased: 0,
      remainingRequested: quantity
    };

    try {
      const response = await api.post('/inventory/batches/release', {
        productId,
        quantity,
        reason,
        reference,
        performedBy
      });
      
      return response.data;
    } catch (error) {
      console.error(`Error releasing inventory for product ${productId} via API:`, error);
      defaultResult.message = 'Error releasing inventory: ' + 
        (error instanceof Error ? error.message : String(error));
      return defaultResult;
    }
  }

  /**
   * Get stock summary for a specific product
   */
  async getProductStockSummary(productId: string): Promise<ProductStockSummary | null> {
    try {
      const response = await api.get(`/inventory/products/${productId}/stock`);
      return response.data;
    } catch (error) {
      console.error(`Error getting stock summary for product ${productId} via API:`, error);
      return null;
    }
  }

  /**
   * Check if a batch is expired
   */
  isBatchExpired(batch: InventoryBatch): boolean {
    if (!batch.expiryDate) return false;
    
    const now = new Date();
    const expiryDate = new Date(batch.expiryDate);
    return expiryDate < now;
  }

  /**
   * Check if a batch is expiring soon
   */
  isBatchExpiringSoon(batch: InventoryBatch, alertDays: number = 30): boolean {
    if (!batch.expiryDate) return false;
    
    const now = new Date();
    const expiryDate = new Date(batch.expiryDate);
    const diffTime = expiryDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays >= 0 && diffDays <= alertDays;
  }

  /**
   * Get the risk level based on how soon a batch will expire
   */
  getExpiryRiskLevel(batch: InventoryBatch): 'low' | 'medium' | 'high' | 'critical' {
    if (!batch.expiryDate) return 'low';
    
    const now = new Date();
    const expiryDate = new Date(batch.expiryDate);
    const diffTime = expiryDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'critical'; // Already expired
    if (diffDays <= 7) return 'critical';
    if (diffDays <= 14) return 'high';
    if (diffDays <= 30) return 'medium';
    return 'low';
  }
}

export default InventoryBatchServiceAPI;