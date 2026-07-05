/**
 * Inventory Command Center — route `/inventory`
 */
import { Link, useNavigate } from 'react-router-dom';
import { useInventoryCommandCenter } from '../../hooks/useInventoryCommandCenter';
import { useMultistoreEnabled } from '../../hooks/useMultistore';
import { MultistoreGate } from '../../components/inventory/MultistoreGate';
import { formatTimestamp } from '../../utils/businessDate';
import { Button } from '../../components/ui/button';

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

function TodayMetric({
  label,
  value,
  accent,
  loading,
  to,
}: {
  label: string;
  value: number;
  accent?: string;
  loading?: boolean;
  to?: string;
}) {
  const inner = (
    <div className="bg-white border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow h-full">
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`text-3xl font-bold mt-2 ${accent ?? 'text-gray-900'}`}>
        {loading ? '…' : value}
      </div>
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}

function QuickAction({
  label,
  description,
  icon,
  onClick,
}: {
  label: string;
  description: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-white border rounded-xl p-4 shadow-sm hover:border-blue-300 hover:shadow-md transition-all"
    >
      <div className="text-2xl mb-2">{icon}</div>
      <div className="font-semibold text-gray-900">{label}</div>
      <div className="text-sm text-gray-500 mt-1">{description}</div>
    </button>
  );
}

export default function InventoryCommandCenterPage() {
  const navigate = useNavigate();
  const { isMultistoreEnabled } = useMultistoreEnabled();
  const { metrics, recentActivity, activityLoading } = useInventoryCommandCenter();

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-gray-600 mt-1">
          Today&apos;s inventory pulse — operational overview and shortcuts.
        </p>
      </div>

      <section className="mb-8">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Today</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <TodayMetric
            label="Receipts"
            value={metrics.receiptsToday}
            accent="text-teal-700"
            loading={metrics.isLoading}
            to="/inventory/goods-receipts"
          />
          <MultistoreGate>
            <TodayMetric
              label="Transfers"
              value={metrics.transfersToday}
              accent="text-indigo-700"
              loading={metrics.isLoading}
              to="/inventory/store-transfers"
            />
          </MultistoreGate>
          <MultistoreGate>
            <TodayMetric
              label="Pending"
              value={metrics.pendingTransfers}
              accent="text-amber-700"
              loading={metrics.isLoading}
              to="/inventory/transfer-approvals"
            />
          </MultistoreGate>
          <TodayMetric
            label="Low stock"
            value={metrics.lowStockCount}
            accent={metrics.lowStockCount > 0 ? 'text-red-700' : 'text-gray-900'}
            loading={metrics.isLoading}
            to="/inventory/stock-levels"
          />
          <TodayMetric
            label="Expiring"
            value={metrics.expiringCount}
            accent={metrics.expiringCount > 0 ? 'text-orange-700' : 'text-gray-900'}
            loading={metrics.isLoading}
            to="/inventory/batches"
          />
        </div>
        {!isMultistoreEnabled && (
          <p className="text-xs text-gray-400 mt-2">
            Transfer metrics appear when multi-store mode is enabled.
          </p>
        )}
      </section>

      <section className="mb-8">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Quick actions
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <QuickAction
            label="Receive goods"
            description="Record incoming stock from suppliers"
            icon="📥"
            onClick={() => navigate('/inventory/goods-receipts')}
          />
          <MultistoreGate>
            <QuickAction
              label="Transfer stock"
              description="Move inventory between locations"
              icon="🚚"
              onClick={() => navigate('/inventory/store-transfers')}
            />
          </MultistoreGate>
          <QuickAction
            label="Count inventory"
            description="Physical stock counts and reconciliation"
            icon="🔢"
            onClick={() => navigate('/inventory/adjustments')}
          />
          <QuickAction
            label="Adjust stock"
            description="Corrections, damage, and write-offs"
            icon="⚖️"
            onClick={() => navigate('/inventory/adjustments')}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-white border rounded-xl shadow-sm">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Recent activity</h3>
            <Link
              to="/inventory/stock-movements"
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              View all
            </Link>
          </div>
          <div className="divide-y">
            {activityLoading ? (
              <p className="p-5 text-sm text-gray-500">Loading movements…</p>
            ) : recentActivity.length === 0 ? (
              <p className="p-5 text-sm text-gray-500">No recent stock movements.</p>
            ) : (
              recentActivity.map((item) => (
                <div key={item.id} className="px-5 py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{item.productName}</div>
                    <div className="text-sm text-gray-500">
                      {MOVEMENT_LABELS[item.movementType] ?? item.movementType}
                      {item.referenceLabel ? ` · ${item.referenceLabel}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`font-semibold tabular-nums ${
                        item.quantity >= 0 ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      {item.quantity >= 0 ? '+' : ''}
                      {item.quantity}
                    </div>
                    <div className="text-xs text-gray-400">{formatTimestamp(item.createdAt)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="bg-white border rounded-xl shadow-sm p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Browse</h3>
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => navigate('/inventory/stock-levels')}
            >
              📦 Stock levels
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => navigate('/inventory/products')}
            >
              🏷️ Products
            </Button>
            <MultistoreGate>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => navigate('/inventory/store-network/stores')}
              >
                🏪 Warehouse network
              </Button>
            </MultistoreGate>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={() => navigate('/inventory/purchase-orders')}
            >
              📝 Purchase orders
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
