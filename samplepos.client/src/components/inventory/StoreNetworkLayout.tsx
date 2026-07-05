import { ReactNode, useMemo } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useMultistoreEnabled } from '../../hooks/useMultistore';
import { useCanAccess } from '../auth/ProtectedRoute';
import { STORE_NETWORK_NAV, isStoreNetworkNavActive, filterInventoryNavByPermissions } from './inventoryNavConfig';
import { useAuth } from '../../hooks/useAuth';

interface StoreNetworkLayoutProps {
  children: ReactNode;
}

/**
 * Sub-navigation inside Store Network (stores, transfers, counts, assortment, …).
 */
export function StoreNetworkLayout({ children }: StoreNetworkLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isMultistoreEnabled, isLoading } = useMultistoreEnabled();
  const { user, permissions } = useAuth();
  const canAccessTransferApprovals = useCanAccess(undefined, [
    'inventory.transfer.approve',
    'inventory.transfer.dispatch',
    'inventory.transfer.receive',
    'inventory.approve',
  ]);

  const subNavTabs = useMemo(
    () =>
      filterInventoryNavByPermissions(STORE_NETWORK_NAV, permissions, user?.role).filter(
        (tab) => tab.id !== 'transfer-approvals' || canAccessTransferApprovals,
      ),
    [permissions, user?.role, canAccessTransferApprovals],
  );

  if (isLoading) {
    return <div className="p-6 text-gray-500">Loading…</div>;
  }

  if (!isMultistoreEnabled) {
    return (
      <div className="p-6">
        <div className="bg-gray-50 border rounded-lg p-8 text-center text-gray-600 max-w-lg mx-auto">
          <p className="font-medium text-gray-900 mb-2">Store Network is not available</p>
          <p className="text-sm">
            Enable multi-store mode under Settings → System → Inventory to create stores and manage
            your warehouse network.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-4 pb-0 border-b bg-slate-50/80">
        <div className="mb-3">
          <h2 className="text-xl font-bold text-gray-900">Store Network</h2>
          <p className="text-sm text-gray-600">
            Warehouses, transfers, store-scoped counts, and per-location assortment.
          </p>
        </div>
        <nav className="flex gap-1 overflow-x-auto pb-3" aria-label="Store network sections">
          {subNavTabs.map((tab) => {
            const active = isStoreNetworkNavActive(location.pathname, tab.path);
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => navigate(tab.path)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2 ${
                  active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span aria-hidden>{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
          <button
            type="button"
            disabled
            title="Coming in a future release"
            className="px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap text-gray-400 border border-dashed border-gray-200 cursor-not-allowed"
          >
            Zones <span className="text-[10px] uppercase ml-1">(future)</span>
          </button>
        </nav>
      </div>
      <div className="flex-1 overflow-auto">{children}</div>
    </div>
  );
}

/** Redirect legacy /inventory/stores to new path. */
export function StoreNetworkStoresRedirect() {
  return <Navigate to="/inventory/store-network/stores" replace />;
}
