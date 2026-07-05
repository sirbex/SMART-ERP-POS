import { useQueries } from '@tanstack/react-query';
import {
  fetchProductWithUoms,
  type ProductUomDetail,
  type ProductWithUoms,
} from './useProductWithUoms';

export function useTransferProductUomMap(productIds: string[], enabled = true) {
  const uniqueIds = [...new Set(productIds.filter(Boolean))];

  const queries = useQueries({
    queries: uniqueIds.map((productId) => ({
      queryKey: ['product-with-uoms', productId],
      queryFn: () => fetchProductWithUoms(productId),
      enabled: enabled && !!productId,
      staleTime: 60_000,
    })),
  });

  const map = new Map<string, ProductWithUoms>();
  for (let i = 0; i < uniqueIds.length; i++) {
    const data = queries[i]?.data;
    if (data) map.set(uniqueIds[i], data);
  }

  const isLoading = queries.some((q) => q.isLoading);

  return { map, isLoading };
}

export type { ProductUomDetail, ProductWithUoms };
