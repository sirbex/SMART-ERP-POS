import { useState, useMemo, useEffect, Fragment } from 'react';
import { Link } from 'react-router-dom';
import Decimal from 'decimal.js';
import Layout from '../components/Layout';
import {
  useSuppliers,
  useCreateSupplier,
  useUpdateSupplier,
  useDeleteSupplier,
} from '../hooks/useSuppliers';
import { supplierInvoiceService } from '../services/comprehensive-accounting';
import { formatCurrency } from '../utils/currency';
import { api } from '../services/api';
import { handleApiError } from '../utils/errorHandler';
import { downloadFile } from '../utils/download';
import { useCanAccess } from '../components/auth/ProtectedRoute';
import SupplierPOItemsInline from '../components/suppliers/SupplierPOItemsInline';
import { SortableTableHeader } from '../components/ui/SortableTableHeader';
import { useColumnSort } from '../hooks/useColumnSort';
// TIMEZONE STRATEGY: Display dates without conversion
// Backend returns DATE as YYYY-MM-DD string (no timezone)
// Frontend displays as-is without parsing to Date object
const formatDisplayDate = (dateString: string | null | undefined): string => {
  if (!dateString) return 'N/A';

  // If it's an ISO string, extract the date part
  if (dateString.includes('T')) {
    return dateString.split('T')[0];
  }

  return dateString;
};

// Payment Terms options with descriptions
const PAYMENT_TERMS = [
  { value: 'NET30', label: 'Net 30 Days', days: 30, description: 'Payment due within 30 days' },
  { value: 'NET60', label: 'Net 60 Days', days: 60, description: 'Payment due within 60 days' },
  { value: 'NET90', label: 'Net 90 Days', days: 90, description: 'Payment due within 90 days' },
  { value: 'NET15', label: 'Net 15 Days', days: 15, description: 'Payment due within 15 days' },
  { value: 'COD', label: 'Cash on Delivery', days: 0, description: 'Payment on delivery' },
  { value: 'PREPAID', label: 'Prepaid', days: -1, description: 'Payment before delivery' },
];

// View modes
type ViewMode = 'table' | 'cards';
type SortField =
  | 'name'
  | 'contactPerson'
  | 'paymentTerms'
  | 'status'
  | 'outstandingBalance'
  | 'createdAt';

// ============================================================
// Typed Interfaces (No `any` policy)
// ============================================================

interface Supplier {
  id: string;
  supplierCode?: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  paymentTerms: string;
  creditLimit?: number;
  outstandingBalance?: number;
  notes?: string;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SupplierPerformance {
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  uniqueProducts: number;
  totalValue: number;
  outstandingAmount: number;
  lastOrderDate: string | null;
  avgDeliveryDays: number;
  onTimeDeliveryRate: number;
}

interface SupplierOrder {
  id: string;
  orderNumber: string;
  poNumber: string;
  orderDate: string;
  expectedDelivery: string | null;
  status: string;
  totalAmount: number;
  itemCount: number;
  notes?: string;
}

interface SupplierProduct {
  productId: string;
  productName: string;
  totalQuantity: number;
  avgUnitCost: number;
  minUnitCost: number;
  maxUnitCost: number;
  lastOrderDate: string;
  orderCount: number;
}

interface SupplierInvoiceSummary {
  id: string;
  invoiceNumber: string;
  supplierInvoiceNumber: string | null;
  supplierId: string;
  invoiceDate: string;
  dueDate: string | null;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  outstandingBalance: number;
  status: string;
  notes: string | null;
  lineItemCount: number;
}

interface InvoiceLineItem {
  id: string;
  lineNumber: number;
  productId: string;
  productName: string;
  description: string | null;
  quantity: number;
  unitOfMeasure: string;
  unitCost: number;
  lineTotal: number;
  taxRate: number;
  taxAmount: number;
  lineTotalIncludingTax: number;
}

interface InvoiceAllocation {
  id: string;
  paymentId: string;
  paymentNumber: string;
  amountAllocated: number;
  allocationDate: string;
  paymentMethod: string;
}

interface InvoiceDetails {
  invoice: SupplierInvoiceSummary & {
    supplierName?: string;
    supplierContactName?: string;
    supplierEmail?: string;
    supplierPhone?: string;
  };
  lineItems: InvoiceLineItem[];
  allocations: InvoiceAllocation[];
}

interface SupplierFormData {
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  paymentTerms: string;
  notes?: string;
}

interface SupplierLedgerEntry {
  date: string;
  docNumber: string;
  type: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  itemStatus: 'Open' | 'Applied' | 'Credit Note' | 'Voided' | 'Pending Bill' | 'Return' | 'Correction';
  paymentMethod?: string;
  balanceAfter: number;
  accountCode?: string;
}

interface SupplierLedgerData {
  supplierId: string;
  supplierName: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  closingBalance: number;
  entries: SupplierLedgerEntry[];
}

// Smart Supplier Statement — one business document per row
interface SmartStatementEntry {
  date: string;
  particulars: string;
  vchType: string;
  vchNo: string;
  debit: number;
  credit: number;
  balanceAfter: number;
  itemStatus: 'Pending Bill' | 'Unpaid' | 'Paid' | 'Applied' | 'Voided' | 'Cancelled';
  paymentMethod?: string;
  transactionId: string;
  referenceType: string;
  isReversed: boolean;
}

interface SmartStatementData {
  supplierId: string;
  supplierName: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  closingBalance: number;
  entries: SmartStatementEntry[];
  openItemBalance?: number;
  ap2100EntityBalance?: number;
  grirBalance?: number;
  unallocatedPrepaymentsTotal?: number;
  unallocatedPrepayments?: Array<{
    paymentId: string;
    paymentNumber: string;
    paymentDate: string;
    unallocatedAmount: number;
  }>;
}

export default function SuppliersPage() {
  // State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const { sortField, sortOrder, handleSort, resetSort, setSortField, setSortOrder } =
    useColumnSort<SortField>('name', 'asc');
  const [filterPaymentTerms, setFilterPaymentTerms] = useState<string>('');
  const [filterOutstandingOnly, setFilterOutstandingOnly] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 20;

  // Permission gating
  const canCreateSupplier = useCanAccess([], ['suppliers.create']);
  const canManageOpeningBalance = useCanAccess([], ['accounting.opening_balance']);
  const canUpdateSupplier = useCanAccess([], ['suppliers.update']);
  const canDeleteSupplier = useCanAccess([], ['suppliers.delete']);

  // Invoice summary stats for top cards
  const [invoiceSummary, setInvoiceSummary] = useState<{
    totalInvoices: number;
    unpaidInvoices: number;
    totalOutstanding: number;
  }>({ totalInvoices: 0, unpaidInvoices: 0, totalOutstanding: 0 });

  // API queries
  const { data: suppliersData, isLoading, isFetching, isPlaceholderData, error, refetch } = useSuppliers({ page, limit, search: debouncedSearch || undefined });
  const createMutation = useCreateSupplier();
  const updateMutation = useUpdateSupplier();
  const deleteMutation = useDeleteSupplier();

  // Extract suppliers
  const allSuppliers = useMemo(() => {
    if (!suppliersData) return [];
    if (suppliersData.data && Array.isArray(suppliersData.data)) return suppliersData.data;
    return Array.isArray(suppliersData) ? suppliersData : [];
  }, [suppliersData]);

  // Filter and sort suppliers (client-side on current page — same pattern as Reorder Dashboard)
  const suppliers = useMemo(() => {
    let filtered = [...allSuppliers];

    if (filterPaymentTerms) {
      filtered = filtered.filter(
        (supplier: Supplier) => supplier.paymentTerms === filterPaymentTerms
      );
    }

    if (filterOutstandingOnly) {
      filtered = filtered.filter(
        (supplier: Supplier) => Number(supplier.outstandingBalance) > 0
      );
    }

    filtered.sort((a: Supplier, b: Supplier) => {
      let aVal: string | number | boolean;
      let bVal: string | number | boolean;

      switch (sortField) {
        case 'name':
          aVal = a.name?.toLowerCase() || '';
          bVal = b.name?.toLowerCase() || '';
          break;
        case 'contactPerson':
          aVal = a.contactPerson?.toLowerCase() || '';
          bVal = b.contactPerson?.toLowerCase() || '';
          break;
        case 'paymentTerms':
          aVal = a.paymentTerms || '';
          bVal = b.paymentTerms || '';
          break;
        case 'status':
          aVal = a.isActive ? 1 : 0;
          bVal = b.isActive ? 1 : 0;
          break;
        case 'outstandingBalance':
          aVal = Number(a.outstandingBalance) || 0;
          bVal = Number(b.outstandingBalance) || 0;
          break;
        case 'createdAt':
          aVal = new Date(a.createdAt || 0).getTime();
          bVal = new Date(b.createdAt || 0).getTime();
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [allSuppliers, filterPaymentTerms, filterOutstandingOnly, sortField, sortOrder]);

  const handleColumnSort = (field: string) => {
    const f = field as SortField;
    if (f === 'outstandingBalance') {
      setFilterOutstandingOnly(true);
      handleSort(f, { defaultOrder: 'desc' });
      return;
    }
    setFilterOutstandingOnly(false);
    handleSort(f, { defaultOrder: 'asc' });
  };

  // Debounce search — wait 350ms after last keystroke before firing API call
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset to page 1 whenever debounced search changes so results are always from page 1
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  // Fetch invoice summary on mount
  useEffect(() => {
    supplierInvoiceService
      .getInvoiceSummary()
      .then(setInvoiceSummary)
      .catch(() => {
        /* keep defaults */
      });
  }, []);

  // Calculate statistics — use API-level aggregates to avoid pagination skewing totals
  const stats = useMemo(() => {
    // pagination.total = true count across all pages (top-level in API response)
    const total = suppliersData?.pagination?.total ?? allSuppliers.length;
    // Active count: use pagination.total (API already filters WHERE IsActive=true)
    const active = suppliersData?.pagination?.total ?? allSuppliers.filter((s: Supplier) => s.isActive).length;

    return { total, active };
  }, [allSuppliers, suppliersData]);

  // Currency formatter for summary cards — uses shared formatCurrency
  const formatCurrencyTop = (amount: number): string => formatCurrency(amount, true, 0);

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Name',
      'Contact Person',
      'Email',
      'Phone',
      'Address',
      'Payment Terms',
      'Status',
      'Created At',
    ];
    const rows = suppliers.map((s: Supplier) => [
      s.name || '',
      s.contactPerson || '',
      s.email || '',
      s.phone || '',
      s.address || '',
      s.paymentTerms || 'NET30',
      s.isActive ? 'Active' : 'Inactive',
      formatDisplayDate(s.createdAt),
    ]);

    const csv = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `suppliers-${new Date().toLocaleDateString('en-CA')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    setShowExportOptions(false);
  };

  // Handle create supplier
  const handleCreate = async (data: SupplierFormData) => {
    try {
      await createMutation.mutateAsync(data);
      setShowCreateModal(false);
      alert('Supplier created successfully!');
    } catch (error) {
      handleApiError(error, { fallback: 'Failed to create supplier' });
    }
  };

  // Handle update supplier
  const handleUpdate = async (data: SupplierFormData) => {
    if (!editingSupplier) return;
    try {
      await updateMutation.mutateAsync({ id: editingSupplier.id, data });
      setEditingSupplier(null);
      alert('Supplier updated successfully!');
    } catch (error) {
      handleApiError(error, { fallback: 'Failed to update supplier' });
    }
  };

  // Handle delete supplier
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete supplier "${name}"? This action cannot be undone.`)) return;
    try {
      await deleteMutation.mutateAsync(id);
      alert('Supplier deleted successfully!');
    } catch (error) {
      handleApiError(error, { fallback: 'Failed to delete supplier' });
    }
  };

  // Loading state — only show full-page loader on first load (no data yet).
  // isPlaceholderData=true means keepPreviousData is active; old results stay visible.
  if (isLoading && !isPlaceholderData) {
    return (
      <Layout>
        <div className="p-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-blue-800">Loading suppliers...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Error state
  if (error) {
    return (
      <Layout>
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">Failed to load suppliers. Please try again.</p>
            <button
              onClick={() => refetch()}
              className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Supplier Management</h2>
            <p className="text-sm text-gray-600 mt-1">Manage your suppliers and vendor relationships</p>
          </div>
          <div className="flex gap-2 self-start sm:self-auto">
            <button
              onClick={() => setShowExportOptions(!showExportOptions)}
              className="px-3 sm:px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-1 sm:gap-2 text-sm"
            >
              📤 Export
            </button>
            {canCreateSupplier && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1 sm:gap-2 text-sm"
              >
                ➕ Add Supplier
              </button>
            )}
          </div>
        </div>

        {/* Export Options */}
        {showExportOptions && (
          <div className="mb-6 bg-white rounded-lg shadow p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Export Options</h3>
            <div className="flex gap-3">
              <button
                onClick={handleExportCSV}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
              >
                📊 Export to CSV ({suppliers.length} suppliers)
              </button>
              <button
                onClick={() => setShowExportOptions(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Summary Statistics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-3 sm:p-4">
            <div className="text-xs sm:text-sm text-gray-600">Total Suppliers</div>
            <div className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{stats.total}</div>
            <div className="text-xs text-gray-500 mt-1 hidden sm:block">All registered vendors</div>
          </div>
          <div className="bg-white rounded-lg shadow p-3 sm:p-4">
            <div className="text-xs sm:text-sm text-gray-600">Active Suppliers</div>
            <div className="text-xl sm:text-2xl font-bold text-green-600 mt-1">{stats.active}</div>
            <div className="text-xs text-gray-500 mt-1 hidden sm:block">Available for POs</div>
          </div>
          <div className="bg-white rounded-lg shadow p-3 sm:p-4">
            <div className="text-xs sm:text-sm text-gray-600">Total Invoices</div>
            <div className="text-xl sm:text-2xl font-bold text-blue-600 mt-1">
              {invoiceSummary.totalInvoices}
            </div>
            <div className="text-xs text-gray-500 mt-1 hidden sm:block">
              {invoiceSummary.unpaidInvoices > 0
                ? `${invoiceSummary.unpaidInvoices} unpaid`
                : 'All paid'}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-3 sm:p-4">
            <div className="text-xs sm:text-sm text-gray-600">Outstanding</div>
            <div className="text-xl sm:text-2xl font-bold text-red-600 mt-1">
              {formatCurrencyTop(invoiceSummary.totalOutstanding)}
            </div>
            <div className="text-xs text-gray-500 mt-1 hidden sm:block">
              {invoiceSummary.unpaidInvoices > 0 ? `${invoiceSummary.unpaidInvoices} unpaid` : 'Across all suppliers'}
            </div>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Search */}
            <div className="lg:col-span-5">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search suppliers by name, contact, email, phone, address..."
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${isFetching ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}`}
              />
            </div>

            {/* Payment Terms Filter */}
            <div className="lg:col-span-2">
              <label htmlFor="filter-payment-terms" className="sr-only">
                Filter by Payment Terms
              </label>
              <select
                id="filter-payment-terms"
                value={filterPaymentTerms}
                onChange={(e) => setFilterPaymentTerms(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Terms</option>
                {PAYMENT_TERMS.map((term) => (
                  <option key={term.value} value={term.value}>
                    {term.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div className="lg:col-span-2">
              <label htmlFor="sort-field" className="sr-only">
                Sort By
              </label>
              <select
                id="sort-field"
                value={sortField}
                onChange={(e) => {
                  const f = e.target.value as SortField;
                  setSortField(f);
                  if (f === 'outstandingBalance') {
                    setFilterOutstandingOnly(true);
                    setSortOrder('desc');
                  } else {
                    setFilterOutstandingOnly(false);
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="name">Sort by Name</option>
                <option value="contactPerson">Sort by Contact</option>
                <option value="paymentTerms">Sort by Terms</option>
                <option value="status">Sort by Status</option>
                <option value="outstandingBalance">Sort by Balance</option>
                <option value="createdAt">Sort by Date</option>
              </select>
            </div>

            {/* Actions */}
            <div className="lg:col-span-3 flex gap-2">
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilterPaymentTerms('');
                  setFilterOutstandingOnly(false);
                  resetSort();
                }}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Clear All
              </button>
              <button
                onClick={() => refetch()}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                title="Refresh"
              >
                🔄
              </button>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="mt-4 flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Showing {suppliers.length} of {stats.total} suppliers
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1 rounded-lg ${viewMode === 'table'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                📋 Table
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`px-3 py-1 rounded-lg ${viewMode === 'cards'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                🗂️ Cards
              </button>
            </div>
          </div>
        </div>

        {/* Suppliers View */}
        {viewMode === 'table' ? (
          /* Table View */
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {/* Mobile Card View */}
            <div className="block sm:hidden space-y-3 p-3">
              {suppliers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {searchQuery ? 'No suppliers match your search' : 'No suppliers yet. Add your first supplier!'}
                </div>
              ) : (
                suppliers.map((supplier: Supplier) => (
                  <div key={supplier.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-gray-900">{supplier.name}</div>
                      <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${supplier.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {supplier.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    {supplier.contactPerson && <div className="text-sm text-gray-600 mb-1">👤 {supplier.contactPerson}</div>}
                    {supplier.phone && <div className="text-sm text-gray-600 mb-1">📞 {supplier.phone}</div>}
                    {supplier.email && <div className="text-sm text-gray-600 mb-1 truncate">📧 {supplier.email}</div>}
                    <div className="flex items-center justify-between mb-3">
                      <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">
                        {supplier.paymentTerms || 'NET30'}
                      </span>
                      {Number(supplier.outstandingBalance) > 0 && (
                        <span className="text-xs font-semibold text-red-600">
                          {formatCurrency(Number(supplier.outstandingBalance))} due
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 border-t border-gray-100 pt-2">
                      <button onClick={() => setViewingSupplier(supplier)} className="flex-1 text-xs text-gray-600 hover:text-gray-900 font-medium py-1">👁️ View</button>
                      {canUpdateSupplier && (
                        <button onClick={() => setEditingSupplier(supplier)} className="flex-1 text-xs text-blue-600 hover:text-blue-900 font-medium py-1">✏️ Edit</button>
                      )}
                      {canDeleteSupplier && (
                        <button onClick={() => handleDelete(supplier.id, supplier.name)} className="flex-1 text-xs text-red-600 hover:text-red-900 font-medium py-1">🗑️ Delete</button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              {filterOutstandingOnly && (
                <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-xs text-amber-900 flex items-center justify-between">
                  <span>
                    Showing suppliers with outstanding balance only ({suppliers.length} on this page)
                  </span>
                  <button
                    type="button"
                    onClick={() => setFilterOutstandingOnly(false)}
                    className="text-amber-800 underline hover:text-amber-950"
                  >
                    Clear balance filter
                  </button>
                </div>
              )}
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <SortableTableHeader
                      label="Supplier Name"
                      field="name"
                      activeField={sortField}
                      direction={sortOrder}
                      onSort={handleColumnSort}
                    />
                    <SortableTableHeader
                      label="Contact Person"
                      field="contactPerson"
                      activeField={sortField}
                      direction={sortOrder}
                      onSort={handleColumnSort}
                    />
                    <SortableTableHeader
                      label="Payment Terms"
                      field="paymentTerms"
                      activeField={sortField}
                      direction={sortOrder}
                      onSort={handleColumnSort}
                    />
                    <SortableTableHeader
                      label="Status"
                      field="status"
                      activeField={sortField}
                      direction={sortOrder}
                      onSort={handleColumnSort}
                    />
                    <SortableTableHeader
                      label="Outstanding Balance"
                      field="outstandingBalance"
                      activeField={sortField}
                      direction={sortOrder}
                      onSort={handleColumnSort}
                      align="right"
                      filtered={filterOutstandingOnly}
                    />
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {suppliers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                        {searchQuery
                          ? 'No suppliers match your search'
                          : 'No suppliers yet. Add your first supplier to get started!'}
                      </td>
                    </tr>
                  ) : (
                    suppliers.map((supplier: Supplier) => (
                      <tr key={supplier.id} className="hover:bg-gray-50">
                        {/* Supplier Name */}
                        <td className="px-4 py-4">
                          <div className="text-sm font-medium text-gray-900">{supplier.name}</div>
                          {supplier.address && (
                            <div className="text-xs text-gray-500 mt-1">{supplier.address}</div>
                          )}
                        </td>

                        {/* Contact Person */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {supplier.contactPerson || '-'}
                          </div>
                        </td>

                        {/* Payment Terms */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">
                            {supplier.paymentTerms || 'NET30'}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${supplier.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                              }`}
                          >
                            {supplier.isActive ? '✓ Active' : '○ Inactive'}
                          </span>
                        </td>

                        {/* Outstanding Balance */}
                        <td className="px-4 py-4 whitespace-nowrap text-right">
                          {Number(supplier.outstandingBalance) > 0 ? (
                            <span className="text-sm font-semibold text-red-600">
                              {formatCurrency(Number(supplier.outstandingBalance))}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setViewingSupplier(supplier)}
                              className="text-gray-600 hover:text-gray-900"
                              title="View Details"
                            >
                              👁️
                            </button>
                            {canUpdateSupplier && (
                              <button
                                onClick={() => setEditingSupplier(supplier)}
                                className="text-blue-600 hover:text-blue-900"
                                title="Edit Supplier"
                              >
                                ✏️
                              </button>
                            )}
                            {canDeleteSupplier && (
                              <button
                                onClick={() => handleDelete(supplier.id, supplier.name)}
                                className="text-red-600 hover:text-red-900"
                                title="Delete Supplier"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Cards View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suppliers.length === 0 ? (
              <div className="col-span-full bg-white rounded-lg shadow p-8 text-center text-gray-500">
                {searchQuery || filterPaymentTerms
                  ? 'No suppliers match your filters'
                  : 'No suppliers yet. Add your first supplier to get started!'}
              </div>
            ) : (
              suppliers.map((supplier: Supplier) => (
                <div
                  key={supplier.id}
                  className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-5"
                >
                  {/* Card Header */}
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900 mb-1">{supplier.name}</h3>
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${supplier.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                          }`}
                      >
                        {supplier.isActive ? '✓ Active' : '○ Inactive'}
                      </span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="space-y-2 mb-4">
                    {supplier.contactPerson && (
                      <div className="flex items-start gap-2 text-sm">
                        <span className="text-gray-500">👤</span>
                        <span className="text-gray-700">{supplier.contactPerson}</span>
                      </div>
                    )}
                    {supplier.email && (
                      <div className="flex items-start gap-2 text-sm">
                        <span className="text-gray-500">📧</span>
                        <a
                          href={`mailto:${supplier.email}`}
                          className="text-blue-600 hover:underline"
                        >
                          {supplier.email}
                        </a>
                      </div>
                    )}
                    {supplier.phone && (
                      <div className="flex items-start gap-2 text-sm">
                        <span className="text-gray-500">📞</span>
                        <a href={`tel:${supplier.phone}`} className="text-blue-600 hover:underline">
                          {supplier.phone}
                        </a>
                      </div>
                    )}
                    {supplier.address && (
                      <div className="flex items-start gap-2 text-sm">
                        <span className="text-gray-500">📍</span>
                        <span className="text-gray-700">{supplier.address}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-500">💳</span>
                      <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">
                        {supplier.paymentTerms || 'NET30'}
                      </span>
                    </div>
                    {Number(supplier.outstandingBalance) > 0 && (
                      <div className="flex items-center justify-between text-sm mt-1 pt-1 border-t border-gray-100">
                        <span className="text-gray-500">Outstanding</span>
                        <span className="font-semibold text-red-600">
                          {formatCurrency(Number(supplier.outstandingBalance))}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Card Actions */}
                  <div className="flex gap-2 pt-3 border-t border-gray-200">
                    <button
                      onClick={() => setViewingSupplier(supplier)}
                      className="flex-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                    >
                      👁️ View
                    </button>
                    {canUpdateSupplier && (
                      <button
                        onClick={() => setEditingSupplier(supplier)}
                        className="flex-1 px-3 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                      >
                        ✏️ Edit
                      </button>
                    )}
                    {canDeleteSupplier && (
                      <button
                        onClick={() => handleDelete(supplier.id, supplier.name)}
                        className="px-3 py-2 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Pagination */}
        {suppliers.length > 0 && (
          <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="text-sm text-gray-600">
              Page {page} • Showing {suppliers.length} suppliers
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="flex-1 sm:flex-none px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ← Previous
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={suppliers.length < limit}
                className="flex-1 sm:flex-none px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {canManageOpeningBalance && (
          <div className="mt-6 bg-indigo-50 border border-indigo-200 rounded-lg p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-indigo-900 mb-1">Supplier opening balance</h2>
            <p className="text-sm text-indigo-800 mb-3">
              Cutover AP is posted from Supplier Payments (audited, permission-controlled). Use Make Payment → Opening balance.
            </p>
            <Link
              to="/accounting/supplier-payments"
              className="inline-flex text-sm font-medium text-indigo-700 hover:text-indigo-900 underline"
            >
              Go to Supplier Payments
            </Link>
          </div>
        )}

        {/* Info Panel */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-900 mb-2">📋 Supplier Management</h3>
          <ul className="text-xs text-blue-800 space-y-1">
            <li>
              • <strong>Payment Terms:</strong> Standard terms NET30 (30 days), NET60, NET90, COD,
              or Prepaid
            </li>
            <li>
              • <strong>Contact Information:</strong> Keep supplier details up-to-date for smooth
              communication
            </li>
            <li>
              • <strong>Active Status:</strong> Inactive suppliers won't appear in purchase order
              creation
            </li>
            <li>
              • <strong>BR-PO-001:</strong> Valid supplier required for all purchase orders
            </li>
            <li>
              • <strong>Search:</strong> Find suppliers quickly by name, contact person, email, or
              phone
            </li>
          </ul>
        </div>

        {/* Supplier Detail Modal */}
        {viewingSupplier && (
          <SupplierDetailModal
            supplier={viewingSupplier}
            onClose={() => setViewingSupplier(null)}
            onEdit={canUpdateSupplier ? () => {
              setEditingSupplier(viewingSupplier);
              setViewingSupplier(null);
            } : undefined}
            canPostOpeningBalance={canManageOpeningBalance}
            onOpeningBalancePosted={() => refetch()}
          />
        )}

        {/* Create/Edit Modal */}
        {(showCreateModal || editingSupplier) && (
          <SupplierFormModal
            supplier={editingSupplier}
            onClose={() => {
              setShowCreateModal(false);
              setEditingSupplier(null);
            }}
            onSubmit={editingSupplier ? handleUpdate : handleCreate}
          />
        )}
      </div>
    </Layout>
  );
}

// Supplier Detail Modal Component
interface SupplierDetailModalProps {
  supplier: Supplier;
  onClose: () => void;
  onEdit?: () => void;
  canPostOpeningBalance?: boolean;
  onOpeningBalancePosted?: () => void;
}

function SupplierDetailModal({
  supplier,
  onClose,
  onEdit,
  canPostOpeningBalance = false,
}: SupplierDetailModalProps) {
  const [activeTab, setActiveTab] = useState<
    'info' | 'performance' | 'orders' | 'products' | 'invoices' | 'ledger'
  >('info');
  const [performance, setPerformance] = useState<SupplierPerformance | null>(null);
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [invoices, setInvoices] = useState<SupplierInvoiceSummary[]>([]);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<string>('');
  const [invoicePage, setInvoicePage] = useState(1);
  const INVOICE_PAGE_SIZE = 25;
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const [invoiceDetails, setInvoiceDetails] = useState<InvoiceDetails | null>(null);
  const [loadingInvoiceDetails, setLoadingInvoiceDetails] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null);
  const [loadingTab, setLoadingTab] = useState<string | null>(null);
  const [expandedPOId, setExpandedPOId] = useState<string | null>(null);

  // Ledger state
  const defaultEnd = new Date().toLocaleDateString('en-CA');
  const defaultStart = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toLocaleDateString('en-CA');
  })();
  // GL ledger state (used for "View GL Journals" drilldown modal)
  const [ledger, setLedger] = useState<SupplierLedgerData | null>(null);
  const [ledgerStartDate, setLedgerStartDate] = useState(defaultStart);
  const [ledgerEndDate, setLedgerEndDate] = useState(defaultEnd);
  const [ledgerFilter] = useState<'all'>('all');
  const LEDGER_PAGE_SIZE = 25;
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  // Smart Statement state (main supplier statement view)
  const [smartLedger, setSmartLedger] = useState<SmartStatementData | null>(null);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);
  const [smartFilter, setSmartFilter] = useState<'all' | 'Pending Bill' | 'Unpaid' | 'Paid' | 'Applied' | 'Cancelled'>('all');
  const [smartSearch, setSmartSearch] = useState('');
  const [smartPage, setSmartPage] = useState(1);
  const SMART_PAGE_SIZE = 25;
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showGlModal, setShowGlModal] = useState(false);

  // Permission check for recording payments
  const canCreatePayment = useCanAccess([], ['suppliers.create']);

  // Single-invoice payment modal state
  const [payingInvoice, setPayingInvoice] = useState<SupplierInvoiceSummary | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);

  // Multi-invoice inline payment panel state
  const [multiSelected, setMultiSelected] = useState<Map<string, number>>(new Map()); // invoiceId → payAmount
  const [multiPayDate, setMultiPayDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [multiPayMethod, setMultiPayMethod] = useState('BANK_TRANSFER');
  const [multiPayRef, setMultiPayRef] = useState('');
  const [multiPayNotes, setMultiPayNotes] = useState('');
  const [multiPosting, setMultiPosting] = useState(false);
  const [multiError, setMultiError] = useState<string | null>(null);
  const [multiSuccess, setMultiSuccess] = useState<string | null>(null);

  const multiRunTotal = useMemo(() => {
    let t = new Decimal(0);
    multiSelected.forEach((amt) => { t = t.plus(amt); });
    return t.toNumber();
  }, [multiSelected]);

  const isPayableInvoice = (inv: SupplierInvoiceSummary) =>
    Number(inv.outstandingBalance || 0) > 0 &&
    !['Cancelled', 'CANCELLED', 'DRAFT', 'Paid', 'PAID', 'VOIDED'].includes(inv.status || '');

  const toggleMultiRow = (inv: SupplierInvoiceSummary) => {
    if (!isPayableInvoice(inv)) return;
    setMultiSelected(prev => {
      const next = new Map(prev);
      if (next.has(inv.id)) {
        next.delete(inv.id);
      } else {
        next.set(inv.id, Number(inv.outstandingBalance || 0));
      }
      return next;
    });
  };

  const setMultiAmount = (invoiceId: string, value: string) => {
    const amt = parseFloat(value) || 0;
    setMultiSelected(prev => {
      const next = new Map(prev);
      if (amt > 0) next.set(invoiceId, amt);
      else next.delete(invoiceId);
      return next;
    });
  };

  const handlePostMultiRun = async () => {
    if (multiSelected.size === 0) return;
    setMultiPosting(true);
    setMultiError(null);
    setMultiSuccess(null);
    try {
      const allocations = invoices
        .filter(inv => multiSelected.has(inv.id))
        .map(inv => ({
          supplierId: supplier.id,
          invoiceId: inv.id,
          amount: multiSelected.get(inv.id)!,
        }));
      const { data } = await api.post('/supplier-payments/payments/mass-run', {
        paymentDate: multiPayDate,
        paymentMethod: multiPayMethod,
        reference: multiPayRef || undefined,
        notes: multiPayNotes || undefined,
        allocations,
      });
      if (!data.success) throw new Error(data.error || 'Payment failed');
      const count = allocations.length;
      setMultiSuccess(`✅ Posted ${count} payment${count !== 1 ? 's' : ''} — ${formatCurrency(multiRunTotal)}`);
      setMultiSelected(new Map());
      setMultiPayRef('');
      setMultiPayNotes('');
      setInvoices([]);
      loadInvoices();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
      const apiError = axiosErr.response?.data?.error || axiosErr.response?.data?.message;
      setMultiError(apiError || (err instanceof Error ? err.message : 'Payment run failed'));
    } finally {
      setMultiPosting(false);
    }
  };

  // Filtered + paginated invoices
  const filteredInvoices = useMemo(() => {
    let result = invoices;
    const q = invoiceSearch.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (inv) =>
          inv.invoiceNumber?.toLowerCase().includes(q) ||
          (inv.supplierInvoiceNumber ?? '').toLowerCase().includes(q)
      );
    }
    if (invoiceStatusFilter) {
      result = result.filter((inv) => inv.status === invoiceStatusFilter);
    }
    return result;
  }, [invoices, invoiceSearch, invoiceStatusFilter]);

  const invoiceTotalPages = Math.max(1, Math.ceil(filteredInvoices.length / INVOICE_PAGE_SIZE));
  const paginatedInvoices = useMemo(() => {
    const start = (invoicePage - 1) * INVOICE_PAGE_SIZE;
    return filteredInvoices.slice(start, start + INVOICE_PAGE_SIZE);
  }, [filteredInvoices, invoicePage, INVOICE_PAGE_SIZE]);

  // GL ledger entries for the drilldown modal (unfiltered)
  const filteredLedgerEntries = useMemo(() => ledger?.entries ?? [], [ledger, ledgerFilter]);
  const ledgerTotalPages = Math.max(1, Math.ceil(filteredLedgerEntries.length / LEDGER_PAGE_SIZE));
  const paginatedLedgerEntries = useMemo(() => filteredLedgerEntries.slice(0, LEDGER_PAGE_SIZE * 4), [filteredLedgerEntries, LEDGER_PAGE_SIZE]);

  // Smart Statement filtered + paginated entries
  const filteredSmartEntries = useMemo(() => {
    let result = smartLedger?.entries ?? [];
    if (smartFilter !== 'all') {
      result = result.filter((e) => e.itemStatus === smartFilter);
    }
    const q = smartSearch.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (e) =>
          e.vchNo.toLowerCase().includes(q) ||
          e.particulars.toLowerCase().includes(q) ||
          e.vchType.toLowerCase().includes(q),
      );
    }
    return result;
  }, [smartLedger, smartFilter, smartSearch]);

  const smartTotalPages = Math.max(1, Math.ceil(filteredSmartEntries.length / SMART_PAGE_SIZE));
  const paginatedSmartEntries = useMemo(() => {
    const start = (smartPage - 1) * SMART_PAGE_SIZE;
    return filteredSmartEntries.slice(start, start + SMART_PAGE_SIZE);
  }, [filteredSmartEntries, smartPage, SMART_PAGE_SIZE]);

  const paymentTermInfo = PAYMENT_TERMS.find((t) => t.value === supplier.paymentTerms);

  // Load data when tabs change
  const loadPerformance = async () => {
    if (performance) return; // Already loaded
    setLoadingTab('performance');
    try {
      const { data } = await api.get(`/suppliers/${supplier.id}/performance`);
      if (data.success) {
        setPerformance(data.data);
      }
    } catch (error) {
      console.error('Failed to load performance:', error);
    } finally {
      setLoadingTab(null);
    }
  };

  const loadOrders = async () => {
    if (orders.length > 0) return; // Already loaded
    setLoadingTab('orders');
    try {
      const { data } = await api.get(`/suppliers/${supplier.id}/orders`, { params: { limit: 50 } });
      if (data.success) {
        setOrders(data.data);
      }
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoadingTab(null);
    }
  };

  const loadProducts = async () => {
    if (products.length > 0) return; // Already loaded
    setLoadingTab('products');
    try {
      const { data } = await api.get(`/suppliers/${supplier.id}/products`);
      if (data.success) {
        setProducts(data.data);
      }
    } catch (error) {
      console.error('Failed to load products:', error);
    } finally {
      setLoadingTab(null);
    }
  };

  const loadInvoices = async () => {
    setLoadingTab('invoices');
    try {
      const { data } = await api.get(`/supplier-payments/suppliers/${supplier.id}/invoices`);
      if (data.success) {
        setInvoices(data.data);
      }
    } catch (error) {
      console.error('Failed to load invoices:', error);
    } finally {
      setLoadingTab(null);
    }
  };

  const loadInvoiceDetails = async (invoiceId: string) => {
    setSelectedInvoice(invoiceId);
    setInvoiceDetails(null);
    setLoadingInvoiceDetails(true);
    try {
      const { data } = await api.get(`/supplier-payments/invoices/${invoiceId}/details`);
      if (data.success) {
        setInvoiceDetails(data.data);
      }
    } catch (error) {
      console.error('Failed to load invoice details:', error);
    } finally {
      setLoadingInvoiceDetails(false);
    }
  };

  const handleDownloadPdf = async (invoiceId: string, invoiceNumber: string) => {
    setDownloadingPdf(invoiceId);
    try {
      await downloadFile(
        `/supplier-payments/invoices/${invoiceId}/pdf`,
        `supplier-invoice-${invoiceNumber}.pdf`
      );
    } catch (error) {
      console.error('Failed to download PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setDownloadingPdf(null);
    }
  };

  const handleInlineInvoiceToggle = async (invoiceId: string) => {
    if (selectedInvoice === invoiceId) {
      setSelectedInvoice(null);
      setInvoiceDetails(null);
      return;
    }
    await loadInvoiceDetails(invoiceId);
  };

  // Load data when tab changes
  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    if (tab === 'performance') loadPerformance();
    if (tab === 'orders') loadOrders();
    if (tab === 'products') loadProducts();
    if (tab === 'invoices') loadInvoices();
    if (tab === 'ledger') loadSmartLedger(ledgerStartDate, ledgerEndDate);
  };

  // Loads raw GL journal entries — used only for the accountant drilldown modal
  const loadLedger = async (start: string, end: string) => {
    setLedgerLoading(true);
    setLedgerError(null);
    try {
      const { data } = await api.get(`/suppliers/${supplier.id}/ledger`, {
        params: { startDate: start, endDate: end },
      });
      if (data.success) {
        setLedger(data.data);
      } else {
        setLedgerError(data.error || 'Failed to load GL journals');
      }
    } catch (err) {
      setLedgerError('Failed to load GL journals');
      console.error('Failed to load ledger:', err);
    } finally {
      setLedgerLoading(false);
    }
  };

  // Loads the Smart Supplier Statement (business-document view)
  const loadSmartLedger = async (start: string, end: string) => {
    setSmartLoading(true);
    setSmartError(null);
    try {
      const { data } = await api.get(`/suppliers/${supplier.id}/smart-statement`, {
        params: { startDate: start, endDate: end },
      });
      if (data.success) {
        setSmartLedger(data.data);
        setSmartPage(1);
        setExpandedRows(new Set());
      } else {
        setSmartError(data.error || 'Failed to load statement');
      }
    } catch (err) {
      setSmartError('Failed to load supplier statement');
      console.error('Failed to load smart ledger:', err);
    } finally {
      setSmartLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!smartLedger) return;
    const entries = smartFilter === 'all'
      ? smartLedger.entries
      : smartLedger.entries.filter((e) => e.itemStatus === smartFilter);
    const escapeCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows: string[] = [
      [escapeCell(`Supplier Statement — ${smartLedger.supplierName}`)].join(','),
      [escapeCell(`Period: ${smartLedger.periodStart} to ${smartLedger.periodEnd}`)].join(','),
      '',
      ['Date', 'Particulars', 'Vch Type', 'Vch No', 'Debit', 'Credit', 'Balance', 'Status', 'Payment Method']
        .map(escapeCell)
        .join(','),
      [smartLedger.periodStart, 'Opening Balance', '', '', '', '', smartLedger.openingBalance, '', '']
        .map(escapeCell)
        .join(','),
      ...entries.map((e) =>
        [e.date, e.particulars, e.vchType, e.vchNo, e.debit || '', e.credit || '', e.balanceAfter, e.itemStatus, e.paymentMethod || '']
          .map(escapeCell)
          .join(','),
      ),
      '',
      ['', 'Outstanding Amount', '', '', '', '', smartLedger.openItemBalance ?? smartLedger.closingBalance, '', ''].map(escapeCell).join(','),
    ];
    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `supplier-statement-${smartLedger.supplierName.replace(/\s+/g, '-')}-${smartLedger.periodStart}-${smartLedger.periodEnd}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = (): void => {
    if (!smartLedger) return;
    const supplierSlug = smartLedger.supplierName.replace(/\s+/g, '-');
    const dateSuffix = `${ledgerStartDate || 'start'}-${ledgerEndDate || 'end'}`;
    const qs = new URLSearchParams();
    if (ledgerStartDate) qs.set('startDate', ledgerStartDate);
    if (ledgerEndDate) qs.set('endDate', ledgerEndDate);
    downloadFile(
      `/documents/SUPPLIER_STATEMENT/${supplier.id}?${qs.toString()}`,
      `supplier-statement-${supplierSlug}-${dateSuffix}.pdf`,
    ).catch((err: Error) => alert(`PDF export failed: ${err.message}`));
  };

  const openPayModal = (inv: SupplierInvoiceSummary) => {
    const balance = Number(inv.outstandingBalance || 0);
    setPayingInvoice(inv);
    setPaymentAmount(balance.toString());
    setPaymentMethod('BANK_TRANSFER');
    setPaymentReference('');
    setPaymentNotes('');
    setPaymentError(null);
    setPaymentSuccess(null);
  };

  const handleSubmitPayment = async () => {
    if (!payingInvoice) return;
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      setPaymentError('Amount must be greater than zero');
      return;
    }
    const balance = Number(payingInvoice.outstandingBalance || 0);
    if (amount > balance) {
      setPaymentError(
        `Amount cannot exceed outstanding balance of ${formatCurrency(balance, true, 0)}`
      );
      return;
    }
    setSubmittingPayment(true);
    setPaymentError(null);
    try {
      const { data } = await api.post('/supplier-payments/payments', {
        supplierId: supplier.id,
        amount,
        paymentMethod,
        reference: paymentReference || undefined,
        notes: paymentNotes || undefined,
        targetInvoiceId: payingInvoice.id,
      });
      if (!data.success) {
        throw new Error(data.error || 'Failed to record payment');
      }
      setPaymentSuccess(
        `Payment of ${formatCurrency(amount, true, 0)} recorded successfully (${data.data?.paymentNumber || ''})`
      );
      // Refresh invoices after short delay
      setTimeout(() => {
        setPayingInvoice(null);
        setPaymentSuccess(null);
        // Force reload invoices
        setInvoices([]);
        loadInvoices();
      }, 2000);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Payment failed';
      setPaymentError(message);
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Removed inline formatCurrency — using shared import from utils/currency

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-3 sm:p-6 max-w-[98vw] sm:max-w-5xl w-full mx-1 sm:mx-4 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4 sm:mb-6">
          <div className="flex-1 min-w-0 pr-3">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 truncate">{supplier.name}</h3>
            {supplier.contactPerson && (
              <p className="text-xs text-gray-500 mt-0.5 sm:hidden">{supplier.contactPerson}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none flex-shrink-0"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Tabs — scrollable on mobile */}
        <div className="flex mb-4 sm:mb-6 border-b border-gray-200 overflow-x-auto scrollbar-none -mx-3 sm:mx-0 px-3 sm:px-0">
          {([
            { key: 'info', icon: '📋', label: 'Info' },
            { key: 'performance', icon: '📊', label: 'Performance' },
            { key: 'orders', icon: '📦', label: 'Orders' },
            { key: 'products', icon: '🏷️', label: 'Items' },
            { key: 'invoices', icon: '📄', label: 'Invoices' },
            { key: 'ledger', icon: '📒', label: 'Ledger' },
          ] as const).map(({ key, icon, label }) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`flex-shrink-0 flex items-center gap-1 px-2.5 sm:px-4 py-2 font-medium text-xs sm:text-sm whitespace-nowrap border-b-2 transition-colors ${activeTab === key
                ? 'text-blue-600 border-blue-600'
                : 'text-gray-500 border-transparent hover:text-gray-900 hover:border-gray-300'
                }`}
            >
              <span>{icon}</span>
              <span className="hidden xs:inline sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="min-h-[400px]">
          {activeTab === 'info' && (
            <div>
              {/* Supplier Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-6">
                {/* Left Column */}
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Supplier Name</label>
                    <div className="mt-1 text-lg font-semibold text-gray-900">{supplier.name}</div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-500">Contact Person</label>
                    <div className="mt-1 text-gray-900">{supplier.contactPerson || '-'}</div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-500">Email</label>
                    <div className="mt-1">
                      {supplier.email ? (
                        <a
                          href={`mailto:${supplier.email}`}
                          className="text-blue-600 hover:underline"
                        >
                          {supplier.email}
                        </a>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-500">Phone</label>
                    <div className="mt-1">
                      {supplier.phone ? (
                        <a href={`tel:${supplier.phone}`} className="text-blue-600 hover:underline">
                          {supplier.phone}
                        </a>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Payment Terms</label>
                    <div className="mt-1">
                      <span className="inline-flex px-3 py-1 text-sm font-semibold rounded-full bg-purple-100 text-purple-800">
                        {paymentTermInfo?.label || supplier.paymentTerms || 'NET30'}
                      </span>
                      {paymentTermInfo && (
                        <div className="text-xs text-gray-500 mt-1">
                          {paymentTermInfo.description}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-500">Status</label>
                    <div className="mt-1">
                      <span
                        className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${supplier.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                          }`}
                      >
                        {supplier.isActive ? '✓ Active' : '○ Inactive'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-500">Created</label>
                    <div className="mt-1 text-gray-900">
                      {formatDisplayDate(supplier.createdAt)}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-500">Last Updated</label>
                    <div className="mt-1 text-gray-900">
                      {formatDisplayDate(supplier.updatedAt)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Address Section */}
              {supplier.address && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <label className="text-sm font-medium text-gray-500">Address</label>
                  <div className="mt-1 text-gray-900 whitespace-pre-wrap">{supplier.address}</div>
                </div>
              )}

              {canPostOpeningBalance && (
                <div className="mb-6 p-4 border border-indigo-200 bg-indigo-50/50 rounded-lg">
                  <h4 className="text-sm font-semibold text-indigo-900 mb-1">Opening balance (cutover)</h4>
                  <p className="text-xs text-indigo-800 mb-2">
                    Post or correct AP for <strong>{supplier.name}</strong> from Supplier Payments (audited).
                  </p>
                  <Link
                    to="/accounting/supplier-payments"
                    className="text-sm font-medium text-indigo-700 hover:text-indigo-900 underline"
                  >
                    Open Supplier Payments → Opening balance
                  </Link>
                </div>
              )}

              {/* Quick Stats */}
              <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-4">
                <div className="bg-blue-50 rounded-lg p-2 sm:p-3 text-center">
                  <div className="text-xs text-blue-600 mb-1">Supplier ID</div>
                  <div className="text-xs sm:text-sm font-mono text-blue-900">
                    {supplier.id.slice(0, 8)}...
                  </div>
                </div>
                <div className="bg-purple-50 rounded-lg p-2 sm:p-3 text-center">
                  <div className="text-xs text-purple-600 mb-1">Pay Days</div>
                  <div className="text-base sm:text-lg font-bold text-purple-900">
                    {paymentTermInfo?.days !== undefined
                      ? paymentTermInfo.days >= 0
                        ? `${paymentTermInfo.days} days`
                        : 'Prepaid'
                      : 'N/A'}
                  </div>
                </div>
                <div className="bg-green-50 rounded-lg p-2 sm:p-3 text-center">
                  <div className="text-xs text-green-600 mb-1">Status</div>
                  <div className="text-xs sm:text-sm font-bold text-green-900">
                    {supplier.isActive ? 'Active' : 'Inactive'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'performance' && (
            <div>
              {loadingTab === 'performance' ? (
                <div className="text-center py-12">
                  <div className="text-gray-600">Loading performance data...</div>
                </div>
              ) : performance ? (
                <div>
                  {/* Performance Metrics */}
                  <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
                      <div className="text-xs text-blue-600 mb-1">Total Orders</div>
                      <div className="text-2xl font-bold text-blue-900">
                        {performance.totalOrders}
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4">
                      <div className="text-xs text-yellow-600 mb-1">Pending Orders</div>
                      <div className="text-2xl font-bold text-yellow-900">
                        {performance.pendingOrders}
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
                      <div className="text-xs text-green-600 mb-1">Completed</div>
                      <div className="text-2xl font-bold text-green-900">
                        {performance.completedOrders}
                      </div>
                    </div>
                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
                      <div className="text-xs text-purple-600 mb-1">Products</div>
                      <div className="text-2xl font-bold text-purple-900">
                        {performance.uniqueProducts}
                      </div>
                    </div>
                  </div>

                  {/* Financial Summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    <div className="bg-white border-2 border-blue-200 rounded-lg p-6">
                      <div className="text-sm text-gray-600 mb-2">Total Purchase Value</div>
                      <div className="text-3xl font-bold text-blue-600">
                        {formatCurrency(performance.totalValue)}
                      </div>
                      <div className="text-xs text-gray-500 mt-2">
                        All orders (completed + pending)
                      </div>
                    </div>
                    <div className="bg-white border-2 border-red-200 rounded-lg p-6">
                      <div className="text-sm text-gray-600 mb-2">Outstanding Amount</div>
                      <div className="text-3xl font-bold text-red-600">
                        {formatCurrency(performance.outstandingAmount)}
                      </div>
                    </div>
                  </div>

                  {/* Last Activity */}
                  {performance.lastOrderDate && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-sm font-medium text-gray-700 mb-1">Last Order Date</div>
                      <div className="text-lg text-gray-900">
                        {formatDisplayDate(performance.lastOrderDate)}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">No performance data available</div>
              )}
            </div>
          )}

          {activeTab === 'orders' && (
            <div>
              {loadingTab === 'orders' ? (
                <div className="text-center py-12">
                  <div className="text-gray-600">Loading orders...</div>
                </div>
              ) : orders.length > 0 ? (
                <div className="space-y-2">
                  {orders.map((order: SupplierOrder) => {
                    const isExpanded = expandedPOId === order.id;
                    return (
                      <div key={order.id} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div
                          className="p-4 cursor-pointer hover:bg-gray-50 transition-colors select-none"
                          onClick={() => setExpandedPOId(isExpanded ? null : order.id)}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400 text-xs w-3">{isExpanded ? '▼' : '▶'}</span>
                              <div>
                                <div className="font-semibold text-blue-600">{order.poNumber}</div>
                                <div className="text-sm text-gray-600">{formatDisplayDate(order.orderDate)}</div>
                              </div>
                            </div>
                            <span
                              className={`px-3 py-1 text-xs font-semibold rounded-full ${order.status === 'COMPLETED'
                                ? 'bg-green-100 text-green-800'
                                : order.status === 'PENDING'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-gray-100 text-gray-800'
                                }`}
                            >
                              {order.status}
                            </span>
                          </div>
                          <div className="flex justify-between items-center pl-5">
                            <div className="text-sm text-gray-600">
                              {order.expectedDelivery && (
                                <>Expected: {formatDisplayDate(order.expectedDelivery)}</>
                              )}
                            </div>
                            <div className="text-lg font-bold text-gray-900">
                              {formatCurrency(order.totalAmount)}
                            </div>
                          </div>
                          {order.notes && (
                            <div className="mt-2 text-xs text-gray-500 pl-5">{order.notes}</div>
                          )}
                        </div>
                        {isExpanded && (
                          <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
                            <SupplierPOItemsInline poId={order.id} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">No purchase orders yet</div>
              )}
            </div>
          )}

          {activeTab === 'products' && (
            <div>
              {loadingTab === 'products' ? (
                <div className="text-center py-12">
                  <div className="text-gray-600">Loading products...</div>
                </div>
              ) : products.length > 0 ? (
                <>
                  {/* Mobile card layout */}
                  <div className="block sm:hidden space-y-3">
                    {products.map((product: SupplierProduct, idx: number) => (
                      <div key={idx} className="border border-gray-200 rounded-lg p-3">
                        <div className="font-medium text-gray-900 mb-2">{product.productName}</div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          <span className="text-gray-500">Orders</span>
                          <span className="text-right font-medium">{product.orderCount}</span>
                          <span className="text-gray-500">Total Qty</span>
                          <span className="text-right font-semibold">{product.totalQuantity}</span>
                          <span className="text-gray-500">Avg Cost</span>
                          <span className="text-right">{formatCurrency(product.avgUnitCost)}</span>
                          <span className="text-gray-500">Range</span>
                          <span className="text-right text-gray-600">{formatCurrency(product.minUnitCost)}–{formatCurrency(product.maxUnitCost)}</span>
                          <span className="text-gray-500">Last Order</span>
                          <span className="text-right">{formatDisplayDate(product.lastOrderDate)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Orders</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Qty</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Cost</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Price Range</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Order</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {products.map((product: SupplierProduct, idx: number) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{product.productName}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">{product.orderCount}</td>
                            <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{product.totalQuantity}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900">{formatCurrency(product.avgUnitCost)}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">{formatCurrency(product.minUnitCost)} – {formatCurrency(product.maxUnitCost)}</td>
                            <td className="px-4 py-3 text-sm text-gray-600">{formatDisplayDate(product.lastOrderDate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-gray-500">No products supplied yet</div>
              )}
            </div>
          )}

          {activeTab === 'invoices' && (
            <div>
              {loadingTab === 'invoices' ? (
                <div className="text-center py-12">
                  <div className="text-gray-600">Loading invoices...</div>
                </div>
              ) : invoices.length > 0 ? (
                <div className="space-y-3">
                  {/* Search + filter controls */}
                  <div className="flex flex-col sm:flex-row gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Search invoice # or ref..."
                      value={invoiceSearch}
                      onChange={(e) => { setInvoiceSearch(e.target.value); setInvoicePage(1); }}
                      className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={invoiceStatusFilter}
                      onChange={(e) => { setInvoiceStatusFilter(e.target.value); setInvoicePage(1); }}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">All Statuses</option>
                      <option value="Pending">Pending</option>
                      <option value="PartiallyPaid">Partially Paid</option>
                      <option value="Paid">Paid</option>
                      <option value="Overdue">Overdue</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </div>

                  {/* Invoice Summary Cards */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4">
                    <div className="bg-blue-50 rounded-lg p-3 text-center">
                      <div className="text-xs text-blue-600 mb-1">Showing</div>
                      <div className="text-xl font-bold text-blue-900">{filteredInvoices.length} <span className="text-sm font-normal text-blue-500">/ {invoices.length}</span></div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3 text-center">
                      <div className="text-xs text-green-600 mb-1">Total Amount</div>
                      <div className="text-lg font-bold text-green-900">
                        {formatCurrency(
                          filteredInvoices.reduce(
                            (sum: number, inv: SupplierInvoiceSummary) =>
                              new Decimal(sum).plus(Number(inv.totalAmount || 0)).toNumber(),
                            0
                          )
                        )}
                      </div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3 text-center">
                      <div className="text-xs text-red-600 mb-1">Outstanding</div>
                      <div className="text-lg font-bold text-red-900">
                        {formatCurrency(
                          Math.max(
                            0,
                            filteredInvoices.reduce(
                              (sum: number, inv: SupplierInvoiceSummary) =>
                                new Decimal(sum)
                                  .plus(Number(inv.outstandingBalance || 0))
                                  .toNumber(),
                              0
                            )
                          )
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Invoice List — mobile cards + desktop table */}
                  {/* Mobile cards */}
                  <div className="block sm:hidden space-y-3">
                    {filteredInvoices.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 text-sm">No invoices match your search.</div>
                    ) : paginatedInvoices.map((inv: SupplierInvoiceSummary) => {
                      const balance = Number(inv.outstandingBalance || 0);
                      const payable = isPayableInvoice(inv);
                      const checked = multiSelected.has(inv.id);
                      const statusColor =
                        inv.status === 'Paid' ? 'bg-green-100 text-green-800'
                          : inv.status === 'PartiallyPaid' ? 'bg-yellow-100 text-yellow-800'
                            : inv.status === 'Pending' ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800';
                      return (
                        <div key={inv.id} className={`border rounded-lg p-3 ${checked ? 'border-purple-400 bg-purple-50' : 'border-gray-200'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {canCreatePayment && payable && (
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleMultiRow(inv)}
                                  className="w-4 h-4 accent-purple-600 cursor-pointer"
                                  title="Select for payment"
                                />
                              )}
                              <span className="font-semibold text-blue-600 text-sm">{inv.invoiceNumber}</span>
                            </div>
                            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${statusColor}`}>{inv.status}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mb-2">
                            <span className="text-gray-500">Date</span>
                            <span className="text-right">{formatDisplayDate(inv.invoiceDate)}</span>
                            <span className="text-gray-500">Due</span>
                            <span className="text-right">{inv.dueDate ? formatDisplayDate(inv.dueDate) : '—'}</span>
                            <span className="text-gray-500">Total</span>
                            <span className="text-right font-semibold">{formatCurrency(Number(inv.totalAmount || 0))}</span>
                            <span className="text-gray-500">Paid</span>
                            <span className="text-right text-green-600">{formatCurrency(Number(inv.amountPaid || 0))}</span>
                            {balance > 0 && <><span className="text-gray-500">Balance</span><span className="text-right font-bold text-red-600">{formatCurrency(balance)}</span></>}
                          </div>
                          {/* Inline pay amount when checked */}
                          {checked && (
                            <div className="flex items-center gap-2 mb-2 pt-2 border-t border-purple-200">
                              <span className="text-xs text-purple-700 font-medium">Pay:</span>
                              <input
                                type="number"
                                value={multiSelected.get(inv.id) ?? ''}
                                onChange={(e) => setMultiAmount(inv.id, e.target.value)}
                                className="flex-1 border border-purple-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-purple-500"
                                min="0.01"
                                max={balance}
                                step="0.01"
                              />
                              <button
                                type="button"
                                onClick={() => setMultiAmount(inv.id, balance.toString())}
                                className="text-xs text-purple-600 hover:text-purple-800 underline whitespace-nowrap"
                              >Full</button>
                            </div>
                          )}
                          <div className="flex gap-2 pt-2 border-t border-gray-100">
                            <button onClick={() => loadInvoiceDetails(inv.id)} className="flex-1 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100">👁️ View</button>
                            <button onClick={() => handleDownloadPdf(inv.id, inv.invoiceNumber)} disabled={downloadingPdf === inv.id} className="flex-1 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 disabled:opacity-50">{downloadingPdf === inv.id ? '⏳' : '📄'} PDF</button>
                            {balance > 0 && !['Cancelled', 'CANCELLED', 'DRAFT'].includes(inv.status || '') && <button onClick={() => openPayModal(inv)} className="flex-1 py-1 text-xs bg-purple-50 text-purple-700 rounded hover:bg-purple-100 font-semibold">💰 Pay</button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {canCreatePayment && <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase w-8">✓</th>}
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ref</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Paid</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                          {canCreatePayment && <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Pay Amount</th>}
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredInvoices.length === 0 ? (
                          <tr><td colSpan={canCreatePayment ? 11 : 9} className="px-4 py-8 text-center text-sm text-gray-500">No invoices match your search.</td></tr>
                        ) : paginatedInvoices.map((inv: SupplierInvoiceSummary) => {
                          const total = Number(inv.totalAmount || 0);
                          const paid = Number(inv.amountPaid || 0);
                          const balance = Number(inv.outstandingBalance || 0);
                          const payable = isPayableInvoice(inv);
                          const checked = multiSelected.has(inv.id);
                          const statusColor =
                            inv.status === 'Paid'
                              ? 'bg-green-100 text-green-800'
                              : inv.status === 'PartiallyPaid'
                                ? 'bg-yellow-100 text-yellow-800'
                                : inv.status === 'Pending'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-100 text-gray-800';
                          const isExpanded = selectedInvoice === inv.id;
                          return (
                            <Fragment key={inv.id}>
                              <tr
                                onClick={() => handleInlineInvoiceToggle(inv.id)}
                                className={`${checked ? 'bg-purple-50' : 'hover:bg-gray-50'} cursor-pointer ${isExpanded ? 'bg-blue-50/40' : ''}`}
                              >
                                {canCreatePayment && (
                                  <td className="px-3 py-3 text-center">
                                    {payable && (
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleMultiRow(inv)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-4 h-4 accent-purple-600 cursor-pointer"
                                        title="Select for payment"
                                      />
                                    )}
                                  </td>
                                )}
                                <td className="px-4 py-3 text-sm font-medium text-blue-600">{inv.invoiceNumber}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{inv.supplierInvoiceNumber || '-'}</td>
                                <td className="px-4 py-3 text-sm text-gray-900">{formatDisplayDate(inv.invoiceDate)}</td>
                                <td className="px-4 py-3 text-sm text-gray-600">{inv.dueDate ? formatDisplayDate(inv.dueDate) : '-'}</td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusColor}`}>{inv.status}</span>
                                </td>
                                <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{formatCurrency(total)}</td>
                                <td className="px-4 py-3 text-sm text-right text-green-600">{formatCurrency(paid)}</td>
                                <td className="px-4 py-3 text-sm text-right font-semibold text-red-600">
                                  {balance > 0 ? formatCurrency(balance) : balance < 0 ? <span className="text-green-600">Overpaid {formatCurrency(Math.abs(balance))}</span> : <span className="text-green-600">Paid</span>}
                                </td>
                                {canCreatePayment && (
                                  <td className="px-4 py-3 text-right">
                                    {checked && (
                                      <div className="flex items-center gap-1 justify-end">
                                        <input
                                          type="number"
                                          value={multiSelected.get(inv.id) ?? ''}
                                          onChange={(e) => setMultiAmount(inv.id, e.target.value)}
                                          onClick={(e) => e.stopPropagation()}
                                          className="w-28 border border-purple-300 rounded px-2 py-1 text-xs text-right focus:ring-1 focus:ring-purple-500"
                                          min="0.01"
                                          max={balance}
                                          step="0.01"
                                        />
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setMultiAmount(inv.id, balance.toString());
                                          }}
                                          className="text-xs text-purple-600 hover:text-purple-800 underline whitespace-nowrap"
                                        >Full</button>
                                      </div>
                                    )}
                                  </td>
                                )}
                                <td className="px-4 py-3 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleInlineInvoiceToggle(inv.id);
                                      }}
                                      className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors"
                                      title={isExpanded ? 'Hide Details' : 'View Details'}
                                    >
                                      {isExpanded ? '▾ Hide' : '▸ View'}
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDownloadPdf(inv.id, inv.invoiceNumber);
                                      }}
                                      disabled={downloadingPdf === inv.id}
                                      className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 transition-colors disabled:opacity-50"
                                      title="Download PDF"
                                    >{downloadingPdf === inv.id ? '⏳' : '📄'} PDF</button>
                                    {balance > 0 && !['Cancelled', 'CANCELLED', 'DRAFT'].includes(inv.status || '') && <button onClick={(e) => {
                                      e.stopPropagation();
                                      openPayModal(inv);
                                    }} className="px-2 py-1 text-xs bg-purple-50 text-purple-700 rounded hover:bg-purple-100 transition-colors font-semibold" title="Record Payment">💰 Pay</button>}
                                  </div>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr className="bg-blue-50/30">
                                  <td colSpan={canCreatePayment ? 11 : 9} className="px-4 py-4">
                                    {loadingInvoiceDetails ? (
                                      <div className="text-sm text-gray-600">Loading details...</div>
                                    ) : invoiceDetails ? (
                                      <div className="border border-blue-200 rounded-lg overflow-hidden bg-white">
                                        <div className="bg-blue-50 px-4 py-3 flex justify-between items-center">
                                          <div>
                                            <h4 className="text-base font-semibold text-gray-900">
                                              {invoiceDetails.invoice.invoiceNumber}
                                              {invoiceDetails.invoice.supplierInvoiceNumber && (
                                                <span className="ml-2 text-xs font-normal text-gray-500">
                                                  (Ref: {invoiceDetails.invoice.supplierInvoiceNumber})
                                                </span>
                                              )}
                                            </h4>
                                            <p className="text-xs text-gray-600">
                                              {formatDisplayDate(invoiceDetails.invoice.invoiceDate)}
                                              {invoiceDetails.invoice.dueDate && ` | Due: ${formatDisplayDate(invoiceDetails.invoice.dueDate)}`}
                                            </p>
                                          </div>
                                          <button
                                            onClick={() => handleDownloadPdf(inv.id, inv.invoiceNumber)}
                                            disabled={downloadingPdf === inv.id}
                                            className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                                          >
                                            {downloadingPdf === inv.id ? '⏳ Generating...' : '📄 Export PDF'}
                                          </button>
                                        </div>
                                        <div className="p-4 space-y-4">
                                          {invoiceDetails.lineItems && invoiceDetails.lineItems.length > 0 ? (
                                            <div>
                                              <h5 className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Line Items</h5>
                                              <table className="min-w-full divide-y divide-gray-200 text-xs">
                                                <thead className="bg-gray-50">
                                                  <tr>
                                                    <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">#</th>
                                                    <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Product/Service</th>
                                                    <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Description</th>
                                                    <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase">Qty</th>
                                                    <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase">Unit Cost</th>
                                                    <th className="px-3 py-2 text-right font-medium text-gray-500 uppercase">Total</th>
                                                  </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                  {invoiceDetails.lineItems.map((item: InvoiceLineItem, idx: number) => (
                                                    <tr key={item.id || idx} className="hover:bg-gray-50">
                                                      <td className="px-3 py-2 text-gray-500">{item.lineNumber || idx + 1}</td>
                                                      <td className="px-3 py-2 font-medium text-gray-900">{item.productName}</td>
                                                      <td className="px-3 py-2 text-gray-600">{item.description || '-'}</td>
                                                      <td className="px-3 py-2 text-right text-gray-900">{item.quantity} {item.unitOfMeasure || ''}</td>
                                                      <td className="px-3 py-2 text-right text-gray-900">{formatCurrency(item.unitCost)}</td>
                                                      <td className="px-3 py-2 text-right font-semibold text-gray-900">{formatCurrency(item.lineTotal)}</td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                                <tfoot className="bg-gray-50">
                                                  <tr>
                                                    <td colSpan={5} className="px-3 py-2 text-right font-semibold text-gray-700">Subtotal:</td>
                                                    <td className="px-3 py-2 text-right font-bold text-gray-900">{formatCurrency(Number(invoiceDetails.invoice.subtotal || invoiceDetails.invoice.totalAmount || 0))}</td>
                                                  </tr>
                                                  {Number(invoiceDetails.invoice.taxAmount || 0) > 0 && (
                                                    <tr>
                                                      <td colSpan={5} className="px-3 py-2 text-right font-semibold text-gray-700">Tax:</td>
                                                      <td className="px-3 py-2 text-right font-bold text-gray-900">{formatCurrency(Number(invoiceDetails.invoice.taxAmount))}</td>
                                                    </tr>
                                                  )}
                                                  <tr className="border-t-2 border-gray-300">
                                                    <td colSpan={5} className="px-3 py-2 text-right font-bold text-gray-900">Total:</td>
                                                    <td className="px-3 py-2 text-right font-bold text-blue-600">{formatCurrency(Number(invoiceDetails.invoice.totalAmount || 0))}</td>
                                                  </tr>
                                                </tfoot>
                                              </table>
                                            </div>
                                          ) : (
                                            <div className="text-xs text-gray-500 italic">No line items recorded for this invoice.</div>
                                          )}

                                          {invoiceDetails.allocations && invoiceDetails.allocations.length > 0 && (
                                            <div>
                                              <h5 className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Payment History</h5>
                                              <div className="space-y-2">
                                                {invoiceDetails.allocations.map((alloc: InvoiceAllocation) => (
                                                  <div key={alloc.id} className="flex justify-between items-center bg-green-50 rounded-lg px-3 py-2">
                                                    <div>
                                                      <span className="font-medium text-gray-900 text-xs">{alloc.paymentNumber}</span>
                                                      <span className="ml-2 text-xs text-gray-500">{formatDisplayDate(alloc.allocationDate)}</span>
                                                      <span className="ml-2 text-xs bg-white px-2 py-0.5 rounded text-gray-600">{alloc.paymentMethod}</span>
                                                    </div>
                                                    <span className="font-bold text-green-700 text-xs">{formatCurrency(alloc.amountAllocated)}</span>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="text-sm text-gray-500">No details found for this invoice.</div>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {invoiceTotalPages > 1 && (
                    <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                      <span className="text-xs text-gray-500">
                        Showing {Math.min((invoicePage - 1) * INVOICE_PAGE_SIZE + 1, filteredInvoices.length)}–{Math.min(invoicePage * INVOICE_PAGE_SIZE, filteredInvoices.length)} of {filteredInvoices.length}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setInvoicePage((p) => Math.max(1, p - 1))}
                          disabled={invoicePage === 1}
                          className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          ‹ Prev
                        </button>
                        {Array.from({ length: invoiceTotalPages }, (_, i) => i + 1)
                          .filter((p) => p === 1 || p === invoiceTotalPages || Math.abs(p - invoicePage) <= 1)
                          .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                            if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                            acc.push(p);
                            return acc;
                          }, [])
                          .map((p, i) =>
                            p === '...' ? (
                              <span key={`ellipsis-${i}`} className="px-1 text-xs text-gray-400">…</span>
                            ) : (
                              <button
                                key={p}
                                onClick={() => setInvoicePage(p as number)}
                                className={`px-2 py-1 text-xs border rounded ${invoicePage === p
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'border-gray-300 hover:bg-gray-100'
                                  }`}
                              >
                                {p}
                              </button>
                            )
                          )}
                        <button
                          onClick={() => setInvoicePage((p) => Math.min(invoiceTotalPages, p + 1))}
                          disabled={invoicePage === invoiceTotalPages}
                          className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Next ›
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Inline Multi-Invoice Payment Panel ─────────────── */}
                  {canCreatePayment && multiSelected.size > 0 && (
                    <div className="mt-4 border-2 border-purple-300 rounded-xl bg-purple-50 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-bold text-purple-900 flex items-center gap-2">
                          💰 Pay Selected Invoices
                          <span className="bg-purple-200 text-purple-800 text-xs font-semibold px-2 py-0.5 rounded-full">{multiSelected.size}</span>
                        </h4>
                        <button
                          type="button"
                          onClick={() => setMultiSelected(new Map())}
                          className="text-xs text-purple-500 hover:text-purple-700 underline"
                          disabled={multiPosting}
                        >Clear selection</button>
                      </div>

                      {/* Selected invoice summary */}
                      <div className="mb-3 text-xs space-y-1">
                        {invoices.filter(inv => multiSelected.has(inv.id)).map(inv => (
                          <div key={inv.id} className="flex items-center justify-between text-purple-800">
                            <span className="font-medium">{inv.invoiceNumber}</span>
                            <span>{formatCurrency(multiSelected.get(inv.id) ?? 0)}</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between font-bold text-purple-900 border-t border-purple-200 pt-1 mt-1">
                          <span>Total</span>
                          <span className="text-base">{formatCurrency(multiRunTotal)}</span>
                        </div>
                      </div>

                      {/* Payment fields */}
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="block text-xs font-medium text-purple-800 mb-1">Payment Date *</label>
                          <input
                            type="date"
                            value={multiPayDate}
                            onChange={(e) => setMultiPayDate(e.target.value)}
                            className="w-full border border-purple-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 bg-white"
                            disabled={multiPosting}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-purple-800 mb-1">Payment Method *</label>
                          <select
                            value={multiPayMethod}
                            onChange={(e) => setMultiPayMethod(e.target.value)}
                            className="w-full border border-purple-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 bg-white"
                            disabled={multiPosting}
                          >
                            <option value="BANK_TRANSFER">Bank Transfer</option>
                            <option value="CASH">Cash</option>
                            <option value="CHECK">Check</option>
                            <option value="CARD">Card</option>
                            <option value="OTHER">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-purple-800 mb-1">Reference</label>
                          <input
                            type="text"
                            value={multiPayRef}
                            onChange={(e) => setMultiPayRef(e.target.value)}
                            placeholder="e.g., Cheque #, Transfer ref"
                            className="w-full border border-purple-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 bg-white"
                            disabled={multiPosting}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-purple-800 mb-1">Notes</label>
                          <input
                            type="text"
                            value={multiPayNotes}
                            onChange={(e) => setMultiPayNotes(e.target.value)}
                            placeholder="Optional notes"
                            className="w-full border border-purple-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 bg-white"
                            disabled={multiPosting}
                          />
                        </div>
                      </div>

                      {multiError && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-3">
                          ❌ {multiError}
                        </div>
                      )}
                      {multiSuccess && (
                        <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg text-sm mb-3">
                          {multiSuccess}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={handlePostMultiRun}
                        disabled={multiPosting || multiRunTotal <= 0 || !multiPayDate}
                        className="w-full py-2.5 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {multiPosting
                          ? <><span className="animate-spin">⏳</span> Posting…</>
                          : <>💰 Post Payment — {formatCurrency(multiRunTotal)}</>
                        }
                      </button>
                    </div>
                  )}

                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  No invoices from this supplier yet
                </div>
              )}
            </div>
          )}

          {/* ── Smart Supplier Statement Tab ── */}
          {activeTab === 'ledger' && (
            <div>
              {/* ── Date range + action bar ── */}
              <div className="space-y-2 mb-4">
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[130px]">
                    <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                    <input
                      type="date"
                      value={ledgerStartDate}
                      onChange={(e) => setLedgerStartDate(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1 min-w-[130px]">
                    <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                    <input
                      type="date"
                      value={ledgerEndDate}
                      onChange={(e) => setLedgerEndDate(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    onClick={() => loadSmartLedger(ledgerStartDate, ledgerEndDate)}
                    disabled={smartLoading}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                  >
                    {smartLoading ? '⏳ Loading…' : '🔍 Fetch'}
                  </button>
                  {smartLedger && (
                    <>
                      <button onClick={handleExportCSV} className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 whitespace-nowrap" title="Download CSV">
                        ⬇ CSV
                      </button>
                      <button onClick={handleExportPDF} className="px-3 py-1.5 bg-rose-600 text-white text-sm rounded-lg hover:bg-rose-700 whitespace-nowrap" title="Print / Save PDF">
                        🖨 PDF
                      </button>
                      <button
                        onClick={() => { setShowGlModal(true); if (!ledger) loadLedger(ledgerStartDate, ledgerEndDate); }}
                        className="px-3 py-1.5 bg-slate-500 text-white text-sm rounded-lg hover:bg-slate-600 whitespace-nowrap"
                        title="View raw GL journal entries (accountant view)"
                      >
                        📒 GL Journals
                      </button>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <select
                    value={smartFilter}
                    onChange={(e) => { setSmartFilter(e.target.value as typeof smartFilter); setSmartPage(1); }}
                    className="px-3 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="all">All Statuses</option>
                    <option value="Pending Bill">Pending Bill</option>
                    <option value="Unpaid">Unpaid</option>
                    <option value="Paid">Paid</option>
                    <option value="Applied">Applied</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Search doc no, type, description…"
                    value={smartSearch}
                    onChange={(e) => { setSmartSearch(e.target.value); setSmartPage(1); }}
                    className="flex-1 min-w-[180px] px-3 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {smartError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">{smartError}</div>
              )}

              {!smartLedger && !smartLoading && (
                <div className="text-center py-12 text-gray-400 text-sm">
                  Select a date range and click <strong>Fetch</strong> to load the supplier statement.
                </div>
              )}

              {smartLedger && (
                <>
                  {/* ── Summary strip ── */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                      <div className="text-xs text-gray-500 mb-1">Opening Balance</div>
                      <div className={`text-sm font-bold ${smartLedger.openingBalance > 0 ? 'text-red-700' : smartLedger.openingBalance < 0 ? 'text-green-700' : 'text-gray-700'}`}>
                        {formatCurrency(Math.abs(smartLedger.openingBalance))}
                        {smartLedger.openingBalance < 0 && <span className="text-xs font-normal ml-1">Cr</span>}
                      </div>
                    </div>
                    <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
                      <div className="text-xs text-red-500 mb-1">Total Debits</div>
                      <div className="text-sm font-bold text-red-800">
                        {formatCurrency(smartLedger.entries.reduce((s, e) => s + e.debit, 0))}
                      </div>
                    </div>
                    <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
                      <div className="text-xs text-green-600 mb-1">Total Credits</div>
                      <div className="text-sm font-bold text-green-800">
                        {formatCurrency(smartLedger.entries.reduce((s, e) => s + e.credit, 0))}
                      </div>
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                      <div className="text-xs text-blue-600 mb-1">Outstanding Amount</div>
                      <div className={`text-sm font-bold ${(smartLedger.openItemBalance ?? smartLedger.closingBalance) > 0 ? 'text-red-700' : (smartLedger.openItemBalance ?? smartLedger.closingBalance) < 0 ? 'text-green-700' : 'text-gray-700'}`}>
                        {formatCurrency(Math.abs(smartLedger.openItemBalance ?? smartLedger.closingBalance))}
                        {(smartLedger.openItemBalance ?? smartLedger.closingBalance) < 0 && <span className="text-xs font-normal ml-1">Cr</span>}
                      </div>
                    </div>
                  </div>

                  {/* ── Smart Statement Table ── */}
                  <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                    <table className="min-w-full divide-y divide-gray-100 text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="w-7 px-1"></th>
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Date</th>
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Particulars</th>
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell whitespace-nowrap">Vch Type</th>
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Vch No</th>
                          <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Debit</th>
                          <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Credit</th>
                          <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell whitespace-nowrap">Balance</th>
                          <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {/* Opening balance row */}
                        <tr className="bg-amber-50 border-b border-amber-100">
                          <td className="w-7 px-1"></td>
                          <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{smartLedger.periodStart}</td>
                          <td colSpan={5} className="px-3 py-2 text-xs text-gray-500 italic font-medium">Opening Balance</td>
                          <td className="px-3 py-2 text-right text-xs font-bold text-gray-800 hidden md:table-cell whitespace-nowrap">
                            {formatCurrency(smartLedger.openingBalance)}
                          </td>
                          <td></td>
                        </tr>

                        {paginatedSmartEntries.map((entry) => {
                          const isExpanded = expandedRows.has(entry.transactionId);
                          const voided = entry.isReversed;

                          // Vch Type badge color
                          const vchColor = entry.vchType === 'GRN' ? 'bg-blue-100 text-blue-700'
                            : entry.vchType === 'Bill' ? 'bg-orange-100 text-orange-700'
                              : entry.vchType === 'Payment' ? 'bg-green-100 text-green-700'
                                : entry.vchType === 'Return' ? 'bg-purple-100 text-purple-700'
                                  : entry.vchType === 'Credit Note' ? 'bg-teal-100 text-teal-700'
                                    : entry.vchType === 'Debit Note' ? 'bg-amber-100 text-amber-700'
                                      : 'bg-gray-100 text-gray-600';

                          // Status badge color
                          const statusColor = entry.itemStatus === 'Pending Bill' ? 'bg-yellow-100 text-yellow-700'
                            : entry.itemStatus === 'Unpaid' ? 'bg-red-100 text-red-700'
                              : entry.itemStatus === 'Paid' ? 'bg-green-100 text-green-700'
                                : entry.itemStatus === 'Applied' ? 'bg-indigo-100 text-indigo-700'
                                  : entry.itemStatus === 'Cancelled' ? 'bg-gray-100 text-gray-400'
                                    : 'bg-gray-100 text-gray-500';

                          return (
                            <Fragment key={entry.transactionId}>
                              <tr
                                onClick={() => setExpandedRows((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(entry.transactionId)) next.delete(entry.transactionId);
                                  else next.add(entry.transactionId);
                                  return next;
                                })}
                                className={`cursor-pointer select-none transition-colors ${voided ? 'opacity-50' : ''} ${isExpanded ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                              >
                                <td className="w-7 px-1 py-2.5 text-center text-gray-400 text-xs">
                                  {isExpanded ? '▾' : '▸'}
                                </td>
                                <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{entry.date}</td>
                                <td className="px-3 py-2.5 text-xs text-gray-800 max-w-[180px]">
                                  <span className={voided ? 'line-through text-gray-400' : ''}>{entry.particulars}</span>
                                </td>
                                <td className="px-3 py-2.5 hidden sm:table-cell">
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${vchColor}`}>
                                    {entry.vchType}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-xs font-mono text-blue-700 whitespace-nowrap">{entry.vchNo || '—'}</td>
                                <td className="px-3 py-2.5 text-right text-xs font-semibold text-red-700 whitespace-nowrap tabular-nums">
                                  {entry.debit > 0 ? formatCurrency(entry.debit) : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-3 py-2.5 text-right text-xs font-semibold text-green-700 whitespace-nowrap tabular-nums">
                                  {entry.credit > 0 ? formatCurrency(entry.credit) : <span className="text-gray-300">—</span>}
                                </td>
                                <td className="px-3 py-2.5 text-right text-xs font-bold text-gray-800 whitespace-nowrap tabular-nums hidden md:table-cell">
                                  {formatCurrency(entry.balanceAfter)}
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
                                    {entry.itemStatus}
                                  </span>
                                </td>
                              </tr>

                              {/* Expanded detail row */}
                              {isExpanded && (
                                <tr className="bg-blue-50 border-b border-blue-100">
                                  <td></td>
                                  <td colSpan={8} className="px-5 py-3">
                                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600">
                                      <span>
                                        <span className="font-medium text-gray-500">Document:</span>{' '}
                                        <span className="font-mono text-gray-700">{entry.vchNo || '—'}</span>
                                      </span>
                                      {entry.paymentMethod && (
                                        <span>
                                          <span className="font-medium text-gray-500">Payment via:</span>{' '}
                                          <span className="text-gray-700">{entry.paymentMethod.replace(/_/g, ' ')}</span>
                                        </span>
                                      )}
                                      <span className="md:hidden">
                                        <span className="font-medium text-gray-500">Balance after:</span>{' '}
                                        <span className="font-bold text-gray-800">{formatCurrency(entry.balanceAfter)}</span>
                                      </span>
                                      <span className="sm:hidden">
                                        <span className="font-medium text-gray-500">Type:</span>{' '}
                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${vchColor}`}>{entry.vchType}</span>
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}

                        {/* Closing balance row */}
                        {filteredSmartEntries.length > 0 && smartPage === smartTotalPages && (
                          <tr className="bg-gray-100 border-t border-gray-200">
                            <td className="w-7 px-1"></td>
                            <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">{smartLedger.periodEnd}</td>
                            <td colSpan={5} className="px-3 py-2.5 text-xs text-gray-600 italic font-medium">Outstanding Amount</td>
                            <td className="px-3 py-2.5 text-right text-xs font-bold text-gray-900 hidden md:table-cell whitespace-nowrap">
                              {formatCurrency(smartLedger.openItemBalance ?? smartLedger.closingBalance)}
                            </td>
                            <td></td>
                          </tr>
                        )}

                        {filteredSmartEntries.length === 0 && (
                          <tr>
                            <td colSpan={9} className="px-4 py-10 text-center text-gray-400 text-sm">
                              No entries match the selected filter.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* ── Pagination ── */}
                  {smartTotalPages > 1 && (
                    <div className="flex items-center justify-between pt-3 border-t border-gray-200 mt-2">
                      <span className="text-xs text-gray-500">
                        {Math.min((smartPage - 1) * SMART_PAGE_SIZE + 1, filteredSmartEntries.length)}–{Math.min(smartPage * SMART_PAGE_SIZE, filteredSmartEntries.length)} of {filteredSmartEntries.length}
                      </span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setSmartPage((p) => Math.max(1, p - 1))} disabled={smartPage === 1} className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">‹ Prev</button>
                        {Array.from({ length: smartTotalPages }, (_, i) => i + 1)
                          .filter((p) => p === 1 || p === smartTotalPages || Math.abs(p - smartPage) <= 1)
                          .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                            if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                            acc.push(p);
                            return acc;
                          }, [])
                          .map((p, i) =>
                            p === '...' ? (
                              <span key={`ell-${i}`} className="px-1 text-xs text-gray-400">…</span>
                            ) : (
                              <button key={p} onClick={() => setSmartPage(p as number)} className={`px-2 py-1 text-xs border rounded ${smartPage === p ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-100'}`}>{p}</button>
                            )
                          )}
                        <button onClick={() => setSmartPage((p) => Math.min(smartTotalPages, p + 1))} disabled={smartPage === smartTotalPages} className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">Next ›</button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── GL Journals Modal (accountant drilldown) ── */}
              {showGlModal && (
                <div
                  className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[70]"
                  onClick={() => setShowGlModal(false)}
                >
                  <div
                    className="bg-white rounded-xl shadow-2xl p-4 sm:p-6 max-w-5xl w-full mx-3 max-h-[85vh] flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-between items-center mb-3">
                      <div>
                        <h4 className="text-base font-bold text-gray-900">GL Journal Entries</h4>
                        <p className="text-xs text-gray-500 mt-0.5">Raw accounting view — accounts 2100 (AP) + 2150 (GR/IR Clearing)</p>
                      </div>
                      <button onClick={() => setShowGlModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-4">×</button>
                    </div>

                    {ledgerLoading && <div className="text-center py-8 text-gray-400 text-sm">Loading GL journals…</div>}
                    {ledgerError && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-3">{ledgerError}</div>}

                    {ledger && (
                      <div className="overflow-auto flex-1 rounded-lg border border-gray-200">
                        <table className="min-w-full divide-y divide-gray-200 text-xs">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">Txn #</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">Reference</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Description</th>
                              <th className="px-3 py-2 text-center font-semibold text-gray-500 uppercase tracking-wide">Acct</th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide">Debit</th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide">Credit</th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide">Balance</th>
                              <th className="px-3 py-2 text-center font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-100">
                            <tr className="bg-amber-50">
                              <td className="px-3 py-1.5 text-gray-500">{ledger.periodStart}</td>
                              <td colSpan={7} className="px-3 py-1.5 italic text-gray-500">Opening Balance</td>
                              <td className="px-3 py-1.5 text-right font-bold text-gray-800">{formatCurrency(ledger.openingBalance)}</td>
                              <td></td>
                            </tr>
                            {paginatedLedgerEntries.map((entry, idx) => (
                              <tr key={idx} className={`${entry.itemStatus === 'Voided' ? 'opacity-40 line-through' : 'hover:bg-gray-50'}`}>
                                <td className="px-3 py-1.5 whitespace-nowrap text-gray-600">{entry.date}</td>
                                <td className="px-3 py-1.5 font-mono text-blue-700 whitespace-nowrap">{entry.docNumber || '—'}</td>
                                <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{entry.type?.replace(/_/g, ' ')}</td>
                                <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{entry.reference || '—'}</td>
                                <td className="px-3 py-1.5 text-gray-500 max-w-[200px] truncate hidden lg:table-cell">{entry.description || '—'}</td>
                                <td className="px-3 py-1.5 text-center">
                                  <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-mono font-medium ${entry.accountCode === '2100' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                                    {entry.accountCode}
                                  </span>
                                </td>
                                <td className="px-3 py-1.5 text-right font-medium text-red-700 tabular-nums">
                                  {entry.debit > 0 ? formatCurrency(entry.debit) : '—'}
                                </td>
                                <td className="px-3 py-1.5 text-right font-medium text-green-700 tabular-nums">
                                  {entry.credit > 0 ? formatCurrency(entry.credit) : '—'}
                                </td>
                                <td className="px-3 py-1.5 text-right font-bold text-gray-800 tabular-nums">{formatCurrency(entry.balanceAfter)}</td>
                                <td className="px-3 py-1.5 text-center">
                                  <span className={`inline-flex px-1.5 py-0.5 rounded-full text-xs font-medium ${entry.itemStatus === 'Open' ? 'bg-red-100 text-red-700' : entry.itemStatus === 'Applied' ? 'bg-green-100 text-green-700' : entry.itemStatus === 'Voided' ? 'bg-gray-100 text-gray-400' : 'bg-amber-100 text-amber-700'}`}>
                                    {entry.itemStatus}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-200">
                      <span className="text-xs text-gray-400">{ledger ? `${ledger.entries.length} GL entries` : ''}</span>
                      {ledgerTotalPages > 1 && (
                        <span className="text-xs text-gray-400">Showing first {paginatedLedgerEntries.length} entries</span>
                      )}
                      <button onClick={() => setShowGlModal(false)} className="px-4 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200">Close</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Supplier Payment Modal */}
        {payingInvoice && (
          <div
            className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-[60]"
            onClick={() => !submittingPayment && setPayingInvoice(null)}
          >
            <div
              className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h4 className="text-lg font-bold text-gray-900">💰 Record Payment</h4>
                <button
                  onClick={() => !submittingPayment && setPayingInvoice(null)}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                  disabled={submittingPayment}
                >
                  ×
                </button>
              </div>

              {/* Invoice Info */}
              <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Invoice</span>
                  <span className="font-semibold text-gray-900">{payingInvoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-600">Total</span>
                  <span className="text-gray-900">
                    {formatCurrency(Number(payingInvoice.totalAmount || 0))}
                  </span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-600">Paid</span>
                  <span className="text-green-600">
                    {formatCurrency(Number(payingInvoice.amountPaid || 0))}
                  </span>
                </div>
                <div className="flex justify-between mt-1 pt-1 border-t border-gray-200">
                  <span className="font-semibold text-gray-700">Outstanding</span>
                  <span className="font-bold text-red-600">
                    {formatCurrency(Number(payingInvoice.outstandingBalance || 0))}
                  </span>
                </div>
              </div>

              {paymentSuccess && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg text-sm mb-4">
                  ✅ {paymentSuccess}
                </div>
              )}
              {paymentError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-4">
                  ❌ {paymentError}
                </div>
              )}

              {/* Payment Form */}
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="0"
                    min="0"
                    max={Number(payingInvoice.outstandingBalance || 0)}
                    disabled={submittingPayment || !!paymentSuccess}
                  />
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() =>
                        setPaymentAmount(Number(payingInvoice.outstandingBalance || 0).toString())
                      }
                      className="text-xs text-purple-600 hover:text-purple-800 underline"
                      disabled={submittingPayment || !!paymentSuccess}
                    >
                      Pay Full Balance
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Method *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    disabled={submittingPayment || !!paymentSuccess}
                  >
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CHECK">Check</option>
                    <option value="CARD">Card</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                  <input
                    type="text"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder="e.g., Cheque #, Transfer ref"
                    disabled={submittingPayment || !!paymentSuccess}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    rows={2}
                    placeholder="Optional notes"
                    disabled={submittingPayment || !!paymentSuccess}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-gray-200">
                <button
                  onClick={() => setPayingInvoice(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                  disabled={submittingPayment}
                >
                  {paymentSuccess ? 'Close' : 'Cancel'}
                </button>
                {!paymentSuccess && (
                  <button
                    onClick={handleSubmitPayment}
                    disabled={submittingPayment || !paymentAmount || Number(paymentAmount) <= 0}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {submittingPayment ? (
                      <>
                        <span className="animate-spin">⏳</span> Processing...
                      </>
                    ) : (
                      <>💰 Record Payment</>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-4 sm:mt-6">
          <button
            onClick={onClose}
            className="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
          >
            Close
          </button>
          {onEdit && (
            <button
              onClick={onEdit}
              className="flex-1 sm:flex-none px-4 py-2.5 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 text-sm"
            >
              ✏️ Edit Supplier
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Supplier Form Modal Component
interface SupplierFormModalProps {
  supplier: Supplier | null;
  onClose: () => void;
  onSubmit: (data: SupplierFormData) => void;
}

function SupplierFormModal({ supplier, onClose, onSubmit }: SupplierFormModalProps) {
  const [formData, setFormData] = useState<SupplierFormData>({
    name: supplier?.name || '',
    contactPerson: supplier?.contactPerson || '',
    email: supplier?.email || '',
    phone: supplier?.phone || '',
    address: supplier?.address || '',
    paymentTerms: supplier?.paymentTerms || 'NET30',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!formData.name.trim()) {
      alert('Supplier name is required');
      return;
    }

    if (formData.email && !formData.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      alert('Invalid email format');
      return;
    }

    onSubmit(formData);
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-4 sm:p-6 max-w-[95vw] sm:max-w-2xl w-full mx-2 sm:mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">
            {supplier ? 'Edit Supplier' : 'Add New Supplier'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Supplier Name */}
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Supplier Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              maxLength={255}
            />
          </div>

          {/* Contact Person */}
          <div className="mb-4">
            <label htmlFor="contactPerson" className="block text-sm font-medium text-gray-700 mb-2">
              Contact Person
            </label>
            <input
              type="text"
              id="contactPerson"
              value={formData.contactPerson}
              onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={255}
            />
          </div>

          {/* Email */}
          <div className="mb-4">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Phone */}
          <div className="mb-4">
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
              Phone
            </label>
            <input
              type="tel"
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={50}
            />
          </div>

          {/* Address */}
          <div className="mb-4">
            <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-2">
              Address
            </label>
            <textarea
              id="address"
              value={formData.address ?? ''}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Payment Terms */}
          <div className="mb-6">
            <label htmlFor="paymentTerms" className="block text-sm font-medium text-gray-700 mb-2">
              Payment Terms
            </label>
            <select
              id="paymentTerms"
              value={formData.paymentTerms}
              onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {PAYMENT_TERMS.map((term) => (
                <option key={term.value} value={term.value}>
                  {term.label}
                </option>
              ))}
            </select>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {supplier ? 'Update Supplier' : 'Create Supplier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
