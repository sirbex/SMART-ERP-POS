import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';

// POS Sale mutation hook
export function useCreatePOSSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: any) => api.sales.create(data),
    onSuccess: () => {
      // Invalidate sales and inventory queries
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
    },
  });
}
