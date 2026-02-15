import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, Calculator, TrendingUp, BookOpen, CreditCard, DollarSign,
  Building, Truck, FileText, Calendar, Scale, ClipboardCheck,
  ChevronDown, ChevronRight, Home, ArrowLeft, Menu, X, Building2
} from 'lucide-react';

interface AccountingLayoutProps {
  children: React.ReactNode;
}

interface NavGroup {
  name: string;
  items: {
    name: string;
    path: string;
    icon: React.ReactNode;
    description: string;
  }[];
}

export default function AccountingLayout({ children }: AccountingLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['Overview', 'ERP Controls']));
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Grouped navigation items
  const navGroups: NavGroup[] = [
    {
      name: 'Overview',
      items: [
        {
          name: 'Dashboard',
          path: '/accounting/dashboard',
          icon: <BarChart3 className="h-4 w-4" />,
          description: 'Accounting summary and integration status'
        }
      ]
    },
    {
      name: 'Core Accounting',
      items: [
        {
          name: 'Chart of Accounts',
          path: '/accounting/chart-of-accounts',
          icon: <BookOpen className="h-4 w-4" />,
          description: 'Account structure and types'
        },
        {
          name: 'General Ledger',
          path: '/accounting/general-ledger',
          icon: <Building className="h-4 w-4" />,
          description: 'All transactions and entries'
        },
        {
          name: 'Trial Balance',
          path: '/accounting/trial-balance',
          icon: <Calculator className="h-4 w-4" />,
          description: 'Verify debits equal credits'
        }
      ]
    },
    {
      name: 'Expenses & Payables',
      items: [
        {
          name: 'Expenses',
          path: '/accounting/expenses',
          icon: <DollarSign className="h-4 w-4" />,
          description: 'Track company expenses'
        },
        {
          name: 'Expense Categories',
          path: '/accounting/expense-categories',
          icon: <CreditCard className="h-4 w-4" />,
          description: 'Categories and budgets'
        },
        {
          name: 'Supplier Payments',
          path: '/accounting/supplier-payments',
          icon: <Truck className="h-4 w-4" />,
          description: 'Bills and payments'
        }
      ]
    },
    {
      name: 'Reports',
      items: [
        {
          name: 'Financial Statements',
          path: '/accounting/financial-statements',
          icon: <TrendingUp className="h-4 w-4" />,
          description: 'Balance sheet, income, cash flow'
        },
        {
          name: 'P&L Reports',
          path: '/accounting/profit-loss',
          icon: <FileText className="h-4 w-4" />,
          description: 'By period, customer, product'
        }
      ]
    },
    {
      name: 'ERP Controls',
      items: [
        {
          name: 'Banking',
          path: '/accounting/banking',
          icon: <Building2 className="h-4 w-4" />,
          description: 'Bank accounts and transactions'
        },
        {
          name: 'Reconciliation',
          path: '/accounting/reconciliation',
          icon: <Scale className="h-4 w-4" />,
          description: 'Cash, AR, Inventory, AP'
        },
        {
          name: 'Journal Entries',
          path: '/accounting/journal-entries',
          icon: <ClipboardCheck className="h-4 w-4" />,
          description: 'Manual journal entries'
        },
        {
          name: 'Period Management',
          path: '/accounting/periods',
          icon: <Calendar className="h-4 w-4" />,
          description: 'Open, close, lock periods'
        }
      ]
    }
  ];

  const isActive = (path: string) => {
    return location.pathname === path ||
      (path === '/accounting/dashboard' && location.pathname === '/accounting');
  };

  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  // Find current page info for header
  const currentPage = navGroups.flatMap(g => g.items).find(item => isActive(item.path));

  const SidebarContent = () => (
    <>
      {/* Back to Dashboard */}
      <div className="p-4 border-b">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Main</span>
        </button>
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {navGroups.map((group) => (
          <div key={group.name} className="mb-2">
            {/* Group Header */}
            <button
              onClick={() => toggleGroup(group.name)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700"
            >
              <span>{group.name}</span>
              {expandedGroups.has(group.name) ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>

            {/* Group Items */}
            {expandedGroups.has(group.name) && (
              <div className="mt-1 space-y-1">
                {group.items.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={`group flex items-center px-3 py-2.5 rounded-lg text-sm transition-all ${isActive(item.path)
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                    title={item.description}
                  >
                    <span className={`mr-3 ${isActive(item.path) ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'}`}>
                      {item.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="block truncate">{item.name}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Quick Stats Footer */}
      <div className="p-4 border-t bg-gray-50">
        <div className="text-xs text-gray-500">
          <div className="flex items-center space-x-2">
            <Home className="h-3 w-3" />
            <span>Accounting Module</span>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-white border-r shadow-sm">
        {/* Module Header */}
        <div className="h-16 flex items-center px-4 border-b border-gray-200">
          <BarChart3 className="h-7 w-7 text-blue-600" />
          <div className="ml-3">
            <h1 className="text-lg font-bold text-gray-900">Accounting</h1>
          </div>
        </div>
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white transform transition-transform duration-300 ease-in-out lg:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
        {/* Mobile Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
          <div className="flex items-center">
            <BarChart3 className="h-7 w-7 text-blue-600" />
            <h1 className="ml-3 text-lg font-bold text-gray-900">Accounting</h1>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-lg hover:bg-gray-100"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>
        <SidebarContent />
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-white border-b shadow-sm flex items-center px-4 lg:px-6">
          {/* Mobile Menu Button */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-gray-100 lg:hidden mr-3"
            aria-label="Open sidebar menu"
          >
            <Menu className="h-5 w-5 text-gray-600" />
          </button>

          {/* Page Title */}
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-gray-900">
              {currentPage?.name || 'Accounting'}
            </h1>
            <p className="text-sm text-gray-500 hidden sm:block">
              {currentPage?.description || 'Financial management and reporting'}
            </p>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}