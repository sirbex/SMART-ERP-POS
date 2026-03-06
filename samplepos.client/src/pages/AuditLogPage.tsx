/**
 * Audit Log Viewer Page
 * Created: November 23, 2025
 * Purpose: View and filter audit trail entries
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AuditLog } from '@shared/types/audit';
import { DatePicker } from '../components/ui/date-picker';
import Layout from '../components/Layout';

// API function to fetch audit logs
async function fetchAuditLogs(filters: {
  page?: number;
  limit?: number;
  entityType?: string;
  action?: string;
  userId?: string;
  severity?: string;
  startDate?: string;
  endDate?: string;
}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      params.append(key, value.toString());
    }
  });

  const response = await fetch(`/api/audit/logs?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to fetch audit logs');
  }

  const result = await response.json();
  return result;
}

export default function AuditLogPage() {
  const [filters, setFilters] = useState({
    page: 1,
    limit: 50,
    entityType: '',
    action: '',
    severity: '',
    startDate: '',
    endDate: '',
  });

  // Fetch audit logs
  const { data, isLoading, error } = useQuery({
    queryKey: ['auditLogs', filters],
    queryFn: () => fetchAuditLogs(filters),
    placeholderData: (previousData) => previousData,
  });

  const auditLogs: AuditLog[] = (data as { data?: AuditLog[]; pagination?: { page: number; limit: number; total: number; totalPages: number } })?.data || [];
  const pagination = (data as { data?: AuditLog[]; pagination?: { page: number; limit: number; total: number; totalPages: number } })?.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 };

  // Severity badge colors
  const getSeverityBadge = (severity: string) => {
    const colors = {
      INFO: 'bg-blue-100 text-blue-800',
      WARNING: 'bg-yellow-100 text-yellow-800',
      ERROR: 'bg-red-100 text-red-800',
      CRITICAL: 'bg-red-600 text-white',
    };
    return colors[severity as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  // Action badge colors
  const getActionBadge = (action: string) => {
    if (action === 'CREATE') return 'bg-green-100 text-green-800';
    if (action === 'UPDATE') return 'bg-blue-100 text-blue-800';
    if (action === 'DELETE' || action === 'VOID') return 'bg-red-100 text-red-800';
    if (action === 'LOGIN') return 'bg-purple-100 text-purple-800';
    if (action === 'LOGOUT') return 'bg-gray-100 text-gray-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Audit Trail</h1>
            <p className="text-gray-600 mt-1">Complete system activity log</p>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Filters</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {/* Entity Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Entity Type
                </label>
                <select
                  value={filters.entityType}
                  onChange={(e) => setFilters({ ...filters, entityType: e.target.value, page: 1 })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  aria-label="Filter by entity type"
                >
                  <option value="">All</option>
                  <option value="SALE">Sale</option>
                  <option value="INVOICE">Invoice</option>
                  <option value="PAYMENT">Payment</option>
                  <option value="PRODUCT">Product</option>
                  <option value="CUSTOMER">Customer</option>
                  <option value="USER">User</option>
                  <option value="INVENTORY_ADJUSTMENT">Inventory Adjustment</option>
                </select>
              </div>

              {/* Action */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Action
                </label>
                <select
                  value={filters.action}
                  onChange={(e) => setFilters({ ...filters, action: e.target.value, page: 1 })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  aria-label="Filter by action type"
                >
                  <option value="">All</option>
                  <option value="CREATE">Create</option>
                  <option value="UPDATE">Update</option>
                  <option value="DELETE">Delete</option>
                  <option value="VOID">Void</option>
                  <option value="LOGIN">Login</option>
                  <option value="LOGOUT">Logout</option>
                </select>
              </div>

              {/* Severity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Severity
                </label>
                <select
                  value={filters.severity}
                  onChange={(e) => setFilters({ ...filters, severity: e.target.value, page: 1 })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  aria-label="Filter by severity level"
                >
                  <option value="">All</option>
                  <option value="INFO">Info</option>
                  <option value="WARNING">Warning</option>
                  <option value="ERROR">Error</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <DatePicker
                  value={filters.startDate}
                  onChange={(date) => setFilters({ ...filters, startDate: date, page: 1 })}
                  placeholder="Select start date"
                  maxDate={filters.endDate ? new Date(filters.endDate) : undefined}
                />
              </div>

              {/* End Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <DatePicker
                  value={filters.endDate}
                  onChange={(date) => setFilters({ ...filters, endDate: date, page: 1 })}
                  placeholder="Select end date"
                  minDate={filters.startDate ? new Date(filters.startDate) : undefined}
                />
              </div>
            </div>

            {/* Clear Filters */}
            <button
              onClick={() =>
                setFilters({
                  page: 1,
                  limit: 50,
                  entityType: '',
                  action: '',
                  severity: '',
                  startDate: '',
                  endDate: '',
                })
              }
              className="mt-4 text-sm text-blue-600 hover:text-blue-800"
            >
              Clear Filters
            </button>
          </div>

          {/* Results Count */}
          <div className="mb-4 text-sm text-gray-600">
            Showing {auditLogs.length} of {pagination.total} entries
          </div>

          {/* Audit Log Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {isLoading ? (
              <div className="p-8 text-center text-gray-500">Loading audit logs...</div>
            ) : error ? (
              <div className="p-8 text-center text-red-500">
                Failed to load audit logs. Please try again.
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No audit entries found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Timestamp
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Entity
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Action
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Details
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Severity
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {log.entityType}
                          </div>
                          {log.entityNumber && (
                            <div className="text-xs text-gray-500">{log.entityNumber}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 text-xs font-semibold rounded ${getActionBadge(
                              log.action
                            )}`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{log.userName || 'System'}</div>
                          {log.userRole && (
                            <div className="text-xs text-gray-500">{log.userRole}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 max-w-md truncate">
                          {log.actionDetails || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 text-xs font-semibold rounded ${getSeverityBadge(
                              log.severity
                            )}`}
                          >
                            {log.severity}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="mt-6 flex justify-between items-center">
              <div className="text-sm text-gray-600">
                Page {pagination.page} of {pagination.totalPages}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                  disabled={filters.page === 1}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                  disabled={filters.page === pagination.totalPages}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
