import React from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { saveInventory } from '../services/InventoryService';
import { STORAGE_KEYS } from '../services/UnifiedDataService';
import { migrateInventoryData, standardizeInventoryStorage } from '../utils/dataStorageMigration';

export const InventoryDebugPanel: React.FC = () => {
  const createSampleInventory = () => {
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
      },
      {
        id: 'sample-004',
        name: 'Bananas',
        sku: 'BANANA',
        price: 0.99,
        quantity: 120,
        unit: 'piece',
        batch: 'BATCH-004',
        category: 'Produce',
        hasExpiry: true
      },
      {
        id: 'sample-005',
        name: 'Rice Jasmine 5kg',
        sku: 'RICE-5KG',
        price: 12.50,
        quantity: 15,
        unit: 'bag',
        batch: 'BATCH-005',
        category: 'Grains',
        hasExpiry: false
      }
    ];
    
    // Save to localStorage using the proper service function
    saveInventory(sampleData);
    
    // Show confirmation
    alert('Created sample inventory items!');
  };
  
  const checkInventory = () => {
    const items = localStorage.getItem(STORAGE_KEYS.INVENTORY);
    const products = localStorage.getItem(STORAGE_KEYS.INVENTORY_PRODUCTS);
    const posInv = localStorage.getItem(STORAGE_KEYS.INVENTORY_LEGACY);
    
    const itemsCount = items ? JSON.parse(items).length : 0;
    const productsCount = products ? JSON.parse(products).length : 0;
    const posInvCount = posInv ? JSON.parse(posInv).length : 0;
    
    alert(`Inventory check:
- ${STORAGE_KEYS.INVENTORY}: ${itemsCount} items
- ${STORAGE_KEYS.INVENTORY_PRODUCTS}: ${productsCount} items
- ${STORAGE_KEYS.INVENTORY_LEGACY}: ${posInvCount} items`);
  };
  
  const clearInventory = () => {
    if (confirm('Are you sure you want to clear all inventory data? This cannot be undone.')) {
      localStorage.removeItem(STORAGE_KEYS.INVENTORY);
      localStorage.removeItem(STORAGE_KEYS.INVENTORY_PRODUCTS);
      localStorage.removeItem(STORAGE_KEYS.INVENTORY_LEGACY);
      
      // Dispatch storage event
      window.dispatchEvent(new Event('storage'));
      
      alert('All inventory data has been cleared.');
    }
  };
  
  const migrateData = () => {
    const result = migrateInventoryData();
    if (result.migrated) {
      alert(`✅ Successfully migrated inventory data!\n\nSource: ${result.source}\nItems: ${result.count}\n\n${result.message}`);
    } else {
      alert(`ℹ️ ${result.message}`);
    }
  };

  const standardizeStorage = () => {
    const result = standardizeInventoryStorage();
    alert(result.success ? `✅ ${result.message}` : `⚠️ ${result.message}`);
  };

  return (
    <Card className="my-4">
      <CardHeader>
        <CardTitle>Inventory Debug Tools</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={createSampleInventory}>
            Create Sample Inventory
          </Button>
          <Button variant="outline" onClick={checkInventory}>
            Check Inventory Storage
          </Button>
          <Button variant="outline" onClick={migrateData}>
            Migrate Inventory Data
          </Button>
          <Button variant="outline" onClick={standardizeStorage}>
            Standardize Storage Keys
          </Button>
          <Button variant="outline" onClick={clearInventory} className="text-red-500">
            Clear All Inventory
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
