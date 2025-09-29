import type { InventoryItem } from '../models/InventoryItem';

/**
 * Sample inventory items with UoM configurations for testing the POS system
 */

export const sampleInventoryWithUoM: InventoryItem[] = [
  {
    id: 'sample-cookies-001',
    name: 'Chocolate Chip Cookies',
    batch: 'COOK-2024-001',
    hasExpiry: true,
    expiry: '2024-06-15',
    quantity: 240, // 240 pieces total
    unit: 'piece',
    baseUomId: 'piece',
    defaultUomId: 'piece',
    price: 1.50, // Base price per piece
    uomOptions: [
      {
        uomId: 'piece',
        price: 1.50,
        isDefault: true,
        conversionFactor: 1,
        barcode: '123456789012'
      },
      {
        uomId: 'half-dozen',
        price: 8.00, // Slight discount for half dozen
        isDefault: false,
        conversionFactor: 6,
        barcode: '123456789013'
      },
      {
        uomId: 'dozen',
        price: 15.00, // Better discount for dozen
        isDefault: false,
        conversionFactor: 12,
        barcode: '123456789014'
      },
      {
        uomId: 'box',
        price: 30.00, // Best price for full box (24 pieces)
        isDefault: false,
        conversionFactor: 24,
        barcode: '123456789015'
      }
    ],
    category: 'Bakery',
    sku: 'COOK-CC-001'
  },
  {
    id: 'sample-apples-002',
    name: 'Red Apples',
    batch: 'APPLE-2024-002',
    hasExpiry: true,
    expiry: '2024-02-28',
    quantity: 150, // 150 pieces
    unit: 'piece',
    baseUomId: 'piece',
    defaultUomId: 'piece', 
    price: 0.75, // Base price per piece
    uomOptions: [
      {
        uomId: 'piece',
        price: 0.75,
        isDefault: true,
        conversionFactor: 1
      },
      {
        uomId: 'half-dozen',
        price: 4.00, // Slight discount
        isDefault: false,
        conversionFactor: 6
      },
      {
        uomId: 'dozen',
        price: 7.50, // Better discount
        isDefault: false,
        conversionFactor: 12
      },
      {
        uomId: 'box',
        price: 14.00, // Box of 20 apples
        isDefault: false,
        conversionFactor: 20
      },
      {
        uomId: 'half-box',
        price: 7.50, // Half box of 10 apples
        isDefault: false,
        conversionFactor: 10
      }
    ],
    category: 'Produce',
    sku: 'APPLE-RED-002'
  },
  {
    id: 'sample-bread-003',
    name: 'White Bread Loaves',
    batch: 'BREAD-2024-003',
    hasExpiry: true,
    expiry: '2024-02-20',
    quantity: 48, // 48 loaves
    unit: 'loaf',
    baseUomId: 'piece',
    defaultUomId: 'piece',
    price: 2.50, // Base price per loaf
    uomOptions: [
      {
        uomId: 'piece',
        price: 2.50,
        isDefault: true,
        conversionFactor: 1
      },
      {
        uomId: 'half-dozen',
        price: 14.00, // Small discount for 6 loaves
        isDefault: false,
        conversionFactor: 6
      },
      {
        uomId: 'dozen',
        price: 26.00, // Better discount for 12 loaves
        isDefault: false,
        conversionFactor: 12
      },
      {
        uomId: 'box',
        price: 48.00, // Case of 24 loaves - wholesale price
        isDefault: false,
        conversionFactor: 24
      }
    ],
    category: 'Bakery',
    sku: 'BREAD-WHITE-003'
  },
  {
    id: 'sample-milk-004',
    name: 'Fresh Milk Bottles',
    batch: 'MILK-2024-004',
    hasExpiry: true,
    expiry: '2024-02-25',
    quantity: 72, // 72 bottles
    unit: 'bottle',
    baseUomId: 'piece',
    defaultUomId: 'piece',
    price: 3.00, // Base price per bottle
    uomOptions: [
      {
        uomId: 'piece',
        price: 3.00,
        isDefault: true,
        conversionFactor: 1
      },
      {
        uomId: 'half-dozen',
        price: 16.50, // Small discount
        isDefault: false,
        conversionFactor: 6
      },
      {
        uomId: 'dozen',
        price: 32.00, // Better discount
        isDefault: false,
        conversionFactor: 12
      },
      {
        uomId: 'box',
        price: 60.00, // Case of 24 bottles
        isDefault: false,
        conversionFactor: 24
      },
      {
        uomId: 'half-box',
        price: 33.00, // Half case of 12 bottles
        isDefault: false,
        conversionFactor: 12
      }
    ],
    category: 'Dairy',
    sku: 'MILK-FRESH-004'
  },
  {
    id: 'sample-simple-001',
    name: 'Basic Item (No UoM)',
    batch: 'BASIC-2024-001',
    hasExpiry: false,
    quantity: 100,
    unit: 'piece',
    price: 5.00,
    // No uomOptions - should use direct cart addition
    category: 'General',
    sku: 'BASIC-001'
  }
];

/**
 * Add sample inventory items to localStorage
 */
export function seedSampleInventoryWithUoM(): void {
  try {
    // Get existing inventory
    const existingInventory = localStorage.getItem('inventory_items');
    const currentItems: InventoryItem[] = existingInventory ? JSON.parse(existingInventory) : [];
    
    // Check if sample items already exist (to avoid duplicates)
    const sampleIds = sampleInventoryWithUoM.map(item => item.id);
    const existingIds = currentItems.map(item => item.id).filter(Boolean);
    const hasAnySampleItems = sampleIds.some(id => existingIds.includes(id));
    
    if (hasAnySampleItems) {
      console.log('Sample UoM inventory already exists, skipping seed operation');
      return;
    }
    
    // Add sample items to existing inventory
    const updatedInventory = [...currentItems, ...sampleInventoryWithUoM];
    
    // Save to localStorage
    localStorage.setItem('inventory_items', JSON.stringify(updatedInventory));
    
    console.log(`Added ${sampleInventoryWithUoM.length} sample items with UoM configurations to inventory`);
  } catch (error) {
    console.error('Failed to seed sample inventory:', error);
  }
}

/**
 * Remove sample inventory items from localStorage
 */
export function removeSampleInventoryWithUoM(): void {
  try {
    const existingInventory = localStorage.getItem('inventory_items');
    if (!existingInventory) return;
    
    const currentItems: InventoryItem[] = JSON.parse(existingInventory);
    const sampleIds = sampleInventoryWithUoM.map(item => item.id);
    
    // Filter out sample items
    const filteredItems = currentItems.filter(item => !sampleIds.includes(item.id));
    
    localStorage.setItem('inventory_items', JSON.stringify(filteredItems));
    console.log('Removed sample UoM inventory items');
  } catch (error) {
    console.error('Failed to remove sample inventory:', error);
  }
}

/**
 * Check if sample inventory items exist
 */
export function hasSampleInventoryWithUoM(): boolean {
  try {
    const existingInventory = localStorage.getItem('inventory_items');
    if (!existingInventory) return false;
    
    const currentItems: InventoryItem[] = JSON.parse(existingInventory);
    const sampleIds = sampleInventoryWithUoM.map(item => item.id);
    const existingIds = currentItems.map(item => item.id).filter(Boolean);
    
    return sampleIds.some(id => existingIds.includes(id));
  } catch (error) {
    console.error('Failed to check sample inventory:', error);
    return false;
  }
}