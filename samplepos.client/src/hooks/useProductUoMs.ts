import { useQuery } from '@tanstack/react-query';
import Decimal from 'decimal.js';

export type ProductUom = {
  id: string;
  productId: string;
  uomId: string;
  uomName: string;
  uomSymbol: string | null;
  conversionFactor: string; // from API as string
  barcode: string | null;
  isDefault: boolean;
  priceOverride: string | null;
  costOverride: string | null;
};

export type DerivedUom = ProductUom & {
  factor: Decimal;
  displayCost: Decimal;
  displayPrice: Decimal;
  marginPct: Decimal; // (price - cost)/price * 100
};

async function fetchProductUoms(productId: string): Promise<ProductUom[]> {
  const token = localStorage.getItem('auth_token');
  const res = await fetch(`/api/products/${productId}/uoms`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Failed to fetch UoMs');
  return json.data;
}

export function useProductUoMs(productId: string | undefined, baseCost: number, basePrice: number) {
  return useQuery({
    queryKey: ['product-uoms', productId],
    enabled: !!productId,
    queryFn: () => fetchProductUoms(productId!),
    select: (rows: ProductUom[]): DerivedUom[] => {
      const baseCostD = new Decimal(baseCost || 0);
      const basePriceD = new Decimal(basePrice || 0);
      return rows.map((r) => {
        const factor = new Decimal(r.conversionFactor || '1');
        const overrideCost = r.costOverride ? new Decimal(r.costOverride) : null;
        const overridePrice = r.priceOverride ? new Decimal(r.priceOverride) : null;
        const displayCost = overrideCost ?? baseCostD.mul(factor);
        const displayPrice = overridePrice ?? basePriceD.mul(factor);
        const marginPct = displayPrice.eq(0)
          ? new Decimal(0)
          : displayPrice.minus(displayCost).div(displayPrice).mul(100);
        return {
          ...r,
          factor,
          displayCost,
          displayPrice,
          marginPct,
        };
      });
    },
  });
}
