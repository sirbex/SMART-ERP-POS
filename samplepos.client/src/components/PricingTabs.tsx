/**
 * Pricing sub-navigation tabs
 * Shared across all pricing pages
 */

import { useLocation, useNavigate } from 'react-router-dom';

const tabs = [
  { label: 'Price Rules', path: '/pricing/rules' },
  { label: 'Categories', path: '/pricing/categories' },
  { label: 'Price Preview', path: '/pricing/preview' },
] as const;

export default function PricingTabs() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="border-b bg-white px-6 pt-4">
      <nav className="flex gap-1" aria-label="Pricing navigation">
        {tabs.map(tab => {
          const isActive = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${isActive
                  ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              aria-current={isActive ? 'page' : undefined}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
