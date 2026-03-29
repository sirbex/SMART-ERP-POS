import { useState } from 'react';
import Decimal from 'decimal.js';
import Layout from '../components/Layout';
import IdDisplay from '../components/IdDisplay';
import { useCustomers, useCustomerStatement } from '../hooks/useApi';
import { formatCurrency } from '../utils/currency';
import { downloadFile } from '../utils/download';
import { DatePicker } from '../components/ui/date-picker';
import type { Customer } from '@shared/zod/customer';
import QuickAddCustomerModal from '../components/customers/QuickAddCustomerModal';
import CustomerDetailModal from '../components/customers/CustomerDetailModal';
import { useModalAccessibility } from '../hooks/useFocusTrap';

interface StatementResponse {
  openingBalance: number | string;
  closingBalance: number | string;
  periodStart?: string;
  periodEnd?: string;
  entries?: StatementEntry[];
  deposits?: {
    summary?: {
      totalDeposited: number;
      totalUsed: number;
      availableBalance: number;
    };
    entries?: DepositEntry[];
  };
  page?: number;
  totalPages?: number;
}

interface StatementEntry {
  date: string;
  type: string;
  reference?: string;
  description?: string;
  debit?: number | string;
  credit?: number | string;
  balance?: number | string;
  balanceAfter?: number | string;
}

interface DepositEntry {
  date: string;
  type: string;
  amount: number | string;
  reference?: string;
  description?: string;
  notes?: string;
  runningBalance?: number | string;
}

type TabType = 'overview' | 'list' | 'groups';
type CustomerModalTab = 'overview' | 'invoices' | 'transactions' | 'deposits' | 'edit';

export default function CustomersPage() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  // Customer detail modal state
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [detailModalTab, setDetailModalTab] = useState<CustomerModalTab>('overview');

  // Statement modal state
  const [statementOpen, setStatementOpen] = useState(false);
  const [statementCustomerId] = useState<string | null>(null);
  const [stmtStart, setStmtStart] = useState<string>('');
  const [stmtEnd, setStmtEnd] = useState<string>('');
  const [stmtPage, setStmtPage] = useState<number>(1);
  const stmtLimit = 100;
  const statementRef = useModalAccessibility(statementOpen, () => setStatementOpen(false));

  const { data: statement } = useCustomerStatement(statementCustomerId || '', {
    start: stmtStart ? new Date(stmtStart).toISOString() : undefined,
    end: stmtEnd ? new Date(stmtEnd).toISOString() : undefined,
    page: stmtPage,
    limit: stmtLimit,
  });

  // downloadFile imported from shared utils/download — no duplicate needed

  const { data: customersResponse, isLoading, error } = useCustomers(page, 50);
  const customers = (customersResponse?.data || []) as Customer[];
  const pagination = customersResponse?.pagination;

  // Helper to safely coerce numeric-like values (pg numeric may arrive as string)
  const toNumber = (v: unknown): number => {
    if (typeof v === 'number') return v;
    const parsed = parseFloat(String(v ?? '0'));
    return isNaN(parsed) ? 0 : parsed;
  };

  // Filter customers by search term
  const filteredCustomers = customers.filter((customer: Customer) => {
    const term = searchTerm.toLowerCase();
    return (
      String(customer.name ?? '').toLowerCase().includes(term) ||
      (customer.email && String(customer.email).toLowerCase().includes(term)) ||
      (customer.phone && String(customer.phone).includes(term))
    );
  });

  // Calculate summary statistics
  const totalCustomers = pagination?.total || 0;
  const activeCustomers = customers.filter((c: Customer) => c.isActive).length;
  const totalBalance = customers.reduce((sum: number, c: Customer) => new Decimal(sum).plus(toNumber(c.balance)).toNumber(), 0);
  const customersWithDebt = customers.filter((c: Customer) => toNumber(c.balance) > 0).length; // Balance > 0 = customer owes money

  return (
    <Layout>
      <div className="p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Customer Center</h1>
            <p className="text-sm sm:text-base text-gray-600 mt-1">Manage customers, track balances, and view accounting</p>
          </div>
          <button
            onClick={() => setShowQuickAdd(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 whitespace-nowrap self-start sm:self-auto"
          >
            + New Customer
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6 overflow-x-auto">
          <nav className="-mb-px flex space-x-4 sm:space-x-8 min-w-max">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'overview'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('list')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'list'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              All Customers ({totalCustomers})
            </button>
            <button
              onClick={() => setActiveTab('groups')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'groups'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              Customer Groups
            </button>
          </nav>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Customers</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{totalCustomers}</p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-2xl">👥</span>
                  </div>
                </div>
                <p className="text-xs text-green-600 mt-3">↑ {activeCustomers} active</p>
              </div>

              <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total AR Balance</p>
                    <p className={`text-3xl font-bold mt-2 ${totalBalance > 0 ? 'text-red-600' : totalBalance < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                      {formatCurrency(Math.abs(totalBalance))}
                      {totalBalance < 0 && <span className="text-sm ml-1">(CR)</span>}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-2xl">💰</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-3">Total receivables</p>
              </div>

              <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Customers with Debt</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{customersWithDebt}</p>
                  </div>
                  <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                    <span className="text-2xl">⚠️</span>
                  </div>
                </div>
                <p className="text-xs text-yellow-600 mt-3">Require attention</p>
              </div>

              <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Recent Activity</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">-</p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                    <span className="text-2xl">📊</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-3">Last 7 days</p>
              </div>
            </div>

            {/* Recent Customers */}
            <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Customers</h2>
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">Loading...</div>
              ) : filteredCustomers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No customers yet</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          ID
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Customer
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Contact
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Balance
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Deposits
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Credit Limit
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredCustomers.slice(0, 10).map((customer: Customer) => (
                        <tr
                          key={customer.id}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() => { setSelectedCustomerId(customer.id); setDetailModalTab('overview'); setDetailModalOpen(true); }}
                        >
                          <td className="px-4 py-3">
                            <IdDisplay id={customer.customerNumber || customer.id} prefix="CUST" />
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{customer.name}</div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            <div>{customer.email || '-'}</div>
                            <div className="text-xs text-gray-500">{customer.phone || '-'}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`font-medium ${toNumber(customer.balance) > 0 ? 'text-red-600' : toNumber(customer.balance) < 0 ? 'text-green-600' : 'text-gray-600'
                                }`}
                            >
                              {formatCurrency(Math.abs(toNumber(customer.balance)))}
                              {toNumber(customer.balance) < 0 && <span className="text-xs ml-1">(CR)</span>}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-medium ${toNumber(customer.depositBalance) > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                              {formatCurrency(toNumber(customer.depositBalance))}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {formatCurrency(customer.creditLimit)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${customer.isActive
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                                }`}
                            >
                              {customer.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* List Tab */}
        {activeTab === 'list' && (
          <div>
            {/* Search and Filters */}
            <div className="bg-white rounded-lg shadow border border-gray-200 p-4 mb-6">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                <div className="flex-1">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by name, email, or phone..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button className="flex-1 sm:flex-none px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-blue-500">
                    🔍 Filter
                  </button>
                  <button className="flex-1 sm:flex-none px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-blue-500">
                    📊 Export
                  </button>
                </div>
              </div>
            </div>

            {/* Customer List */}
            <div className="bg-white rounded-lg shadow border border-gray-200">
              {isLoading ? (
                <div className="text-center py-12 text-gray-500">Loading customers...</div>
              ) : error ? (
                <div className="text-center py-12 text-red-600">Error loading customers</div>
              ) : filteredCustomers.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500 mb-4">No customers found</p>
                  <button
                    onClick={() => setShowQuickAdd(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    + Add Your First Customer
                  </button>
                </div>
              ) : (
                <>
                  {/* Mobile Card View */}
                  <div className="block sm:hidden space-y-3 p-3">
                    {filteredCustomers.map((customer: Customer) => (
                      <div key={customer.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                              <span className="text-blue-600 font-semibold text-sm">{customer.name.charAt(0).toUpperCase()}</span>
                            </div>
                            <div>
                              <div className="font-medium text-gray-900">{customer.name}</div>
                              <div className="text-xs text-gray-500">{customer.phone || customer.email || 'No contact'}</div>
                            </div>
                          </div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${customer.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                            {customer.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center mb-3">
                          <div>
                            <div className="text-xs text-gray-500">Balance</div>
                            <div className={`text-sm font-semibold ${toNumber(customer.balance) > 0 ? 'text-red-600' : toNumber(customer.balance) < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                              {formatCurrency(Math.abs(toNumber(customer.balance)))}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">Deposits</div>
                            <div className={`text-sm font-semibold ${toNumber(customer.depositBalance) > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                              {formatCurrency(toNumber(customer.depositBalance))}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">Limit</div>
                            <div className="text-sm text-gray-600">{formatCurrency(customer.creditLimit)}</div>
                          </div>
                        </div>
                        <div className="flex gap-2 border-t border-gray-100 pt-2">
                          <button className="flex-1 text-xs text-blue-600 hover:text-blue-900 font-medium py-1" onClick={() => { setSelectedCustomerId(customer.id); setDetailModalTab('overview'); setDetailModalOpen(true); }}>View</button>
                          <button className="flex-1 text-xs text-gray-600 hover:text-gray-900 font-medium py-1" onClick={() => { setSelectedCustomerId(customer.id); setDetailModalTab('edit'); setDetailModalOpen(true); }}>Edit</button>
                          <button className="flex-1 text-xs text-gray-600 hover:text-gray-900 font-medium py-1" onClick={() => { setSelectedCustomerId(customer.id); setDetailModalTab('transactions'); setDetailModalOpen(true); }}>Statement</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Customer
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Contact Info
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Balance
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Deposits
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Credit Limit
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredCustomers.map((customer: Customer) => (
                          <tr key={customer.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                                  <span className="text-blue-600 font-semibold text-sm">
                                    {customer.name.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                                <div className="ml-4">
                                  <div className="font-medium text-gray-900">{customer.name}</div>
                                  <div className="text-xs text-gray-500">
                                    ID: {customer.id.slice(0, 8)}...
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm text-gray-900">{customer.email || '-'}</div>
                              <div className="text-xs text-gray-500">{customer.phone || '-'}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div
                                className={`font-semibold ${toNumber(customer.balance) > 0
                                  ? 'text-red-600'
                                  : toNumber(customer.balance) < 0
                                    ? 'text-green-600'
                                    : 'text-gray-600'
                                  }`}
                              >
                                {formatCurrency(Math.abs(toNumber(customer.balance)))}
                                {toNumber(customer.balance) < 0 && <span className="text-xs ml-1">(CR)</span>}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`font-semibold ${toNumber(customer.depositBalance) > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                                {formatCurrency(toNumber(customer.depositBalance))}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {formatCurrency(customer.creditLimit)}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${customer.isActive
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-800'
                                  }`}
                              >
                                {customer.isActive ? '✓ Active' : '✗ Inactive'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right text-sm font-medium">
                              <button className="text-blue-600 hover:text-blue-900 mr-3" onClick={() => { setSelectedCustomerId(customer.id); setDetailModalTab('overview'); setDetailModalOpen(true); }}>View</button>
                              <button className="text-gray-600 hover:text-gray-900 mr-3" onClick={() => { setSelectedCustomerId(customer.id); setDetailModalTab('edit'); setDetailModalOpen(true); }}>Edit</button>
                              <button className="text-gray-600 hover:text-gray-900" onClick={() => { setSelectedCustomerId(customer.id); setDetailModalTab('transactions'); setDetailModalOpen(true); }}>Statement</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {pagination && pagination.totalPages > 1 && (
                    <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-700">
                          Showing <span className="font-medium">{(page - 1) * 50 + 1}</span> to{' '}
                          <span className="font-medium">
                            {Math.min(page * 50, pagination.total)}
                          </span>{' '}
                          of <span className="font-medium">{pagination.total}</span> customers
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setPage(Math.max(1, page - 1))}
                            disabled={page === 1}
                            className="px-3 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Previous
                          </button>
                          <button
                            onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                            disabled={page === pagination.totalPages}
                            className="px-3 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Groups Tab */}
        {activeTab === 'groups' && (
          <div className="bg-white rounded-lg shadow border border-gray-200 p-8">
            <div className="text-center text-gray-500">
              <p className="text-lg font-medium mb-2">Customer Groups</p>
              <p className="text-sm">Coming soon - Manage customer pricing tiers and groups</p>
            </div>
          </div>
        )}
      </div>

      {/* Quick Add Customer Modal */}
      <QuickAddCustomerModal
        isOpen={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        onSuccess={(customer) => {
          // Optional: Show success notification
          console.log('Customer created:', customer);
        }}
      />

      {/* Customer Statement Modal */}
      {statementOpen && statementCustomerId && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="absolute inset-0 bg-black/40" onClick={() => setStatementOpen(false)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div ref={statementRef} role="dialog" aria-modal="true" aria-label="Customer Statement" className="relative bg-white w-full max-w-[95vw] sm:max-w-6xl rounded-lg shadow-xl border border-gray-200 p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Customer Statement</h3>
                <button onClick={() => setStatementOpen(false)} className="p-2 rounded hover:bg-gray-100" aria-label="Close">✕</button>
              </div>

              {statement ? (
                <>
                  <div className="flex flex-wrap items-end gap-3 mb-3" aria-label="Statement Filters">
                    <div>
                      <label className="block text-xs text-gray-600" htmlFor="modalStmtStart">Start</label>
                      <DatePicker
                        value={stmtStart}
                        onChange={(date) => { setStmtStart(date); setStmtPage(1); }}
                        placeholder="Start date"
                        maxDate={stmtEnd ? new Date(stmtEnd) : undefined}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600" htmlFor="modalStmtEnd">End</label>
                      <DatePicker
                        value={stmtEnd}
                        onChange={(date) => { setStmtEnd(date); setStmtPage(1); }}
                        placeholder="End date"
                        minDate={stmtStart ? new Date(stmtStart) : undefined}
                      />
                    </div>
                    <button className="px-3 py-2 border border-gray-300 rounded bg-white hover:bg-gray-50" onClick={() => { setStmtStart(''); setStmtEnd(''); setStmtPage(1); }} aria-label="Reset Statement Filters">Reset</button>
                    <div className="flex gap-2 ml-auto">
                      <button
                        onClick={() => {
                          const params = [
                            stmtStart ? `start=${new Date(stmtStart).toISOString()}` : '',
                            stmtEnd ? `end=${new Date(stmtEnd).toISOString()}` : ''
                          ].filter(Boolean).join('&');
                          const url = `/customers/${statementCustomerId}/statement/export.csv${params ? '?' + params : ''}`;
                          downloadFile(url, `statement-${statementCustomerId}-${new Date().toISOString().slice(0, 10)}.csv`);
                        }}
                        className="px-3 py-2 border border-gray-300 rounded bg-white hover:bg-gray-50 text-sm"
                        aria-label="Export Statement CSV"
                      >
                        Export CSV
                      </button>
                      <button
                        onClick={() => {
                          const params = [
                            stmtStart ? `start=${new Date(stmtStart).toISOString()}` : '',
                            stmtEnd ? `end=${new Date(stmtEnd).toISOString()}` : ''
                          ].filter(Boolean).join('&');
                          const url = `/customers/${statementCustomerId}/statement/export.pdf${params ? '?' + params : ''}`;
                          downloadFile(url, `statement-${statementCustomerId}-${new Date().toISOString().slice(0, 10)}.pdf`);
                        }}
                        className="px-3 py-2 border border-gray-300 rounded bg-white hover:bg-gray-50 text-sm"
                        aria-label="Export Statement PDF"
                      >
                        Export PDF
                      </button>
                    </div>
                  </div>

                  {/* Invoice/Liability Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="bg-gray-50 border border-gray-200 rounded p-3">
                      <div className="text-xs text-gray-600">Opening Balance</div>
                      <div className={`text-lg font-semibold ${Number((statement as StatementResponse).openingBalance || 0) > 0 ? 'text-red-600' : Number((statement as StatementResponse).openingBalance || 0) < 0 ? 'text-green-600' : ''}`}>
                        {formatCurrency(Math.abs(Number((statement as StatementResponse).openingBalance || 0)))}
                        {Number((statement as StatementResponse).openingBalance || 0) < 0 && <span className="text-xs ml-1">(CR)</span>}
                      </div>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded p-3">
                      <div className="text-xs text-gray-600">Closing Balance</div>
                      <div className={`text-lg font-semibold ${Number((statement as StatementResponse).closingBalance || 0) > 0 ? 'text-red-600' : Number((statement as StatementResponse).closingBalance || 0) < 0 ? 'text-green-600' : ''}`}>
                        {formatCurrency(Math.abs(Number((statement as StatementResponse).closingBalance || 0)))}
                        {Number((statement as StatementResponse).closingBalance || 0) < 0 && <span className="text-xs ml-1">(CR)</span>}
                      </div>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded p-3">
                      <div className="text-xs text-gray-600">Period</div>
                      <div className="text-sm">{new Date((statement as StatementResponse).periodStart ?? '').toLocaleDateString()} → {new Date((statement as StatementResponse).periodEnd ?? '').toLocaleDateString()}</div>
                    </div>
                  </div>

                  {/* Deposit Summary Card (if customer has deposits) */}
                  {(statement as StatementResponse).deposits?.summary?.totalDeposited != null && (statement as StatementResponse).deposits!.summary!.totalDeposited > 0 && (
                    <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <h4 className="text-sm font-semibold text-emerald-800 mb-2">💰 Customer Deposits (Prepayments)</h4>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-emerald-600">Total Deposited:</span>
                          <span className="ml-2 font-semibold">{formatCurrency((statement as StatementResponse).deposits!.summary!.totalDeposited)}</span>
                        </div>
                        <div>
                          <span className="text-emerald-600">Used:</span>
                          <span className="ml-2 font-semibold">{formatCurrency((statement as StatementResponse).deposits!.summary!.totalUsed)}</span>
                        </div>
                        <div>
                          <span className="text-emerald-600">Available:</span>
                          <span className="ml-2 font-bold text-emerald-700">{formatCurrency((statement as StatementResponse).deposits!.summary!.availableBalance)}</span>
                        </div>
                      </div>
                      <p className="text-xs text-emerald-600 mt-2 italic">
                        Note: Deposits are tracked separately and do not affect invoice balance above.
                      </p>
                    </div>
                  )}

                  {/* Invoice Ledger Section */}
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">📋 Invoice Ledger (Credit Sales & Payments)</h4>
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Debit</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Credit</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {((statement as StatementResponse).entries || []).length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                              No invoice transactions in this period
                            </td>
                          </tr>
                        ) : ((statement as StatementResponse).entries || []).map((e: StatementEntry, idx: number) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm text-gray-600">{new Date(e.date).toLocaleString()}</td>
                            <td className="px-6 py-4 text-sm">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${e.type === 'INVOICE' ? 'bg-blue-100 text-blue-800' :
                                e.type === 'PAYMENT' ? 'bg-green-100 text-green-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                {e.type}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">{e.reference || '-'}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{e.description || '-'}</td>
                            <td className="px-6 py-4 text-sm text-right text-red-600">{e.debit ? formatCurrency(Number(e.debit)) : '-'}</td>
                            <td className="px-6 py-4 text-sm text-right text-green-600">{e.credit ? formatCurrency(Number(e.credit)) : '-'}</td>
                            <td className={`px-6 py-4 text-sm text-right font-semibold ${Number(e.balanceAfter || 0) > 0 ? 'text-red-600' : Number(e.balanceAfter || 0) < 0 ? 'text-green-600' : ''}`}>
                              {formatCurrency(Math.abs(Number(e.balanceAfter || 0)))}
                              {Number(e.balanceAfter || 0) < 0 && <span className="text-xs ml-1">(CR)</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Deposit Activity Section (if any deposits exist) */}
                  {((statement as StatementResponse).deposits?.entries?.length ?? 0) > 0 && (
                    <>
                      <h4 className="text-sm font-semibold text-gray-700 mt-6 mb-2">💰 Deposit Activity</h4>
                      <div className="overflow-x-auto border border-emerald-200 rounded-lg">
                        <table className="min-w-full divide-y divide-emerald-200">
                          <thead className="bg-emerald-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-emerald-700 uppercase tracking-wider">Date</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-emerald-700 uppercase tracking-wider">Type</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-emerald-700 uppercase tracking-wider">Reference</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-emerald-700 uppercase tracking-wider">Description</th>
                              <th className="px-6 py-3 text-right text-xs font-medium text-emerald-700 uppercase tracking-wider">Amount</th>
                              <th className="px-6 py-3 text-right text-xs font-medium text-emerald-700 uppercase tracking-wider">Running Balance</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-emerald-100">
                            {((statement as StatementResponse).deposits!.entries || []).map((d: DepositEntry, idx: number) => (
                              <tr key={idx} className="hover:bg-emerald-50">
                                <td className="px-6 py-4 text-sm text-gray-600">{new Date(d.date).toLocaleString()}</td>
                                <td className="px-6 py-4 text-sm">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${d.type === 'DEPOSIT_IN' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                                    }`}>
                                    {d.type === 'DEPOSIT_IN' ? '💰 Received' : '🏦 Applied'}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600">{d.reference || '-'}</td>
                                <td className="px-6 py-4 text-sm text-gray-600">{d.description || '-'}</td>
                                <td className={`px-6 py-4 text-sm text-right font-medium ${Number(d.amount) >= 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                  {Number(d.amount) >= 0 ? '+' : ''}{formatCurrency(Number(d.amount))}
                                </td>
                                <td className="px-6 py-4 text-sm text-right font-semibold text-emerald-700">{formatCurrency(Number(d.runningBalance || 0))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between mt-4 rounded-b-lg">
                    <div className="text-sm text-gray-700">Page {(statement as StatementResponse)?.page || stmtPage}</div>
                    <div className="flex gap-2">
                      <button className="px-3 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50" onClick={() => setStmtPage(Math.max(1, stmtPage - 1))} disabled={((statement as StatementResponse)?.page || stmtPage) === 1}>Previous</button>
                      <button className="px-3 py-1 border border-gray-300 rounded bg-white hover:bg-gray-50" onClick={() => setStmtPage(stmtPage + 1)}>Next</button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-10 text-gray-500">Loading statement…</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Customer Detail Modal */}
      <CustomerDetailModal
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        customerId={selectedCustomerId}
        initialTab={detailModalTab}
        onCustomerUpdated={() => {
          // Refresh the customer list
          // The useCustomers hook will automatically refetch
        }}
        onCustomerDeleted={() => {
          setDetailModalOpen(false);
          setSelectedCustomerId(null);
        }}
      />
    </Layout>
  );
}
