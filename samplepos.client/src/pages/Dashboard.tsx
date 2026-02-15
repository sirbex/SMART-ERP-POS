import Layout from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import ExpiryAlertsWidget from '../components/ExpiryAlertsWidget';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const modules = [
    { name: 'Point of Sale', path: '/pos', icon: '🛒', color: 'bg-blue-500' },
    { name: 'Products', path: '/inventory/products', icon: '📦', color: 'bg-green-500' },
    { name: 'Inventory', path: '/inventory', icon: '📊', color: 'bg-purple-500' },
    { name: 'Customers', path: '/customers', icon: '👥', color: 'bg-yellow-500' },
    { name: 'Suppliers', path: '/suppliers', icon: '🏢', color: 'bg-indigo-500' },
    { name: 'Purchase Orders', path: '/inventory/purchase-orders', icon: '📝', color: 'bg-pink-500' },
    { name: 'Goods Receipts', path: '/inventory/goods-receipts', icon: '📥', color: 'bg-teal-500' },
    { name: 'Sales', path: '/sales', icon: '💰', color: 'bg-orange-500' },
    { name: 'Stock Movements', path: '/inventory/stock-movements', icon: '📋', color: 'bg-red-500' },
    { name: 'Reports', path: '/reports', icon: '📈', color: 'bg-cyan-500' },
  ];

  // Add Admin module if user is ADMIN
  const adminModules = user?.role === 'ADMIN' ? [
    { name: 'Admin Data Management', path: '/admin/data-management', icon: '🔧', color: 'bg-gray-800' },
    { name: 'Audit Trail', path: '/admin/audit-trail', icon: '📋', color: 'bg-slate-700' },
  ] : [];

  const allModules = [...modules, ...adminModules];

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-6">Dashboard</h2>

        {/* Expiry Alerts Widget */}
        <div className="mb-4 sm:mb-6">
          <ExpiryAlertsWidget maxAlerts={5} />
        </div>

        {/* Module Navigation Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {allModules.map((module) => (
            <button
              key={module.path}
              onClick={() => navigate(module.path)}
              className={`${module.color} text-white p-4 sm:p-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 text-left hover:scale-105`}
            >
              <div className="text-3xl sm:text-4xl mb-2">{module.icon}</div>
              <h3 className="text-lg sm:text-xl font-semibold">{module.name}</h3>
            </button>
          ))}
        </div>
      </div>
    </Layout>
  );
}
