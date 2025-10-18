// Add this to the component to debug the product loading issue
import { useEffect } from 'react';
import { getInventory } from '../services/InventoryService';
import { STORAGE_KEYS } from '../services/UnifiedDataService';

export function useInventoryDebugger() {
  useEffect(() => {
    console.log('Running inventory debugger');
    
    // Check direct localStorage access
    const directInventoryItems = localStorage.getItem(STORAGE_KEYS.INVENTORY);
    console.log(`Direct localStorage ${STORAGE_KEYS.INVENTORY}:`, directInventoryItems ? JSON.parse(directInventoryItems).length : 'Not found');
    
    const directInventoryProducts = localStorage.getItem(STORAGE_KEYS.INVENTORY_PRODUCTS); 
    console.log(`Direct localStorage ${STORAGE_KEYS.INVENTORY_PRODUCTS}:`, directInventoryProducts ? JSON.parse(directInventoryProducts).length : 'Not found');
    
    const directPosInventory = localStorage.getItem(STORAGE_KEYS.INVENTORY_LEGACY);
    console.log(`Direct localStorage ${STORAGE_KEYS.INVENTORY_LEGACY}:`, directPosInventory ? JSON.parse(directPosInventory).length : 'Not found');
    
    // Test getInventory function
    const inventory = getInventory();
    console.log('getInventory() returned:', inventory.length, 'items');
    if (inventory.length > 0) {
      console.log('Sample item from getInventory():', inventory[0]);
    }
    
    // Add create sample function
    window.createSampleInventory = () => {
      const sampleData = [
        {
          id: 'sample-001',
          name: 'Coca-Cola 500ml',
          sku: 'COKE-500',
          price: 1.50,
          quantity: 48,
          unit: 'bottle',
          batch: 'BATCH-001',
          category: 'Beverages',
          hasExpiry: true
        },
        {
          id: 'sample-002',
          name: 'Bread White Loaf',
          sku: 'BREAD-WHT',
          price: 2.25,
          quantity: 24,
          unit: 'loaf',
          batch: 'BATCH-002',
          category: 'Bakery',
          hasExpiry: true
        },
        {
          id: 'sample-003',
          name: 'Milk Whole 1L',
          sku: 'MILK-1L',
          price: 3.99,
          quantity: 36,
          unit: 'carton',
          batch: 'BATCH-003',
          category: 'Dairy',
          hasExpiry: true
        }
      ];
      
      localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(sampleData));
      console.log(`Created sample inventory with ${sampleData.length} items in ${STORAGE_KEYS.INVENTORY}`);
      
      // Dispatch storage event to update components
      window.dispatchEvent(new Event('storage'));
      
      return 'Sample inventory created successfully!';
    };
    
    console.log('Inventory debugger complete. Type createSampleInventory() in console to add sample data.');
  }, []);
  
  return null;
}
