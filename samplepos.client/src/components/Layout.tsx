import { useMemo, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useTenant } from '../contexts/TenantContext';
import { PasswordExpiryWarning } from './auth/PasswordExpiryWarning';
import ServerClock from './ServerClock';
import { CASHIER_NAV_ITEMS, isCashierRole } from '../utils/cashierLockdown';
import { createClientAuthorization } from '../authorization/authorizationService';
import { useRestaurantEnabled } from '../hooks/useRestaurantEnabled';
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
  /** When set, item only shows if the tenant module flag is enabled */
  requiresRestaurant?: boolean;
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout, permissions } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const { config, loading: tenantLoading } = useTenant();
  const brandName = config.branding.companyName || config.name || 'SMART ERP';
  const { data: restaurantEnabled = false } = useRestaurantEnabled();

  const navItems: NavItem[] = [
    { name: 'Dashboard', path: '/dashboard', icon: '📊', color: 'text-blue-600' },
    { name: 'Point of Sale', path: '/pos', icon: '🛒', color: 'text-green-600', permissions: ['pos.read', 'pos.create'], feature: 'pos' },
    {
      name: 'Restaurant',
      path: '/restaurant',
      icon: '🍽️',
      color: 'text-amber-700',
      permissions: ['restaurant.read', 'restaurant.order'],
      feature: 'pos',
      requiresRestaurant: true,
    },
    {
      name: 'Kitchen',
      path: '/restaurant/kitchen',
      icon: '👨‍🍳',
      color: 'text-orange-700',
      permissions: ['restaurant.kitchen'],
      feature: 'pos',
      requiresRestaurant: true,
    },
    {
      name: 'Stations',
      path: '/restaurant/stations',
      icon: '🖨️',
      color: 'text-stone-700',
      permissions: ['restaurant.manage'],
      feature: 'pos',
      requiresRestaurant: true,
    },
    {
      name: 'Recipes',
      path: '/restaurant/recipes',
      icon: '🥗',
      color: 'text-lime-700',
      permissions: ['restaurant.manage'],
      feature: 'pos',
      requiresRestaurant: true,
    },
    {
      name: 'Order tags',
      path: '/restaurant/order-tags',
      icon: '🏷️',
      color: 'text-amber-700',
      permissions: ['restaurant.manage'],
      feature: 'pos',
      requiresRestaurant: true,
    },
    { name: 'Orders Queue', path: '/orders-queue', icon: '📋', color: 'text-orange-600', permissions: ['orders.read', 'orders.pay'], feature: 'pos' },
    { name: 'Inventory', path: '/inventory', icon: '📦', color: 'text-purple-600', permissions: ['inventory.read'], feature: 'inventory' },
    { name: 'Customers', path: '/customers', icon: '👥', color: 'text-yellow-600', permissions: ['customers.read'], feature: 'customers' },
    { name: 'Suppliers', path: '/suppliers', icon: '🏢', color: 'text-indigo-600', permissions: ['suppliers.read'], feature: 'purchase_orders' },
    { name: 'Sales', path: '/sales', icon: '💰', color: 'text-emerald-600', permissions: ['sales.read'], feature: 'pos' },
    { name: 'Quotations', path: '/quotations', icon: '💼', color: 'text-blue-500', permissions: ['quotations.read'], feature: 'invoices' },
    { name: 'CRM', path: '/crm', icon: '🤝', color: 'text-violet-600', permissions: ['crm.read'], feature: 'crm' },
    { name: 'HR & Payroll', path: '/hr', icon: '📇', color: 'text-pink-600', permissions: ['hr.read'], feature: 'hr' },
    { name: 'Sales Orders', path: '/distribution/sales-orders', icon: '📦', color: 'text-indigo-600', permissions: ['orders.read'], feature: 'invoices' },
    { name: 'Dispatch', path: '/delivery', icon: '🚚', color: 'text-teal-600', permissions: ['delivery.read'], feature: 'invoices' },
    { name: 'Pricing', path: '/pricing', icon: '🏷️', color: 'text-rose-600', permissions: ['settings.read'], feature: 'pricing' },
    { name: 'Accounting', path: '/accounting', icon: '🧾', color: 'text-orange-600', permissions: ['accounting.read'], feature: 'accounting' },
    { name: 'Reports', path: '/reports', icon: '📈', color: 'text-cyan-600', permissions: ['reports.read', 'reports.sales_view', 'reports.financial_view'], feature: 'reports' },
    { name: 'Category Reports', path: '/reports/category-intelligence', icon: '🏷️', color: 'text-indigo-600', permissions: ['reports.financial_view'], feature: 'reports' },
  ];

  const adminNavItems: NavItem[] = [
    { name: 'Import', path: '/import', icon: '📥', color: 'text-violet-600', permissions: ['admin.create'] },
    { name: 'Settings', path: '/settings', icon: '⚙️', color: 'text-gray-600', permissions: ['system.read'] },
    { name: 'Roles', path: '/admin/roles', icon: '🔐', color: 'text-pink-600', permissions: ['admin.update'] },
  ];

  const planFeatures = config.planFeatures ?? [];

  const allNavItems = useMemo(() => {
    if (isCashierRole(user?.role)) {
      return CASHIER_NAV_ITEMS.map((item) => ({
        name: item.name,
        path: item.path,
        icon: item.icon,
        color: 'text-gray-700',
      }));
    }

    const items = [...navItems, ...adminNavItems];
    // Same engine as ProtectedRoute: ADMIN always allowed; RBAC set otherwise;
    // legacy role fallback only when the permission set is empty.
    const authz = createClientAuthorization(user, permissions);
    return items.filter((item) => {
      if (item.requiresRestaurant && !restaurantEnabled) return false;
      if (item.feature) {
        if (tenantLoading) return false;
        if (planFeatures.length > 0 && !planFeatures.includes(item.feature)) return false;
      }
      if (!item.permissions) return true;
      if (!authz) return false;
      return item.permissions.some((p) => authz.hasPermission(p));
    });
  }, [user, permissions, planFeatures, tenantLoading, restaurantEnabled]);
  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path: string) => {
    if (path === '/settings/invoice') {
      return location.pathname.startsWith('/settings');
    }
    // Keep Restaurant POS distinct from Kitchen Display
    if (path === '/restaurant') {
      return location.pathname === '/restaurant';
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <div className="app-shell">
      {/* ── ShellBar — never scrolls ─────────────────────────────────── */}
      <header className="h-12 flex-shrink-0 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-40 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 lg:hidden"
            aria-label="Toggle menu"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-gray-900 lg:hidden">{brandName}</h1>
        </div>
        <div className="flex items-center gap-3">
          <ServerClock />
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold lg:hidden">
            {user?.fullName?.charAt(0).toUpperCase() || 'U'}
          </div>
        </div>
      </header>

      {/* ── App Body — fills viewport below shellbar ─────────────────── */}
      <div className="app-body">

        {/* ── Side Navigation — never scrolls (nav inside does) ───────── */}
        <aside
          className={[
            'bg-white border-r border-gray-200 flex flex-col overflow-hidden',
            'transition-all duration-300 ease-in-out',
            // Mobile: absolute overlay drawn over page content
            'absolute inset-y-0 left-0 z-30 shadow-lg',
            // Desktop: normal flex item, no shadow needed (border-r suffices)
            'lg:static lg:z-auto lg:shadow-none',
            sidebarOpen
              ? 'translate-x-0 w-64'
              : '-translate-x-full w-64 lg:translate-x-0 lg:w-20',
          ].join(' ')}
        >
          {/* Brand / collapse toggle */}
          <div className="h-12 flex items-center justify-between px-4 border-b border-gray-200 flex-shrink-0">
            <h1 className="text-xl font-bold text-gray-900 truncate">
              {sidebarOpen || !isDesktop
                ? brandName
                : brandName.slice(0, 2).toUpperCase()}
            </h1>
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

          {/* Nav links — the only scroll region inside the sidenav */}
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
                      if (!isDesktop) setSidebarOpen(false);
                    }}
                  >
                    <span className={`text-xl flex-shrink-0 ${item.color}`}>{item.icon}</span>
                    {(sidebarOpen || !isDesktop) && (
                      <span className="text-sm whitespace-nowrap">{item.name}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* User section */}
          <div className="border-t border-gray-200 p-4 flex-shrink-0">
            <div className={sidebarOpen || !isDesktop ? 'flex items-center gap-3' : 'flex flex-col items-center gap-2'}>
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                {user?.fullName?.charAt(0).toUpperCase() || 'U'}
              </div>
              {(sidebarOpen || !isDesktop) && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{user?.fullName}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.role}</p>
                </div>
              )}
            </div>
            <Link
              to="/my/quick-login"
              className={`${sidebarOpen || !isDesktop ? 'w-full flex items-center gap-2' : 'w-10 justify-center flex'
                } mt-3 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors`}
              title={!sidebarOpen && isDesktop ? 'Quick Login Setup' : undefined}
            >
              {sidebarOpen || !isDesktop ? '🔑 Quick Login Setup' : '🔑'}
            </Link>
            <button
              onClick={handleLogout}
              className={`${sidebarOpen || !isDesktop ? 'w-full' : 'w-10'
                } mt-3 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors`}
              title={!sidebarOpen && isDesktop ? 'Logout' : undefined}
            >
              {sidebarOpen || !isDesktop ? 'Logout' : '🚪'}
            </button>
          </div>
        </aside>

        {/* Mobile backdrop — click to close */}
        {sidebarOpen && (
          <div
            className="absolute inset-0 bg-black/50 z-20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Dynamic Page Content — the ONLY scroll container ─────── */}
        <main className="page-container">
          <PasswordExpiryWarning />
          {children}
        </main>

      </div>
    </div>
  );
}
