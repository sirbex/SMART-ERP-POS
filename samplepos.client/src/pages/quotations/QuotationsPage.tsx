/**
 * Quotations List Page
 * View and manage all quotations
 */

import { useState } from 'react';
import Decimal from 'decimal.js';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import quotationApi from '../../api/quotations';
import type { QuotationStatus } from '@shared/types/quotation';
import { getQuoteStatusBadge, getDaysUntilExpiry, calculateQuoteAge, normalizeStatus } from '@shared/types/quotation';
import { formatCurrency } from '../../utils/currency';
import Layout from '../../components/Layout';

export default function QuotationsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  // Default to showing active quotations (exclude CONVERTED and CANCELLED)
  const [statusFilter, setStatusFilter] = useState<QuotationStatus | 'ALL' | 'ACTIVE'>('ACTIVE');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'quick' | 'standard'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'customer'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['quotations', page, statusFilter, typeFilter, searchTerm, sortBy, sortOrder],
    queryFn: () =>
      quotationApi.listQuotations({
        page,
        limit: 20,
        status: statusFilter === 'ALL' || statusFilter === 'ACTIVE' ? undefined : statusFilter,
        quoteType: typeFilter === 'ALL' ? undefined : typeFilter,
        searchTerm: searchTerm || undefined,
      }),
  });

  // Filter out CONVERTED/CANCELLED if ACTIVE filter selected
  const filteredQuotations = statusFilter === 'ACTIVE'
    ? (data?.quotations || []).filter(q => q.status !== 'CONVERTED' && q.status !== 'CANCELLED')
    : (data?.quotations || []);

  const quotations = filteredQuotations.sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'date') {
      comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    } else if (sortBy === 'amount') {
      comparison = a.totalAmount - b.totalAmount;
    } else if (sortBy === 'customer') {
      comparison = (a.customerName || '').localeCompare(b.customerName || '');
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });
  const totalPages = data?.totalPages || 1;

  // Calculate stats using normalized 3-status model
  const allQuotations = data?.quotations || [];
  const openQuotations = allQuotations.filter(q => normalizeStatus(q.status) === 'OPEN');
  const stats = {
    total: allQuotations.length,
    open: openQuotations.length,
    converted: allQuotations.filter(q => normalizeStatus(q.status) === 'CONVERTED').length,
    cancelled: allQuotations.filter(q => normalizeStatus(q.status) === 'CANCELLED').length,
    totalValue: allQuotations.reduce((sum, q) => new Decimal(sum).plus(q.totalAmount).toNumber(), 0),
    openValue: openQuotations.reduce((sum, q) => new Decimal(sum).plus(q.totalAmount).toNumber(), 0),
  };

  const getStatusColor = (status: QuotationStatus): string => {
    const badge = getQuoteStatusBadge(status);
    const colors: Record<typeof badge.color, string> = {
      gray: 'bg-gray-100 text-gray-800',
      blue: 'bg-blue-100 text-blue-800',
      green: 'bg-green-100 text-green-800',
      yellow: 'bg-yellow-100 text-yellow-800',
      red: 'bg-red-100 text-red-800',
      purple: 'bg-purple-100 text-purple-800',
    };
    return colors[badge.color];
  };

  return (
    <Layout>
      <div className="p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Quotations</h1>
            <p className="text-gray-600 mt-1">Manage customer quotations and convert to sales</p>
          </div>
          <button
            onClick={() => navigate('/quotations/new')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-lg transition-all"
          >
            + New Quotation
          </button>
        </div>

        {/* Stats Cards */}
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
            <p className="text-sm text-gray-600">Open</p>
            <p className="text-2xl font-bold text-gray-900">{stats.open}</p>
            <p className="text-xs text-gray-500 mt-1">{formatCurrency(stats.openValue)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
            <p className="text-sm text-gray-600">Converted</p>
            <p className="text-2xl font-bold text-gray-900">{stats.converted}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-gray-500">
            <p className="text-sm text-gray-600">Cancelled</p>
            <p className="text-2xl font-bold text-gray-900">{stats.cancelled}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-indigo-500">
            <p className="text-sm text-gray-600">Total Value</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(stats.totalValue)}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Filters & Search</h2>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              {showFilters ? '− Hide Filters' : '+ Show Filters'}
            </button>
          </div>

          <div className="space-y-4">
            {/* Search Bar */}
            <div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="🔍 Search by quote number, customer name, reference..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
              />
            </div>

            {/* Advanced Filters */}
            {showFilters && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as QuotationStatus | 'ALL' | 'ACTIVE')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    aria-label="Filter by status"
                  >
                    <option value="ACTIVE">Open (Pending Action)</option>
                    <option value="ALL">All Status</option>
                    <option value="CONVERTED">Converted</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as 'ALL' | 'quick' | 'standard')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    aria-label="Filter by quote type"
                  >
                    <option value="ALL">All Types</option>
                    <option value="quick">Quick (POS)</option>
                    <option value="standard">Standard</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'date' | 'amount' | 'customer')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    aria-label="Sort quotations by field"
                  >
                    <option value="date">Date Created</option>
                    <option value="amount">Total Amount</option>
                    <option value="customer">Customer Name</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Order</label>
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    aria-label="Sort order"
                  >
                    <option value="desc">Newest First</option>
                    <option value="asc">Oldest First</option>
                  </select>
                </div>
              </div>
            )}

            {/* Active Filters Display */}
            {(statusFilter !== 'ALL' || typeFilter !== 'ALL' || searchTerm) && (
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="text-sm text-gray-600">Active filters:</span>
                {statusFilter !== 'ALL' && (
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm flex items-center gap-1">
                    Status: {statusFilter}
                    <button onClick={() => setStatusFilter('ALL')} className="hover:text-blue-900">×</button>
                  </span>
                )}
                {typeFilter !== 'ALL' && (
                  <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm flex items-center gap-1">
                    Type: {typeFilter}
                    <button onClick={() => setTypeFilter('ALL')} className="hover:text-green-900">×</button>
                  </span>
                )}
                {searchTerm && (
                  <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm flex items-center gap-1">
                    Search: "{searchTerm}"
                    <button onClick={() => setSearchTerm('')} className="hover:text-purple-900">×</button>
                  </span>
                )}
                <button
                  onClick={() => {
                    setStatusFilter('ALL');
                    setTypeFilter('ALL');
                    setSearchTerm('');
                  }}
                  className="px-3 py-1 text-sm text-red-600 hover:text-red-700 font-medium"
                >
                  Clear All
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Quotations Table */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-gray-600 mt-4">Loading quotations...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-800 font-semibold">Failed to load quotations</p>
            <p className="text-red-600 text-sm mt-2">{(error as Error).message}</p>
            <button
              onClick={() => refetch()}
              className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
            >
              Retry
            </button>
          </div>
        ) : quotations.length === 0 ? (
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
            <p className="text-gray-600 text-lg font-semibold">No quotations found</p>
            <p className="text-gray-500 mt-2">
              {searchTerm || statusFilter !== 'ALL'
                ? 'Try adjusting your filters'
                : 'Create your first quotation to get started'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quote #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Valid Until
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Age
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {quotations.map((quote) => {
                  const daysUntilExpiry = getDaysUntilExpiry(quote.validUntil);
                  const quoteAge = calculateQuoteAge(quote.createdAt);
                  const statusBadge = getQuoteStatusBadge(quote.status);

                  return (
                    <tr
                      key={quote.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/quotations/${quote.quoteNumber}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-blue-600">{quote.quoteNumber}</div>
                        <div className="text-xs text-gray-500">
                          {new Date(quote.createdAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {quote.customerName || 'Walk-in Customer'}
                        </div>
                        {quote.customerPhone && (
                          <div className="text-xs text-gray-500">{quote.customerPhone}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${quote.quoteType === 'quick'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-blue-100 text-blue-800'
                            }`}
                        >
                          {quote.quoteType === 'quick' ? 'Quick (POS)' : 'Standard'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold text-gray-900">
                          {formatCurrency(quote.totalAmount)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(
                            quote.status
                          )}`}
                        >
                          {statusBadge.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {new Date(quote.validUntil).toLocaleDateString()}
                        </div>
                        {daysUntilExpiry > 0 && quote.status !== 'CONVERTED' && (
                          <div
                            className={`text-xs ${daysUntilExpiry <= 7 ? 'text-red-600 font-semibold' : 'text-gray-500'
                              }`}
                          >
                            {daysUntilExpiry} days left
                          </div>
                        )}
                        {daysUntilExpiry <= 0 && quote.status !== 'CONVERTED' && (
                          <div className="text-xs text-red-600 font-semibold">Expired</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {quoteAge === 0 ? 'Today' : quoteAge === 1 ? '1 day' : `${quoteAge} days`}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/quotations/${quote.quoteNumber}`);
                          }}
                          className="text-blue-600 hover:text-blue-900 mr-3"
                        >
                          View
                        </button>
                        {normalizeStatus(quote.status) === 'OPEN' && daysUntilExpiry > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              // Store quote number and redirect to POS
                              localStorage.setItem('loadQuoteNumber', quote.quoteNumber);
                              navigate('/pos');
                            }}
                            className="text-purple-600 hover:text-purple-900 mr-3"
                            title="Load this quote in POS"
                          >
                            Open in POS
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-200">
                <div className="text-sm text-gray-700">
                  Page {page} of {totalPages}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
