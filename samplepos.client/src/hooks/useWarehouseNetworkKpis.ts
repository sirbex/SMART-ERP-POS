import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../utils/api';
import { useStoreLocations, useStoreTransfers } from './useWarehouse';
import { useOfflineStockLevels } from './useOfflineData';
import type { StoreTransfer } from '../../../shared/types/storeTransfer';

export interface WarehouseNetworkKpis {
  inventoryValue: number | null;
  availableUnits: number;
  productCount: number;
  activeStores: number;
  transfersToday: number;
  pendingTransfers: number;
  lowStockCount: number;
  isLoading: boolean;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

const OPEN_TRANSFER_STATUSES = new Set(['DRAFT', 'APPROVED', 'DISPATCHED', 'IN_TRANSIT']);

function unwrapStockListPayload(payload: unknown): unknown[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const record = payload as { data?: unknown };
  if (Array.isArray(record.data)) return record.data;
  if (record.data && typeof record.data === 'object') {
    const nested = record.data as { data?: unknown };
    if (Array.isArray(nested.data)) return nested.data;
  }
  return [];
}

export function useWarehouseNetworkKpis(enabled: boolean): WarehouseNetworkKpis {
  const { data: stores = [], isLoading: storesLoading } = useStoreLocations(enabled);
  const { data: transfers = [], isLoading: transfersLoading } = useStoreTransfers(enabled);
  const { data: stockData, isLoading: stockLoading } = useOfflineStockLevels();

  const { data: valueData, isLoading: valueLoading } = useQuery({
    queryKey: ['warehouse', 'network', 'inventory-value'],
    queryFn: async () => {
      const res = await api.inventory.inventoryValue();
      const rows = (res.data?.data ?? res.data) as Array<{ inventory_value?: string | number }>;
      if (!Array.isArray(rows)) return null;
      const total = rows.reduce((sum, row) => {
        const v = parseFloat(String(row.inventory_value ?? 0));
        return sum + (Number.isFinite(v) ? v : 0);
      }, 0);
      return total;
    },
    enabled,
    staleTime: 60_000,
  });

  const metrics = useMemo(() => {
    const list = transfers as StoreTransfer[];
    const transfersToday = list.filter((t) => isToday(t.createdAt)).length;
    const pendingTransfers = list.filter((t) => OPEN_TRANSFER_STATUSES.has(t.status)).length;

    const stockRows = unwrapStockListPayload(stockData);
    const rows = stockRows;
    let availableUnits = 0;
    let productCount = 0;
    let lowStockCount = 0;
    for (const r of rows as Array<{
      needs_reorder?: boolean;
      total_stock?: string | number;
      total_quantity?: string | number;
    }>) {
      const qty = parseFloat(String(r.total_stock ?? r.total_quantity ?? 0));
      if (Number.isFinite(qty)) {
        availableUnits += qty;
        if (qty > 0) productCount += 1;
      }
      if (r.needs_reorder === true) lowStockCount += 1;
    }

    return {
      inventoryValue: valueData ?? null,
      availableUnits,
      productCount,
      activeStores: stores.filter((s) => s.isActive).length,
      transfersToday,
      pendingTransfers,
      lowStockCount,
    };
  }, [transfers, stores, stockData, valueData]);

  return {
    ...metrics,
    isLoading: enabled && (storesLoading || transfersLoading || stockLoading || valueLoading),
  };
}
