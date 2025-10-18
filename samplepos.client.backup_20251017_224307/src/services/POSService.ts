/**
 * POS Transaction Service - Handles all POS transaction operations
 * Enhanced with InventoryBatchService integration for proper inventory tracking
 */

import { v4 as uuidv4 } from 'uuid';
import type { 
  Transaction, 
  TransactionItem, 
  PaymentDetails, 
  Customer,
  Receipt
  // TransactionItemBatch is used in types for batches field in TransactionItem
} from '../models/Transaction';
import type { InventoryItem } from '../models/InventoryItem';
import type { ProductStockSummary } from '../models/BatchInventory';
import InventoryBatchService from './InventoryBatchService';

const LOCAL_STORAGE_KEY = 'pos_transactions_v1';
const INVENTORY_KEY = 'pos_inventory_v1';

export class POSService {
  /**
   * Get all transactions from local storage
   */
  static getTransactions(): Transaction[] {
    const transactions = localStorage.getItem(LOCAL_STORAGE_KEY);
    return transactions ? JSON.parse(transactions) : [];
  }

  /**
   * Save transactions to local storage
   */
  private static saveTransactions(transactions: Transaction[]): void {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(transactions));
  }

  /**
   * Get a single transaction by ID
   */
  static getTransactionById(id: string): Transaction | undefined {
    const transactions = this.getTransactions();
    return transactions.find(t => t.id === id);
  }

  /**
   * Create a new transaction with batch inventory tracking
   */
  static createTransaction(
    items: TransactionItem[], 
    payment: PaymentDetails, 
    customer?: Customer, 
    notes?: string
  ): Transaction {
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
    const taxAmount = items.reduce((sum, item) => sum + (item.taxes || 0), 0);
    const discountAmount = items.reduce((sum, item) => {
      if (item.discount) {
        if (item.discountType === 'percentage') {
          return sum + (item.subtotal * item.discount / 100);
        }
        return sum + (item.discount || 0);
      }
      return sum;
    }, 0);

    const total = subtotal + taxAmount - discountAmount;
    
    const transactions = this.getTransactions();
    const transactionNumber = this.generateTransactionNumber(transactions);
    
    // Process batch allocations for the items
    const processedItems = this.processBatchAllocation(items);
    
    const transaction: Transaction = {
      id: uuidv4(),
      transactionNumber,
      items: processedItems,
      subtotal,
      taxAmount,
      discountAmount,
      total,
      payment,
      status: 'pending',
      customer,
      notes,
      createdAt: new Date().toISOString()
    };
    
    // Add the transaction
    transactions.push(transaction);
    this.saveTransactions(transactions);
    
    // Update inventory (this now uses InventoryBatchService through processBatchAllocation)
    // The inventory reduction already happened in processBatchAllocation
    
    return transaction;
  }
  
  /**
   * Process batch allocation for items in a transaction using FIFO
   */
  private static processBatchAllocation(items: TransactionItem[]): TransactionItem[] {
    const inventoryService = InventoryBatchService.getInstance();
    const userId = 'pos-system'; // Identifier for the POS system
    const userName = 'POS System'; // Display name for the POS system
    
    return items.map(item => {
      // Try to allocate batches using FIFO
      const fifoResult = inventoryService.releaseFIFO(item.productId, item.quantity);
      
      if (fifoResult.success) {
        // Apply the FIFO release to update the inventory
        inventoryService.applyFIFORelease(
          item.productId, 
          item.quantity, 
          'sale', // Movement type
          userId,
          userName,
          `POS-${new Date().getTime()}` // Reference number
        );
        
        // Create the batch information for the transaction
        const batches = fifoResult.releasedBatches.map(batch => ({
          batchId: batch.batchId,
          batchNumber: batch.batchNumber,
          quantity: batch.quantityReleased,
          costPrice: batch.costPrice || 0,
          expiryDate: batch.expiryDate,
          daysToExpiryAtSale: batch.daysToExpiry
        }));
        
        // Calculate profit information
        const averageCostPrice = fifoResult.averageCost || 0;
        const totalCost = fifoResult.totalCost || 0;
        const profit = item.subtotal - totalCost;
        const profitMargin = item.subtotal > 0 ? (profit / item.subtotal) * 100 : 0;
        
        // Return the item with batch information
        return {
          ...item,
          batches,
          fifoRelease: {
            success: fifoResult.success,
            totalReleased: fifoResult.totalReleased,
            expiryRiskLevel: fifoResult.expiryRiskLevel,
            earliestExpiryDays: fifoResult.earliestExpiryDays
          },
          averageCostPrice,
          profit,
          profitMargin
        };
      } else {
        // If FIFO allocation fails, try legacy inventory update as fallback
        console.warn(`FIFO allocation failed for product ${item.productId}, using legacy inventory update`);
        this.updateInventoryLegacy([item]);
        
        return {
          ...item,
          fifoRelease: {
            success: false
          }
        };
      }
    });
  }
  
  /**
   * Complete a transaction
   */
  static completeTransaction(id: string): Transaction | undefined {
    const transactions = this.getTransactions();
    const transactionIndex = transactions.findIndex(t => t.id === id);
    
    if (transactionIndex !== -1) {
      transactions[transactionIndex].status = 'completed';
      transactions[transactionIndex].completedAt = new Date().toISOString();
      this.saveTransactions(transactions);
      return transactions[transactionIndex];
    }
    
    return undefined;
  }
  
  /**
   * Cancel a transaction
   */
  static cancelTransaction(id: string): Transaction | undefined {
    const transactions = this.getTransactions();
    const transactionIndex = transactions.findIndex(t => t.id === id);
    
    if (transactionIndex !== -1) {
      // Revert inventory changes
      this.revertInventoryChanges(transactions[transactionIndex].items);
      
      transactions[transactionIndex].status = 'cancelled';
      this.saveTransactions(transactions);
      return transactions[transactionIndex];
    }
    
    return undefined;
  }
  
  /**
   * Generate a new transaction number
   */
  private static generateTransactionNumber(transactions: Transaction[]): string {
    // Format: TXN-YYYYMMDD-XXXX
    const today = new Date();
    const dateStr = today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, '0') +
      today.getDate().toString().padStart(2, '0');
    
    // Count transactions for today to generate sequence
    const todayTransactions = transactions.filter(t => 
      t.createdAt.startsWith(today.toISOString().split('T')[0])
    );
    
    const sequence = (todayTransactions.length + 1).toString().padStart(4, '0');
    return `TXN-${dateStr}-${sequence}`;
  }
  
  /**
   * Update inventory based on sold items (legacy method for backward compatibility)
   */
  private static updateInventoryLegacy(items: TransactionItem[]): void {
    const inventory = this.getInventory();
    
    items.forEach(item => {
      const productIndex = inventory.findIndex(p => p.id === item.productId);
      
      if (productIndex !== -1) {
        // Only subtract inventory if there's a product and it tracks quantity
        if (typeof inventory[productIndex].quantity === 'number') {
          const currentQty = inventory[productIndex].quantity as number;
          inventory[productIndex].quantity = currentQty - item.quantity;
        }
      }
    });
    
    this.saveInventory(inventory);
  }
  
  /**
   * Revert inventory changes when cancelling a transaction
   */
  private static revertInventoryChanges(items: TransactionItem[]): void {
    // Will use InventoryBatchService for batch reversal in future implementation
    
    items.forEach(item => {
      // If the item has batch information, we need to revert the batches
      if (item.batches && item.batches.length > 0) {
        // For now, we can't easily restore specific batch allocations
        // This would require a more complex inventory system with transaction linking
        // Instead, we'll add the items back to inventory as a new batch
        console.log(`Reverting inventory changes for ${item.name}`);
        
        // TODO: Implement proper batch reversal in a future version
      } else {
        // Use legacy inventory update for items without batch info
        const inventory = this.getInventory();
        
        const productIndex = inventory.findIndex(p => p.id === item.productId);
        
        if (productIndex !== -1) {
          // Only add back to inventory if there's a product and it tracks quantity
          if (typeof inventory[productIndex].quantity === 'number') {
            const currentQty = inventory[productIndex].quantity as number;
            inventory[productIndex].quantity = currentQty + item.quantity;
          }
        }
        
        this.saveInventory(inventory);
      }
    });
  }
  
  /**
   * Generate a receipt for a transaction
   */
  static generateReceipt(transactionId: string): Receipt | undefined {
    const transaction = this.getTransactionById(transactionId);
    
    if (!transaction) return undefined;
    
    // Get business details from localStorage or use defaults
    const businessSettings = JSON.parse(localStorage.getItem('pos_settings') || '{}');
    
    const receipt: Receipt = {
      transactionId,
      receiptNumber: `RCT-${transaction.transactionNumber.substring(4)}`,
      businessName: businessSettings.businessName || 'Sample POS Store',
      businessAddress: businessSettings.businessAddress || 'Business Address',
      businessPhone: businessSettings.businessPhone || 'Phone Number',
      businessEmail: businessSettings.businessEmail || 'email@example.com',
      businessTaxId: businessSettings.businessTaxId || '',
      transaction,
      printedAt: new Date().toISOString()
    };
    
    return receipt;
  }
  
  /**
   * Get inventory items
   */
  static getInventory(): InventoryItem[] {
    const inventory = localStorage.getItem(INVENTORY_KEY);
    return inventory ? JSON.parse(inventory) : [];
  }
  
  /**
   * Save inventory items
   */
  private static saveInventory(inventory: InventoryItem[]): void {
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventory));
  }
  
  /**
   * Add a sample inventory for demonstration purposes
   * This now creates proper batch inventory as well
   */
  static addSampleInventory(): void {
    const existingInventory = this.getInventory();
    const inventoryBatchService = InventoryBatchService.getInstance();
    const batchProducts = inventoryBatchService.getProducts();
    
    // Only add sample data if inventory is empty
    if (existingInventory.length === 0 && batchProducts.length === 0) {
      // First create the sample products in batch inventory system
      const sampleProducts = [
        {
          id: '1',
          name: 'Cola Drink',
          sku: 'BEV-COLA-001',
          barcode: '8901234567890',
          category: 'Beverages',
          unit: 'bottle',
          hasExpiry: true,
          expiryAlertDays: 30,
          reorderLevel: 20,
          isActive: true
        },
        {
          id: '2',
          name: 'Chocolate Bar',
          sku: 'CONF-CHOC-001',
          barcode: '7890123456789',
          category: 'Confectionery',
          unit: 'piece',
          hasExpiry: true,
          expiryAlertDays: 30,
          reorderLevel: 15,
          isActive: true
        },
        {
          id: '3',
          name: 'White Bread',
          sku: 'BAK-BREAD-001',
          barcode: '6789012345678',
          category: 'Bakery',
          unit: 'loaf',
          hasExpiry: true,
          expiryAlertDays: 2,
          reorderLevel: 5,
          isActive: true
        },
        {
          id: '4',
          name: 'Milk',
          sku: 'DAIRY-MILK-001',
          barcode: '5678901234567',
          category: 'Dairy',
          unit: 'carton',
          hasExpiry: true,
          expiryAlertDays: 3,
          reorderLevel: 8,
          isActive: true
        },
        {
          id: '5',
          name: 'Potato Chips',
          sku: 'SNACK-CHIP-001',
          barcode: '4567890123456',
          category: 'Snacks',
          unit: 'packet',
          hasExpiry: true,
          expiryAlertDays: 45,
          reorderLevel: 10,
          isActive: true
        }
      ];
      
      // Add products to batch inventory system
      sampleProducts.forEach(product => {
        inventoryBatchService.saveProduct({
          ...product,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });
      
      // Add batches for each product (simulating purchases)
      const today = new Date();
      
      // Cola Drink batches
      inventoryBatchService.receivePurchase({
        id: `purchase-${Date.now()}-1`,
        purchaseOrderNumber: 'PO-SAMPLE-1',
        supplier: 'Sample Supplier',
        receivedBy: 'System',
        receivedDate: today.toISOString().split('T')[0],
        items: [
          {
            productId: '1',
            productName: 'Cola Drink',
            batchNumber: 'BTH001',
            quantityReceived: 60,
            unitCost: 1.50,
            totalCost: 90,
            expiryDate: new Date(today.getFullYear(), today.getMonth() + 3, today.getDate()).toISOString().split('T')[0]
          },
          {
            productId: '1',
            productName: 'Cola Drink',
            batchNumber: 'BTH001-B',
            quantityReceived: 40,
            unitCost: 1.50,
            totalCost: 60,
            expiryDate: new Date(today.getFullYear(), today.getMonth() + 6, today.getDate()).toISOString().split('T')[0]
          }
        ],
        totalValue: 150,
        status: 'complete',
        createdAt: today.toISOString()
      });
      
      // Chocolate Bar batches
      inventoryBatchService.receivePurchase({
        id: `purchase-${Date.now()}-2`,
        purchaseOrderNumber: 'PO-SAMPLE-2',
        supplier: 'Sweet Supplier',
        receivedBy: 'System',
        receivedDate: today.toISOString().split('T')[0],
        items: [
          {
            productId: '2',
            productName: 'Chocolate Bar',
            batchNumber: 'BTH002',
            quantityReceived: 50,
            unitCost: 0.75,
            totalCost: 37.5,
            expiryDate: new Date(today.getFullYear(), today.getMonth() + 9, today.getDate()).toISOString().split('T')[0]
          }
        ],
        totalValue: 37.5,
        status: 'complete',
        createdAt: today.toISOString()
      });
      
      // White Bread batches
      inventoryBatchService.receivePurchase({
        id: `purchase-${Date.now()}-3`,
        purchaseOrderNumber: 'PO-SAMPLE-3',
        supplier: 'Bakery Supplier',
        receivedBy: 'System',
        receivedDate: today.toISOString().split('T')[0],
        items: [
          {
            productId: '3',
            productName: 'White Bread',
            batchNumber: 'BTH003',
            quantityReceived: 30,
            unitCost: 1.80,
            totalCost: 54,
            expiryDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5).toISOString().split('T')[0]
          }
        ],
        totalValue: 54,
        status: 'complete',
        createdAt: today.toISOString()
      });
      
      // Milk batches
      inventoryBatchService.receivePurchase({
        id: `purchase-${Date.now()}-4`,
        purchaseOrderNumber: 'PO-SAMPLE-4',
        supplier: 'Dairy Supplier',
        receivedBy: 'System',
        receivedDate: today.toISOString().split('T')[0],
        items: [
          {
            productId: '4',
            productName: 'Milk',
            batchNumber: 'BTH004',
            quantityReceived: 20,
            unitCost: 2.00,
            totalCost: 40,
            expiryDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 10).toISOString().split('T')[0]
          },
          {
            productId: '4',
            productName: 'Milk',
            batchNumber: 'BTH004-B',
            quantityReceived: 20,
            unitCost: 2.00,
            totalCost: 40,
            expiryDate: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14).toISOString().split('T')[0]
          }
        ],
        totalValue: 80,
        status: 'complete',
        createdAt: today.toISOString()
      });
      
      // Potato Chips batches
      inventoryBatchService.receivePurchase({
        id: `purchase-${Date.now()}-5`,
        purchaseOrderNumber: 'PO-SAMPLE-5',
        supplier: 'Snack Supplier',
        receivedBy: 'System',
        receivedDate: today.toISOString().split('T')[0],
        items: [
          {
            productId: '5',
            productName: 'Potato Chips',
            batchNumber: 'BTH005',
            quantityReceived: 60,
            unitCost: 1.20,
            totalCost: 72,
            expiryDate: new Date(today.getFullYear(), today.getMonth() + 5, today.getDate()).toISOString().split('T')[0]
          }
        ],
        totalValue: 72,
        status: 'complete',
        createdAt: today.toISOString()
      });
      
      // Legacy inventory for backward compatibility
      const sampleInventoryItems: InventoryItem[] = [
        {
          id: '1',
          name: 'Cola Drink',
          batch: 'BTH001',
          hasExpiry: true,
          expiry: '2025-12-31',
          quantity: 100,
          unit: 'bottle',
          price: 2.50,
          category: 'Beverages',
          sku: 'BEV-COLA-001',
          barcode: '8901234567890',
          costPrice: 1.50
        },
        {
          id: '2',
          name: 'Chocolate Bar',
          batch: 'BTH002',
          hasExpiry: true,
          expiry: '2025-06-30',
          quantity: 50,
          unit: 'piece',
          price: 1.25,
          category: 'Confectionery',
          sku: 'CONF-CHOC-001',
          barcode: '7890123456789',
          costPrice: 0.75
        },
        {
          id: '3',
          name: 'White Bread',
          batch: 'BTH003',
          hasExpiry: true,
          expiry: '2025-10-15',
          quantity: 30,
          unit: 'loaf',
          price: 3.00,
          category: 'Bakery',
          sku: 'BAK-BREAD-001',
          barcode: '6789012345678',
          costPrice: 1.80
        },
        {
          id: '4',
          name: 'Milk',
          batch: 'BTH004',
          hasExpiry: true,
          expiry: '2025-10-10',
          quantity: 40,
          unit: 'carton',
          price: 2.99,
          category: 'Dairy',
          sku: 'DAIRY-MILK-001',
          barcode: '5678901234567',
          costPrice: 2.00
        },
        {
          id: '5',
          name: 'Potato Chips',
          batch: 'BTH005',
          hasExpiry: true,
          expiry: '2026-01-15',
          quantity: 60,
          unit: 'packet',
          price: 1.99,
          category: 'Snacks',
          sku: 'SNACK-CHIP-001',
          barcode: '4567890123456',
          costPrice: 1.20
        }
      ];
      
      this.saveInventory(sampleInventoryItems);
    }
  }
  
  /**
   * Get product details with inventory information
   * Combines data from both inventory systems
   */
  static getProductWithInventory(productId: string): {
    product: InventoryItem | null;
    stockSummary: ProductStockSummary | null;
  } {
    // Get product from legacy inventory
    const inventoryItems = this.getInventory();
    const product = inventoryItems.find(item => item.id === productId) || null;
    
    // Get stock summary from batch inventory
    const inventoryBatchService = InventoryBatchService.getInstance();
    const stockSummary = inventoryBatchService.getProductStockSummary(productId);
    
    return {
      product,
      stockSummary
    };
  }
  
  /**
   * Get all products with inventory information
   */
  static getAllProductsWithInventory(): Array<{
    product: InventoryItem;
    stockSummary: ProductStockSummary | null;
  }> {
    // Get legacy inventory
    const inventoryItems = this.getInventory();
    
    // Get batch inventory service
    const inventoryBatchService = InventoryBatchService.getInstance();
    
    // Combine the information
    return inventoryItems.map(product => ({
      product,
      stockSummary: product.id ? inventoryBatchService.getProductStockSummary(product.id) : null
    }));
  }
}