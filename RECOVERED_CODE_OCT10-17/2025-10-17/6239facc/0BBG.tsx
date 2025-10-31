import React from 'react';

interface POSLayoutProps {
  children: React.ReactNode;
}

export default function POSLayout({ children }: POSLayoutProps) {
  return (
    <div className="flex flex-col w-full min-h-screen bg-gray-50">
      <header className="w-full bg-white shadow p-4">
        <div className="flex items-center justify-between max-w-full">
          <h1 className="text-xl font-semibold text-qb-blue-600">Point of Sale</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
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
      <main className="flex-grow flex w-full">
        <aside className="w-1/5 bg-gray-100 p-3 shadow-sm">
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700 mb-3">Quick Actions</div>
            <button className="w-full text-left px-3 py-2 text-sm rounded hover:bg-qb-blue-50 hover:text-qb-blue-600 transition-colors">
              New Sale
            </button>
            <button className="w-full text-left px-3 py-2 text-sm rounded hover:bg-qb-blue-50 hover:text-qb-blue-600 transition-colors">
              Recent Transactions
            </button>
            <button className="w-full text-left px-3 py-2 text-sm rounded hover:bg-qb-blue-50 hover:text-qb-blue-600 transition-colors">
              Customers
            </button>
            <button className="w-full text-left px-3 py-2 text-sm rounded hover:bg-qb-blue-50 hover:text-qb-blue-600 transition-colors">
              Reports
            </button>
          </div>
        </aside>
        <section className="flex-1 p-4 overflow-auto bg-white">
          {children}
        </section>
      </main>
    </div>
  );
}
