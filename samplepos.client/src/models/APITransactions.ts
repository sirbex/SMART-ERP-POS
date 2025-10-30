// Legacy placeholder for APITransactions types
// Export common transaction-related types used by services
export type { Transaction, TransactionItem } from '../types';
export type { PaymentMethod } from '../types/backend';

// Bring types into local scope for use below
import type { TransactionItem as _TransactionItem } from '../types';
import type { PaymentMethod as _PaymentMethod } from '../types/backend';

// Legacy API models expected by services
export interface POSTransaction {
  id?: string;
  items: _TransactionItem[];
  customerId?: string;
  paymentMethod: _PaymentMethod | string;
  paymentAmount: number;
  changeAmount: number;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  notes?: string;
}

export interface CustomerPayment {
  id?: string;
  amount: number;
  method: _PaymentMethod | string;
  reference?: string;
  status?: string;
  invoiceNumber?: string;
}
