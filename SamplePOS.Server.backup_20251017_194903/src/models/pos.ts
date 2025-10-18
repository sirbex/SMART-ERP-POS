/**
 * Type definitions for the SaleItem and Transaction models
 */

export interface SaleItem {
  id: string;
  name: string;
  sku?: string;
  price: number;
  quantity: number;
  unit?: string;
  uomDisplayName?: string;
  conversionFactor?: number;
  discount?: number;
  subtotal?: number;
  tax?: number;
  total?: number;
  notes?: string;
  productId?: number;
  costPrice?: number;
}

export interface Transaction {
  id: string;
  customerId?: string;
  customerName?: string;
  items: SaleItem[];
  subtotal: number;
  tax: number;
  discount?: number;
  total: number;
  paymentMethod: string;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  amountPaid?: number;
  change?: number;
  notes?: string;
  createdBy?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface Payment {
  id: string;
  customerId: string;
  transactionId?: string;
  amount: number;
  paymentMethod: string;
  notes?: string;
  timestamp: string;
}

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  isActive: boolean;
  balance: number;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}