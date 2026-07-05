import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../utils/api';
import { getBusinessDate } from '../utils/businessDate';
import { useGoodsReceipts } from './useGoodsReceipts';
import { useStockMovements } from './useStockMovements';
import { useOfflineStockLevels } from './useOfflineData';
import { useMultistoreEnabled } from './useMultistore';
import { useStoreTransfers } from './useWarehouse';
import type { StoreTransfer } from '../../../shared/types/storeTransfer';

export interface InventoryCommandCenterMetrics {
  receiptsToday: number;
  transfersToday: number;
  pendingTransfers: number;
  lowStockCount: number;
  expiringCount: number;
  isLoading: boolean;
}

export interface RecentActivityItem {
  id: string;
  movementType: string;
  productName: string;
  quantity: number;
  createdAt: string;
  referenceLabel?: string;
}

const OPEN_TRANSFER_STATUSES = new Set(['DRAFT', 'APPROVED', 'DISPATCHED', 'IN_TRANSIT']);

function isBusinessToday(iso: string): boolean {
  const datePart = iso.includes('T') ? iso.slice(0, 10) : iso;
  return datePart === getBusinessDate();
}

function extractListTotal(data: unknown): number {
  if (!data || typeof data !== 'object') return 0;
  const record = data as { pagination?: { total?: number }; data?: unknown[] };
  if (typeof record.pagination?.total === 'number') return record.pagination.total;
  if (Array.isArray(record.data)) return record.data.length;
  return 0;
}

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

function extractListRows<T>(data: unknown): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  const record = data as { data?: unknown[] };
  return Array.isArray(record.data) ? (record.data as T[]) : [];
}

export function useInventoryCommandCenter(): {
  metrics: InventoryCommandCenterMetrics;
  recentActivity: RecentActivityItem[];
  activityLoading: boolean;
} {
  const today = getBusinessDate();
  const { isMultistoreEnabled } = useMultistoreEnabled();

  const { data: receiptsData, isLoading: receiptsLoading } = useGoodsReceipts({
    startDate: today,
    endDate: today,
    limit: 1,
    page: 1,
  });

  const { data: transfers = [], isLoading: transfersLoading } = useStoreTransfers(
    isMultistoreEnabled,
  );

  const { data: stockData, isLoading: stockLoading } = useOfflineStockLevels();

  const { data: expiringData, isLoading: expiringLoading } = useQuery({
    queryKey: ['inventory', 'command-center', 'expiring', 30],
    queryFn: async () => {
      const res = await api.inventory.expiringSoon(30);
      const rows = (res.data?.data ?? res.data) as unknown;
      return Array.isArray(rows) ? rows.length : 0;
    },
    staleTime: 60_000,
  });

  const { data: movementsData, isLoading: movementsLoading } = useStockMovements({
    page: 1,
    limit: 12,
  });

  const metrics = useMemo(() => {
    const list = transfers as StoreTransfer[];
    const transfersToday = list.filter((t) => isBusinessToday(t.createdAt)).length;
    const pendingTransfers = isMultistoreEnabled
      ? list.filter((t) => OPEN_TRANSFER_STATUSES.has(t.status)).length
      : 0;

    const stockRows = unwrapStockListPayload(stockData);
    const lowStockCount = stockRows.filter(
      (r) => (r as { needs_reorder?: boolean }).needs_reorder === true,
    ).length;

    return {
      receiptsToday: extractListTotal(receiptsData?.data),
      transfersToday,
      pendingTransfers,
      lowStockCount,
      expiringCount: expiringData ?? 0,
      isLoading: receiptsLoading || stockLoading || expiringLoading || (isMultistoreEnabled && transfersLoading),
    };
  }, [
    receiptsData,
    transfers,
    stockData,
    expiringData,
    isMultistoreEnabled,
    receiptsLoading,
    stockLoading,
    expiringLoading,
    transfersLoading,
  ]);

  const recentActivity = useMemo(() => {
    type MovementRow = {
      id: string;
      movementType: string;
      productName?: string;
      quantity?: number | string;
      createdAt: string;
      grNumber?: string;
      saleNumber?: string;
      referenceType?: string;
      referenceId?: string;
    };

    const rows = extractListRows<MovementRow>(movementsData);
    return rows.map((m) => {
      let referenceLabel: string | undefined;
      if (m.grNumber) referenceLabel = m.grNumber;
      else if (m.saleNumber) referenceLabel = m.saleNumber;
      else if (m.referenceType && m.referenceId) {
        referenceLabel = `${m.referenceType} ${m.referenceId.slice(0, 8)}`;
      }

      return {
        id: m.id,
        movementType: m.movementType,
        productName: m.productName ?? 'Unknown product',
        quantity: Number(m.quantity ?? 0),
        createdAt: m.createdAt,
        referenceLabel,
      };
    });
  }, [movementsData]);

  return {
    metrics,
    recentActivity,
    activityLoading: movementsLoading,
  };
}
