/**
 * Shared type definitions for the POS system
 */

export interface SaleItem {
  name: string;
  price: number;
  quantity: number | '';
  batch?: string;
  unit?: string;
  // Enhanced UoM support for point of sale
  selectedUomId?: string;    // ID of the selected unit of measure
  unitPrice?: number;        // Price per selected unit
  basePrice?: number;        // Original price per base unit
  conversionFactor?: number; // Factor to convert to base unit
  uomDisplayName?: string;   // Display name of the unit (e.g., "Box", "½ Box")
}

export interface PaymentDetail {
  amount: number;
  method: string;
  reference: string;
  note?: string;
  timestamp: string;
}

export interface SaleRecord {
  id: string;
  cart: SaleItem[];
  customer: string;
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
  note: string;
  timestamp: string;
  invoiceNumber?: string;
}