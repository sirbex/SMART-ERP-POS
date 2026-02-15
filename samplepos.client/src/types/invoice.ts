import Decimal from 'decimal.js';

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  saleId?: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate?: string;
  subtotal?: string | Decimal;
  taxAmount?: string | Decimal;
  totalAmount: string | Decimal;
  amountPaid: string | Decimal;
  balance: string | Decimal;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoicePayment {
  id: string;
  invoiceId: string;
  amount: string | Decimal;
  method: string; // 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'OTHER'
  reference?: string;
  paidAt: string;
  createdAt: string;
}
