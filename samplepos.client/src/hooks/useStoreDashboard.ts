import { useMemo } from 'react';
import { addDaysToDateString, getBusinessDate } from '../utils/businessDate';
import { productFromApiUoms, formatMultiUomQuantity } from '../utils/formatQuantity';
import { useGoodsReceipts } from './useGoodsReceipts';
import { useStockMovements } from './useStockMovements';
import { useSalesSummary, useTopSellingProducts } from './useApi';
import {
  useStoreLocations,
  useStoreTransfers,
  useStockLevelsByStore,
  useStoreLotsAtStore,
  type WarehouseLotRow,
} from './useWarehouse';
import type { StoreLocation } from '../../../shared/types/warehouseNetwork';
import type { StoreTransfer } from '../../../shared/types/storeTransfer';

const OPEN_STATUSES = new Set(['DRAFT', 'APPROVED', 'DISPATCHED', 'IN_TRANSIT']);
const EXPIRY_WINDOW_DAYS = 30;

export interface StoreStockRow {
  product_id: string;
  product_name: string;
  total_stock?: string | number;
  total_quantity?: string | number;
  average_cost?: string | number;
  selling_price?: string | number;
  needs_reorder?: boolean;
  uoms?: unknown;
}

export interface StoreTopSellerRow {
  productId: string;
  productName: string;
  quantity: number;
  revenue: number;
  uoms?: unknown;
}

export interface StoreTopStockRow {
  productId: string;
  productName: string;
  quantity: number;
  inventoryValue: number;
  uoms?: unknown;
  quantityLabel?: string;
}

export interface StoreExpiringLotRow {
  productLotId: string;
  productName: string;
  lotNumber: string;
  expiryDate: string;
  availableQuantity: number;
  daysUntilExpiry: number;
}

export interface StoreRecentTransferRow {
  id: string;
  transferNumber: string;
  status: string;
  routeLabel: string;
  occurredAt: string;
}

export interface StoreRecentMovementRow {
  id: string;
  productName: string;
  movementType: string;
  quantity: number;
  createdAt: string;
  referenceLabel?: string;
}

export interface StoreInventoryRow {
  productId: string;
  productName: string;
  quantity: number;
  quantityLabel?: string;
  inventoryValue: number;
  needsReorder: boolean;
}

export interface StoreDashboardMetrics {
  inventoryValue: number;
  lowStockCount: number;
  totalQty: number;
  lineCount: number;
  productCount: number;
  pendingTransfers: number;
  incomingTransfers: number;
  outgoingTransfers: number;
  expiringLotCount: number;
  todayLabel: string;
  todayValue: string;
  todaySublabel?: string;
}

export interface StoreDashboardData {
  metrics: StoreDashboardMetrics;
  topSellers: StoreTopSellerRow[];
  topStockAtStore: StoreTopStockRow[];
  currentInventory: StoreInventoryRow[];
  expiringLots: StoreExpiringLotRow[];
  recentTransfers: StoreRecentTransferRow[];
  recentMovements: StoreRecentMovementRow[];
  isLoading: boolean;
}

function parseNum(value: string | number | null | undefined): number {
  const n = parseFloat(String(value ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function daysUntilExpiry(expiryDate: string): number {
  const today = getBusinessDate();
  const exp = expiryDate.slice(0, 10);
  const msPerDay = 86_400_000;
  const t0 = Date.parse(`${today}T00:00:00Z`);
  const t1 = Date.parse(`${exp}T00:00:00Z`);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return 999;
  return Math.round((t1 - t0) / msPerDay);
}

function extractListTotal(data: unknown): number {
  if (!data || typeof data !== 'object') return 0;
  const record = data as { pagination?: { total?: number }; data?: unknown[] };
  if (typeof record.pagination?.total === 'number') return record.pagination.total;
  if (Array.isArray(record.data)) return record.data.length;
  return 0;
}

function transferTimestamp(t: StoreTransfer): string {
  return t.receivedAt ?? t.dispatchedAt ?? t.approvedAt ?? t.updatedAt ?? t.createdAt;
}

function buildRouteLabel(
  transfer: StoreTransfer,
  storeMap: Map<string, StoreLocation>,
  perspectiveStoreId: string,
): string {
  const source = storeMap.get(transfer.sourceStoreId)?.code ?? 'SRC';
  const dest = storeMap.get(transfer.destinationStoreId)?.code ?? 'DST';
  if (transfer.destinationStoreId === perspectiveStoreId) {
    return `${source} → here`;
  }
  if (transfer.sourceStoreId === perspectiveStoreId) {
    return `here → ${dest}`;
  }
  return `${source} → ${dest}`;
}

export function useStoreDashboard(
  storeId: string | undefined,
  store: StoreLocation | null,
  enabled: boolean,
): StoreDashboardData {
  const today = getBusinessDate();
  const weekAgo = addDaysToDateString(today, -7);
  const isPosSelling = store?.isPosSelling === true;

  const { data: stores = [] } = useStoreLocations(enabled);
  const { data: transfers = [], isLoading: transfersLoading } = useStoreTransfers(enabled);
  const { data: stockRows = [], isLoading: stockLoading } = useStockLevelsByStore(
    storeId ?? null,
    enabled && !!storeId,
  );
  const { data: lots = [], isLoading: lotsLoading } = useStoreLotsAtStore(
    storeId ?? null,
    enabled && !!storeId,
  );

  const { data: todaySales, isLoading: salesLoading } = useSalesSummary(
    today,
    today,
    undefined,
    { enabled: enabled && isPosSelling },
  );

  const { data: topSelling = [], isLoading: topSellingLoading } = useTopSellingProducts(5, {
    startDate: weekAgo,
    endDate: today,
    enabled: enabled && isPosSelling,
  });

  const { data: receiptsResponse, isLoading: receiptsLoading } = useGoodsReceipts({
    startDate: today,
    endDate: today,
    limit: 1,
    page: 1,
    enabled: enabled && !isPosSelling,
  });

  const { data: movementsData, isLoading: movementsLoading } = useStockMovements({
    page: 1,
    limit: 40,
  });

  const storeMap = useMemo(
    () => new Map(stores.map((s) => [s.id, s])),
    [stores],
  );

  const parsedStockRows = useMemo(
    () => (Array.isArray(stockRows) ? (stockRows as StoreStockRow[]) : []),
    [stockRows],
  );

  const storeProductIds = useMemo(
    () =>
      new Set(
        parsedStockRows
          .filter((r) => parseNum(r.total_stock ?? r.total_quantity) > 0)
          .map((r) => r.product_id),
      ),
    [parsedStockRows],
  );

  const posStoreCount = useMemo(
    () => stores.filter((s) => s.isPosSelling && s.isActive).length,
    [stores],
  );

  return useMemo(() => {
    const emptyMetrics: StoreDashboardMetrics = {
      inventoryValue: 0,
      lowStockCount: 0,
      totalQty: 0,
      lineCount: 0,
      productCount: 0,
      pendingTransfers: 0,
      incomingTransfers: 0,
      outgoingTransfers: 0,
      expiringLotCount: 0,
      todayLabel: "Today's activity",
      todayValue: '—',
    };

    if (!enabled || !storeId || !store) {
      return {
        metrics: emptyMetrics,
        topSellers: [],
        topStockAtStore: [],
        currentInventory: [],
        expiringLots: [],
        recentTransfers: [],
        recentMovements: [],
        isLoading: false,
      };
    }

    const list = transfers as StoreTransfer[];
    const related = list.filter(
      (t) =>
        t.sourceStoreId === storeId ||
        t.destinationStoreId === storeId ||
        t.transitStoreId === storeId,
    );
    const pendingTransfers = related.filter((t) => OPEN_STATUSES.has(t.status)).length;
    const incomingTransfers = related.filter(
      (t) =>
        t.destinationStoreId === storeId &&
        (t.status === 'IN_TRANSIT' || t.status === 'DISPATCHED'),
    ).length;
    const outgoingTransfers = related.filter(
      (t) =>
        t.sourceStoreId === storeId &&
        (t.status === 'IN_TRANSIT' || t.status === 'DISPATCHED' || t.status === 'APPROVED'),
    ).length;

    let inventoryValue = 0;
    let lowStockCount = 0;
    let totalQty = 0;
    let productCount = 0;
    for (const row of parsedStockRows) {
      const qty = parseNum(row.total_stock ?? row.total_quantity);
      const cost = parseNum(row.average_cost);
      totalQty += qty;
      inventoryValue += qty * cost;
      if (row.needs_reorder) lowStockCount += 1;
      if (qty > 0) productCount += 1;
    }

    const currentInventory = parsedStockRows
      .map((row) => {
        const qty = parseNum(row.total_stock ?? row.total_quantity);
        const cost = parseNum(row.average_cost);
        const uomProduct = productFromApiUoms(row.uoms);
        return {
          productId: row.product_id,
          productName: row.product_name,
          quantity: qty,
          quantityLabel: formatMultiUomQuantity(qty, uomProduct),
          inventoryValue: qty * cost,
          needsReorder: row.needs_reorder === true,
        };
      })
      .filter((row) => row.quantity > 0)
      .sort((a, b) => a.productName.localeCompare(b.productName));

    const expiringLots = (lots as WarehouseLotRow[])
      .filter((lot) => lot.expiryDate)
      .map((lot) => ({
        productLotId: lot.productLotId,
        productName: lot.productName,
        lotNumber: lot.lotNumber,
        expiryDate: lot.expiryDate!.slice(0, 10),
        availableQuantity: lot.availableQuantity,
        daysUntilExpiry: daysUntilExpiry(lot.expiryDate!),
      }))
      .filter((lot) => lot.daysUntilExpiry <= EXPIRY_WINDOW_DAYS)
      .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)
      .slice(0, 8);

    const topStockAtStore = parsedStockRows
      .map((row) => {
        const qty = parseNum(row.total_stock ?? row.total_quantity);
        const cost = parseNum(row.average_cost);
        const uomProduct = productFromApiUoms(row.uoms);
        return {
          productId: row.product_id,
          productName: row.product_name,
          quantity: qty,
          inventoryValue: qty * cost,
          uoms: row.uoms,
          quantityLabel: formatMultiUomQuantity(qty, uomProduct),
        };
      })
      .filter((row) => row.quantity > 0)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    type TopProductApiRow = {
      product_id?: string;
      productId?: string;
      product_name?: string;
      productName?: string;
      total_revenue?: number | string;
      totalRevenue?: number | string;
      total_quantity?: number | string;
      totalQuantity?: number | string;
    };

    const topSellers = (Array.isArray(topSelling) ? topSelling : []).map((row: TopProductApiRow) => ({
      productId: String(row.product_id ?? row.productId ?? ''),
      productName: String(row.product_name ?? row.productName ?? 'Unknown'),
      quantity: parseNum(row.total_quantity ?? row.totalQuantity),
      revenue: parseNum(row.total_revenue ?? row.totalRevenue),
    }));

    let todayLabel = "Today's activity";
    let todayValue = '—';
    let todaySublabel: string | undefined;

    if (isPosSelling) {
      const summary = todaySales as { totalAmount?: number; totalSales?: number } | undefined;
      const amount = parseNum(summary?.totalAmount ?? summary?.totalSales);
      todayLabel = "Today's sales";
      todayValue = String(amount);
      if (posStoreCount > 1) {
        todaySublabel = 'Company total (per-store sales tracking coming soon)';
      }
    } else {
      const receiptsToday = extractListTotal(receiptsResponse?.data);
      todayLabel = 'Receipts today';
      todayValue = String(receiptsToday);
      todaySublabel = 'Goods received network-wide';
    }

    const recentTransfers = related
      .slice()
      .sort((a, b) => transferTimestamp(b).localeCompare(transferTimestamp(a)))
      .slice(0, 6)
      .map((t) => ({
        id: t.id,
        transferNumber: t.transferNumber,
        status: t.status,
        routeLabel: buildRouteLabel(t, storeMap, storeId),
        occurredAt: transferTimestamp(t),
      }));

    type MovementRow = {
      id: string;
      productId?: string;
      productName?: string;
      movementType: string;
      quantity?: number | string;
      createdAt: string;
      grNumber?: string;
      saleNumber?: string;
      referenceType?: string;
      referenceId?: string;
    };

    let movementPayload: unknown = movementsData;
    if (movementPayload && typeof movementPayload === 'object' && 'data' in movementPayload) {
      const wrapped = movementPayload as { data?: unknown };
      movementPayload = Array.isArray(wrapped.data) ? wrapped.data : wrapped.data;
    }
    const movementRows = Array.isArray(movementPayload) ? (movementPayload as MovementRow[]) : [];

    const recentMovements = movementRows
      .filter((m) => !m.productId || storeProductIds.has(m.productId))
      .slice(0, 8)
      .map((m) => {
        let referenceLabel: string | undefined;
        if (m.grNumber) referenceLabel = m.grNumber;
        else if (m.saleNumber) referenceLabel = m.saleNumber;
        else if (m.referenceType && m.referenceId) {
          referenceLabel = `${m.referenceType} ${m.referenceId.slice(0, 8)}`;
        }
        return {
          id: m.id,
          productName: m.productName ?? 'Unknown product',
          movementType: m.movementType,
          quantity: parseNum(m.quantity),
          createdAt: m.createdAt,
          referenceLabel,
        };
      });

    const isLoading =
      stockLoading ||
      lotsLoading ||
      transfersLoading ||
      movementsLoading ||
      (isPosSelling && (salesLoading || topSellingLoading)) ||
      (!isPosSelling && receiptsLoading);

    return {
      metrics: {
        inventoryValue,
        lowStockCount,
        totalQty,
        lineCount: parsedStockRows.length,
        productCount,
        pendingTransfers,
        incomingTransfers,
        outgoingTransfers,
        expiringLotCount: expiringLots.length,
        todayLabel,
        todayValue,
        todaySublabel,
      },
      topSellers: isPosSelling ? topSellers : [],
      topStockAtStore,
      currentInventory,
      expiringLots,
      recentTransfers,
      recentMovements,
      isLoading,
    };
  }, [
    enabled,
    storeId,
    store,
    transfers,
    parsedStockRows,
    lots,
    topSelling,
    todaySales,
    receiptsResponse,
    movementsData,
    storeMap,
    storeProductIds,
    isPosSelling,
    posStoreCount,
    stockLoading,
    lotsLoading,
    transfersLoading,
    movementsLoading,
    salesLoading,
    topSellingLoading,
    receiptsLoading,
  ]);
}
