/**
 * Enhanced inventory service with batch management and FIFO system
 */

import type { 
  InventoryBatch, 
  Product, 
  InventoryMovement, 
  PurchaseReceiving,
  FIFOReleaseResult,
  ProductStockSummary 
} from '../models/BatchInventory';

class InventoryBatchService {
  private static instance: InventoryBatchService;
  
  static getInstance(): InventoryBatchService {
    if (!InventoryBatchService.instance) {
      InventoryBatchService.instance = new InventoryBatchService();
    }
    return InventoryBatchService.instance;
  }

  // LocalStorage keys
  private readonly PRODUCTS_KEY = 'inventory_products';
  private readonly BATCHES_KEY = 'inventory_batches';
  private readonly MOVEMENTS_KEY = 'inventory_movements';
  private readonly PURCHASES_KEY = 'inventory_purchases';

  // Get all products
  getProducts(): Product[] {
    try {
      const stored = localStorage.getItem(this.PRODUCTS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  // Get all batches
  getBatches(): InventoryBatch[] {
    try {
      const stored = localStorage.getItem(this.BATCHES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  // Get all movements
  getMovements(): InventoryMovement[] {
    try {
      const stored = localStorage.getItem(this.MOVEMENTS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  // Get batches for a specific product, sorted by expiry date (FIFO)
  getProductBatches(productId: string, includeExpired: boolean = false): InventoryBatch[] {
    const batches = this.getBatches()
      .filter(batch => 
        batch.productId === productId && 
        batch.quantity > 0 &&
        batch.status === 'active' &&
        (includeExpired || !this.isBatchExpired(batch))
      );

    // Sort by expiry date (FIFO) - items without expiry date go last
    return batches.sort((a, b) => {
      if (!a.expiryDate && !b.expiryDate) return 0;
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
    });
  }

  // Check if a batch is expired
  isBatchExpired(batch: InventoryBatch): boolean {
    if (!batch.expiryDate) return false;
    return new Date(batch.expiryDate) < new Date();
  }

  // Check if a batch is expiring soon
  isBatchExpiringSoon(batch: InventoryBatch, alertDays: number = 30): boolean {
    if (!batch.expiryDate) return false;
    const expiryDate = new Date(batch.expiryDate);
    const alertDate = new Date();
    alertDate.setDate(alertDate.getDate() + alertDays);
    return expiryDate <= alertDate && expiryDate >= new Date();
  }

  // Get stock summary for a product
  getProductStockSummary(productId: string): ProductStockSummary | null {
    const products = this.getProducts();
    const product = products.find(p => p.id === productId);
    if (!product) return null;

    const batches = this.getBatches().filter(b => b.productId === productId && b.status === 'active');
    
    const totalQuantity = batches.reduce((sum, b) => sum + b.quantity, 0);
    const expiredBatches = batches.filter(b => this.isBatchExpired(b));
    const expiringSoonBatches = batches.filter(b => this.isBatchExpiringSoon(b, product.expiryAlertDays));
    
    const expiredQuantity = expiredBatches.reduce((sum, b) => sum + b.quantity, 0);
    const expiringSoonQuantity = expiringSoonBatches.reduce((sum, b) => sum + b.quantity, 0);
    const availableQuantity = totalQuantity - expiredQuantity;

    const totalValue = batches.reduce((sum, b) => sum + (b.quantity * b.costPrice), 0);
    const averageCost = totalQuantity > 0 ? totalValue / totalQuantity : 0;

    const expiryDates = batches
      .filter(b => b.expiryDate)
      .map(b => new Date(b.expiryDate!))
      .sort((a, b) => a.getTime() - b.getTime());

    return {
      productId,
      productName: product.name,
      totalQuantity,
      availableQuantity,
      expiredQuantity,
      expiringSoonQuantity,
      batchCount: batches.length,
      earliestExpiry: expiryDates.length > 0 ? expiryDates[0].toISOString().split('T')[0] : undefined,
      latestExpiry: expiryDates.length > 0 ? expiryDates[expiryDates.length - 1].toISOString().split('T')[0] : undefined,
      averageCost,
      totalValue,
      reorderLevel: product.reorderLevel,
      isLowStock: availableQuantity <= product.reorderLevel,
      hasExpiredStock: expiredQuantity > 0,
      hasExpiringSoonStock: expiringSoonQuantity > 0
    };
  }

  // FIFO release system - release inventory based on expiry dates
  releaseFIFO(productId: string, requestedQuantity: number): FIFOReleaseResult {
    const batches = this.getProductBatches(productId, false); // Don't include expired
    let remainingRequested = requestedQuantity;
    const releasedBatches: FIFOReleaseResult['releasedBatches'] = [];
    
    if (batches.length === 0) {
      return {
        success: false,
        message: 'No available batches for this product',
        releasedBatches: [],
        totalReleased: 0,
        remainingRequested: requestedQuantity
      };
    }

    // Check if we have enough total quantity
    const totalAvailable = batches.reduce((sum, batch) => sum + batch.quantity, 0);
    if (totalAvailable < requestedQuantity) {
      return {
        success: false,
        message: `Insufficient stock. Available: ${totalAvailable}, Requested: ${requestedQuantity}`,
        releasedBatches: [],
        totalReleased: 0,
        remainingRequested: requestedQuantity
      };
    }

    // Process FIFO release
    for (const batch of batches) {
      if (remainingRequested <= 0) break;
      
      const releaseFromThisBatch = Math.min(batch.quantity, remainingRequested);
      
      releasedBatches.push({
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        quantityReleased: releaseFromThisBatch,
        remainingQuantity: batch.quantity - releaseFromThisBatch,
        expiryDate: batch.expiryDate
      });
      
      remainingRequested -= releaseFromThisBatch;
    }

    const totalReleased = requestedQuantity - remainingRequested;

    return {
      success: remainingRequested === 0,
      message: remainingRequested === 0 
        ? 'Successfully released inventory using FIFO' 
        : `Partially released. Still need ${remainingRequested} units`,
      releasedBatches,
      totalReleased,
      remainingRequested
    };
  }

  // Apply FIFO release to actual inventory
  applyFIFORelease(productId: string, requestedQuantity: number, movementType: InventoryMovement['movementType'], userId: string, userName: string, referenceNumber?: string): boolean {
    const releaseResult = this.releaseFIFO(productId, requestedQuantity);
    
    if (!releaseResult.success) {
      console.error('Cannot apply FIFO release:', releaseResult.message);
      return false;
    }

    // Update batch quantities
    const batches = this.getBatches();
    const updatedBatches = batches.map(batch => {
      const releasedBatch = releaseResult.releasedBatches.find(rb => rb.batchId === batch.id);
      if (releasedBatch) {
        const updatedBatch = {
          ...batch,
          quantity: releasedBatch.remainingQuantity,
          updatedAt: new Date().toISOString()
        };
        
        // Mark batch as depleted if quantity reaches 0
        if (updatedBatch.quantity === 0) {
          updatedBatch.status = 'depleted' as const;
        }
        
        return updatedBatch;
      }
      return batch;
    });

    // Create movement records
    const movements = this.getMovements();
    const newMovements: InventoryMovement[] = releaseResult.releasedBatches.map(releasedBatch => ({
      id: `movement-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      productId,
      productName: batches.find(b => b.id === releasedBatch.batchId)?.productName || 'Unknown',
      batchId: releasedBatch.batchId,
      batchNumber: releasedBatch.batchNumber,
      movementType,
      quantity: -releasedBatch.quantityReleased, // Negative for outgoing
      referenceNumber,
      userId,
      userName,
      timestamp: new Date().toISOString(),
      notes: `FIFO release - ${releasedBatch.quantityReleased} units from batch ${releasedBatch.batchNumber}`
    }));

    // Save updated data
    try {
      localStorage.setItem(this.BATCHES_KEY, JSON.stringify(updatedBatches));
      localStorage.setItem(this.MOVEMENTS_KEY, JSON.stringify([...movements, ...newMovements]));
      return true;
    } catch (error) {
      console.error('Error saving FIFO release:', error);
      return false;
    }
  }

  // Receive new inventory (Purchase)
  receivePurchase(purchase: PurchaseReceiving): boolean {
    try {
      const batches = this.getBatches();
      const movements = this.getMovements();
      const purchases = this.getPurchases();

      // Create new batches for each received item
      const newBatches: InventoryBatch[] = purchase.items.map(item => ({
        id: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        batchNumber: item.batchNumber,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantityReceived,
        originalQuantity: item.quantityReceived,
        costPrice: item.unitCost,
        sellingPrice: item.unitCost * 1.2, // Default markup
        expiryDate: item.expiryDate,
        manufacturingDate: item.manufacturingDate,
        supplierBatchRef: item.supplierBatchRef,
        receivedDate: purchase.receivedDate,
        receivedBy: purchase.receivedBy,
        supplier: purchase.supplier,
        location: item.location,
        status: 'active',
        notes: item.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));

      // Create movement records for receiving
      const newMovements: InventoryMovement[] = purchase.items.map(item => ({
        id: `movement-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        productId: item.productId,
        productName: item.productName,
        batchId: newBatches.find(b => b.productId === item.productId && b.batchNumber === item.batchNumber)?.id,
        batchNumber: item.batchNumber,
        movementType: 'purchase',
        quantity: item.quantityReceived,
        unitCost: item.unitCost,
        totalValue: item.totalCost,
        referenceNumber: purchase.purchaseOrderNumber,
        userId: 'system',
        userName: purchase.receivedBy,
        timestamp: new Date().toISOString(),
        notes: `Purchase received - PO: ${purchase.purchaseOrderNumber || 'N/A'}`
      }));

      // Save all data
      localStorage.setItem(this.BATCHES_KEY, JSON.stringify([...batches, ...newBatches]));
      localStorage.setItem(this.MOVEMENTS_KEY, JSON.stringify([...movements, ...newMovements]));
      localStorage.setItem(this.PURCHASES_KEY, JSON.stringify([...purchases, purchase]));

      return true;
    } catch (error) {
      console.error('Error receiving purchase:', error);
      return false;
    }
  }

  // Get purchase history
  getPurchases(): PurchaseReceiving[] {
    try {
      const stored = localStorage.getItem(this.PURCHASES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  // Save products
  saveProducts(products: Product[]): boolean {
    try {
      localStorage.setItem(this.PRODUCTS_KEY, JSON.stringify(products));
      return true;
    } catch {
      return false;
    }
  }

  // Add or update product
  saveProduct(product: Product): boolean {
    try {
      const products = this.getProducts();
      const existingIndex = products.findIndex(p => p.id === product.id);
      
      if (existingIndex >= 0) {
        products[existingIndex] = { ...product, updatedAt: new Date().toISOString() };
      } else {
        products.push({ ...product, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      }
      
      return this.saveProducts(products);
    } catch {
      return false;
    }
  }

  // Get low stock products
  getLowStockProducts(): ProductStockSummary[] {
    const products = this.getProducts();
    return products
      .map(p => this.getProductStockSummary(p.id))
      .filter((summary): summary is ProductStockSummary => summary !== null && summary.isLowStock);
  }

  // Get products with expired stock
  getProductsWithExpiredStock(): ProductStockSummary[] {
    const products = this.getProducts();
    return products
      .map(p => this.getProductStockSummary(p.id))
      .filter((summary): summary is ProductStockSummary => summary !== null && summary.hasExpiredStock);
  }

  // Get products with expiring soon stock
  getProductsWithExpiringSoonStock(): ProductStockSummary[] {
    const products = this.getProducts();
    return products
      .map(p => this.getProductStockSummary(p.id))
      .filter((summary): summary is ProductStockSummary => summary !== null && summary.hasExpiringSoonStock);
  }
}

export default InventoryBatchService;