/**
 * Held Sales Service
 * API service for managing held POS carts
 */

import api from '../config/api.config';
import { roundMoney } from '../utils/precision';

export interface HeldSaleItem {
  productId: string | number;
  name: string;
  quantity: number;
  unit: string;
  uomId?: string | null;
  unitPrice: number;
  priceOverride?: number | null;
  priceOverrideReason?: string | null;
  discount: number;
  discountReason?: string | null;
  subtotal: number;
  taxRate?: number;
  taxAmount: number;
  total: number;
}

export interface HeldSale {
  id: string;
  holdNumber: string;
  customerId?: string | null;
  items: HeldSaleItem[];
  subtotal: number;
  taxAmount: number;
  discount: number;
  total: number;
  notes?: string | null;
  heldBy: string;
  heldAt: string;
  expiresAt: string;
  customer?: {
    id: string;
    name: string;
    phone?: string;
  } | null;
  user: {
    id: string;
    fullName: string;
  };
}

export interface HoldSaleRequest {
  customerId?: string | null;
  items: HeldSaleItem[];
  subtotal: number;
  taxAmount: number;
  discount: number;
  total: number;
  notes?: string | null;
}

/**
 * Hold current cart
 */
export async function holdSale(request: HoldSaleRequest): Promise<HeldSale> {
  const response = await api.post('/pos/hold', {
    ...request,
    subtotal: roundMoney(request.subtotal),
    taxAmount: roundMoney(request.taxAmount),
    discount: roundMoney(request.discount),
    total: roundMoney(request.total),
  });
  return response.data;
}

/**
 * Get all held sales (current user or all if admin)
 */
export async function getHeldSales(showAll: boolean = false): Promise<HeldSale[]> {
  const response = await api.get('/pos/held', {
    params: { all: showAll }
  });
  return response.data;
}

/**
 * Get count of held sales for badge
 */
export async function getHeldSalesCount(showAll: boolean = false): Promise<number> {
  const response = await api.get('/pos/held/count', {
    params: { all: showAll }
  });
  return response.data.count;
}

/**
 * Get a specific held sale by ID
 */
export async function getHeldSale(id: string): Promise<HeldSale> {
  const response = await api.get(`/pos/held/${id}`);
  return response.data;
}

/**
 * Delete a held sale
 */
export async function deleteHeldSale(id: string): Promise<void> {
  await api.delete(`/pos/held/${id}`);
}

/**
 * Clean up expired held sales (admin only)
 */
export async function cleanupExpiredHeldSales(): Promise<{ count: number }> {
  const response = await api.delete('/pos/held/cleanup/expired');
  return response.data;
}
