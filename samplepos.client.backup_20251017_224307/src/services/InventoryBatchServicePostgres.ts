/**
 * Enhanced inventory service with batch management and FIFO system - PostgreSQL Version
 * This implements the same interface as InventoryBatchService but uses PostgreSQL instead of localStorage
 */

import type { 
  InventoryBatch, 
  Product, 
  InventoryMovement, 
  PurchaseReceiving,
  FIFOReleaseResult,
  ProductStockSummary 
} from '../models/BatchInventory';

import { InventoryItemRepository } from '../repositories/inventory-item-repository';
import { InventoryBatchRepository } from '../repositories/inventory-batch-repository';
import pool from '../db/pool';
import type { DbInventoryBatch } from '../repositories/inventory-batch-repository';

class InventoryBatchServicePostgres {
  private static instance: InventoryBatchServicePostgres;
  
  // Repository instances
  private itemRepository: InventoryItemRepository;
  private batchRepository: InventoryBatchRepository;
  
  private constructor() {
    this.itemRepository = new InventoryItemRepository();
    this.batchRepository = new InventoryBatchRepository();
  }
  
  static getInstance(): InventoryBatchServicePostgres {
    if (!InventoryBatchServicePostgres.instance) {
      InventoryBatchServicePostgres.instance = new InventoryBatchServicePostgres();
    }
    return InventoryBatchServicePostgres.instance;
  }

  // Get all products
  async getProducts(): Promise<Product[]> {
    try {
      const items = await this.itemRepository.findAll();
      return items.map(item => this.mapDbItemToProduct(item));
    } catch (error) {
      console.error('Error fetching products from database:', error);
      return [];
    }
  }

  // Get all batches
  async getBatches(): Promise<InventoryBatch[]> {
    try {
      const batches = await this.batchRepository.findAll();
      return batches.map(batch => this.mapDbBatchToInventoryBatch(batch));
    } catch (error) {
      console.error('Error fetching batches from database:', error);
      return [];
    }
  }

  // Get all movements
  async getMovements(): Promise<InventoryMovement[]> {
    try {
      const result = await pool.query(`
        SELECT 
          m.id,
          i.name AS product_name,
          i.id AS product_id,
          b.batch_number,
          b.id AS batch_id,
          m.movement_type,
          m.quantity,
          m.unit_of_measure,
          m.conversion_factor,
          m.reason,
          m.reference AS reference_number,
          m.performed_by AS user_id,
          m.created_at AS timestamp,
          m.notes
        FROM 
          inventory_movements m
        JOIN 
          inventory_items i ON m.inventory_item_id = i.id
        LEFT JOIN
          inventory_batches b ON m.inventory_batch_id = b.id
        ORDER BY 
          m.created_at DESC
      `);
      
      return result.rows.map((row: any) => ({
        id: row.id,
        productId: row.product_id,
        productName: row.product_name,
        batchId: row.batch_id,
        batchNumber: row.batch_number || '',
        movementType: row.movement_type,
        quantity: parseFloat(row.quantity),
        unitCost: row.unit_cost,
        totalValue: row.total_value,
        referenceNumber: row.reference_number,
        userId: row.user_id,
        userName: row.performed_by,
        timestamp: row.timestamp,
        notes: row.notes
      }));
    } catch (error) {
      console.error('Failed to get inventory movements from database:', error);
      return [];
    }
  }

  // Get batches for a specific product, sorted by expiry date (FIFO)
  async getProductBatches(productId: string, includeExpired: boolean = false): Promise<InventoryBatch[]> {
    try {
      // Convert string ID to number (PostgreSQL uses numeric IDs)
      const numericId = Number(productId);
      if (isNaN(numericId)) {
        console.error(`Invalid product ID: ${productId}`);
        return [];
      }
      
      const batches = await this.batchRepository.findByItemId(numericId);
      
      const filteredBatches = batches.filter(batch => 
        batch.remaining_quantity > 0 && 
        (includeExpired || !this.isBatchExpired(this.mapDbBatchToInventoryBatch(batch)))
      );
      
      // Map and sort batches by FIFO criteria
      const mappedBatches = filteredBatches.map(batch => this.mapDbBatchToInventoryBatch(batch));
      
      // Use the same ultra-precise FIFO sorting logic as the original service
      return mappedBatches.sort((a, b) => {
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
    } catch (error) {
      console.error(`Error fetching batches for product ${productId}:`, error);
      return [];
    }
  }

  // Get only the active (available for sale) batches with intelligent preemption logic
  async getActiveBatches(productId: string): Promise<InventoryBatch[]> {
    const allBatches = await this.getProductBatches(productId, false);
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
  async getBatchStatus(batch: InventoryBatch, productId: string): Promise<{
    status: 'active' | 'reserved' | 'expired' | 'expiring-soon';
    daysToExpiry?: number;
    isNextActive: boolean;
    position: number;
  }> {
    const allBatches = await this.getProductBatches(productId, false);
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
  async getProductStockSummary(productId: string): Promise<ProductStockSummary | null> {
    try {
      // Convert string ID to number
      const numericId = Number(productId);
      if (isNaN(numericId)) {
        console.error(`Invalid product ID: ${productId}`);
        return null;
      }
      
      // Get the product
      const product = await this.itemRepository.findById(numericId);
      if (!product) {
        console.error(`Product not found with ID: ${productId}`);
        return null;
      }
      
      // Get the product's batches
      const batches = await this.batchRepository.findByItemId(numericId);
      const mappedBatches = batches.map(batch => this.mapDbBatchToInventoryBatch(batch));
      
      // Calculate statistics
      const totalQuantity = batches.reduce((sum, b) => sum + (b.remaining_quantity || 0), 0);
      const expiredBatches = mappedBatches.filter(b => this.isBatchExpired(b));
      
      // Get expiry alert days from product metadata
      const metadata = product.metadata || {};
      const expiryAlertDays = metadata.expiryAlertDays || 30;
      
      const expiringSoonBatches = mappedBatches.filter(b => 
        this.isBatchExpiringSoon(b, expiryAlertDays)
      );
      
      const expiredQuantity = expiredBatches.reduce((sum, b) => sum + b.quantity, 0);
      const expiringSoonQuantity = expiringSoonBatches.reduce((sum, b) => sum + b.quantity, 0);
      const availableQuantity = totalQuantity - expiredQuantity;
      
      // Calculate value statistics
      const totalValue = batches.reduce((sum, b) => {
        const unitCost = b.unit_cost || 0;
        const remainingQty = b.remaining_quantity || 0;
        return sum + (unitCost * remainingQty);
      }, 0);
      
      const averageCost = totalQuantity > 0 ? totalValue / totalQuantity : 0;
      
      // Sort expiry dates
      const expiryDates = mappedBatches
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
        reorderLevel: product.reorder_level || 10,
        isLowStock: availableQuantity <= (product.reorder_level || 10),
        hasExpiredStock: expiredQuantity > 0,
        hasExpiringSoonStock: expiringSoonQuantity > 0
      };
    } catch (error) {
      console.error(`Error getting product stock summary for ${productId}:`, error);
      return null;
    }
  }

  // Ultra-precise FIFO release system with intelligent allocation optimization
  async releaseFIFO(productId: string, requestedQuantity: number): Promise<FIFOReleaseResult> {
    try {
      // Convert string ID to number
      const numericId = Number(productId);
      if (isNaN(numericId)) {
        return {
          success: false,
          message: `Invalid product ID: ${productId}`,
          releasedBatches: [],
          totalReleased: 0,
          remainingRequested: requestedQuantity
        };
      }
      
      const batches = await this.getProductBatches(productId, false);
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
    } catch (error) {
      console.error(`Error releasing FIFO for product ${productId}:`, error);
      return {
        success: false,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        releasedBatches: [],
        totalReleased: 0,
        remainingRequested: requestedQuantity
      };
    }
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
  async applyFIFORelease(productId: string, requestedQuantity: number, movementType: InventoryMovement['movementType'], userId: string, userName: string, referenceNumber?: string): Promise<boolean> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Convert string ID to number
      const numericId = Number(productId);
      if (isNaN(numericId)) {
        console.error(`Invalid product ID: ${productId}`);
        await client.query('ROLLBACK');
        return false;
      }
      
      // Get the product
      const product = await this.itemRepository.findById(numericId);
      if (!product) {
        console.error(`Product not found with ID: ${productId}`);
        await client.query('ROLLBACK');
        return false;
      }
      
      // Calculate FIFO release allocation
      const releaseResult = await this.releaseFIFO(productId, requestedQuantity);
      
      if (!releaseResult.success) {
        console.error('Cannot apply FIFO release:', releaseResult.message);
        await client.query('ROLLBACK');
        return false;
      }
      
      // Update each batch in the database
      for (const releasedBatch of releaseResult.releasedBatches) {
        // Convert batch ID to number
        const numericBatchId = Number(releasedBatch.batchId.toString().replace(/^batch-/, ''));
        if (isNaN(numericBatchId)) {
          console.error(`Invalid batch ID: ${releasedBatch.batchId}`);
          continue;
        }
        
        // Update the batch quantity
        await this.batchRepository.update(numericBatchId, {
          remaining_quantity: releasedBatch.remainingQuantity
        });
        
        // Create movement record
        await client.query(`
          INSERT INTO inventory_movements (
            id,
            inventory_item_id,
            inventory_batch_id,
            movement_type,
            quantity,
            unit_of_measure,
            conversion_factor,
            actual_quantity,
            reason,
            reference,
            performed_by,
            notes,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
          `movement-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          numericId,
          numericBatchId,
          movementType,
          -releasedBatch.quantityReleased, // Negative for outgoing
          product.metadata?.unit || 'piece',
          1, // Default conversion factor
          releasedBatch.quantityReleased,
          `FIFO release - ${movementType}`,
          referenceNumber || '',
          userId,
          `Released by ${userName} - ${releasedBatch.quantityReleased} units from batch ${releasedBatch.batchNumber}`,
          new Date().toISOString()
        ]);
      }
      
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error applying FIFO release:', error);
      return false;
    } finally {
      client.release();
    }
  }

  // Receive new inventory (Purchase)
  async receivePurchase(purchase: PurchaseReceiving): Promise<boolean> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Process each item in the purchase
      for (const item of purchase.items) {
        // Convert product ID to number
        const numericProductId = Number(item.productId);
        if (isNaN(numericProductId)) {
          console.error(`Invalid product ID: ${item.productId}`);
          continue;
        }
        
        // Create a new batch
        const newBatch = await this.batchRepository.create({
          inventory_item_id: numericProductId,
          batch_number: item.batchNumber,
          quantity: item.quantityReceived,
          remaining_quantity: item.quantityReceived,
          unit_cost: item.unitCost,
          expiry_date: item.expiryDate,
          received_date: purchase.receivedDate,
          supplier: purchase.supplier,
          metadata: {
            manufacturingDate: item.manufacturingDate,
            supplierBatchRef: item.supplierBatchRef,
            location: item.location,
            notes: item.notes,
            receivedBy: purchase.receivedBy
          }
        });
        
        if (!newBatch) {
          console.error(`Failed to create batch for product ${item.productName}`);
          continue;
        }
        
        // Create movement record
        await client.query(`
          INSERT INTO inventory_movements (
            id,
            inventory_item_id,
            inventory_batch_id,
            movement_type,
            quantity,
            unit_of_measure,
            conversion_factor,
            actual_quantity,
            reason,
            reference,
            performed_by,
            notes,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        `, [
          `movement-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          numericProductId,
          newBatch.id,
          'purchase',
          item.quantityReceived,
          'piece', // Default unit
          1, // Default conversion factor
          item.quantityReceived,
          `Purchase received - ${purchase.supplier}`,
          purchase.purchaseOrderNumber || '',
          purchase.receivedBy || 'system',
          `Purchase received - PO: ${purchase.purchaseOrderNumber || 'N/A'}`,
          new Date().toISOString()
        ]);
      }
      
      // Insert purchase record (custom table for purchase records)
      await client.query(`
        INSERT INTO purchase_receivings (
          id,
          purchase_order_number,
          supplier,
          received_by,
          received_date,
          total_value,
          status,
          notes,
          metadata,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        purchase.id || `purchase-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        purchase.purchaseOrderNumber || `PO-${Date.now()}`,
        purchase.supplier,
        purchase.receivedBy || 'system',
        purchase.receivedDate || new Date().toISOString().split('T')[0],
        purchase.totalValue || 0,
        purchase.status || 'complete',
        purchase.notes || '',
        JSON.stringify(purchase.items.map(item => ({
          productId: item.productId,
          productName: item.productName,
          batchNumber: item.batchNumber,
          quantityReceived: item.quantityReceived,
          unitCost: item.unitCost,
          totalCost: item.totalCost
        }))),
        new Date().toISOString()
      ]);
      
      await client.query('COMMIT');
      
      // Dispatch custom event to notify other components
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('inventory-updated'));
      }
      
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error receiving purchase:', error);
      return false;
    } finally {
      client.release();
    }
  }

  // Get purchase history
  async getPurchases(): Promise<PurchaseReceiving[]> {
    try {
      const result = await pool.query(`
        SELECT * FROM purchase_receivings
        ORDER BY received_date DESC, created_at DESC
      `);
      
      return result.rows.map((row: any) => ({
        id: row.id,
        purchaseOrderNumber: row.purchase_order_number,
        supplier: row.supplier,
        receivedBy: row.received_by,
        receivedDate: row.received_date,
        items: typeof row.metadata === 'object' ? row.metadata : 
               typeof row.metadata === 'string' ? JSON.parse(row.metadata) : [],
        totalValue: parseFloat(row.total_value || 0),
        status: row.status,
        notes: row.notes,
        createdAt: row.created_at
      }));
    } catch (error) {
      console.error('Failed to get purchase history:', error);
      return [];
    }
  }

  // Save a product
  async saveProduct(product: Product): Promise<boolean> {
    try {
      // Check if product exists by name or SKU (for new products without ID)
      let existingItem = null;
      
      if (product.id && !product.id.startsWith('product-')) {
        // If it has a numeric ID (from database)
        existingItem = await this.itemRepository.findById(Number(product.id));
      } else {
        // Try to find by SKU
        existingItem = await this.itemRepository.findBySku(product.sku || '');
        
        if (!existingItem && product.name) {
          // Also try to find by name
          const items = await this.itemRepository.findAll();
          existingItem = items.find(i => i.name === product.name);
        }
      }
      
      if (existingItem) {
        // Update existing product
        await this.itemRepository.update(Number(existingItem.id), {
          sku: product.sku,
          name: product.name,
          description: product.description,
          category: product.category || 'General',
          base_price: product.price || 0,
          tax_rate: 0, // Default tax rate
          reorder_level: product.reorderLevel || 10,
          is_active: product.isActive !== false,
          metadata: {
            unit: product.unit || 'piece',
            hasExpiry: product.hasExpiry || false,
            expiryAlertDays: product.expiryAlertDays || 30,
            maxStockLevel: product.maxStockLevel,
            defaultUnit: product.defaultUnit,
            location: product.location,
            supplier: product.supplier,
            costPrice: product.costPrice || 0
          }
        });
      } else {
        // Create new product
        await this.itemRepository.create({
          sku: product.sku || `SKU-${Date.now()}`,
          name: product.name,
          description: product.description,
          category: product.category || 'General',
          base_price: product.price || 0,
          tax_rate: 0, // Default tax rate
          reorder_level: product.reorderLevel || 10,
          is_active: product.isActive !== false,
          metadata: {
            unit: product.unit || 'piece',
            hasExpiry: product.hasExpiry || false,
            expiryAlertDays: product.expiryAlertDays || 30,
            maxStockLevel: product.maxStockLevel,
            defaultUnit: product.defaultUnit,
            location: product.location,
            supplier: product.supplier,
            costPrice: product.costPrice || 0
          }
        });
      }
      
      // Dispatch custom event to notify other components
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('inventory-updated'));
      }
      
      return true;
    } catch (error) {
      console.error('Error saving product:', error);
      return false;
    }
  }
  
  // Update existing product
  async updateProduct(product: Product): Promise<boolean> {
    return this.saveProduct(product);
  }
  
  // Get low stock products
  async getLowStockProducts(): Promise<ProductStockSummary[]> {
    try {
      const result = await pool.query(`
        SELECT i.*,
          COALESCE(SUM(b.remaining_quantity), 0) as total_quantity
        FROM inventory_items i
        LEFT JOIN inventory_batches b ON i.id = b.inventory_item_id
        GROUP BY i.id
        HAVING COALESCE(SUM(b.remaining_quantity), 0) <= i.reorder_level
      `);
      
      const lowStockProducts = await Promise.all(
        result.rows.map(async (item) => {
          const productId = String(item.id);
          return await this.getProductStockSummary(productId);
        })
      );
      
      return lowStockProducts.filter((p): p is ProductStockSummary => p !== null);
    } catch (error) {
      console.error('Error getting low stock products:', error);
      return [];
    }
  }
  
  // Get products with expired stock
  async getProductsWithExpiredStock(): Promise<ProductStockSummary[]> {
    try {
      const result = await pool.query(`
        SELECT DISTINCT i.*
        FROM inventory_items i
        JOIN inventory_batches b ON i.id = b.inventory_item_id
        WHERE 
          b.expiry_date < CURRENT_DATE AND
          b.remaining_quantity > 0
      `);
      
      const expiredProducts = await Promise.all(
        result.rows.map(async (item) => {
          const productId = String(item.id);
          return await this.getProductStockSummary(productId);
        })
      );
      
      return expiredProducts.filter((p): p is ProductStockSummary => p !== null && p.hasExpiredStock);
    } catch (error) {
      console.error('Error getting products with expired stock:', error);
      return [];
    }
  }
  
  // Get products with expiring soon stock
  async getProductsWithExpiringSoonStock(): Promise<ProductStockSummary[]> {
    try {
      const result = await pool.query(`
        SELECT DISTINCT i.*
        FROM inventory_items i
        JOIN inventory_batches b ON i.id = b.inventory_item_id
        WHERE 
          b.expiry_date >= CURRENT_DATE AND
          b.expiry_date <= (CURRENT_DATE + INTERVAL '30 day') AND
          b.remaining_quantity > 0
      `);
      
      const expiringSoonProducts = await Promise.all(
        result.rows.map(async (item) => {
          const productId = String(item.id);
          return await this.getProductStockSummary(productId);
        })
      );
      
      return expiringSoonProducts.filter((p): p is ProductStockSummary => p !== null && p.hasExpiringSoonStock);
    } catch (error) {
      console.error('Error getting products with expiring soon stock:', error);
      return [];
    }
  }

  // Helper functions to map DB objects to domain models
  private mapDbItemToProduct(dbItem: any): Product {
    const metadata = dbItem.metadata || {};
    
    return {
      id: String(dbItem.id),
      name: dbItem.name,
      sku: dbItem.sku || '',
      category: dbItem.category || 'General',
      unit: metadata.unit || 'piece',
      hasExpiry: metadata.hasExpiry || false,
      expiryAlertDays: metadata.expiryAlertDays || 30,
      reorderLevel: dbItem.reorder_level || 10,
      price: dbItem.base_price || 0,
      costPrice: metadata.costPrice || 0,
      maxStockLevel: metadata.maxStockLevel,
      description: dbItem.description || '',
      supplier: metadata.supplier || '',
      location: metadata.location || '',
      isActive: dbItem.is_active !== false,
      defaultUnit: metadata.defaultUnit,
      createdAt: dbItem.created_at,
      updatedAt: dbItem.updated_at
    };
  }

  private mapDbBatchToInventoryBatch(dbBatch: DbInventoryBatch): InventoryBatch {
    const metadata = dbBatch.metadata || {};
    
    return {
      id: String(dbBatch.id),
      batchNumber: dbBatch.batch_number,
      productId: String(dbBatch.inventory_item_id),
      productName: '', // Will be populated separately if needed
      quantity: dbBatch.remaining_quantity,
      originalQuantity: dbBatch.quantity,
      costPrice: dbBatch.unit_cost,
      sellingPrice: 0, // Can be calculated based on markup if needed
      expiryDate: dbBatch.expiry_date,
      manufacturingDate: metadata.manufacturingDate,
      supplierBatchRef: metadata.supplierBatchRef,
      receivedDate: dbBatch.received_date,
      receivedBy: metadata.receivedBy || '',
      supplier: dbBatch.supplier || '',
      location: metadata.location || '',
      status: dbBatch.remaining_quantity > 0 ? 'active' : 'depleted',
      notes: metadata.notes || '',
      createdAt: dbBatch.created_at,
      updatedAt: dbBatch.updated_at
    };
  }
}

export default InventoryBatchServicePostgres;