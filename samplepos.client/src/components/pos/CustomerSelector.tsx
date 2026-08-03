import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../utils/api';
import type { Customer } from '@shared/zod/customer';
import Decimal from 'decimal.js';
import { formatCurrency } from '../../utils/currency';
import QuickAddCustomerModal from '../customers/QuickAddCustomerModal';
import { useOfflineContext } from '../../contexts/OfflineContext';
import { searchCustomers as searchOfflineCustomers, getAllCustomers, type OfflineCustomer } from '../../lib/offlineDb';

function offlineToCustomer(c: OfflineCustomer): Customer {
  return {
    id: c.id,
    name: c.name,
    email: c.email || null,
    phone: c.phone || null,
    address: c.address || null,
    customerGroupId: c.customerGroupId ?? null,
    priceGroupId: c.priceGroupId ?? null,
    pricingMode: c.pricingMode ?? null,
    balance: c.balance,
    creditLimit: c.creditLimit,
    unlimitedCredit: c.unlimitedCredit === true,
    whtLiable: c.whtLiable ?? false,
    defaultWhtTypeId: c.defaultWhtTypeId ?? null,
    isActive: c.isActive,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

interface CustomerSelectorProps {
  selectedCustomer: Customer | null;
  onSelectCustomer: (customer: Customer | null) => void;
  saleTotal: number;
  /** Restaurant / touch POS: search or +Add; selected shows name (not credit card). */
  compact?: boolean;
  /** Override label (default: Customer). */
  label?: string;
  /** Optional — e.g. takeaway required. */
  required?: boolean;
  /** Prefill search hint when no selection. */
  placeholder?: string;
}

export default function CustomerSelector({
  selectedCustomer,
  onSelectCustomer,
  saleTotal,
  compact = false,
  label = 'Customer',
  required = false,
  placeholder = 'Search by name, email, or phone…',
}: CustomerSelectorProps) {
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const { isOnline } = useOfflineContext();

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers', 'pos-search', search, isOnline],
    queryFn: async () => {
      // Offline: search IndexedDB (full cache, not first page)
      if (!isOnline) {
        if (search.trim()) return (await searchOfflineCustomers(search)).map(offlineToCustomer);
        return (await getAllCustomers()).map(offlineToCustomer).slice(0, 50);
      }
      // Online: server search — never client-filter the first list page (only 50 of ~200+)
      if (search.trim()) {
        const res = await api.customers.search(search.trim(), 50);
        if (!res.data.success) return [];
        return (res.data.data || []) as Customer[];
      }
      const res = await api.customers.list({ page: 1, limit: 50 });
      if (!res.data.success) return [];
      return (res.data.data || []) as Customer[];
    },
    staleTime: 15_000,
  });

  const handleSelect = (customer: Customer) => {
    onSelectCustomer(customer);
    setSearch('');
    setShowDropdown(false);
  };

  const handleQuickAddSuccess = (created: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    creditLimit?: number;
    [key: string]: unknown;
  }) => {
    const customer: Customer = {
      id: created.id,
      name: created.name,
      email: (created.email as string | undefined) ?? null,
      phone: (created.phone as string | undefined) ?? null,
      address: (created.address as string | undefined) ?? null,
      customerGroupId: (created.customerGroupId as string | undefined) ?? null,
      priceGroupId: (created.priceGroupId as string | undefined) ?? null,
      pricingMode: (created.pricingMode as Customer['pricingMode']) ?? null,
      creditLimit: Number(created.creditLimit ?? 0),
      balance: Number(created.balance ?? 0),
      isActive: Boolean(created.isActive ?? true),
      createdAt: String(created.createdAt ?? new Date().toISOString()),
      updatedAt: String(created.updatedAt ?? new Date().toISOString()),
    };
    onSelectCustomer(customer);
    setShowQuickAdd(false);
  };

  const availableCredit = selectedCustomer
    ? selectedCustomer.unlimitedCredit
      ? Number.POSITIVE_INFINITY
      : new Decimal(selectedCustomer.creditLimit).minus(selectedCustomer.balance).toNumber()
    : 0;

  const canUseCredit =
    selectedCustomer &&
    (selectedCustomer.unlimitedCredit === true || availableCredit >= saleTotal);

  const touchSearch =
    'w-full min-h-12 px-3 py-3 text-base border border-stone-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 touch-manipulation';
  const touchAdd =
    'touch-manipulation min-h-12 min-w-12 sm:min-w-[5.5rem] px-3 rounded-xl bg-emerald-600 text-white text-sm font-bold active:bg-emerald-700 shrink-0';
  const touchRow =
    'touch-manipulation w-full text-left px-3 py-3 border-b last:border-b-0 active:bg-emerald-50';

  if (compact && selectedCustomer) {
    return (
      <>
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500">
            {label}
            {required ? ' *' : ''}
          </label>
          <div className="flex items-center gap-2 rounded-xl border-2 border-emerald-600 bg-emerald-50 px-3 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-bold text-base text-stone-900 truncate">{selectedCustomer.name}</div>
              {selectedCustomer.phone ? (
                <div className="text-sm text-stone-600 truncate">{selectedCustomer.phone}</div>
              ) : null}
              {selectedCustomer.address ? (
                <div className="text-xs text-stone-500 truncate mt-0.5">{selectedCustomer.address}</div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onSelectCustomer(null)}
              className="touch-manipulation shrink-0 min-h-11 px-3 rounded-xl border border-stone-300 bg-white text-sm font-semibold text-stone-800 active:bg-stone-100"
            >
              Change
            </button>
          </div>
        </div>
        <QuickAddCustomerModal
          isOpen={showQuickAdd}
          onClose={() => setShowQuickAdd(false)}
          onSuccess={handleQuickAddSuccess}
          isOffline={!isOnline}
        />
      </>
    );
  }

  return (
    <>
      <div className={compact ? 'space-y-1.5' : 'mb-4'}>
        <label
          className={
            compact
              ? 'block text-xs font-semibold uppercase tracking-wide text-stone-500'
              : 'block text-xs sm:text-sm font-medium text-gray-700 mb-1'
          }
        >
          {label}
          {required ? (compact ? ' *' : ' (required)') : compact ? '' : ' (Optional)'}
        </label>
        {selectedCustomer && !compact ? (
          <div className="border border-gray-300 rounded p-2 sm:p-3 bg-gray-50">
            <div className="flex justify-between items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm sm:text-base text-gray-900 truncate">
                    {selectedCustomer.name}
                  </span>
                  {selectedCustomer.pricingMode === 'AT_COST' ? (
                    <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800 shrink-0">
                      At cost
                    </span>
                  ) : selectedCustomer.priceGroupId ? (
                    <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600 shrink-0">
                      Standard pricing
                    </span>
                  ) : null}
                </div>
                {selectedCustomer.email && (
                  <div className="text-xs text-gray-500 truncate">{selectedCustomer.email}</div>
                )}
                {selectedCustomer.phone && (
                  <div className="text-xs text-gray-500">{selectedCustomer.phone}</div>
                )}
                <div className="mt-2 text-xs space-y-1">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">Credit Limit:</span>
                    <span className="text-right">
                      {selectedCustomer.unlimitedCredit
                        ? 'Unlimited'
                        : formatCurrency(selectedCustomer.creditLimit)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">Current Balance:</span>
                    <span className="text-right">{formatCurrency(selectedCustomer.balance)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">Available Credit:</span>
                    <span
                      className={`text-right ${
                        !selectedCustomer.unlimitedCredit && availableCredit < 0
                          ? 'text-red-600'
                          : 'text-green-600'
                      }`}
                    >
                      {selectedCustomer.unlimitedCredit
                        ? 'Unlimited'
                        : formatCurrency(availableCredit)}
                    </span>
                  </div>
                </div>
                {!canUseCredit && saleTotal > 0 && (
                  <div className="mt-1 text-xs text-red-600">⚠ Insufficient credit for this sale</div>
                )}
              </div>
              <button
                type="button"
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
              <div className={`flex-1 ${compact ? '' : 'relative'}`}>
                <input
                  type="search"
                  inputMode="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder={placeholder}
                  className={
                    compact
                      ? touchSearch
                      : 'w-full px-2 sm:px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500'
                  }
                  aria-label="Search customers"
                />
                {/* Non-compact: absolute overlay. Compact (restaurant/touch): in-flow list so
                    results are not clipped by ticket overflow-hidden / AdaptiveDialogBody. */}
                {showDropdown && !compact ? (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-y-auto">
                    {isLoading ? (
                      <div className="p-3 text-sm text-stone-500">Loading…</div>
                    ) : customers && customers.length > 0 ? (
                      customers.map((customer: Customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          onClick={() => handleSelect(customer)}
                          className="w-full text-left px-3 py-2 hover:bg-blue-50 focus:bg-blue-100 border-b last:border-b-0"
                        >
                          <div className="font-semibold truncate text-xs sm:text-sm text-gray-900">
                            {customer.name}
                          </div>
                          {customer.phone ? (
                            <div className="text-xs text-stone-500">{customer.phone}</div>
                          ) : null}
                          {customer.email ? (
                            <div className="text-xs text-gray-500 truncate">{customer.email}</div>
                          ) : null}
                          <div className="text-xs text-gray-600 mt-1">
                            Credit:{' '}
                            {customer.unlimitedCredit ? 'Unlimited' : formatCurrency(customer.creditLimit)}{' '}
                            | Balance: {formatCurrency(customer.balance)}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="p-3 text-sm text-stone-500">No customers found — tap + Add</div>
                    )}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setShowQuickAdd(true)}
                className={
                  compact
                    ? touchAdd
                    : 'px-3 sm:px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 focus:ring-2 focus:ring-green-500 whitespace-nowrap text-xs sm:text-sm font-medium flex-shrink-0'
                }
                title="Add customer"
              >
                <span className="hidden sm:inline">+ Add</span>
                <span className="sm:hidden">+</span>
              </button>
            </div>
            {showDropdown && compact ? (
              <div
                className="w-full bg-white border border-stone-300 rounded-xl shadow-sm max-h-60 overflow-y-auto"
                data-customer-results="inline"
                role="listbox"
                aria-label="Customer search results"
              >
                {isLoading ? (
                  <div className="p-3 text-sm text-stone-500">Loading…</div>
                ) : customers && customers.length > 0 ? (
                  customers.map((customer: Customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      role="option"
                      onClick={() => handleSelect(customer)}
                      className={touchRow}
                    >
                      <div className="font-semibold truncate text-base text-stone-900">
                        {customer.name}
                      </div>
                      {customer.phone ? (
                        <div className="text-xs text-stone-500">{customer.phone}</div>
                      ) : null}
                      {customer.address ? (
                        <div className="text-xs text-stone-400 truncate">{customer.address}</div>
                      ) : null}
                    </button>
                  ))
                ) : (
                  <div className="p-3 text-sm text-stone-500">No customers found — tap + Add</div>
                )}
              </div>
            ) : null}
            {compact ? (
              <p className="text-xs text-stone-500">Search existing or + Add if new</p>
            ) : (
              <p className="text-xs text-gray-500">💡 Tip: Create new customers on-the-fly with Quick Add</p>
            )}
          </div>
        )}
      </div>

      <QuickAddCustomerModal
        isOpen={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        onSuccess={handleQuickAddSuccess}
        isOffline={!isOnline}
      />
    </>
  );
}
