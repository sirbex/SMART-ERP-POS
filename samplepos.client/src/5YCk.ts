import { z } from 'zod';
import Decimal from 'decimal.js';

// --- Core Types ---

export type Currency = 'UGX' | 'USD' | 'EUR'; // Extend as needed

export interface Group {
  id: string;
  name: string;
}

export interface Account {
  id: string;
  name: string;
  groupId: string;
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
}

export interface LedgerEntry {
  id: string;
  transactionId: string;
  accountId: string;
  amount: Decimal;
  type: 'debit' | 'credit';
  currency: Currency;
  exchangeRate?: Decimal;
  refType?: string;
  refId?: string;
  createdAt: Date;
}

export interface Transaction {
  id: string;
  date: Date;
  description: string;
  entries: LedgerEntry[];
  refType?: string;
  refId?: string;
}

// --- Zod Schemas ---

export const LedgerEntrySchema = z.object({
  transactionId: z.string(),
  accountId: z.string(),
  amount: z.instanceof(Decimal),
  type: z.enum(['debit', 'credit']),
  currency: z.string().min(3).max(3),
  exchangeRate: z.instanceof(Decimal).optional(),
  refType: z.string().optional(),
  refId: z.string().optional(),
});

export const TransactionSchema = z.object({
  date: z.date(),
  description: z.string(),
  entries: z.array(LedgerEntrySchema),
  refType: z.string().optional(),
  refId: z.string().optional(),
});

// --- Example: Customer, Supplier, Invoice, Payment, Delivery, Loan ---
export const CustomerSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const SupplierSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const InvoiceSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  amount: z.instanceof(Decimal),
  currency: z.string().min(3).max(3),
  status: z.enum(['pending', 'paid', 'cancelled']),
  createdAt: z.date(),
});

export const PaymentSchema = z.object({
  id: z.string(),
  invoiceId: z.string().optional(),
  customerId: z.string().optional(),
  supplierId: z.string().optional(),
  amount: z.instanceof(Decimal),
  currency: z.string().min(3).max(3),
  createdAt: z.date(),
});

export const DeliverySchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  status: z.enum(['pending', 'delivered', 'cancelled']),
  createdAt: z.date(),
});

export const LoanSchema = z.object({
  id: z.string(),
  fromAccountId: z.string(),
  toAccountId: z.string(),
  amount: z.instanceof(Decimal),
  currency: z.string().min(3).max(3),
  status: z.enum(['active', 'repaid', 'defaulted']),
  createdAt: z.date(),
});

// --- Export types for API inputs ---
export type TransactionInput = z.infer<typeof TransactionSchema>;
export type LedgerEntryInput = z.infer<typeof LedgerEntrySchema>;
export type InvoiceInput = z.infer<typeof InvoiceSchema>;
export type PaymentInput = z.infer<typeof PaymentSchema>;
export type DeliveryInput = z.infer<typeof DeliverySchema>;
export type LoanInput = z.infer<typeof LoanSchema>;
