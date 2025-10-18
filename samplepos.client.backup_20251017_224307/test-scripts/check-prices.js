/**
 * POS Inventory Price Checker
 * 
 * This script checks all inventory items across different storage locations
 * and validates pricing information, highlighting potential issues.
 */

// Storage keys to check for inventory data
const STORAGE_KEYS = {
  INVENTORY: 'inventory_items',          // Primary inventory storage
  INVENTORY_PRODUCTS: 'inventory_products', // Secondary inventory storage
  INVENTORY_LEGACY: 'pos_inventory_v3'   // Legacy inventory format
};

function formatCurrency(amount) {
  if (amount === null || amount === undefined || amount === '') return 'Not set';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(+amount);
}

function checkInventoryStorage() {
  console.group('POS Inventory Price Check');
  
  // Check all possible inventory storage locations
  const inventorySources = [
    { key: STORAGE_KEYS.INVENTORY, name: 'Primary Inventory' },
    { key: STORAGE_KEYS.INVENTORY_PRODUCTS, name: 'Product Inventory' },
    { key: STORAGE_KEYS.INVENTORY_LEGACY, name: 'Legacy Inventory' }
  ];
  
  let foundInventory = false;
  let combinedItems = [];
  
  // Process each inventory source
  inventorySources.forEach(source => {
    try {
      const rawData = localStorage.getItem(source.key);
      
      if (!rawData) {
        console.log(`❌ ${source.name}: No data found in ${source.key}`);
        return;
      }
      
      const data = JSON.parse(rawData);
      
      if (!Array.isArray(data) || data.length === 0) {
        console.log(`⚠️ ${source.name}: Empty or invalid data format in ${source.key}`);
        return;
      }
      
      foundInventory = true;
      combinedItems = combinedItems.concat(data.map(item => ({ ...item, source: source.name })));
      
      console.group(`✅ ${source.name} (${data.length} items)`);
      console.log('Sample items:', data.slice(0, 2));
      
      // Price analysis
      const itemsWithPrice = data.filter(item => 
        item.price !== undefined && item.price !== null && item.price !== '');
      
      console.log(`Items with price defined: ${itemsWithPrice.length} (${Math.round(itemsWithPrice.length/data.length*100)}%)`);
      
      if (itemsWithPrice.length > 0) {
        // Convert prices to numbers to ensure correct calculation
        const prices = itemsWithPrice.map(i => typeof i.price === 'number' ? i.price : +i.price);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
        
        console.log(`Price range: ${formatCurrency(minPrice)} to ${formatCurrency(maxPrice)}`);
        console.log(`Average price: ${formatCurrency(avgPrice)}`);
        console.log('Sample price values:', itemsWithPrice.slice(0, 5).map(i => formatCurrency(i.price)));
      }
      
      // Cost price analysis
      const itemsWithCost = data.filter(item => 
        item.costPrice !== undefined && item.costPrice !== null && item.costPrice !== '');
      
      console.log(`Items with cost price defined: ${itemsWithCost.length} (${Math.round(itemsWithCost.length/data.length*100)}%)`);
      
      if (itemsWithCost.length > 0 && itemsWithPrice.length > 0) {
        const itemsWithBoth = data.filter(item => 
          item.price !== undefined && item.price !== null && item.price !== '' &&
          item.costPrice !== undefined && item.costPrice !== null && item.costPrice !== ''
        );
        
        // Calculate markup percentages
        if (itemsWithBoth.length > 0) {
          const markups = itemsWithBoth.map(item => {
            const cost = typeof item.costPrice === 'number' ? item.costPrice : +item.costPrice;
            const price = typeof item.price === 'number' ? item.price : +item.price;
            return cost > 0 ? (price - cost) / cost * 100 : 0;
          });
          
          const avgMarkup = markups.reduce((sum, markup) => sum + markup, 0) / markups.length;
          const minMarkup = Math.min(...markups);
          const maxMarkup = Math.max(...markups);
          
          console.log(`Average markup: ${avgMarkup.toFixed(2)}%`);
          console.log(`Markup range: ${minMarkup.toFixed(2)}% to ${maxMarkup.toFixed(2)}%`);
          
          // Highlight potential pricing issues
          const potentialIssues = itemsWithBoth.filter(item => {
            const cost = typeof item.costPrice === 'number' ? item.costPrice : +item.costPrice;
            const price = typeof item.price === 'number' ? item.price : +item.price;
            return price <= cost; // Selling at cost or loss
          });
          
          if (potentialIssues.length > 0) {
            console.warn(`⚠️ Found ${potentialIssues.length} items with price <= cost:`);
            console.table(potentialIssues.map(item => ({
              name: item.name,
              cost: formatCurrency(item.costPrice),
              price: formatCurrency(item.price),
              profit: formatCurrency(item.price - item.costPrice),
              markup: ((item.price / item.costPrice - 1) * 100).toFixed(2) + '%'
            })));
          }
        }
      }
      
      console.groupEnd();
    } catch (e) {
      console.error(`Error checking ${source.name}:`, e);
    }
  });
  
  if (!foundInventory) {
    console.warn('❌ No inventory data found in any storage location');
  } else {
    // Analyze combined inventory
    console.group('Overall Inventory Analysis');
    console.log(`Total unique items found: ${combinedItems.length}`);
    
    // Check for duplicate product names across storages
    const nameCount = {};
    combinedItems.forEach(item => {
      if (item.name) {
        nameCount[item.name] = (nameCount[item.name] || 0) + 1;
      }
    });
    
    const duplicates = Object.entries(nameCount)
      .filter(([name, count]) => count > 1)
      .map(([name, count]) => ({ name, count }));
    
    if (duplicates.length > 0) {
      console.warn(`⚠️ Found ${duplicates.length} products with duplicate names across storage locations:`);
      console.table(duplicates);
    }
    
    // Price consistency check across storages
    const nameToPrice = {};
    combinedItems.forEach(item => {
      if (item.name && (item.price !== undefined && item.price !== null && item.price !== '')) {
        if (!nameToPrice[item.name]) {
          nameToPrice[item.name] = [];
        }
        nameToPrice[item.name].push({ 
          price: typeof item.price === 'number' ? item.price : +item.price, 
          source: item.source 
        });
      }
    });
    
    const inconsistentPrices = Object.entries(nameToPrice)
      .filter(([name, prices]) => {
        if (prices.length <= 1) return false;
        const firstPrice = prices[0].price;
        return prices.some(p => p.price !== firstPrice);
      })
      .map(([name, prices]) => ({ 
        name, 
        priceCount: prices.length,
        prices: prices.map(p => `${formatCurrency(p.price)} (${p.source})`) 
      }));
    
    if (inconsistentPrices.length > 0) {
      console.warn(`⚠️ Found ${inconsistentPrices.length} products with inconsistent prices across storage locations:`);
      console.table(inconsistentPrices);
    }
    
    console.groupEnd();
  }
  
  console.groupEnd();
  return foundInventory;
}

// Auto-execute on script load
const result = checkInventoryStorage();
console.log(`Price check completed. Inventory data found: ${result}`);
