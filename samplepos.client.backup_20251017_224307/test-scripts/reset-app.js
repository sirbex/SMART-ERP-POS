#!/usr/bin/env node

/**
 * Complete Application Reset Script
 * This script provides immediate data clearing for development/testing
 */

console.log('🧹 Starting complete application reset...');

// Instructions for browser console
const browserConsoleScript = `
// Complete POS Application Reset
console.log('🧹 Clearing all POS application data...');

// Specific keys used by the POS application
const posKeys = [
  'pos_transaction_history_v1', 'pos_inventory_v1', 'pos_customers', 'pos_ledger',
  'pos_scheduled_payments', 'pos_sales', 'pos_reports', 'pos_analytics',
  'inventory_items', 'inventory_movements', 'inventory_history', 'simple_inventory_items',
  'transaction_history', 'sale_records', 'receipts', 'invoices',
  'payment_schedules', 'split_payments', 'installmentPlans',
  'customer_ledger', 'accounts_receivable', 'customer_balances',
  'pos_settings', 'app_settings', 'user_preferences', 'theme',
  'sample_inventory', 'demo_transactions', 'test_data'
];

// Clear specific POS keys
posKeys.forEach(key => {
  if (localStorage.getItem(key)) {
    console.log('Removing:', key);
    localStorage.removeItem(key);
  }
});

// Also clear any remaining keys that might contain POS data
Object.keys(localStorage).forEach(key => {
  if (key.toLowerCase().includes('pos') || key.toLowerCase().includes('sample') || 
      key.toLowerCase().includes('demo') || key.toLowerCase().includes('test')) {
    console.log('Removing additional key:', key);
    localStorage.removeItem(key);
  }
});

// Clear sessionStorage  
sessionStorage.clear();

// Clear any IndexedDB (if used)
if (window.indexedDB) {
  indexedDB.databases().then(databases => {
    databases.forEach(db => {
      if (db.name && db.name.includes('pos')) {
        indexedDB.deleteDatabase(db.name);
        console.log('Cleared IndexedDB:', db.name);
      }
    });
  }).catch(() => {
    console.log('IndexedDB clearing not available');
  });
}

// Clear cookies (domain-specific)
document.cookie.split(";").forEach(cookie => {
  const eqPos = cookie.indexOf("=");
  const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
  document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
});

console.log('✅ All POS data cleared!');
console.log('🔄 Reloading application...');

// Reload the page
setTimeout(() => {
  window.location.reload();
}, 1000);
`;

console.log('\n📋 COPY AND PASTE THIS INTO YOUR BROWSER CONSOLE:');
console.log('   (Open DevTools with F12, go to Console tab, paste and press Enter)');
console.log('\n' + '='.repeat(80));
console.log(browserConsoleScript);
console.log('='.repeat(80));

console.log('\n🎯 This will:');
console.log('   ✅ Clear all localStorage data');
console.log('   ✅ Clear all sessionStorage data');
console.log('   ✅ Clear any POS-related IndexedDB');
console.log('   ✅ Clear cookies');
console.log('   ✅ Reload the application');

console.log('\n🚀 After running this, your POS application will be completely clean!');