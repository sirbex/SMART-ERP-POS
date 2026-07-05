import { useEffect } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';
import type { SystemSettings } from '../../../shared/types/systemSettings';
import { warehouseKeys } from './useWarehouse';
import { inventoryKeys } from './useInventory';
import { warehouseReportKeys } from './useWarehouseReports';

export const multistoreKeys = {
  all: ['multistore'] as const,
  settings: () => [...multistoreKeys.all, 'settings'] as const,
};

const MULTISTORE_ENABLED_KEY = 'multistore_enabled';

export function getCachedMultistoreEnabled(): boolean | undefined {
  const raw = localStorage.getItem(MULTISTORE_ENABLED_KEY);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return undefined;
}

/** Invalidate every client surface that branches on multistore mode. */
export function invalidateMultistoreModeQueries(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: multistoreKeys.all });
  queryClient.invalidateQueries({ queryKey: warehouseKeys.all });
  queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
  queryClient.invalidateQueries({ queryKey: warehouseReportKeys.all });
  queryClient.invalidateQueries({ queryKey: ['systemSettings'] });
  queryClient.invalidateQueries({ queryKey: ['pos', 'assigned-store'] });
  queryClient.invalidateQueries({ queryKey: ['warehouse', 'network'] });
  queryClient.invalidateQueries({ queryKey: ['inventory', 'command-center'] });
  queryClient.invalidateQueries({ queryKey: ['stockCounts'] });
}

/** Optimistically flip multistore flag across the app before PATCH completes. */
export function setMultistoreEnabledOptimistic(
  queryClient: QueryClient,
  enabled: boolean,
): void {
  queryClient.setQueryData(multistoreKeys.settings(), enabled);
  queryClient.setQueryData<SystemSettings | undefined>(['systemSettings'], (prev) =>
    prev ? { ...prev, isMultistoreEnabled: enabled } : prev,
  );
  localStorage.setItem(MULTISTORE_ENABLED_KEY, String(enabled));
}

/** True only when tenant has enabled multistore in system settings. */
export function useMultistoreEnabled() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: multistoreKeys.settings(),
    queryFn: async () => {
      const res = await api.get<{ data?: SystemSettings }>('/system-settings');
      const settings = res.data?.data;
      const enabled = settings?.isMultistoreEnabled === true;
      localStorage.setItem(MULTISTORE_ENABLED_KEY, String(enabled));
      return enabled;
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    placeholderData: () => getCachedMultistoreEnabled(),
  });

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === MULTISTORE_ENABLED_KEY) {
        invalidateMultistoreModeQueries(queryClient);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [queryClient]);

  return {
    isMultistoreEnabled: query.data === true,
    isLoading: query.isLoading && query.data === undefined,
    refetch: query.refetch,
  };
}
