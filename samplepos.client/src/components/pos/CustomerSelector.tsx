import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../utils/api';
import type { Customer } from '@shared/zod/customer';
import Decimal from 'decimal.js';
import { formatCurrency } from '../../utils/currency';
import QuickAddCustomerModal from '../customers/QuickAddCustomerModal';

interface CustomerSelectorProps {
  selectedCustomer: Customer | null;
  onSelectCustomer: (customer: Customer | null) => void;
  saleTotal: number;
}

export default function CustomerSelector({ selectedCustomer, onSelectCustomer, saleTotal }: CustomerSelectorProps) {
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: async () => {
      const res = await api.customers.list();
      if (!res.data.success) return [];
      const all = res.data.data || [];
      if (!search) return all;
      const term = search.toLowerCase();
      return all.filter((c: Customer) =>
        c.name.toLowerCase().includes(term) ||
        (c.email && c.email.toLowerCase().includes(term)) ||
        (c.phone && c.phone.includes(term))
      );
    },
    staleTime: 30_000,
  });

  const handleSelect = (customer: Customer) => {
    onSelectCustomer(customer);
    setSearch('');
    setShowDropdown(false);
  };

  const handleQuickAddSuccess = (customer: Customer) => {
    // Automatically select the newly created customer
    onSelectCustomer(customer);
    setShowQuickAdd(false);
  };

  const availableCredit = selectedCustomer
    ? new Decimal(selectedCustomer.creditLimit).minus(selectedCustomer.balance).toNumber()
    : 0;

  const canUseCredit = selectedCustomer && availableCredit >= saleTotal;

  return (
    <>
      <div className="mb-4">
      <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Customer (Optional)</label>
      {selectedCustomer ? (
        <div className="border border-gray-300 rounded p-2 sm:p-3 bg-gray-50">
          <div className="flex justify-between items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm sm:text-base text-gray-900 truncate">{selectedCustomer.name}</div>
              {selectedCustomer.email && <div className="text-xs text-gray-500 truncate">{selectedCustomer.email}</div>}
              {selectedCustomer.phone && <div className="text-xs text-gray-500">{selectedCustomer.phone}</div>}
              <div className="mt-2 text-xs space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">Credit Limit:</span>
                  <span className="text-right">{formatCurrency(selectedCustomer.creditLimit)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="font-medium">Current Balance:</span>
                  <span className="text-right">{formatCurrency(selectedCustomer.balance)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="font-medium">Available Credit:</span>
                  <span className={`text-right ${availableCredit < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {formatCurrency(availableCredit)}
                  </span>
                </div>
              </div>
              {!canUseCredit && saleTotal > 0 && (
                <div className="mt-1 text-xs text-red-600">
                  ⚠ Insufficient credit for this sale
                </div>
              )}
            </div>
            <button
              onClick={() => onSelectCustomer(null)}
              className="text-xs text-red-600 hover:text-red-800 flex-shrink-0"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Search by name, email, or phone..."
                className="w-full px-2 sm:px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                aria-label="Search customers"
              />
              {showDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-y-auto">
                  {isLoading ? (
                    <div className="p-3 text-xs text-gray-500">Loading...</div>
                  ) : customers && customers.length > 0 ? (
                    customers.map((customer: Customer) => (
                      <button
                        key={customer.id}
                        onClick={() => handleSelect(customer)}
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 focus:bg-blue-100 border-b last:border-b-0"
                      >
                        <div className="font-semibold text-xs sm:text-sm text-gray-900 truncate">{customer.name}</div>
                        {customer.email && <div className="text-xs text-gray-500 truncate">{customer.email}</div>}
                        {customer.phone && <div className="text-xs text-gray-500">{customer.phone}</div>}
                        <div className="text-xs text-gray-600 mt-1">
                          Credit: {formatCurrency(customer.creditLimit)} | Balance: {formatCurrency(customer.balance)}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-xs text-gray-500">No customers found</div>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowQuickAdd(true)}
              className="px-3 sm:px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 focus:ring-2 focus:ring-green-500 whitespace-nowrap text-xs sm:text-sm font-medium flex-shrink-0"
              title="Quick Add Customer"
            >
              <span className="hidden sm:inline">+ Add</span>
              <span className="sm:hidden">+</span>
            </button>
          </div>
          <p className="text-xs text-gray-500">💡 Tip: Create new customers on-the-fly with Quick Add</p>
        </div>
      )}
    </div>

    {/* Quick Add Customer Modal */}
    <QuickAddCustomerModal
      isOpen={showQuickAdd}
      onClose={() => setShowQuickAdd(false)}
      onSuccess={handleQuickAddSuccess}
    />
    </>
  );
}
