import type { InventoryItem } from '../models/InventoryItem';
import type { SaleItem } from '../types/pos';

/**
 * Inventory Service - Manages inventory operations and POS integration
 */

export interface InventoryMovement {
  id: string;
  itemName: string;
  itemBatch: string;
  movementType: 'sale' | 'purchase' | 'adjustment' | 'return';
  quantity: number; // Always in base units
  unitOfMeasure: string;
  conversionFactor: number;
  actualQuantityMoved: number; // Quantity in the selected UoM
  reason: string;
  reference: string;
  timestamp: string;
  performedBy?: string;
}

/**
 * Get all inventory items from localStorage
 */
export function getInventory(): InventoryItem[] {
  try {
    const data = localStorage.getItem('inventory_items');
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to get inventory:', error);
    return [];
  }
}

/**
 * Save inventory items to localStorage
 */
export function saveInventory(inventory: InventoryItem[]): void {
  try {
    localStorage.setItem('inventory_items', JSON.stringify(inventory));
    // Dispatch storage event to notify other components
    window.dispatchEvent(new Event('storage'));
  } catch (error) {
    console.error('Failed to save inventory:', error);
  }
}

/**
 * Get inventory movements from localStorage
 */
export function getInventoryMovements(): InventoryMovement[] {
  try {
    const data = localStorage.getItem('inventory_movements');
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to get inventory movements:', error);
    return [];
  }
}

/**
 * Save inventory movements to localStorage
 */
export function saveInventoryMovements(movements: InventoryMovement[]): void {
  try {
    localStorage.setItem('inventory_movements', JSON.stringify(movements));
  } catch (error) {
    console.error('Failed to save inventory movements:', error);
  }
}

/**
 * Process sales and update inventory quantities
 * This function handles UoM conversions properly
 */
export function processSalesTransaction(
  saleItems: SaleItem[],
  transactionId: string
): { success: boolean; errors: string[]; movements: InventoryMovement[] } {
  const inventory = getInventory();
  const movements: InventoryMovement[] = [];
  const errors: string[] = [];
  let success = true;

  // Process each sale item
  saleItems.forEach((saleItem, index) => {
    try {
      if (typeof saleItem.quantity !== 'number' || saleItem.quantity <= 0) {
        errors.push(`Invalid quantity for item: ${saleItem.name}`);
        return;
      }

      // Find the inventory item
      const inventoryIndex = inventory.findIndex(inv => 
        inv.name === saleItem.name && 
        (saleItem.batch ? inv.batch === saleItem.batch : true)
      );

      if (inventoryIndex === -1) {
        errors.push(`Item not found in inventory: ${saleItem.name}${saleItem.batch ? ` (Batch: ${saleItem.batch})` : ''}`);
        success = false;
        return;
      }

      const inventoryItem = inventory[inventoryIndex];
      const currentQty = typeof inventoryItem.quantity === 'number' ? inventoryItem.quantity : 0;

      // Calculate the quantity to deduct in base units
      let quantityToDeduct: number;
      let actualQuantityMoved: number;
      let conversionFactor: number;

      if (saleItem.conversionFactor && saleItem.conversionFactor > 0) {
        // UoM sale - convert to base units
        conversionFactor = saleItem.conversionFactor;
        actualQuantityMoved = saleItem.quantity;
        quantityToDeduct = saleItem.quantity * conversionFactor;
      } else {
        // Regular sale - assume base units
        conversionFactor = 1;
        actualQuantityMoved = saleItem.quantity;
        quantityToDeduct = saleItem.quantity;
      }

      // Check if we have enough stock
      if (currentQty < quantityToDeduct) {
        errors.push(
          `Insufficient stock for ${saleItem.name}. ` +
          `Available: ${currentQty} pieces, ` +
          `Required: ${quantityToDeduct} pieces ` +
          `(${actualQuantityMoved} ${saleItem.uomDisplayName || 'units'})`
        );
        success = false;
        return;
      }

      // Update inventory quantity
      const newQty = currentQty - quantityToDeduct;
      inventory[inventoryIndex].quantity = newQty;

      // Record the movement
      const movement: InventoryMovement = {
        id: `MOV-${Date.now()}-${index}`,
        itemName: saleItem.name,
        itemBatch: saleItem.batch || '',
        movementType: 'sale',
        quantity: quantityToDeduct, // Always in base units
        unitOfMeasure: saleItem.uomDisplayName || saleItem.unit || 'piece',
        conversionFactor: conversionFactor,
        actualQuantityMoved: actualQuantityMoved,
        reason: `Sale - Invoice ${transactionId}`,
        reference: transactionId,
        timestamp: new Date().toISOString(),
        performedBy: 'POS System'
      };

      movements.push(movement);

    } catch (error) {
      errors.push(`Error processing ${saleItem.name}: ${error}`);
      success = false;
    }
  });

  // Only save if all items were processed successfully
  if (success) {
    saveInventory(inventory);
    
    // Save movements
    const existingMovements = getInventoryMovements();
    saveInventoryMovements([...existingMovements, ...movements]);
  }

  return { success, errors, movements };
}

/**
 * Check stock availability for a sale item
 */
export function checkStockAvailability(saleItem: SaleItem): { 
  available: boolean; 
  currentStock: number; 
  requiredStock: number; 
  message: string 
} {
  const inventory = getInventory();
  
  const inventoryItem = inventory.find(inv => 
    inv.name === saleItem.name && 
    (saleItem.batch ? inv.batch === saleItem.batch : true)
  );

  if (!inventoryItem) {
    return {
      available: false,
      currentStock: 0,
      requiredStock: 0,
      message: `Item not found in inventory: ${saleItem.name}`
    };
  }

  const currentStock = typeof inventoryItem.quantity === 'number' ? inventoryItem.quantity : 0;
  
  // Calculate required stock in base units
  let requiredStock: number;
  if (saleItem.conversionFactor && saleItem.conversionFactor > 0 && typeof saleItem.quantity === 'number') {
    requiredStock = saleItem.quantity * saleItem.conversionFactor;
  } else {
    requiredStock = typeof saleItem.quantity === 'number' ? saleItem.quantity : 0;
  }

  const available = currentStock >= requiredStock;

  return {
    available,
    currentStock,
    requiredStock,
    message: available 
      ? `Stock available: ${currentStock} pieces` 
      : `Insufficient stock. Available: ${currentStock}, Required: ${requiredStock}`
  };
}

/**
 * Get low stock items
 */
export function getLowStockItems(): InventoryItem[] {
  const inventory = getInventory();
  return inventory.filter(item => {
    const qty = typeof item.quantity === 'number' ? item.quantity : 0;
    const reorderLevel = typeof item.reorderLevel === 'number' ? item.reorderLevel : 10;
    return qty <= reorderLevel;
  });
}

/**
 * Refresh inventory display (trigger re-render in other components)
 */
export function refreshInventoryDisplay(): void {
  window.dispatchEvent(new Event('storage'));
}