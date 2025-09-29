/**
 * Unified Data Service for POS Application
 * This service provides consistent data management across all components
 */

// Standard localStorage keys used across the application
export const STORAGE_KEYS = {
  // Core data
  TRANSACTIONS: 'pos_transaction_history_v1',
  INVENTORY: 'inventory_items',
  INVENTORY_MOVEMENTS: 'inventory_movements',
  INVENTORY_HISTORY: 'inventory_history',
  
  // Customer data
  CUSTOMERS: 'pos_customers',
  CUSTOMER_LEDGER: 'pos_ledger',
  
  // Payment data
  SCHEDULED_PAYMENTS: 'pos_scheduled_payments',
  INSTALLMENT_PLANS: 'installmentPlans',
  
  // Settings
  SETTINGS: 'pos_settings',
  THEME: 'theme',
} as const;

// Type definitions
export interface SaleItem {
  id?: string;
  name: string;
  price: number;
  quantity: number;
  batch?: string;
  uom?: string;
  uomName?: string;
  conversionFactor?: number;
}

export interface SaleRecord {
  id: string;
  invoiceNumber: string;
  timestamp: string;
  customer: string;
  cart: SaleItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  change: number;
  outstanding: number;
  status: 'PAID' | 'PARTIAL' | 'OVERPAID';
  payments: PaymentDetail[];
  paymentType: string;
  note?: string;
}

export interface PaymentDetail {
  amount: number;
  method: string;
  reference: string;
  note?: string;
  timestamp: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
  sku?: string;
  barcode?: string;
  costPrice?: number;
  batch?: string;
  expiry?: string;
  hasExpiry?: boolean;
  reorderLevel?: number;
  supplier?: string;
  unitOfMeasures?: UnitOfMeasure[];
}

export interface UnitOfMeasure {
  id: string;
  name: string;
  abbreviation: string;
  conversionFactor: number;
  price?: number;
  isBase: boolean;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  balance: number;
  creditLimit: number;
  status: 'active' | 'inactive';
}

export interface LedgerEntry {
  id: string;
  customer: string;
  date: string;
  amount: number;
  type: 'credit' | 'debit';
  note: string;
  balance: number;
  category?: string;
  paymentMethod?: string;
  status?: string;
  dueDate?: string;
}

/**
 * Generic localStorage operations with error handling
 */
class StorageService {
  static get<T>(key: string, defaultValue: T): T {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return defaultValue;
      return JSON.parse(stored);
    } catch (error) {
      console.error(`Error loading ${key}:`, error);
      return defaultValue;
    }
  }

  static set<T>(key: string, value: T): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      // Dispatch storage event to notify other components
      window.dispatchEvent(new Event('storage'));
      return true;
    } catch (error) {
      console.error(`Error saving ${key}:`, error);
      return false;
    }
  }

  static remove(key: string): boolean {
    try {
      localStorage.removeItem(key);
      window.dispatchEvent(new Event('storage'));
      return true;
    } catch (error) {
      console.error(`Error removing ${key}:`, error);
      return false;
    }
  }
}

/**
 * Transaction Management Service
 */
export class TransactionService {
  static getAll(): SaleRecord[] {
    return StorageService.get(STORAGE_KEYS.TRANSACTIONS, []);
  }

  static save(transaction: SaleRecord): boolean {
    const transactions = this.getAll();
    const existingIndex = transactions.findIndex(t => t.id === transaction.id);
    
    if (existingIndex >= 0) {
      transactions[existingIndex] = transaction;
    } else {
      transactions.push(transaction);
    }
    
    return StorageService.set(STORAGE_KEYS.TRANSACTIONS, transactions);
  }

  static getById(id: string): SaleRecord | undefined {
    return this.getAll().find(t => t.id === id);
  }

  static delete(id: string): boolean {
    const transactions = this.getAll().filter(t => t.id !== id);
    return StorageService.set(STORAGE_KEYS.TRANSACTIONS, transactions);
  }

  static getByDateRange(from: Date, to: Date): SaleRecord[] {
    return this.getAll().filter(t => {
      const transactionDate = new Date(t.timestamp);
      return transactionDate >= from && transactionDate <= to;
    });
  }

  static getTotalRevenue(transactions: SaleRecord[] = this.getAll()): number {
    return transactions.reduce((sum, t) => sum + t.paid, 0);
  }

  static getOutstandingAmount(transactions: SaleRecord[] = this.getAll()): number {
    return transactions.reduce((sum, t) => sum + t.outstanding, 0);
  }
}

/**
 * Inventory Management Service
 */
export class InventoryService {
  static getAll(): InventoryItem[] {
    return StorageService.get(STORAGE_KEYS.INVENTORY, []);
  }

  static save(inventory: InventoryItem[]): boolean {
    return StorageService.set(STORAGE_KEYS.INVENTORY, inventory);
  }

  static getById(id: string): InventoryItem | undefined {
    return this.getAll().find(item => item.id === id);
  }

  static addItem(item: InventoryItem): boolean {
    const inventory = this.getAll();
    inventory.push(item);
    return this.save(inventory);
  }

  static updateItem(id: string, updates: Partial<InventoryItem>): boolean {
    const inventory = this.getAll();
    const index = inventory.findIndex(item => item.id === id);
    
    if (index >= 0) {
      inventory[index] = { ...inventory[index], ...updates };
      return this.save(inventory);
    }
    return false;
  }

  static deleteItem(id: string): boolean {
    const inventory = this.getAll().filter(item => item.id !== id);
    return this.save(inventory);
  }

  static getLowStockItems(threshold?: number): InventoryItem[] {
    return this.getAll().filter(item => {
      const reorderLevel = threshold || item.reorderLevel || 10;
      return item.quantity <= reorderLevel;
    });
  }

  static getExpiringItems(days: number = 30): InventoryItem[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + days);
    
    return this.getAll().filter(item => {
      if (!item.hasExpiry || !item.expiry) return false;
      return new Date(item.expiry) <= cutoffDate;
    });
  }

  static getTotalValue(): number {
    return this.getAll().reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }
}

/**
 * Customer Management Service
 */
export class CustomerService {
  static getAll(): Customer[] {
    return StorageService.get(STORAGE_KEYS.CUSTOMERS, []);
  }

  static save(customers: Customer[]): boolean {
    return StorageService.set(STORAGE_KEYS.CUSTOMERS, customers);
  }

  static getById(id: string): Customer | undefined {
    return this.getAll().find(c => c.id === id);
  }

  static getByName(name: string): Customer | undefined {
    return this.getAll().find(c => c.name.toLowerCase() === name.toLowerCase());
  }

  static addCustomer(customer: Customer): boolean {
    const customers = this.getAll();
    customers.push(customer);
    return this.save(customers);
  }

  static updateCustomer(id: string, updates: Partial<Customer>): boolean {
    const customers = this.getAll();
    const index = customers.findIndex(c => c.id === id);
    
    if (index >= 0) {
      customers[index] = { ...customers[index], ...updates };
      return this.save(customers);
    }
    return false;
  }

  static updateBalance(customerId: string, amount: number): boolean {
    return this.updateCustomer(customerId, { 
      balance: (this.getById(customerId)?.balance || 0) + amount 
    });
  }
}

/**
 * Ledger Management Service
 */
export class LedgerService {
  static getAll(): LedgerEntry[] {
    return StorageService.get(STORAGE_KEYS.CUSTOMER_LEDGER, []);
  }

  static save(entries: LedgerEntry[]): boolean {
    return StorageService.set(STORAGE_KEYS.CUSTOMER_LEDGER, entries);
  }

  static addEntry(entry: LedgerEntry): boolean {
    const entries = this.getAll();
    entries.push(entry);
    return this.save(entries);
  }

  static getByCustomer(customerName: string): LedgerEntry[] {
    return this.getAll().filter(entry => entry.customer === customerName);
  }

  static getBalance(customerName: string): number {
    return this.getByCustomer(customerName)
      .reduce((sum, entry) => {
        return entry.type === 'credit' ? sum + entry.amount : sum - entry.amount;
      }, 0);
  }
}

/**
 * Application State Service
 * Manages cross-component notifications and events
 */
export class AppStateService {
  private static listeners: Map<string, Function[]> = new Map();

  static subscribe(event: string, callback: Function): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  static emit(event: string, data?: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  // Predefined events
  static onTransactionAdded(callback: (transaction: SaleRecord) => void) {
    return this.subscribe('transaction:added', callback);
  }

  static onInventoryUpdated(callback: (items: InventoryItem[]) => void) {
    return this.subscribe('inventory:updated', callback);
  }

  static onCustomerUpdated(callback: (customer: Customer) => void) {
    return this.subscribe('customer:updated', callback);
  }

  static emitTransactionAdded(transaction: SaleRecord): void {
    this.emit('transaction:added', transaction);
  }

  static emitInventoryUpdated(items: InventoryItem[]): void {
    this.emit('inventory:updated', items);
  }

  static emitCustomerUpdated(customer: Customer): void {
    this.emit('customer:updated', customer);
  }
}

/**
 * Data Synchronization Service
 * Ensures all components stay in sync with localStorage changes
 */
export class SyncService {
  static setupGlobalSync(): void {
    // Listen for localStorage changes from other tabs/windows
    window.addEventListener('storage', (e) => {
      if (e.key && Object.values(STORAGE_KEYS).includes(e.key as any)) {
        console.log(`Data sync: ${e.key} changed`);
        
        // Emit specific events based on the changed key
        switch (e.key) {
          case STORAGE_KEYS.TRANSACTIONS:
            AppStateService.emit('storage:transactions');
            break;
          case STORAGE_KEYS.INVENTORY:
            AppStateService.emit('storage:inventory');
            break;
          case STORAGE_KEYS.CUSTOMERS:
            AppStateService.emit('storage:customers');
            break;
          case STORAGE_KEYS.CUSTOMER_LEDGER:
            AppStateService.emit('storage:ledger');
            break;
        }
      }
    });
  }
}

// Initialize sync service when module loads
SyncService.setupGlobalSync();