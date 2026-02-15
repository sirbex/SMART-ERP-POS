/**
 * Product with embedded UoM - Simplified hook
 * Replaces the old useProductUoMs pattern by fetching product with UoMs embedded
 * All conversion logic is now handled server-side via ProductWithUom class
 */

import { useQuery } from '@tanstack/react-query';
import Decimal from 'decimal.js';

export type ProductUomDetail = {
  id: string;
  uomId: string;
  uomName: string;
  uomSymbol: string | null;
  conversionFactor: string;
  barcode: string | null;
  isDefault: boolean;
  priceOverride: string | null;
  costOverride: string | null;
  factor: string;
  displayCost: string;
  displayPrice: string;
  marginPct: string;
};

export type ProductWithUoms = {
  id: string;
  name: string;
  sku: string;
  costPrice: number;
  sellingPrice: number;
  uoms: ProductUomDetail[];
  // ... other product fields
};

async function fetchProductWithUoms(productId: string): Promise<ProductWithUoms> {
  const token = localStorage.getItem('auth_token');
  const res = await fetch(`/api/products/${productId}?includeUoms=true`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to fetch product');
  return json.data;
}

/**
 * Fetch product with all UoM details pre-computed by the server
 * This replaces useProductUoMs - conversions are now done server-side
 */
export function useProductWithUoms(productId: string | undefined) {
  return useQuery({
    queryKey: ['product-with-uoms', productId],
    enabled: !!productId,
    queryFn: () => fetchProductWithUoms(productId!),
    staleTime: 60000, // 1 minute
  });
}

/**
 * Helper: Find UoM by ID (searches both ProductUom ID and master UoM ID)
 */
export function findUom(product: ProductWithUoms | undefined, uomId: string): ProductUomDetail | undefined {
  return product?.uoms?.find(u => u.id === uomId || u.uomId === uomId);
}

/**
 * Helper: Get default UoM
 */
export function getDefaultUom(product: ProductWithUoms | undefined): ProductUomDetail | undefined {
  return product?.uoms?.find(u => u.isDefault) || product?.uoms?.[0];
}

/**
 * Helper: Convert quantity to base units (client-side utility)
 * For when you need to prepare data to send to backend
 */
export function convertToBase(product: ProductWithUoms | undefined, quantity: number, fromUomId?: string): Decimal {
  if (!product || !fromUomId) {
    return new Decimal(quantity);
  }

  const uom = findUom(product, fromUomId);
  if (!uom) {
    return new Decimal(quantity);
  }

  const factor = new Decimal(uom.conversionFactor);
  return new Decimal(quantity).mul(factor);
}

/**
 * Helper: Convert quantity from base units (client-side utility)
 * For when you need to display backend data
 */
export function convertFromBase(product: ProductWithUoms | undefined, baseQuantity: number, toUomId?: string): Decimal {
  if (!product || !toUomId) {
    return new Decimal(baseQuantity);
  }

  const uom = findUom(product, toUomId);
  if (!uom) {
    return new Decimal(baseQuantity);
  }

  const factor = new Decimal(uom.conversionFactor);
  return new Decimal(baseQuantity).div(factor);
}
