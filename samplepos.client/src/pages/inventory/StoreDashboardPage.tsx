/**
 * Per-store operational dashboard — route `/inventory/stores/:storeId`
 * Default tab: Inventory Overview (not Settings).
 */

import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMultistoreEnabled } from '../../hooks/useMultistore';
import { useStoreLocations } from '../../hooks/useWarehouse';
import { useStoreDashboard } from '../../hooks/useStoreDashboard';
import { StoreLocationSettingsPanel } from '../../components/inventory/StoreLocationSettingsPanel';
import {
  StoreCurrentInventoryPanel,
  StoreDashboardKpiBar,
  StoreExpiringLotsPanel,
  StoreRecentActivityPanel,
  StoreTopProductsPanel,
} from '../../components/inventory/StoreDashboardPanels';
import { Button } from '../../components/ui/button';

type StoreDashboardTab = 'overview' | 'settings';

export default function StoreDashboardPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const navigate = useNavigate();
  const { isMultistoreEnabled, isLoading: flagLoading } = useMultistoreEnabled();
  const { data: stores = [], isLoading } = useStoreLocations(isMultistoreEnabled);
  const [activeTab, setActiveTab] = useState<StoreDashboardTab>('overview');

  const store = stores.find((s) => s.id === storeId) ?? null;
  const dashboardEnabled = isMultistoreEnabled && !!storeId && !!store;

  const dashboard = useStoreDashboard(storeId, store, dashboardEnabled);

  const posSellingStores = useMemo(
    () => stores.filter((s) => s.isPosSelling && s.isActive),
    [stores],
  );

  if (flagLoading || isLoading) {
    return <div className="p-6 text-gray-500">Loading…</div>;
  }

  if (!isMultistoreEnabled) {
    return (
      <div className="p-6">
        <div className="bg-gray-50 border rounded-lg p-8 text-center text-gray-600">
          Multi-store mode is not enabled.
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="p-6">
        <p className="text-gray-600 mb-4">Store not found.</p>
        <Button type="button" variant="outline" onClick={() => navigate('/inventory/store-network/stores')}>
          ← Back to Store Network
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <Link
            to="/inventory/store-network/stores"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Store Network
          </Link>
          <h2 className="text-2xl font-bold text-gray-900 mt-2">{store.name}</h2>
          <p className="text-gray-600 mt-1">
            {store.code} · {store.storeType}
            {store.isPosSelling && (
              <span className="ml-2 text-blue-600 font-medium">POS selling</span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <Link
            to="/inventory/store-transfers"
            className="text-sm px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
          >
            Transfers
          </Link>
          <Link
            to="/inventory/stock-levels"
            className="text-sm px-3 py-1.5 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100"
          >
            Stock levels
          </Link>
        </div>
      </div>

      <nav
        className="flex gap-1 overflow-x-auto border-b mb-6 pb-0"
        aria-label="Store dashboard sections"
      >
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
            activeTab === 'overview'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
          }`}
        >
          Inventory Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
            activeTab === 'settings'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
          }`}
        >
          Settings
        </button>
      </nav>

      {activeTab === 'overview' && (
        <>
          <StoreDashboardKpiBar
            metrics={dashboard.metrics}
            isPosSelling={store.isPosSelling}
            loading={dashboard.isLoading}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <StoreTopProductsPanel
              topSellers={dashboard.topSellers}
              topStockAtStore={dashboard.topStockAtStore}
              isPosSelling={store.isPosSelling}
              loading={dashboard.isLoading}
            />
            <StoreExpiringLotsPanel rows={dashboard.expiringLots} loading={dashboard.isLoading} />
          </div>

          <StoreCurrentInventoryPanel rows={dashboard.currentInventory} loading={dashboard.isLoading} />

          <StoreRecentActivityPanel
            transfers={dashboard.recentTransfers}
            movements={dashboard.recentMovements}
            loading={dashboard.isLoading}
          />
        </>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-6 max-w-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="bg-white border rounded-lg p-3">
              <div className="text-xs text-gray-500 uppercase">POS selling</div>
              <div className="font-medium mt-1">{store.isPosSelling ? 'Enabled' : 'No'}</div>
            </div>
            <div className="bg-white border rounded-lg p-3">
              <div className="text-xs text-gray-500 uppercase">Default receiving</div>
              <div className="font-medium mt-1">{store.isDefaultReceiving ? 'Yes' : 'No'}</div>
            </div>
            <div className="bg-white border rounded-lg p-3">
              <div className="text-xs text-gray-500 uppercase">Store type</div>
              <div className="font-medium mt-1">{store.storeType}</div>
            </div>
            <div className="bg-white border rounded-lg p-3">
              <div className="text-xs text-gray-500 uppercase">Assigned users</div>
              <div className="font-medium mt-1 text-gray-400">Coming in Phase 2</div>
            </div>
          </div>

          <div className="bg-white border rounded-lg p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4">Store settings</h3>
            <StoreLocationSettingsPanel store={store} posSellingStores={posSellingStores} />
          </div>
        </div>
      )}
    </div>
  );
}
