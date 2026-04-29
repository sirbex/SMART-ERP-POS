import { useState, useMemo, useEffect } from 'react';
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
type SortField = 'name' | 'createdAt' | 'paymentTerms';
type SortOrder = 'asc' | 'desc';

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

export default function SuppliersPage() {
  // State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [filterPaymentTerms, setFilterPaymentTerms] = useState<string>('');
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 20;

  // Permission gating
  const canCreateSupplier = useCanAccess([], ['suppliers.create']);
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

  // Filter and sort suppliers
  const suppliers = useMemo(() => {
    let filtered = [...allSuppliers];

    // Payment terms filter (client-side: lightweight, no DB round-trip per change)
    if (filterPaymentTerms) {
      filtered = filtered.filter(
        (supplier: Supplier) => supplier.paymentTerms === filterPaymentTerms
      );
    }

    // Sorting
    filtered.sort((a: Supplier, b: Supplier) => {
      let aVal, bVal;

      switch (sortField) {
        case 'name':
          aVal = a.name?.toLowerCase() || '';
          bVal = b.name?.toLowerCase() || '';
          break;
        case 'createdAt':
          aVal = new Date(a.createdAt || 0).getTime();
          bVal = new Date(b.createdAt || 0).getTime();
          break;
        case 'paymentTerms':
          aVal = a.paymentTerms || '';
          bVal = b.paymentTerms || '';
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [allSuppliers, filterPaymentTerms, sortField, sortOrder]);

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
    // Total outstanding: server-computed SUM across ALL active suppliers (not just current page)
    const totalOutstanding = (suppliersData as (typeof suppliersData) & { stats?: { totalOutstanding?: number } })?.stats?.totalOutstanding
      ?? allSuppliers.reduce((sum: number, s: Supplier) => sum + Number(s.outstandingBalance || 0), 0);

    return { total, active, totalOutstanding };
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Total Suppliers</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</div>
            <div className="text-xs text-gray-500 mt-1">All registered vendors</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Active Suppliers</div>
            <div className="text-2xl font-bold text-green-600 mt-1">{stats.active}</div>
            <div className="text-xs text-gray-500 mt-1">Available for POs</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Total Invoices</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">
              {invoiceSummary.totalInvoices}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {invoiceSummary.unpaidInvoices > 0
                ? `${invoiceSummary.unpaidInvoices} unpaid`
                : 'All paid'}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600">Total Outstanding</div>
            <div className="text-2xl font-bold text-red-600 mt-1">
              {formatCurrencyTop(stats.totalOutstanding)}
            </div>
            <div className="text-xs text-gray-500 mt-1">Across all suppliers</div>
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
                onChange={(e) => setSortField(e.target.value as SortField)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="name">Sort by Name</option>
                <option value="createdAt">Sort by Date</option>
                <option value="paymentTerms">Sort by Terms</option>
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
                  setSortField('name');
                  setSortOrder('asc');
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
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Supplier Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact Person
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payment Terms
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Outstanding Balance
                    </th>
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
          <div className="mt-6 flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Page {page} • Showing {suppliers.length} suppliers
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ← Previous
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={suppliers.length < limit}
                className="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
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
}

function SupplierDetailModal({ supplier, onClose, onEdit }: SupplierDetailModalProps) {
  const [activeTab, setActiveTab] = useState<
    'info' | 'performance' | 'orders' | 'products' | 'invoices'
  >('info');
  const [performance, setPerformance] = useState<SupplierPerformance | null>(null);
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [invoices, setInvoices] = useState<SupplierInvoiceSummary[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const [invoiceDetails, setInvoiceDetails] = useState<InvoiceDetails | null>(null);
  const [loadingInvoiceDetails, setLoadingInvoiceDetails] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null);
  const [loadingTab, setLoadingTab] = useState<string | null>(null);

  // Payment modal state
  const [payingInvoice, setPayingInvoice] = useState<SupplierInvoiceSummary | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);

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
    setLoadingInvoiceDetails(true);
    try {
      const { data } = await api.get(`/supplier-payments/invoices/${invoiceId}/details`);
      if (data.success) {
        setInvoiceDetails(data.data);
        setSelectedInvoice(invoiceId);
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

  // Load data when tab changes
  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    if (tab === 'performance') loadPerformance();
    if (tab === 'orders') loadOrders();
    if (tab === 'products') loadProducts();
    if (tab === 'invoices') loadInvoices();
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
        className="bg-white rounded-lg p-4 sm:p-6 max-w-[95vw] sm:max-w-5xl w-full mx-2 sm:mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-gray-900">{supplier.name}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 sm:gap-2 mb-6 border-b border-gray-200 overflow-x-auto">
          <button
            onClick={() => handleTabChange('info')}
            className={`px-3 sm:px-4 py-2 font-medium text-sm whitespace-nowrap ${activeTab === 'info'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            📋 Info
          </button>
          <button
            onClick={() => handleTabChange('performance')}
            className={`px-3 sm:px-4 py-2 font-medium text-sm whitespace-nowrap ${activeTab === 'performance'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            📊 Performance
          </button>
          <button
            onClick={() => handleTabChange('orders')}
            className={`px-3 sm:px-4 py-2 font-medium text-sm whitespace-nowrap ${activeTab === 'orders'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            📦 Orders
          </button>
          <button
            onClick={() => handleTabChange('products')}
            className={`px-3 sm:px-4 py-2 font-medium text-sm whitespace-nowrap ${activeTab === 'products'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            🏷️ Items
          </button>
          <button
            onClick={() => handleTabChange('invoices')}
            className={`px-3 sm:px-4 py-2 font-medium text-sm whitespace-nowrap ${activeTab === 'invoices'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            📄 Invoices
          </button>
        </div>

        {/* Tab Content */}
        <div className="min-h-[400px]">
          {activeTab === 'info' && (
            <div>
              {/* Supplier Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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

              {/* Quick Stats */}
              <div className="mb-6 grid grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-blue-600 mb-1">Supplier ID</div>
                  <div className="text-sm font-mono text-blue-900">
                    {supplier.id.slice(0, 8)}...
                  </div>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-purple-600 mb-1">Payment Days</div>
                  <div className="text-lg font-bold text-purple-900">
                    {paymentTermInfo?.days !== undefined
                      ? paymentTermInfo.days >= 0
                        ? `${paymentTermInfo.days} days`
                        : 'Prepaid'
                      : 'N/A'}
                  </div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-xs text-green-600 mb-1">Status</div>
                  <div className="text-sm font-bold text-green-900">
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
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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
                      <div className="text-xs text-gray-500 mt-2">Money demanded by supplier</div>
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
                <div className="space-y-3">
                  {orders.map((order: SupplierOrder) => (
                    <div
                      key={order.id}
                      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-semibold text-blue-600">{order.poNumber}</div>
                          <div className="text-sm text-gray-600">
                            {formatDisplayDate(order.orderDate)}
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
                      <div className="flex justify-between items-center">
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
                        <div className="mt-2 text-xs text-gray-500">{order.notes}</div>
                      )}
                    </div>
                  ))}
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
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Product
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Orders
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Total Qty
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Avg Cost
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Price Range
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Last Order
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {products.map((product: SupplierProduct, idx: number) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {product.productName}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-600">
                            {product.orderCount}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                            {product.totalQuantity}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">
                            {formatCurrency(product.avgUnitCost)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-600">
                            {formatCurrency(product.minUnitCost)} -{' '}
                            {formatCurrency(product.maxUnitCost)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {formatDisplayDate(product.lastOrderDate)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
                  {/* Invoice Summary Cards */}
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="bg-blue-50 rounded-lg p-3 text-center">
                      <div className="text-xs text-blue-600 mb-1">Total Invoices</div>
                      <div className="text-xl font-bold text-blue-900">{invoices.length}</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3 text-center">
                      <div className="text-xs text-green-600 mb-1">Total Amount</div>
                      <div className="text-lg font-bold text-green-900">
                        {formatCurrency(
                          invoices.reduce(
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
                            invoices.reduce(
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

                  {/* Invoice List */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Invoice #
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Ref
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Date
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Due Date
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Status
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                            Total
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                            Paid
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                            Balance
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {invoices.map((inv: SupplierInvoiceSummary) => {
                          const total = Number(inv.totalAmount || 0);
                          const paid = Number(inv.amountPaid || 0);
                          const balance = Number(inv.outstandingBalance || 0);
                          const statusColor =
                            inv.status === 'Paid'
                              ? 'bg-green-100 text-green-800'
                              : inv.status === 'PartiallyPaid'
                                ? 'bg-yellow-100 text-yellow-800'
                                : inv.status === 'Pending'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-100 text-gray-800';
                          return (
                            <tr key={inv.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-blue-600">
                                {inv.invoiceNumber}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {inv.supplierInvoiceNumber || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900">
                                {formatDisplayDate(inv.invoiceDate)}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                {inv.dueDate ? formatDisplayDate(inv.dueDate) : '-'}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusColor}`}
                                >
                                  {inv.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                                {formatCurrency(total)}
                              </td>
                              <td className="px-4 py-3 text-sm text-right text-green-600">
                                {formatCurrency(paid)}
                              </td>
                              <td className="px-4 py-3 text-sm text-right font-semibold text-red-600">
                                {balance > 0 ? (
                                  formatCurrency(balance)
                                ) : balance < 0 ? (
                                  <span className="text-green-600">
                                    Overpaid {formatCurrency(Math.abs(balance))}
                                  </span>
                                ) : (
                                  <span className="text-green-600">Paid</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => loadInvoiceDetails(inv.id)}
                                    className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors"
                                    title="View Details"
                                  >
                                    👁️ View
                                  </button>
                                  <button
                                    onClick={() => handleDownloadPdf(inv.id, inv.invoiceNumber)}
                                    disabled={downloadingPdf === inv.id}
                                    className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 transition-colors disabled:opacity-50"
                                    title="Download PDF"
                                  >
                                    {downloadingPdf === inv.id ? '⏳' : '📄'} PDF
                                  </button>
                                  {balance > 0 && (
                                    <button
                                      onClick={() => openPayModal(inv)}
                                      className="px-2 py-1 text-xs bg-purple-50 text-purple-700 rounded hover:bg-purple-100 transition-colors font-semibold"
                                      title="Record Payment"
                                    >
                                      💰 Pay
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Invoice Detail Panel */}
                  {selectedInvoice && invoiceDetails && (
                    <div className="mt-4 border-2 border-blue-200 rounded-lg overflow-hidden">
                      <div className="bg-blue-50 px-6 py-4 flex justify-between items-center">
                        <div>
                          <h4 className="text-lg font-semibold text-gray-900">
                            {invoiceDetails.invoice.invoiceNumber}
                            {invoiceDetails.invoice.supplierInvoiceNumber && (
                              <span className="ml-2 text-sm font-normal text-gray-500">
                                (Ref: {invoiceDetails.invoice.supplierInvoiceNumber})
                              </span>
                            )}
                          </h4>
                          <p className="text-sm text-gray-600">
                            {formatDisplayDate(invoiceDetails.invoice.invoiceDate)}
                            {invoiceDetails.invoice.dueDate &&
                              ` | Due: ${formatDisplayDate(invoiceDetails.invoice.dueDate)}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() =>
                              handleDownloadPdf(
                                selectedInvoice,
                                invoiceDetails.invoice.invoiceNumber
                              )
                            }
                            disabled={downloadingPdf === selectedInvoice}
                            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                          >
                            {downloadingPdf === selectedInvoice
                              ? '⏳ Generating...'
                              : '📄 Download PDF'}
                          </button>
                          <button
                            onClick={() => {
                              setSelectedInvoice(null);
                              setInvoiceDetails(null);
                            }}
                            className="text-gray-400 hover:text-gray-600 text-xl"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {loadingInvoiceDetails ? (
                        <div className="p-6 text-center text-gray-600">Loading details...</div>
                      ) : (
                        <div className="p-6 space-y-6">
                          {/* Line Items */}
                          {invoiceDetails.lineItems && invoiceDetails.lineItems.length > 0 ? (
                            <div>
                              <h5 className="text-sm font-semibold text-gray-700 mb-3">
                                Line Items
                              </h5>
                              <table className="min-w-full divide-y divide-gray-200 text-sm">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                      #
                                    </th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                      Product/Service
                                    </th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                      Description
                                    </th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                                      Qty
                                    </th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                                      Unit Cost
                                    </th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                                      Total
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {invoiceDetails.lineItems.map(
                                    (item: InvoiceLineItem, idx: number) => (
                                      <tr key={item.id || idx} className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-gray-500">
                                          {item.lineNumber || idx + 1}
                                        </td>
                                        <td className="px-3 py-2 font-medium text-gray-900">
                                          {item.productName}
                                        </td>
                                        <td className="px-3 py-2 text-gray-600">
                                          {item.description || '-'}
                                        </td>
                                        <td className="px-3 py-2 text-right text-gray-900">
                                          {item.quantity} {item.unitOfMeasure || ''}
                                        </td>
                                        <td className="px-3 py-2 text-right text-gray-900">
                                          {formatCurrency(item.unitCost)}
                                        </td>
                                        <td className="px-3 py-2 text-right font-semibold text-gray-900">
                                          {formatCurrency(item.lineTotal)}
                                        </td>
                                      </tr>
                                    )
                                  )}
                                </tbody>
                                <tfoot className="bg-gray-50">
                                  <tr>
                                    <td
                                      colSpan={5}
                                      className="px-3 py-2 text-right font-semibold text-gray-700"
                                    >
                                      Subtotal:
                                    </td>
                                    <td className="px-3 py-2 text-right font-bold text-gray-900">
                                      {formatCurrency(
                                        Number(
                                          invoiceDetails.invoice.subtotal ||
                                          invoiceDetails.invoice.totalAmount ||
                                          0
                                        )
                                      )}
                                    </td>
                                  </tr>
                                  {Number(invoiceDetails.invoice.taxAmount || 0) > 0 && (
                                    <tr>
                                      <td
                                        colSpan={5}
                                        className="px-3 py-2 text-right font-semibold text-gray-700"
                                      >
                                        Tax:
                                      </td>
                                      <td className="px-3 py-2 text-right font-bold text-gray-900">
                                        {formatCurrency(Number(invoiceDetails.invoice.taxAmount))}
                                      </td>
                                    </tr>
                                  )}
                                  <tr className="border-t-2 border-gray-300">
                                    <td
                                      colSpan={5}
                                      className="px-3 py-2 text-right font-bold text-gray-900"
                                    >
                                      Total:
                                    </td>
                                    <td className="px-3 py-2 text-right font-bold text-blue-600 text-lg">
                                      {formatCurrency(
                                        Number(invoiceDetails.invoice.totalAmount || 0)
                                      )}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          ) : (
                            <div className="text-sm text-gray-500 italic">
                              No line items recorded for this invoice.
                            </div>
                          )}

                          {/* Payments */}
                          {invoiceDetails.allocations && invoiceDetails.allocations.length > 0 && (
                            <div>
                              <h5 className="text-sm font-semibold text-gray-700 mb-3">
                                Payment History
                              </h5>
                              <div className="space-y-2">
                                {invoiceDetails.allocations.map((alloc: InvoiceAllocation) => (
                                  <div
                                    key={alloc.id}
                                    className="flex justify-between items-center bg-green-50 rounded-lg px-4 py-3"
                                  >
                                    <div>
                                      <span className="font-medium text-gray-900">
                                        {alloc.paymentNumber}
                                      </span>
                                      <span className="ml-2 text-sm text-gray-500">
                                        {formatDisplayDate(alloc.allocationDate)}
                                      </span>
                                      <span className="ml-2 text-xs bg-white px-2 py-0.5 rounded text-gray-600">
                                        {alloc.paymentMethod}
                                      </span>
                                    </div>
                                    <span className="font-bold text-green-700">
                                      {formatCurrency(alloc.amountAllocated)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <div className="mt-3 flex justify-between items-center pt-3 border-t border-gray-200">
                                <span className="font-semibold text-gray-700">Total Paid:</span>
                                <span className="font-bold text-green-600 text-lg">
                                  {formatCurrency(Number(invoiceDetails.invoice.amountPaid || 0))}
                                </span>
                              </div>
                              {Number(invoiceDetails.invoice.outstandingBalance || 0) > 0 && (
                                <div className="flex justify-between items-center mt-1">
                                  <span className="font-semibold text-gray-700">Balance Due:</span>
                                  <span className="font-bold text-red-600 text-lg">
                                    {formatCurrency(
                                      Number(invoiceDetails.invoice.outstandingBalance)
                                    )}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Notes */}
                          {invoiceDetails.invoice.notes && (
                            <div>
                              <h5 className="text-sm font-semibold text-gray-700 mb-1">Notes</h5>
                              <p className="text-sm text-gray-600">
                                {invoiceDetails.invoice.notes}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
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
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Close
          </button>
          {onEdit && (
            <button
              onClick={onEdit}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
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
