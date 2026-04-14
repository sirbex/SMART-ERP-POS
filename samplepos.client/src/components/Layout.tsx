import { useMemo, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useTenant } from '../contexts/TenantContext';
import { PasswordExpiryWarning } from './auth/PasswordExpiryWarning';
import ServerClock from './ServerClock';

interface LayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  name: string;
  path: string;
  icon: string;
  color: string;
  permissions?: string[];  // RBAC permission keys — user needs ANY
  feature?: string;        // Plan feature key — hidden if plan lacks it
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout, permissions } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const { config } = useTenant();
  const brandName = config.branding.companyName || config.name || 'SMART ERP';

  const navItems: NavItem[] = [
    { name: 'Dashboard', path: '/dashboard', icon: '📊', color: 'text-blue-600' },
    { name: 'Point of Sale', path: '/pos', icon: '🛒', color: 'text-green-600', permissions: ['pos.read', 'pos.create'], feature: 'pos' },
    { name: 'Orders Queue', path: '/orders-queue', icon: '📋', color: 'text-orange-600', permissions: ['orders.read'], feature: 'pos' },
    { name: 'Inventory', path: '/inventory', icon: '📦', color: 'text-purple-600', permissions: ['inventory.read'], feature: 'inventory' },
    { name: 'Customers', path: '/customers', icon: '👥', color: 'text-yellow-600', permissions: ['customers.read'], feature: 'customers' },
    { name: 'Suppliers', path: '/suppliers', icon: '🏢', color: 'text-indigo-600', permissions: ['suppliers.read'], feature: 'customers' },
    { name: 'Sales', path: '/sales', icon: '💰', color: 'text-emerald-600', permissions: ['sales.read'], feature: 'pos' },
    { name: 'Quotations', path: '/quotations', icon: '💼', color: 'text-blue-500', permissions: ['quotations.read'], feature: 'invoices' },
    { name: 'CRM', path: '/crm', icon: '🤝', color: 'text-violet-600', permissions: ['crm.read'], feature: 'customers' },
    { name: 'HR & Payroll', path: '/hr', icon: '📇', color: 'text-pink-600', permissions: ['hr.read'], feature: 'hr' },
    { name: 'Delivery Notes', path: '/delivery-notes', icon: '📋', color: 'text-orange-600', permissions: ['delivery.read'], feature: 'invoices' },
    { name: 'Delivery', path: '/delivery', icon: '🚚', color: 'text-teal-600', permissions: ['delivery.read'], feature: 'invoices' },
    { name: 'Pricing', path: '/pricing', icon: '🏷️', color: 'text-rose-600', permissions: ['settings.read'], feature: 'pos' },
    { name: 'Accounting', path: '/accounting', icon: '🧾', color: 'text-orange-600', permissions: ['accounting.read'], feature: 'accounting' },
    { name: 'Reports', path: '/reports', icon: '📈', color: 'text-cyan-600', permissions: ['reports.read', 'reports.sales_view', 'reports.financial_view'], feature: 'reports' },
  ];

  const adminNavItems: NavItem[] = [
    { name: 'Import', path: '/import', icon: '📥', color: 'text-violet-600', permissions: ['admin.create'] },
    { name: 'Settings', path: '/settings', icon: '⚙️', color: 'text-gray-600', permissions: ['system.manage'] },
    { name: 'Roles', path: '/admin/roles', icon: '🔐', color: 'text-pink-600', permissions: ['admin.update'] },
  ];

  // Filter items: show if user has legacy role access OR RBAC permission
  const isAdminOrManager = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  const planFeatures = config.planFeatures ?? [];

  const allNavItems = useMemo(() => {
    const items = [...navItems, ...adminNavItems];
    return items.filter(item => {
      // Plan feature gate — hide if plan doesn't include the feature
      if (item.feature && planFeatures.length > 0 && !planFeatures.includes(item.feature)) {
        return false;
      }
      // Dashboard always visible
      if (!item.permissions) return true;
      // Legacy role: ADMIN sees everything, MANAGER sees non-admin items
      if (user?.role === 'ADMIN') return true;
      if (isAdminOrManager && !adminNavItems.includes(item)) return true;
      // RBAC check (synchronous from AuthContext)
      if (item.permissions.some(p => permissions.has(p))) return true;
      return false;
    });
  }, [user?.role, permissions, isAdminOrManager, planFeatures]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path: string) => {
    if (path === '/settings/invoice') {
      return location.pathname.startsWith('/settings');
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          } ${sidebarOpen ? 'w-64' : 'lg:w-20 w-64'
          } bg-white shadow-lg transition-all duration-300 ease-in-out flex flex-col fixed h-full z-30 lg:relative`}
      >
        {/* Logo Section */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
          {(sidebarOpen || isDesktop) ? (
            <h1 className={`${sidebarOpen || isDesktop ? 'text-2xl' : 'text-xl'} font-bold text-gray-900`}>
              {sidebarOpen ? brandName : brandName.slice(0, 2).toUpperCase()}
            </h1>
          ) : (
            <span className="text-2xl font-bold text-gray-900">{brandName.slice(0, 2).toUpperCase()}</span>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors hidden lg:block"
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors lg:hidden"
            aria-label="Close sidebar"
          >
            ✕
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-2">
            {allNavItems.map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive(item.path)
                    ? 'bg-blue-50 text-blue-700 font-bold'
                    : 'text-gray-700 hover:bg-gray-100 font-semibold'
                    }`}
                  title={!sidebarOpen && isDesktop ? item.name : undefined}
                  onClick={() => {
                    if (!isDesktop) {
                      setSidebarOpen(false);
                    }
                  }}
                >
                  <span className={`text-xl ${item.color}`}>{item.icon}</span>
                  {(sidebarOpen || !isDesktop) && (
                    <span className="text-sm whitespace-nowrap">{item.name}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* User Section */}
        <div className="border-t border-gray-200 p-4">
          <div className={`${sidebarOpen ? 'flex items-center gap-3' : 'flex flex-col items-center gap-2'}`}>
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
              {user?.fullName?.charAt(0).toUpperCase() || 'U'}
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user?.fullName}
                </p>
                <p className="text-xs text-gray-500 truncate">{user?.role}</p>
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className={`${sidebarOpen ? 'w-full' : 'w-10'
              } mt-3 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors`}
            title={!sidebarOpen ? 'Logout' : undefined}
          >
            {sidebarOpen ? 'Logout' : '🚪'}
          </button>
        </div>
      </aside>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar — always visible */}
        <header className="h-12 bg-white border-b border-gray-200 flex items-center justify-between px-4 sticky top-0 z-10">
          {/* Left: mobile hamburger + brand */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-gray-100 lg:hidden"
              aria-label="Open menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-gray-900 lg:hidden">{brandName}</h1>
          </div>
          {/* Right: clock + avatar */}
          <div className="flex items-center gap-3">
            <ServerClock />
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold lg:hidden">
              {user?.fullName?.charAt(0).toUpperCase() || 'U'}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <PasswordExpiryWarning />
          {children}
        </main>
      </div>
    </div>
  );
}
