import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';
import type {
  ProductDistributionPolicyDto,
  UpdateProductDistributionPolicyDto,
} from '../../../shared/types/productDistribution';

export const productDistributionKeys = {
  all: ['product-distribution'] as const,
  policy: (productId: string) => [...productDistributionKeys.all, productId] as const,
};

export function useProductDistributionPolicy(productId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: productDistributionKeys.policy(productId ?? 'none'),
    queryFn: async () => {
      const res = await api.warehouse.getProductDistributionPolicy(productId!);
      return res.data?.data as ProductDistributionPolicyDto;
    },
    enabled: enabled && !!productId,
  });
}

export function useUpdateProductDistributionPolicy(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateProductDistributionPolicyDto) => {
      const res = await api.warehouse.updateProductDistributionPolicy(productId, body);
      return res.data?.data as ProductDistributionPolicyDto;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: productDistributionKeys.policy(productId) });
    },
  });
}
