import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { formatCurrency } from '../../utils/currency';
import { formatTimestamp } from '../../utils/businessDate';
import { NetworkKpiCard } from './NetworkKpiCard';
import { DataTable } from '../shared/DataTable';
import type { DataTableColumn } from '../shared/DataTable';
import type {
  StoreDashboardMetrics,
  StoreExpiringLotRow,
  StoreInventoryRow,
  StoreRecentMovementRow,
  StoreRecentTransferRow,
  StoreTopSellerRow,
  StoreTopStockRow,
} from '../../hooks/useStoreDashboard';

const MOVEMENT_LABELS: Record<string, string> = {
  GOODS_RECEIPT: 'Goods receipt',
  SALE: 'Sale',
  ADJUSTMENT_IN: 'Adjustment in',
  ADJUSTMENT_OUT: 'Adjustment out',
  TRANSFER_IN: 'Transfer in',
  TRANSFER_OUT: 'Transfer out',
  RETURN: 'Return',
  SUPPLIER_RETURN: 'Supplier return',
  DAMAGE: 'Damage',
  EXPIRY: 'Expiry',
  OPENING_BALANCE: 'Opening balance',
};

export function StoreDashboardKpiBar({
  metrics,
  isPosSelling,
  loading,
}: {
  metrics: StoreDashboardMetrics;
  isPosSelling: boolean;
  loading?: boolean;
}) {
  const todayDisplay =
    metrics.todayLabel.includes('sales') && metrics.todayValue !== '—'
      ? formatCurrency(parseFloat(metrics.todayValue) || 0)
      : metrics.todayValue;

  return (
    <div className="mb-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-3">
        <NetworkKpiCard
          label="Inventory value"
          value={formatCurrency(metrics.inventoryValue)}
          accent="text-blue-700"
          loading={loading}
        />
        <NetworkKpiCard
          label="Available units"
          value={metrics.totalQty.toFixed(0)}
          accent="text-gray-900"
          loading={loading}
        />
        <NetworkKpiCard
          label="Products"
          value={String(metrics.productCount)}
          loading={loading}
        />
        <NetworkKpiCard
          label="Low stock"
          value={String(metrics.lowStockCount)}
          accent={metrics.lowStockCount > 0 ? 'text-red-700' : 'text-gray-900'}
          loading={loading}
        />
        <NetworkKpiCard
          label="Expiring"
          value={String(metrics.expiringLotCount)}
          accent={metrics.expiringLotCount > 0 ? 'text-orange-700' : 'text-gray-900'}
          loading={loading}
        />
        <NetworkKpiCard
          label="Incoming"
          value={String(metrics.incomingTransfers)}
          accent="text-indigo-700"
          loading={loading}
        />
        <NetworkKpiCard
          label="Outgoing"
          value={String(metrics.outgoingTransfers)}
          accent="text-violet-700"
          loading={loading}
        />
      </div>
      {(isPosSelling || metrics.todayValue !== '—') && (
        <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
          <span className="text-gray-500">{metrics.todayLabel}:</span>
          <span
            className={`font-semibold ${isPosSelling ? 'text-emerald-700' : 'text-teal-700'}`}
          >
            {todayDisplay}
          </span>
          {metrics.pendingTransfers > 0 && (
            <span className="text-xs text-amber-700">
              · {metrics.pendingTransfers} pending transfer
              {metrics.pendingTransfers === 1 ? '' : 's'}
            </span>
          )}
          {metrics.todaySublabel && (
            <span className="text-xs text-gray-400 w-full">{metrics.todaySublabel}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function StoreTopProductsPanel({
  topSellers,
  topStockAtStore,
  isPosSelling,
  loading,
}: {
  topSellers: StoreTopSellerRow[];
  topStockAtStore: StoreTopStockRow[];
  isPosSelling: boolean;
  loading?: boolean;
}) {
  const rows = isPosSelling ? topSellers : topStockAtStore;

  return (
    <div className="bg-white border rounded-lg p-5 shadow-sm h-full">
      <h3 className="font-semibold text-gray-900 mb-1">
        {isPosSelling ? 'Top sellers (7 days)' : 'Top stock at location'}
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        {isPosSelling
          ? 'Best performers company-wide this week'
          : 'Highest quantity on hand at this location'}
      </p>
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No data yet.</p>
      ) : isPosSelling ? (
        <ul className="space-y-3">
          {topSellers.map((row, index) => (
            <li key={row.productId || index} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{row.productName}</div>
                <div className="text-xs text-gray-500">{row.quantity.toFixed(0)} units sold</div>
              </div>
              <div className="text-sm font-semibold text-gray-800 shrink-0">
                {formatCurrency(row.revenue)}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-3">
          {topStockAtStore.map((row, index) => (
            <li key={row.productId || index} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{row.productName}</div>
                <div className="text-xs text-gray-500">{formatCurrency(row.inventoryValue)} value</div>
              </div>
              <div className="text-sm font-semibold text-blue-700 shrink-0 text-right">
                <div>{row.quantityLabel ?? `${row.quantity.toFixed(0)} units`}</div>
                <div className="text-[10px] font-normal text-gray-400">
                  {row.quantity.toFixed(2)} base
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function StoreCurrentInventoryPanel({
  rows,
  loading,
}: {
  rows: StoreInventoryRow[];
  loading?: boolean;
}) {
  const columns = useMemo((): DataTableColumn<StoreInventoryRow>[] => [
    {
      id: 'product',
      header: 'Product',
      cell: (row) => (
        <div className="min-w-0">
          <div className="font-medium text-gray-900 truncate">{row.productName}</div>
        </div>
      ),
    },
    {
      id: 'quantity',
      header: 'On hand',
      align: 'right',
      cell: (row) => (
        <div className="text-right">
          <div className="font-medium text-gray-900">{row.quantityLabel ?? row.quantity.toFixed(0)}</div>
          <div className="text-[10px] text-gray-400">{row.quantity.toFixed(2)} base</div>
        </div>
      ),
    },
    {
      id: 'value',
      header: 'Value',
      align: 'right',
      cell: (row) => (
        <span className="font-medium text-gray-800">{formatCurrency(row.inventoryValue)}</span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      align: 'center',
      cell: (row) =>
        row.needsReorder ? (
          <span className="text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded">Low</span>
        ) : (
          <span className="text-xs text-gray-400">OK</span>
        ),
    },
  ], []);

  return (
    <div className="bg-white border rounded-lg shadow-sm mb-8">
      <div className="px-5 py-4 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="font-semibold text-gray-900">Current inventory</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {rows.length} product{rows.length === 1 ? '' : 's'} with on-hand quantity
          </p>
        </div>
        <Link
          to="/inventory/stock-levels"
          className="text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0"
        >
          Full stock levels →
        </Link>
      </div>
      <DataTable
        columns={columns}
        data={rows}
        getRowKey={(row) => row.productId}
        isLoading={loading}
        loadingMessage="Loading inventory…"
        emptyMessage="No stock on hand at this location."
        stickyHeader
        className="shadow-none rounded-none border-0"
      />
    </div>
  );
}

export function StoreExpiringLotsPanel({
  rows,
  loading,
}: {
  rows: StoreExpiringLotRow[];
  loading?: boolean;
}) {
  return (
    <div className="bg-white border rounded-lg p-5 shadow-sm h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Expiring lots</h3>
        <Link
          to="/inventory/batches"
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          Batch management
        </Link>
      </div>
      {loading ? (
        <p className="text-sm text-gray-500">Loading lots…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No lots expiring within 30 days.</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2 text-[10px] font-semibold text-gray-500 uppercase">
            <span className="col-span-2">Product / lot</span>
            <span>Expiry</span>
            <span className="text-right">Qty</span>
          </div>
          {rows.map((lot) => (
            <div
              key={lot.productLotId}
              className={`grid grid-cols-4 gap-2 text-sm py-2 border-t ${
                lot.daysUntilExpiry <= 7 ? 'text-red-800' : 'text-gray-800'
              }`}
            >
              <div className="col-span-2 min-w-0">
                <div className="font-medium truncate">{lot.productName}</div>
                <div className="text-xs text-gray-500 font-mono truncate">{lot.lotNumber}</div>
              </div>
              <div className="text-xs">
                {lot.expiryDate}
                <div className="text-gray-400">
                  {lot.daysUntilExpiry < 0 ? 'Expired' : `${lot.daysUntilExpiry}d`}
                </div>
              </div>
              <div className="text-right font-medium">{lot.availableQuantity}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StoreRecentActivityPanel({
  transfers,
  movements,
  loading,
}: {
  transfers: StoreRecentTransferRow[];
  movements: StoreRecentMovementRow[];
  loading?: boolean;
}) {
  return (
    <div className="bg-white border rounded-lg shadow-sm">
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Recent activity</h3>
        <div className="flex gap-3 text-xs">
          <Link to="/inventory/store-transfers" className="text-blue-600 hover:text-blue-800 font-medium">
            Transfers
          </Link>
          <Link to="/inventory/stock-movements" className="text-blue-600 hover:text-blue-800 font-medium">
            Movements
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="p-5 text-sm text-gray-500">Loading activity…</p>
      ) : transfers.length === 0 && movements.length === 0 ? (
        <p className="p-5 text-sm text-gray-500">No recent activity for this location.</p>
      ) : (
        <div className="divide-y">
          {transfers.map((t) => (
            <div key={`tr-${t.id}`} className="px-5 py-3 flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-gray-900">
                  Transfer {t.transferNumber}
                </div>
                <div className="text-xs text-gray-500">
                  {t.routeLabel} · {t.status.replace(/_/g, ' ')}
                </div>
              </div>
              <div className="text-xs text-gray-400 shrink-0">{formatTimestamp(t.occurredAt)}</div>
            </div>
          ))}
          {movements.map((m) => (
            <div key={`mv-${m.id}`} className="px-5 py-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{m.productName}</div>
                <div className="text-xs text-gray-500">
                  {MOVEMENT_LABELS[m.movementType] ?? m.movementType}
                  {m.referenceLabel ? ` · ${m.referenceLabel}` : ''}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div
                  className={`text-sm font-semibold tabular-nums ${
                    m.quantity >= 0 ? 'text-green-700' : 'text-red-700'
                  }`}
                >
                  {m.quantity >= 0 ? '+' : ''}
                  {m.quantity}
                </div>
                <div className="text-xs text-gray-400">{formatTimestamp(m.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
