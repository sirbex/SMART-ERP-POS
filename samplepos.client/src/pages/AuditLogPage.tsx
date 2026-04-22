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
import { formatTimestamp } from '../utils/businessDate';
import apiClient from '../utils/api';

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
  const params: Record<string, string> = {};
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      params[key] = value.toString();
    }
  });

  const response = await apiClient.get('/audit/logs', { params });
  return response.data;
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
    const colors: Record<string, string> = {
      CREATE: 'bg-green-100 text-green-800',
      UPDATE: 'bg-blue-100 text-blue-800',
      DELETE: 'bg-red-100 text-red-800',
      VOID: 'bg-red-100 text-red-800',
      CANCEL: 'bg-red-100 text-red-800',
      REFUND: 'bg-orange-100 text-orange-800',
      EXCHANGE: 'bg-orange-100 text-orange-800',
      APPROVE: 'bg-emerald-100 text-emerald-800',
      REJECT: 'bg-rose-100 text-rose-800',
      FINALIZE: 'bg-teal-100 text-teal-800',
      STATUS_CHANGE: 'bg-indigo-100 text-indigo-800',
      ADJUST_INVENTORY: 'bg-amber-100 text-amber-800',
      PRICE_CHANGE: 'bg-cyan-100 text-cyan-800',
      PRICE_OVERRIDE: 'bg-cyan-100 text-cyan-800',
      LOGIN: 'bg-purple-100 text-purple-800',
      LOGOUT: 'bg-gray-100 text-gray-800',
      LOGIN_FAILED: 'bg-red-200 text-red-900',
      PASSWORD_CHANGE: 'bg-violet-100 text-violet-800',
      PERMISSION_CHANGE: 'bg-violet-100 text-violet-800',
      OPEN_DRAWER: 'bg-yellow-100 text-yellow-800',
      CLOSE_SHIFT: 'bg-slate-100 text-slate-800',
      RESTORE: 'bg-lime-100 text-lime-800',
      ARCHIVE: 'bg-stone-100 text-stone-800',
      EXPORT: 'bg-sky-100 text-sky-800',
      IMPORT: 'bg-sky-100 text-sky-800',
      REMOVE: 'bg-red-100 text-red-800',
      REPRINT: 'bg-amber-100 text-amber-800',
    };
    return colors[action] || 'bg-gray-100 text-gray-800';
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
                  <option value="SUPPLIER">Supplier</option>
                  <option value="USER">User</option>
                  <option value="PURCHASE_ORDER">Purchase Order</option>
                  <option value="GOODS_RECEIPT">Goods Receipt</option>
                  <option value="INVENTORY_ADJUSTMENT">Inventory Adjustment</option>
                  <option value="BATCH">Batch</option>
                  <option value="PRICING">Pricing</option>
                  <option value="DISCOUNT">Discount</option>
                  <option value="SETTINGS">Settings</option>
                  <option value="REPORT">Report</option>
                  <option value="SYSTEM">System</option>
                  <option value="LEAD">Lead</option>
                  <option value="OPPORTUNITY">Opportunity</option>
                  <option value="ACTIVITY">Activity</option>
                  <option value="OPPORTUNITY_DOCUMENT">Opportunity Document</option>
                  <option value="DEPARTMENT">Department</option>
                  <option value="POSITION">Position</option>
                  <option value="EMPLOYEE">Employee</option>
                  <option value="PAYROLL_PERIOD">Payroll Period</option>
                  <option value="PAYROLL_ENTRY">Payroll Entry</option>
                  <option value="SALES_ORDER">Sales Order</option>
                  <option value="DELIVERY">Delivery</option>
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
                  <option value="CANCEL">Cancel</option>
                  <option value="REFUND">Refund</option>
                  <option value="EXCHANGE">Exchange</option>
                  <option value="APPROVE">Approve</option>
                  <option value="REJECT">Reject</option>
                  <option value="FINALIZE">Finalize</option>
                  <option value="STATUS_CHANGE">Status Change</option>
                  <option value="ADJUST_INVENTORY">Adjust Inventory</option>
                  <option value="PRICE_CHANGE">Price Change</option>
                  <option value="PRICE_OVERRIDE">Price Override</option>
                  <option value="LOGIN">Login</option>
                  <option value="LOGOUT">Logout</option>
                  <option value="LOGIN_FAILED">Login Failed</option>
                  <option value="PASSWORD_CHANGE">Password Change</option>
                  <option value="PERMISSION_CHANGE">Permission Change</option>
                  <option value="OPEN_DRAWER">Open Drawer</option>
                  <option value="CLOSE_SHIFT">Close Shift</option>
                  <option value="RESTORE">Restore</option>
                  <option value="ARCHIVE">Archive</option>
                  <option value="EXPORT">Export</option>
                  <option value="IMPORT">Import</option>
                  <option value="REMOVE">Remove</option>
                  <option value="REPRINT">Reprint</option>
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
                          {formatTimestamp(log.createdAt)}
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
