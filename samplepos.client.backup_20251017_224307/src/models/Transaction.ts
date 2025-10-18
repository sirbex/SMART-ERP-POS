/**
 * Transaction models for the POS system
 * Enhanced with batch inventory tracking
 */

import type { InventoryItem } from './InventoryItem';
import type { FIFOReleaseResult } from './BatchInventory';
// InventoryBatch type is referenced in documentation but not directly used

/**
 * Batch information for a transaction item
 * Tracks which specific batches were used for a sale with FIFO allocation
 */
export interface TransactionItemBatch {
  batchId: string;
  batchNumber: string;
  quantity: number;
  costPrice: number;
  expiryDate?: string;
  daysToExpiryAtSale?: number;
}

export interface TransactionItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  price: number;           // Added: price property (may be different from unitPrice)
  subtotal: number;
  discount?: number;
  discountType?: 'percentage' | 'amount'; // Whether discount is a percentage or fixed amount
  taxes?: number;
  taxRate?: number;
  originalProduct?: InventoryItem; // Reference to the original product
  uomId?: string;                  // Unit of measure ID used for this sale
  
  // Batch tracking information
  batches?: TransactionItemBatch[]; // Batches used for this transaction item
  fifoRelease?: Partial<FIFOReleaseResult>; // FIFO release details
  averageCostPrice?: number;       // Average cost price across used batches
  profit?: number;                 // Calculated profit (subtotal - cost)
  profitMargin?: number;           // Profit margin percentage
}

export type PaymentMethod = 
  | 'cash' 
  | 'card' 
  | 'credit' // Store credit
  | 'mobile' // Mobile payments
  | 'split'  // Multiple payment methods
  | 'other';

export interface PaymentDetails {
  method: PaymentMethod;
  amount: number;
  reference?: string;       // Reference number for payment (card last 4, etc)
  cardType?: string;        // Type of card used
  receiptNumber?: string;   // Receipt number generated for this payment
  changeAmount?: number;    // Change given to customer for cash payments
  splitDetails?: SplitPaymentDetail[]; // Details for split payments
}

export interface SplitPaymentDetail {
  method: Exclude<PaymentMethod, 'split'>;
  amount: number;
  reference?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  accountBalance?: number; // Current account balance
}

export interface Transaction {
  id: string;
  transactionNumber: string;
  items: TransactionItem[];
  itemCount?: number;             // Added: item count for recent transactions list
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  payment: PaymentDetails;
  paymentMethod?: PaymentMethod;  // Added: direct reference to payment method for API compatibility
  status: 'pending' | 'completed' | 'cancelled' | 'refunded' | 'partial';
  voided?: boolean;               // Added: flag to indicate if transaction has been voided
  customer?: Customer;
  salesPerson?: string;
  notes?: string;
  createdAt: string; // ISO date string
  completedAt?: string; // ISO date string when transaction was completed
}

// Receipt model
export interface Receipt {
  transactionId: string;
  receiptNumber: string;
  businessName: string;
  businessAddress?: string;
  businessPhone?: string;
  businessEmail?: string;
  businessTaxId?: string;
  transaction: Transaction;
  printedAt: string; // ISO date string
}

// Daily summary
export interface DailySummary {
  date: string; // YYYY-MM-DD
  totalSales: number;
  totalTransactions: number;
  totalTax: number;
  totalDiscount: number;
  paymentBreakdown: Record<PaymentMethod, number>; // Total per payment method
}