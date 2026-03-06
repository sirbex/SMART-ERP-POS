import { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Layout from './Layout';
import { useOfflineContext } from '../contexts/OfflineContext';

interface InventoryLayoutProps {
  children: ReactNode;
}

export default function InventoryLayout({ children }: InventoryLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isOnline } = useOfflineContext();

  const tabs = [
    { id: 'stock-levels', label: 'Stock Levels', path: '/inventory', icon: '📦' },
    { id: 'products', label: 'Products', path: '/inventory/products', icon: '🏷️' },
    { id: 'batches', label: 'Batch Management', path: '/inventory/batches', icon: '🔢' },
    { id: 'stock-movements', label: 'Stock Movements', path: '/inventory/stock-movements', icon: '📊' },
    { id: 'purchase-orders', label: 'Purchase Orders', path: '/inventory/purchase-orders', icon: '📝' },
    { id: 'goods-receipts', label: 'Goods Receipts', path: '/inventory/goods-receipts', icon: '📥' },
    { id: 'uoms', label: 'Units of Measure', path: '/inventory/uoms', icon: '📐' },
    { id: 'barcode-lookup', label: 'Barcode Lookup', path: '/inventory/barcode-lookup', icon: '📡' },
  ];

  const isActiveTab = (path: string) => {
    if (path === '/inventory') {
      return location.pathname === '/inventory';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <Layout>
      <div className="h-full flex flex-col">
        {/* Inventory Module Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="text-3xl">📦</div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
              <p className="text-sm text-gray-600">Manage stock, products, orders, and movements</p>
            </div>
            {!isOnline && (
              <span className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Offline Mode
              </span>
            )}
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-2 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => navigate(tab.path)}
                className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors flex items-center gap-2 ${isActiveTab(tab.path)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </Layout>
  );
}
