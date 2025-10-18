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

  // Get batches for a specific product, sorted by expiry date (FIFO) with ultra-precision
  getProductBatches(productId: string, includeExpired: boolean = false): InventoryBatch[] {
    const batches = this.getBatches()
      .filter(batch => 
        batch.productId === productId && 
        batch.quantity > 0 &&
        batch.status === 'active' &&
        (includeExpired || !this.isBatchExpired(batch))
      );

    // Ultra-precise FIFO sorting with multiple criteria
    return batches.sort((a, b) => {
      // Priority 1: Expiry date (earliest first)
      if (!a.expiryDate && !b.expiryDate) {
        // Priority 2: Received date (oldest first) for items without expiry
        const receivedComparison = new Date(a.receivedDate).getTime() - new Date(b.receivedDate).getTime();
        if (receivedComparison !== 0) return receivedComparison;
        
        // Priority 3: Manufacturing date (oldest first) if available
        if (a.manufacturingDate && b.manufacturingDate) {
          const mfgComparison = new Date(a.manufacturingDate).getTime() - new Date(b.manufacturingDate).getTime();
          if (mfgComparison !== 0) return mfgComparison;
        }
        
        // Priority 4: Batch number (alphanumeric sort for consistency)
        return a.batchNumber.localeCompare(b.batchNumber);
      }
      
      // Items without expiry go last
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      
      // Both have expiry - ultra-precise comparison
      const aExpiry = new Date(a.expiryDate).getTime();
      const bExpiry = new Date(b.expiryDate).getTime();
      const expiryDiff = aExpiry - bExpiry;
      
      // If expiry dates are different, prioritize earlier expiry
      if (expiryDiff !== 0) return expiryDiff;
      
      // Same expiry date - secondary sorting criteria
      // Priority 2: Received date (older inventory first)
      const aReceived = new Date(a.receivedDate).getTime();
      const bReceived = new Date(b.receivedDate).getTime();
      const receivedDiff = aReceived - bReceived;
      if (receivedDiff !== 0) return receivedDiff;
      
      // Priority 3: Manufacturing date (older manufacturing first)
      if (a.manufacturingDate && b.manufacturingDate) {
        const aMfg = new Date(a.manufacturingDate).getTime();
        const bMfg = new Date(b.manufacturingDate).getTime();
        const mfgDiff = aMfg - bMfg;
        if (mfgDiff !== 0) return mfgDiff;
      }
      
      // Priority 4: Quantity (smaller batches first to clear faster)
      const quantityDiff = a.quantity - b.quantity;
      if (quantityDiff !== 0) return quantityDiff;
      
      // Priority 5: Batch number (consistent alphanumeric sort)
      return a.batchNumber.localeCompare(b.batchNumber);
    });
  }

  // Get only the active (available for sale) batches with intelligent preemption logic
  getActiveBatches(productId: string): InventoryBatch[] {
    const allBatches = this.getProductBatches(productId, false);
    if (allBatches.length === 0) {
      return [];
    }
    
    if (allBatches.length === 1) {
      return allBatches;
    }

    // Ultra-precise batch activation logic
    const currentDate = new Date();
    const activeBatches: InventoryBatch[] = [];
    
    // Primary active batch (earliest expiry with quantity)
    const primaryBatch = allBatches.find(batch => batch.quantity > 0);
    if (primaryBatch) {
      activeBatches.push(primaryBatch);
      
      // Intelligent preemption: activate next batch if primary is critically low or expiring very soon
      const remainingBatches = allBatches.filter(b => b.id !== primaryBatch.id && b.quantity > 0);
      
      if (remainingBatches.length > 0) {
        const nextBatch = remainingBatches[0];
        
        // Preemption conditions
        const shouldPreempt = this.shouldPreemptBatch(primaryBatch, nextBatch, currentDate);
        
        if (shouldPreempt) {
          activeBatches.push(nextBatch);
        }
      }
    }

    return activeBatches;
  }

  // Intelligent batch preemption logic
  private shouldPreemptBatch(currentBatch: InventoryBatch, nextBatch: InventoryBatch, currentDate: Date): boolean {
    if (!currentBatch.expiryDate) return false;
    
    const currentExpiry = new Date(currentBatch.expiryDate);
    const daysToExpiry = Math.ceil((currentExpiry.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Preempt if current batch is expiring in 24 hours and has low quantity
    if (daysToExpiry <= 1 && currentBatch.quantity <= 3) {
      return true;
    }
    
    // Preempt if current batch is expiring in 48 hours and next batch has better shelf life
    if (daysToExpiry <= 2 && nextBatch.expiryDate) {
      const nextExpiry = new Date(nextBatch.expiryDate);
      const nextDaysToExpiry = Math.ceil((nextExpiry.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Only preempt if next batch has significantly more time (7+ days difference)
      return nextDaysToExpiry - daysToExpiry >= 7;
    }
    
    // Preempt if current batch quantity is critically low (≤1 unit) regardless of expiry
    if (currentBatch.quantity <= 1) {
      return true;
    }
    
    return false;
  }

  // Get batch status for display purposes
  getBatchStatus(batch: InventoryBatch, productId: string): {
    status: 'active' | 'reserved' | 'expired' | 'expiring-soon';
    daysToExpiry?: number;
    isNextActive: boolean;
    position: number;
  } {
    const allBatches = this.getProductBatches(productId, false);
    const position = allBatches.findIndex(b => b.id === batch.id) + 1;
    
    if (this.isBatchExpired(batch)) {
      return {
        status: 'expired',
        isNextActive: false,
        position
      };
    }

    const daysToExpiry = batch.expiryDate 
      ? Math.ceil((new Date(batch.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      : undefined;

    if (this.isBatchExpiringSoon(batch)) {
      if (position === 1) {
        return {
          status: 'expiring-soon',
          daysToExpiry,
          isNextActive: false,
          position
        };
      } else {
        return {
          status: 'expiring-soon',
          daysToExpiry,
          isNextActive: position === 2,
          position
        };
      }
    }

    // First batch is always active, others are reserved
    if (position === 1) {
      return {
        status: 'active',
        daysToExpiry,
        isNextActive: false,
        position
      };
    } else if (position === 2) {
      return {
        status: 'reserved',
        daysToExpiry,
        isNextActive: true,
        position
      };
    } else {
      return {
        status: 'reserved',
        daysToExpiry,
        isNextActive: false,
        position
      };
    }
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

  // Ultra-precise FIFO release system with intelligent allocation optimization
  releaseFIFO(productId: string, requestedQuantity: number): FIFOReleaseResult {
    const batches = this.getProductBatches(productId, false);
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

    // Ultra-precise availability analysis
    const availabilityAnalysis = this.analyzeAvailability(batches, requestedQuantity);
    
    if (availabilityAnalysis.totalAvailable < requestedQuantity) {
      return {
        success: false,
        message: `Insufficient stock. Available: ${availabilityAnalysis.totalAvailable} units across ${availabilityAnalysis.batchCount} batches. Shortage: ${requestedQuantity - availabilityAnalysis.totalAvailable} units. ${availabilityAnalysis.expiryWarning || ''}`,
        releasedBatches: [],
        totalReleased: 0,
        remainingRequested: requestedQuantity
      };
    }

    // Intelligent batch allocation with optimization
    const currentDate = new Date();
    let totalCost = 0;
    let earliestExpiry: number | undefined;
    let expiryRiskLevel = 'low';
    
    for (const batch of batches) {
      if (remainingRequested <= 0) break;
      
      const releaseFromThisBatch = Math.min(batch.quantity, remainingRequested);
      
      // Precise expiry calculation with time zone handling
      let daysToExpiry: number | undefined;
      let hoursToExpiry: number | undefined;
      if (batch.expiryDate) {
        const expiryDate = new Date(batch.expiryDate + 'T23:59:59'); // End of expiry day
        const timeDiff = expiryDate.getTime() - currentDate.getTime();
        hoursToExpiry = Math.ceil(timeDiff / (1000 * 60 * 60));
        daysToExpiry = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
        
        if (earliestExpiry === undefined || daysToExpiry < earliestExpiry) {
          earliestExpiry = daysToExpiry;
        }
      }
      
      // Calculate weighted cost for this batch allocation
      const batchCost = releaseFromThisBatch * batch.costPrice;
      totalCost += batchCost;
      
      // Assess expiry risk
      if (daysToExpiry !== undefined) {
        if (daysToExpiry <= 1) expiryRiskLevel = 'critical';
        else if (daysToExpiry <= 3 && expiryRiskLevel !== 'critical') expiryRiskLevel = 'high';
        else if (daysToExpiry <= 7 && expiryRiskLevel === 'low') expiryRiskLevel = 'medium';
      }
      
      releasedBatches.push({
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        quantityReleased: releaseFromThisBatch,
        remainingQuantity: batch.quantity - releaseFromThisBatch,
        expiryDate: batch.expiryDate,
        daysToExpiry,
        costPrice: batch.costPrice,
        batchCost,
        hoursToExpiry
      });
      
      remainingRequested -= releaseFromThisBatch;
    }

    const totalReleased = requestedQuantity - remainingRequested;
    const averageCost = totalReleased > 0 ? totalCost / totalReleased : 0;
    
    // Ultra-precise status message with detailed analytics
    let message = '';
    if (remainingRequested === 0) {
      const batchCount = releasedBatches.length;
      const expiryInfo = earliestExpiry !== undefined ? 
        `${earliestExpiry}d to earliest expiry, risk: ${expiryRiskLevel}` : 
        'no expiry constraints';
      
      message = `✅ Optimal FIFO allocation: ${totalReleased} units from ${batchCount} batch${batchCount > 1 ? 'es' : ''} (${expiryInfo}, avg cost: $${averageCost.toFixed(3)})`;
    } else {
      message = `⚠️ Partial allocation: ${totalReleased}/${requestedQuantity} units. Shortage: ${remainingRequested} units`;
    }

    return {
      success: remainingRequested === 0,
      message,
      releasedBatches,
      totalReleased,
      remainingRequested,
      averageCost,
      totalCost,
      expiryRiskLevel: expiryRiskLevel as 'low' | 'medium' | 'high' | 'critical',
      earliestExpiryDays: earliestExpiry
    };
  }

  // Detailed availability analysis for ultra-precise planning
  private analyzeAvailability(batches: InventoryBatch[], requestedQuantity: number): {
    totalAvailable: number;
    batchCount: number;
    expiryWarning?: string;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  } {
    const totalAvailable = batches.reduce((sum, batch) => sum + batch.quantity, 0);
    const currentDate = new Date();
    
    let expiryWarning: string | undefined;
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    
    // Analyze expiry risks in available inventory
    const expiringBatches = batches.filter(batch => {
      if (!batch.expiryDate) return false;
      const daysToExpiry = Math.ceil((new Date(batch.expiryDate).getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
      return daysToExpiry <= 7; // Consider batches expiring within a week
    });
    
    if (expiringBatches.length > 0) {
      const expiringQuantity = expiringBatches.reduce((sum, batch) => sum + batch.quantity, 0);
      const criticalBatches = expiringBatches.filter(batch => {
        const daysToExpiry = Math.ceil((new Date(batch.expiryDate!).getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
        return daysToExpiry <= 1;
      });
      
      if (criticalBatches.length > 0) {
        riskLevel = 'critical';
        expiryWarning = `${criticalBatches.length} batch(es) expiring within 24 hours`;
      } else if (expiringQuantity >= requestedQuantity * 0.8) {
        riskLevel = 'high';
        expiryWarning = `${Math.round(expiringQuantity)} units expiring within 7 days`;
      } else {
        riskLevel = 'medium';
        expiryWarning = `${expiringBatches.length} batch(es) expiring soon`;
      }
    }
    
    return {
      totalAvailable,
      batchCount: batches.length,
      expiryWarning,
      riskLevel
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
      const newBatches: InventoryBatch[] = purchase.items.map(item => {
        if (!item.quantityReceived || item.quantityReceived <= 0) {
          console.warn(`⚠️ Attempted to create batch with zero quantity for product ${item.productName} (${item.productId}) in PO ${purchase.purchaseOrderNumber}`);
          return null;
        }
        return {
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
          status: "active" as const,
          notes: item.notes,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
      }).filter(batch => batch !== null);

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
  
  // Update existing product
  updateProduct(product: Product): boolean {
    try {
      const products = this.getProducts();
      const existingIndex = products.findIndex(p => p.id === product.id);
      
      if (existingIndex < 0) {
        console.error(`Product with id ${product.id} not found`);
        return false;
      }
      
      products[existingIndex] = { 
        ...product, 
        updatedAt: new Date().toISOString() 
      };
      
      return this.saveProducts(products);
    } catch (error) {
      console.error('Error updating product:', error);
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