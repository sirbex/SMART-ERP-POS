import { useMemo, useState } from 'react';
import { useProductStoreDistribution, useStoreLotsAtStore } from '../../hooks/useWarehouse';
import { formatCurrency } from '../../utils/currency';
import type { WarehouseLotRow } from '../../hooks/useWarehouse';

interface DistributionRow {
  storeLocationId: string;
  storeCode: string;
  storeName: string;
  storeType: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityCommitted: number;
  availableQuantity: number;
}

function storeTypeBadgeClass(storeType: string): string {
  switch (storeType) {
    case 'MAIN':
      return 'bg-indigo-100 text-indigo-800';
    case 'SELLING':
      return 'bg-green-100 text-green-800';
    case 'TRANSIT':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function StoreProductLots({
  storeId,
  productId,
  enabled,
}: {
  storeId: string;
  productId: string;
  enabled: boolean;
}) {
  const { data: lots = [], isLoading } = useStoreLotsAtStore(storeId, enabled);

  const productLots = useMemo(
    () => (lots as WarehouseLotRow[]).filter((l) => l.productId === productId),
    [lots, productId],
  );

  if (!enabled) return null;

  if (isLoading) {
    return <p className="text-xs text-gray-500 py-2">Loading lots…</p>;
  }

  if (productLots.length === 0) {
    return <p className="text-xs text-gray-500 py-2">No active lots at this location.</p>;
  }

  return (
    <div className="mt-2 border-t pt-2 space-y-2">
      <div className="grid grid-cols-3 gap-2 text-[10px] font-semibold text-gray-500 uppercase">
        <span>Lot</span>
        <span>Expiry</span>
        <span className="text-right">Qty</span>
      </div>
      {productLots.map((lot) => (
        <div key={lot.productLotId} className="grid grid-cols-3 gap-2 text-sm text-gray-800">
          <span className="font-mono text-xs truncate">{lot.lotNumber}</span>
          <span className="text-xs text-gray-600">{lot.expiryDate?.slice(0, 10) ?? '—'}</span>
          <span className="text-right font-medium">{lot.availableQuantity}</span>
        </div>
      ))}
    </div>
  );
}

interface ProductStockDetailCardsProps {
  productId: string;
  enabled: boolean;
  /** Optional cost for inventory value estimate (company average). */
  unitCost?: number;
}

export function ProductStockDetailCards({
  productId,
  enabled,
  unitCost = 0,
}: ProductStockDetailCardsProps) {
  const { data, isLoading, error } = useProductStoreDistribution(productId, enabled);
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null);

  const rows = (data ?? []) as DistributionRow[];

  const summary = useMemo(() => {
    const totalOnHand = rows.reduce((sum, r) => sum + r.quantityOnHand, 0);
    const totalAvailable = rows.reduce((sum, r) => sum + r.availableQuantity, 0);
    return {
      totalOnHand,
      totalAvailable,
      inventoryValue: unitCost > 0 ? totalOnHand * unitCost : null,
      locationCount: rows.filter((r) => r.quantityOnHand > 0).length,
    };
  }, [rows, unitCost]);

  if (!enabled) return null;

  if (isLoading) {
    return <div className="px-6 py-4 text-sm text-gray-500">Loading stock by store…</div>;
  }

  if (error) {
    return (
      <div className="px-6 py-4 text-sm text-red-600">Failed to load stock distribution.</div>
    );
  }

  return (
    <div className="px-6 py-4 border-b bg-slate-50/80">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div>
          <div className="text-xs text-gray-500 font-medium">Total Stock</div>
          <div className="text-xl font-bold text-gray-900">{summary.totalOnHand.toFixed(0)}</div>
        </div>
        {unitCost > 0 && (
          <div>
            <div className="text-xs text-gray-500 font-medium">Avg Cost</div>
            <div className="text-xl font-bold text-gray-900">{formatCurrency(unitCost)}</div>
          </div>
        )}
        {summary.inventoryValue != null && (
          <div>
            <div className="text-xs text-gray-500 font-medium">Inventory Value</div>
            <div className="text-xl font-bold text-blue-700">
              {formatCurrency(summary.inventoryValue)}
            </div>
          </div>
        )}
        <div>
          <div className="text-xs text-gray-500 font-medium">Stores with stock</div>
          <div className="text-xl font-bold text-gray-900">{summary.locationCount}</div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Stores</div>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">No stock across store locations.</p>
        ) : (
          rows.map((row) => {
            const isOpen = expandedStoreId === row.storeLocationId;
            return (
              <div key={row.storeLocationId} className="bg-white border rounded-lg overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
                  onClick={() =>
                    setExpandedStoreId(isOpen ? null : row.storeLocationId)
                  }
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-full ${storeTypeBadgeClass(row.storeType)}`}
                    >
                      {row.storeType}
                    </span>
                    <span className="font-medium text-gray-900 truncate">{row.storeName}</span>
                    <span className="text-xs text-gray-400">{row.storeCode}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-lg font-bold text-gray-900">
                      {row.quantityOnHand.toFixed(0)}
                    </span>
                    <span className="text-gray-400 text-sm">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-3 bg-gray-50/50">
                    <div className="flex gap-4 text-xs text-gray-600 mb-1">
                      <span>Available: {row.availableQuantity.toFixed(2)}</span>
                      <span>Reserved: {row.quantityReserved.toFixed(2)}</span>
                    </div>
                    <StoreProductLots
                      storeId={row.storeLocationId}
                      productId={productId}
                      enabled={isOpen}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
