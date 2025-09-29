/**
 * Utility functions for resetting application data
 */

/**
 * Clear all application data from localStorage
 * This removes all inventory, transactions, customers, and other stored data
 */
export function clearAllApplicationData(): void {
  try {
    // List of all localStorage keys used by the application
    const keysToRemove = [
      'inventory_items',
      'inventory_movements', 
      'inventory_history',
      'transaction_history',
      'customer_ledger',
      'simple_inventory_items',
      'payment_schedules',
      'split_payments',
      'accounts_receivable',
      'customer_balances',
      'pos_settings',
      'app_settings'
    ];
    
    // Remove each key
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });
    
    // Dispatch storage events to notify all components
    window.dispatchEvent(new Event('storage'));
    
    console.log('All application data cleared successfully');
    
    // Show user confirmation
    alert('All application data has been cleared successfully. The page will reload.');
    
    // Reload the page to refresh all components
    window.location.reload();
    
  } catch (error) {
    console.error('Error clearing application data:', error);
    alert('There was an error clearing the data. Please try again.');
  }
}

/**
 * Clear only inventory-related data
 */
export function clearInventoryData(): void {
  try {
    localStorage.removeItem('inventory_items');
    localStorage.removeItem('inventory_movements');
    localStorage.removeItem('inventory_history');
    localStorage.removeItem('simple_inventory_items');
    
    // Dispatch storage events to notify components
    window.dispatchEvent(new Event('storage'));
    
    console.log('Inventory data cleared successfully');
    
  } catch (error) {
    console.error('Error clearing inventory data:', error);
  }
}

/**
 * Clear only transaction/sales data
 */
export function clearTransactionData(): void {
  try {
    localStorage.removeItem('transaction_history');
    localStorage.removeItem('payment_schedules');
    localStorage.removeItem('split_payments');
    
    // Dispatch storage events to notify components
    window.dispatchEvent(new Event('storage'));
    
    console.log('Transaction data cleared successfully');
    
  } catch (error) {
    console.error('Error clearing transaction data:', error);
  }
}

/**
 * Clear only customer data
 */
export function clearCustomerData(): void {
  try {
    localStorage.removeItem('customer_ledger');
    localStorage.removeItem('accounts_receivable');
    localStorage.removeItem('customer_balances');
    
    // Dispatch storage events to notify components
    window.dispatchEvent(new Event('storage'));
    
    console.log('Customer data cleared successfully');
    
  } catch (error) {
    console.error('Error clearing customer data:', error);
  }
}