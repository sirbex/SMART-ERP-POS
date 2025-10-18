/**
 * POS System Type Definitions
 */

/**
 * Represents an item being sold in a transaction
 */
export interface SaleItem {
  id?: string;
  name: string;
  sku?: string;
  price: number;
  quantity: number;
  unit?: string;
  uomDisplayName?: string; // Human-readable unit name (e.g., "Kilogram", "Box")
  conversionFactor?: number; // Factor to convert to base unit
  discount?: number;
  subtotal?: number;
  tax?: number;
  total?: number;
  notes?: string;
  productId?: string;
  costPrice?: number;
}

/**
 * Represents a transaction in the POS system
 */
export interface Transaction {
  id: string;
  items: SaleItem[];
  subtotal: number;
  tax: number;
  discount?: number;
  total: number;
  paymentMethod: string;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  voided?: boolean;           // Added: flag to indicate if transaction has been voided
  amountPaid?: number;
  change?: number;
  customerId?: string;
  customerName?: string;
  timestamp: string;
  notes?: string;
  createdBy?: string;
  metadata?: Record<string, any>;
}

/**
 * Represents a customer in the POS system
 */
export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  balance?: number;
  loyaltyDiscount?: number;    // Added: loyalty discount percentage for customer
  lastPurchaseDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Represents a customer payment
 */
export interface Payment {
  id: string;
  customerId: string;
  amount: number;
  paymentMethod: string;
  transactionId?: string;
  timestamp: string;
  notes?: string;
}

/**
 * Represents a product category
 */
export interface Category {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
}