/**
 * QuickBooks-inspired Sidebar Navigation Component
 * Clean, icon-based navigation with active state highlighting
 */

import React from 'react';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  DollarSign, 
  Package, 
  Users, 
  FileText, 
  Settings,
  TestTube
} from 'lucide-react';
import { Badge } from '../ui/badge';

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

interface SidebarNavProps {
  onSelect: (screen: string) => void;
  selected: string;
}

const SidebarNav: React.FC<SidebarNavProps> = ({ onSelect, selected }) => {
  const navItems: NavItem[] = [
    { 
      key: 'dashboard', 
      label: 'Dashboard', 
      icon: <LayoutDashboard className="h-5 w-5" /> 
    },
    { 
      key: 'pos', 
      label: 'Point of Sale', 
      icon: <ShoppingCart className="h-5 w-5" /> 
    },
    { 
      key: 'payment', 
      label: 'Payment & Billing', 
      icon: <DollarSign className="h-5 w-5" /> 
    },
    { 
      key: 'inventory', 
      label: 'Inventory & Purchasing', 
      icon: <Package className="h-5 w-5" /> 
    },
    { 
      key: 'customers', 
      label: 'Customers & Ledger', 
      icon: <Users className="h-5 w-5" /> 
    },
    { 
      key: 'reports', 
      label: 'Reports', 
      icon: <FileText className="h-5 w-5" /> 
    },
    { 
      key: 'settings', 
      label: 'Settings', 
      icon: <Settings className="h-5 w-5" /> 
    },
    { 
      key: 'api-test', 
      label: 'API Test', 
      icon: <TestTube className="h-5 w-5" /> 
    },
  ];

  return (
    <aside className="qb-sidebar fixed left-0 top-0 h-screen w-64 pt-16 overflow-y-auto">
      <nav className="flex flex-col gap-1 p-4">
        {navItems.map((item) => {
          const isActive = selected === item.key;
          
          return (
            <button
              key={item.key}
              onClick={() => onSelect(item.key)}
              className={`
                group flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium
                transition-all duration-200 ease-in-out
                ${isActive 
                  ? 'bg-qb-blue-500 text-white shadow-md' 
                  : 'text-qb-gray-700 hover:bg-qb-gray-100 hover:text-qb-blue-600'
                }
              `}
            >
              <span className={`
                ${isActive ? 'text-white' : 'text-qb-gray-500 group-hover:text-qb-blue-600'}
                transition-colors duration-200
              `}>
                {item.icon}
              </span>
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge && item.badge > 0 && (
                <Badge 
                  variant={isActive ? "secondary" : "default"}
                  className={`
                    ml-auto text-xs
                    ${isActive ? 'bg-white text-qb-blue-600' : 'bg-qb-blue-100 text-qb-blue-700'}
                  `}
                >
                  {item.badge}
                </Badge>
              )}
            </button>
          );
        })}
      </nav>
      
      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-qb-gray-200 bg-white">
        <div className="text-center">
          <p className="text-xs text-qb-gray-500">Version 2.0.0</p>
          <p className="text-xs text-qb-gray-400 mt-1">© 2025 Sample POS</p>
        </div>
      </div>
    </aside>
  );
};

export default SidebarNav;
