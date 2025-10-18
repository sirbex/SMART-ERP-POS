/**
 * IMMEDIATE DATA CLEARING - Run this in browser console NOW
 * 
 * Instructions:
 * 1. Open your browser Developer Tools (F12)
 * 2. Go to Console tab
 * 3. Copy and paste this entire script
 * 4. Press Enter
 */

console.log('🧹 IMMEDIATE POS DATA CLEARING...');

// All localStorage keys used by POS components
const allPOSKeys = [
  // Dashboard keys (these are what's showing old data)
  'pos_transaction_history_v1',
  'pos_inventory_v1',
  
  // Inventory
  'inventory_items',
  'inventory_movements', 
  'inventory_history',
  'simple_inventory_items',
  
  // Transactions & Sales
  'transaction_history',
  'pos_sales',
  'sale_records',
  'receipts',
  'invoices',
  
  // Payments (these weren't being cleared before)
  'pos_scheduled_payments',
  'payment_schedules',
  'split_payments',
  'installmentPlans',
  
  // Customers
  'pos_customers',
  'pos_ledger',
  'customer_ledger',
  'accounts_receivable',
  'customer_balances',
  
  // Reports & Analytics
  'pos_reports',
  'pos_analytics',
  
  // Settings
  'pos_settings',
  'app_settings',
  'user_preferences',
  
  // Sample data
  'sample_inventory',
  'demo_transactions',
  'test_data'
];

console.log('Clearing', allPOSKeys.length, 'specific POS keys...');

// Clear each specific key
allPOSKeys.forEach(key => {
  if (localStorage.getItem(key)) {
    console.log('✓ Cleared:', key);
    localStorage.removeItem(key);
  }
});

// Clear any remaining POS-related keys
let additionalCleared = 0;
Object.keys(localStorage).forEach(key => {
  const keyLower = key.toLowerCase();
  if (keyLower.includes('pos') || keyLower.includes('sample') || 
      keyLower.includes('demo') || keyLower.includes('test') ||
      keyLower.includes('transaction') || keyLower.includes('payment')) {
    console.log('✓ Additional cleared:', key);
    localStorage.removeItem(key);
    additionalCleared++;
  }
});

// Clear session storage
sessionStorage.clear();
console.log('✓ Cleared sessionStorage');

console.log('🎯 SUMMARY:');
console.log('- Cleared', allPOSKeys.length, 'standard POS keys');
console.log('- Cleared', additionalCleared, 'additional POS-related keys');
console.log('- Cleared sessionStorage');

console.log('✅ ALL POS DATA CLEARED!');
console.log('🔄 Reloading in 2 seconds...');

// Reload the page
setTimeout(() => {
  window.location.reload();
}, 2000);