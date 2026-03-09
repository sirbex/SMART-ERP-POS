import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';
import type { CreateSaleInput } from '../types/inputs';

// POS Sale mutation hook
export function useCreatePOSSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSaleInput) => api.sales.create(data),
    onSuccess: () => {
      // Invalidate sales and inventory queries (both standard and offline-aware)
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
      queryClient.invalidateQueries({ queryKey: ['offline', 'stock-levels'] });
      queryClient.invalidateQueries({ queryKey: ['offline', 'products'] });
      queryClient.invalidateQueries({ queryKey: ['offline', 'customers'] });
    },
  });
}
