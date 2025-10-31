import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Button } from '../ui/button';

interface POSLayoutProps {
  children: React.ReactNode;
}

export default function POSLayout({ children }: POSLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col w-full min-h-screen bg-gray-50">
      {/* Header - Full width and responsive */}
      <header className="w-full bg-white shadow-sm p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            {/* Mobile menu toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <h1 className="text-lg md:text-xl font-semibold text-qb-blue-600">Point of Sale</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs md:text-sm text-gray-600">
              {new Date().toLocaleDateString('en-US', { 
                weekday: 'short', 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
              })}
            </span>
          </div>
        </div>
      </header>

      {/* Main content with sidebar */}
      <div className="flex flex-1 w-full overflow-hidden">
        {/* Sidebar - Responsive with mobile overlay */}
        <aside className={`
          fixed lg:static inset-y-0 left-0 z-20 
          w-64 lg:w-72 xl:w-80
          bg-gray-100 shadow-lg lg:shadow-sm 
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          mt-[73px] lg:mt-0
        `}>
          <div className="p-4 space-y-2 h-full overflow-y-auto">
            <div className="text-sm font-medium text-gray-700 mb-3">Quick Actions</div>
            <button 
              className="w-full text-left px-3 py-2 text-sm rounded hover:bg-qb-blue-50 hover:text-qb-blue-600 transition-colors"
              onClick={() => setSidebarOpen(false)}
            >
              New Sale
            </button>
            <button 
              className="w-full text-left px-3 py-2 text-sm rounded hover:bg-qb-blue-50 hover:text-qb-blue-600 transition-colors"
              onClick={() => setSidebarOpen(false)}
            >
              Recent Transactions
            </button>
            <button 
              className="w-full text-left px-3 py-2 text-sm rounded hover:bg-qb-blue-50 hover:text-qb-blue-600 transition-colors"
              onClick={() => setSidebarOpen(false)}
            >
              Customers
            </button>
            <button 
              className="w-full text-left px-3 py-2 text-sm rounded hover:bg-qb-blue-50 hover:text-qb-blue-600 transition-colors"
              onClick={() => setSidebarOpen(false)}
            >
              Reports
            </button>
          </div>
        </aside>

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-10 lg:hidden mt-[73px]"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content area - fills remaining space */}
        <section className="flex-1 w-full p-4 md:p-6 lg:p-8 overflow-auto bg-white">
          {children}
        </section>
      </div>
    </div>
  );
}
