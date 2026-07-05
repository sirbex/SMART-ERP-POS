import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';
import type {
  AssortmentMatrixDto,
  AssortmentCellStatus,
  UpdateAssortmentMatrixCellDto,
} from '../../../shared/types/assortmentMatrix';
import type { TransferLotSearchResult } from '../components/inventory/TransferLotSearch';

export const assortmentMatrixKeys = {
  all: ['assortment-matrix'] as const,
  list: (search: string, category: string, page: number) =>
    [...assortmentMatrixKeys.all, search, category, page] as const,
};

export function useAssortmentMatrix(
  search: string,
  category: string,
  page: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: assortmentMatrixKeys.list(search, category, page),
    queryFn: async () => {
      const res = await api.warehouse.getAssortmentMatrix({
        search: search || undefined,
        category: category !== 'all' ? category : undefined,
        page,
        pageSize: 50,
      });
      return res.data?.data as AssortmentMatrixDto;
    },
    enabled,
  });
}

export function useUpdateAssortmentMatrixCell() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateAssortmentMatrixCellDto) => {
      const res = await api.warehouse.updateAssortmentMatrixCell(body);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: assortmentMatrixKeys.all });
    },
  });
}

export function useSearchTransferLots(storeLocationId: string | null) {
  return useMutation({
    mutationFn: async (query: string) => {
      const res = await api.warehouse.searchStoreLots(storeLocationId!, query);
      return (res.data?.data ?? []) as TransferLotSearchResult[];
    },
  });
}

export function useFetchTransferProductLots(storeLocationId: string | null) {
  return useMutation({
    mutationFn: async (productId: string) => {
      const res = await api.warehouse.storeProductLots(storeLocationId!, productId);
      return (res.data?.data ?? []) as TransferLotSearchResult[];
    },
  });
}

export function nextAssortmentCellStatus(
  current: AssortmentCellStatus,
  distributionPolicy: 'GLOBAL' | 'RESTRICTED',
): AssortmentCellStatus {
  if (distributionPolicy === 'GLOBAL') {
    return current === 'ACTIVE' ? 'HIDDEN' : 'ACTIVE';
  }
  if (current === 'UNASSIGNED') return 'ACTIVE';
  if (current === 'ACTIVE') return 'HIDDEN';
  return 'UNASSIGNED';
}

export function assortmentStatusLabel(status: AssortmentCellStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'Active';
    case 'HIDDEN':
      return 'Hidden';
    case 'UNASSIGNED':
      return '—';
    default:
      return status;
  }
}

export function assortmentStatusClass(status: AssortmentCellStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-green-50 text-green-800 border-green-200';
    case 'HIDDEN':
      return 'bg-gray-100 text-gray-600 border-gray-200';
    case 'UNASSIGNED':
      return 'bg-white text-gray-400 border-dashed border-gray-200';
    default:
      return 'bg-white text-gray-600 border-gray-200';
  }
}
