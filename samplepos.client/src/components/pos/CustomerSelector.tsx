import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, User } from 'lucide-react';
import { api } from '../../utils/api';
import type { Customer } from '@shared/zod/customer';
import Decimal from 'decimal.js';
import { formatCurrency } from '../../utils/currency';
import QuickAddCustomerModal from '../customers/QuickAddCustomerModal';
import { useOfflineContext } from '../../contexts/OfflineContext';
import { searchCustomers as searchOfflineCustomers, getAllCustomers, type OfflineCustomer } from '../../lib/offlineDb';
import { SearchSoftKeyboardInput } from '../keyboard/SearchSoftKeyboardInput';
import { POS_ADAPTIVE_CLASSES } from '../../lib/posAdaptiveLayout';

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
  /** Retail POS: sheet picker below lg; inline search on desktop. Does not affect restaurant. */
  retailAdaptive?: boolean;
  /** Override label (default: Customer). */
  label?: string;
  /** Optional — e.g. takeaway required. */
  required?: boolean;
  /** Prefill search hint when no selection. */
  placeholder?: string;
}

function CustomerResultList({
  customers,
  isLoading,
  onSelect,
  rowClassName,
  emptyHint,
}: {
  customers: Customer[] | undefined;
  isLoading: boolean;
  onSelect: (customer: Customer) => void;
  rowClassName: string;
  emptyHint: string;
}) {
  if (isLoading) {
    return <div className="p-3 text-sm text-stone-500">Loading…</div>;
  }
  if (!customers || customers.length === 0) {
    return <div className="p-3 text-sm text-stone-500">{emptyHint}</div>;
  }
  return (
    <>
      {customers.map((customer) => (
        <button
          key={customer.id}
          type="button"
          onClick={() => onSelect(customer)}
          className={rowClassName}
        >
          <div className="font-semibold truncate text-sm text-gray-900">{customer.name}</div>
          {customer.phone ? <div className="text-xs text-stone-500">{customer.phone}</div> : null}
          {customer.email ? (
            <div className="text-xs text-gray-500 truncate">{customer.email}</div>
          ) : null}
          {!rowClassName.includes('touch-manipulation') ? (
            <div className="text-xs text-gray-600 mt-1">
              Credit:{' '}
              {customer.unlimitedCredit ? 'Unlimited' : formatCurrency(customer.creditLimit)} | Balance:{' '}
              {formatCurrency(customer.balance)}
            </div>
          ) : customer.address ? (
            <div className="text-xs text-stone-400 truncate">{customer.address}</div>
          ) : null}
        </button>
      ))}
    </>
  );
}

export default function CustomerSelector({
  selectedCustomer,
  onSelectCustomer,
  saleTotal,
  compact = false,
  retailAdaptive = false,
  label = 'Customer',
  required = false,
  placeholder = 'Search by name, email, or phone…',
}: CustomerSelectorProps) {
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { isOnline } = useOfflineContext();

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers', 'pos-search', search, isOnline],
    queryFn: async () => {
      if (!isOnline) {
        if (search.trim()) return (await searchOfflineCustomers(search)).map(offlineToCustomer);
        return (await getAllCustomers()).map(offlineToCustomer).slice(0, 50);
      }
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
    setSheetOpen(false);
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
    setSheetOpen(false);
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

  const labelText = (
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
  );

  const selectedCustomerCard = selectedCustomer ? (
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
  ) : null;

  const inlineSearchRow = (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className={`flex-1 ${compact ? '' : 'relative'}`}>
          <SearchSoftKeyboardInput
            value={search}
            onChange={(next) => {
              setSearch(next);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            placeholder={placeholder}
            className={
              compact
                ? `${touchSearch} pr-11`
                : 'w-full px-2 sm:px-3 py-2 pr-11 text-xs sm:text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500'
            }
            aria-label="Search customers"
          />
          {showDropdown && !compact ? (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-y-auto">
              <CustomerResultList
                customers={customers}
                isLoading={isLoading}
                onSelect={handleSelect}
                rowClassName="w-full text-left px-3 py-2 hover:bg-blue-50 focus:bg-blue-100 border-b last:border-b-0"
                emptyHint="No customers found — tap + Add"
              />
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
          <CustomerResultList
            customers={customers}
            isLoading={isLoading}
            onSelect={handleSelect}
            rowClassName={touchRow}
            emptyHint="No customers found — tap + Add"
          />
        </div>
      ) : null}
      {compact ? (
        <p className="text-xs text-stone-500">Search existing or + Add if new</p>
      ) : (
        <p className="text-xs text-gray-500">💡 Tip: Create new customers on-the-fly with Quick Add</p>
      )}
    </div>
  );

  const sheetPicker = retailAdaptive ? (
    <>
      <div className={POS_ADAPTIVE_CLASSES.customerSheetTrigger}>
        <button
          type="button"
          onClick={() => {
            setSheetOpen(true);
            setShowDropdown(true);
          }}
          className="flex w-full min-h-11 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-left shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          data-pos-customer-sheet-trigger="true"
          aria-expanded={sheetOpen}
          aria-haspopup="dialog"
        >
          <User className="h-4 w-4 shrink-0 text-gray-500" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
            {selectedCustomer ? selectedCustomer.name : `${label}${required ? '' : ' (Optional)'}`}
          </span>
          <span className="shrink-0 text-xs font-medium text-blue-600">
            {selectedCustomer ? 'Change' : 'Select'}
          </span>
        </button>
      </div>

      {sheetOpen ? (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-label={`${label} search`}
          data-pos-customer-sheet="true"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close customer search"
            onClick={() => setSheetOpen(false)}
          />
          <div className="relative z-10 rounded-t-xl border-t border-gray-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl">
            <div className="mb-3 flex items-center gap-2">
              <SearchSoftKeyboardInput
                value={search}
                onChange={(next) => {
                  setSearch(next);
                  setShowDropdown(true);
                }}
                autoFocus
                onFocus={() => setShowDropdown(true)}
                placeholder={placeholder}
                wrapClassName="min-w-0 flex-1"
                className="w-full px-3 py-2.5 pr-11 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                aria-label="Search customers"
              />
              <button
                type="button"
                onClick={() => setShowQuickAdd(true)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-green-600 text-white hover:bg-green-700 focus:ring-2 focus:ring-green-500"
                title="Add customer"
                aria-label="Add customer"
              >
                <Plus className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="max-h-[min(45vh,360px)] overflow-y-auto rounded-lg border border-gray-200 bg-white">
              <CustomerResultList
                customers={customers}
                isLoading={isLoading}
                onSelect={handleSelect}
                rowClassName="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b last:border-b-0"
                emptyHint="No customers found — tap + to add"
              />
            </div>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="mt-3 w-full rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </>
  ) : null;

  let body: ReactNode;

  if (compact && selectedCustomer) {
    body = (
      <div className="space-y-1.5">
        {labelText}
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
    );
  } else if (retailAdaptive) {
    body = (
      <div className="mb-4">
        {labelText}
        {sheetPicker}
        <div className={POS_ADAPTIVE_CLASSES.customerExpanded}>
          {selectedCustomer ? selectedCustomerCard : inlineSearchRow}
        </div>
      </div>
    );
  } else {
    body = (
      <div className={compact ? 'space-y-1.5' : 'mb-4'}>
        {labelText}
        {selectedCustomer && !compact ? selectedCustomerCard : inlineSearchRow}
      </div>
    );
  }

  return (
    <>
      {body}
      <QuickAddCustomerModal
        isOpen={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        onSuccess={handleQuickAddSuccess}
        isOffline={!isOnline}
      />
    </>
  );
}
