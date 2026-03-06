import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { PasswordExpiryWarning } from './auth/PasswordExpiryWarning';

interface LayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  name: string;
  path: string;
  icon: string;
  color: string;
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false); // Default closed on mobile
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems: NavItem[] = [
    { name: 'Dashboard', path: '/dashboard', icon: '📊', color: 'text-blue-600' },
    { name: 'Point of Sale', path: '/pos', icon: '🛒', color: 'text-green-600' },
    { name: 'Inventory', path: '/inventory', icon: '📦', color: 'text-purple-600' },
    { name: 'Customers', path: '/customers', icon: '👥', color: 'text-yellow-600' },
    { name: 'Suppliers', path: '/suppliers', icon: '🏢', color: 'text-indigo-600' },
    { name: 'Sales', path: '/sales', icon: '💰', color: 'text-emerald-600' },
    { name: 'Quotations', path: '/quotations', icon: '💼', color: 'text-blue-500' },
    { name: 'Delivery', path: '/delivery', icon: '🚚', color: 'text-teal-600' },
    { name: 'Accounting', path: '/accounting', icon: '🧾', color: 'text-orange-600' },
    { name: 'Reports', path: '/reports', icon: '📈', color: 'text-cyan-600' },
  ];

  // Admin-only navigation items
  const adminNavItems: NavItem[] = [
    { name: 'Settings', path: '/settings', icon: '⚙️', color: 'text-gray-600' },
    { name: 'Roles', path: '/admin/roles', icon: '🔐', color: 'text-pink-600' },
  ];

  // Add admin items for ADMIN users
  const allNavItems = user?.role === 'ADMIN'
    ? [...navItems, ...adminNavItems]
    : navItems;

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
          {(sidebarOpen || window.innerWidth >= 1024) ? (
            <h1 className={`${sidebarOpen || window.innerWidth >= 1024 ? 'text-2xl' : 'text-xl'} font-bold text-gray-900`}>
              {sidebarOpen ? 'SamplePOS' : 'SP'}
            </h1>
          ) : (
            <span className="text-2xl font-bold text-gray-900">SP</span>
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
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  title={!sidebarOpen && window.innerWidth >= 1024 ? item.name : undefined}
                  onClick={() => {
                    if (window.innerWidth < 1024) {
                      setSidebarOpen(false);
                    }
                  }}
                >
                  <span className={`text-2xl ${item.color}`}>{item.icon}</span>
                  {(sidebarOpen || window.innerWidth < 1024) && (
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
        {/* Top Bar (Mobile) */}
        <header className="h-16 bg-white shadow-sm flex items-center justify-between px-4 lg:hidden sticky top-0 z-10">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-100"
            aria-label="Open menu"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-900">SamplePOS</h1>
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
            {user?.fullName?.charAt(0).toUpperCase() || 'U'}
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
