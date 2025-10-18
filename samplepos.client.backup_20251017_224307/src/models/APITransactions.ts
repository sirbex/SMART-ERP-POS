/**
 * API Transaction Models
 * 
 * These interfaces define the structure for transaction data
 * used in API communication between frontend and backend.
 */

import type { Customer } from './Customer';

/**
 * Represents an item in a transaction
 */
export interface TransactionItem {
  id: string;
  productId: string;
  productName: string;
  price: number;           // Unit price at time of sale
  quantity: number;
  unit: string;            // Unit of measure (e.g., 'piece', 'kg')
  subtotal: number;        // price * quantity
  discount?: number;
  notes?: string;
}

/**
 * Main transaction interface for API operations
 */
export interface Transaction {
  id: string;
  invoiceNumber: string;
  timestamp: string;       // ISO date string
  customer: string;        // Customer name or "Walk-in"
  cart: TransactionItem[];
  subtotal: number;        // Sum of all item subtotals
  discount: number;
  tax: number;
  total: number;           // Final total after tax and discounts
  paid: number;            // Amount paid by customer
  change: number;          // Change given to customer
  outstanding: number;     // Amount still owed (for partial payments)
  status: string;          // 'PAID', 'PARTIAL', 'VOIDED', etc.
  payments: PaymentDetail[];
  paymentMethod: string;   // 'cash', 'card', 'credit', etc.
  voided: boolean;         // Whether the transaction has been voided
  note?: string;           // Additional transaction notes
}

/**
 * Payment details for a transaction
 */
export interface PaymentDetail {
  amount: number;
  method: string;          // 'cash', 'card', 'mobile_money', etc.
  reference?: string;      // Reference number, card last 4, etc.
  note?: string;
  timestamp: string;       // ISO date string
}

/**
 * Extended transaction for POS operations with additional fields
 */
export interface POSTransaction extends Transaction {
  salesPerson?: string;    // Employee who processed the transaction
  deviceId?: string;       // ID of the POS terminal
  storeId?: string;        // Store location ID
  loyaltyPoints?: number;  // Points earned/used in transaction
  customerDetails?: Customer; // Full customer details if available
  receiptUrl?: string;     // URL to digital receipt
  returnPolicy?: string;   // Return policy information
}

/**
 * Customer payment record for account management
 */
export interface CustomerPayment {
  id?: string;
  customerId: string;
  amount: number;
  method: string;
  reference?: string;
  timestamp?: string;
  notes?: string;
}