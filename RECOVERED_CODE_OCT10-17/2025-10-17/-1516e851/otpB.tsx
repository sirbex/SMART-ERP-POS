import { 
  LayoutDashboard, 
  ShoppingCart, 
  Users, 
  Package, 
  FileText, 
  Settings, 
  TrendingUp,
  Receipt,
  LucideIcon
} from 'lucide-react';
import { NavLink } from 'react-router-dom';

interface NavItem {
  label: string;
  icon: LucideIcon;
  path: string;
  badge?: string;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Sales Register', icon: ShoppingCart, path: '/pos' },
  { label: 'Customers', icon: Users, path: '/customers' },
  { label: 'Inventory', icon: Package, path: '/inventory' },
  { label: 'Receipts', icon: Receipt, path: '/receipts' },
  { label: 'Reports', icon: TrendingUp, path: '/reports' },
  { label: 'Settings', icon: Settings, path: '/settings' },
];

export const SidebarNav = () => {
  return (
    <aside className="w-64 bg-slate-50 border-r border-slate-200 shadow-sm flex flex-col">
      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-6 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
                  isActive
                    ? 'bg-teal-500 text-white shadow-md'
                    : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-700'}`} />
                  <span className="font-medium text-sm">{item.label}</span>
                  {item.badge && (
                    <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-200">
        <p className="text-xs text-slate-500 text-center">
          SamplePOS v1.0.0
        </p>
        <p className="text-xs text-slate-400 text-center mt-1">
          © 2025 All rights reserved
        </p>
      </div>
    </aside>
  );
};
