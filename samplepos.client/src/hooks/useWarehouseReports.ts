import { useQuery } from '@tanstack/react-query';
import { api } from '../utils/api';
import type { WarehouseNetworkReport } from '../../../shared/types/warehouseReports';
import type { StoreStockSummaryRow } from '../../../shared/types/warehouseReports';

export const warehouseReportKeys = {
  all: ['warehouseReports'] as const,
  network: (days: number) => [...warehouseReportKeys.all, 'network', days] as const,
  stockByStore: () => [...warehouseReportKeys.all, 'stockByStore'] as const,
};

export function useWarehouseNetworkReport(days = 7, enabled = true) {
  return useQuery({
    queryKey: warehouseReportKeys.network(days),
    queryFn: async () => {
      const res = await api.warehouse.reports.network(days);
      return res.data?.data as WarehouseNetworkReport;
    },
    enabled,
    staleTime: 60_000,
  });
}

/** Sellable qty per store_location_id — for hiding empty special stores. */
export function useStoreStockQtyMap(enabled = true) {
  return useQuery({
    queryKey: warehouseReportKeys.stockByStore(),
    queryFn: async () => {
      const res = await api.warehouse.reports.stockByStore();
      const rows = (res.data?.data ?? []) as StoreStockSummaryRow[];
      const map = new Map<string, number>();
      if (Array.isArray(rows)) {
        for (const row of rows) {
          map.set(row.storeLocationId, Number(row.sellableQty) || 0);
        }
      }
      return map;
    },
    enabled,
    staleTime: 30_000,
  });
}
