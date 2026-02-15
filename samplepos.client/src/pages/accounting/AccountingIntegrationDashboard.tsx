/**
 * Accounting Integration Dashboard
 * 
 * Consolidated dashboard that shows:
 * - Chart of Accounts summary
 * - Trial Balance status
 * - Sales performance (last 30 days)
 * - Accounts Receivable (Customer balances)
 * - Accounts Payable (Supplier balances)
 * - Recent journal entries
 * 
 * Uses the consolidated /api/accounting/dashboard-summary endpoint
 * for optimal performance (single API call)
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/temp-ui-components";
import { Badge } from "../../components/ui/temp-ui-components";
import { Button } from "../../components/ui/temp-ui-components";
import {
  Users,
  Building2,
  FileText,
  DollarSign,
  TrendingUp,
  AlertCircle,
  BookOpen,
  RefreshCw,
  ShoppingCart,
  Receipt,
  BarChart3
} from 'lucide-react';
import { formatCurrency } from '../../utils/currency';
import { accountingApi } from '../../services/api';
import toast from 'react-hot-toast';

// Dashboard data interface matching backend response
interface DashboardData {
  asOfDate: string;
  chartOfAccounts: {
    total: number;
    byType: Record<string, number>;
  };
  trialBalance: {
    totalDebits: number;
    totalCredits: number;
    difference: number;
    isBalanced: boolean;
  };
  sales: {
    periodDays: number;
    totalSales: number;
    totalRevenue: number;
    totalCOGS: number;
    totalProfit: number;
    profitMargin: number;
  };
  receivables: {
    customerCount: number;
    totalAmount: number;
  };
  payables: {
    supplierCount: number;
    totalAmount: number;
  };
  journalEntries: {
    recentCount: number;
  };
}

const AccountingIntegrationDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Use consolidated dashboard endpoint for optimal performance (single API call)
      const response = await accountingApi.get('/dashboard-summary');

      if (response.data?.success) {
        setData(response.data.data);
      } else {
        throw new Error(response.data?.error || 'Failed to load dashboard');
      }
    } catch (error: any) {
      console.error('Error loading dashboard data:', error);
      toast.error('Failed to load dashboard data');

      // Set empty default data on error
      setData({
        asOfDate: new Date().toISOString().split('T')[0],
        chartOfAccounts: { total: 0, byType: {} },
        trialBalance: { totalDebits: 0, totalCredits: 0, difference: 0, isBalanced: true },
        sales: { periodDays: 30, totalSales: 0, totalRevenue: 0, totalCOGS: 0, totalProfit: 0, profitMargin: 0 },
        receivables: { customerCount: 0, totalAmount: 0 },
        payables: { supplierCount: 0, totalAmount: 0 },
        journalEntries: { recentCount: 0 }
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
    toast.success('Dashboard refreshed');
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 lg:p-6">
        <div className="text-center text-gray-500 py-8">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p>Failed to load dashboard data</p>
          <Button onClick={loadDashboardData} className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Quick Stats Bar */}
      <div className="flex items-center justify-between">
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 p-4 rounded-lg border flex-1 mr-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm">
                Real-time financial overview • As of {data.asOfDate}
              </p>
            </div>
            <Badge
              variant="default"
              className={`${data.trialBalance.isBalanced ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} hover:bg-green-200`}
            >
              <TrendingUp className="w-4 h-4 mr-1" />
              {data.trialBalance.isBalanced ? 'Books Balanced' : 'Books Unbalanced'}
            </Badge>
          </div>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Sales Performance - Top Row */}
      <Card className="border-l-4 border-l-green-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-green-600" />
            Sales Performance (Last {data.sales.periodDays} Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600">Transactions</div>
              <div className="text-2xl font-bold text-gray-900">{data.sales.totalSales}</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-sm text-green-600">Revenue</div>
              <div className="text-2xl font-bold text-green-700">{formatCurrency(data.sales.totalRevenue)}</div>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg">
              <div className="text-sm text-orange-600">Cost of Goods</div>
              <div className="text-2xl font-bold text-orange-700">{formatCurrency(data.sales.totalCOGS)}</div>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-sm text-blue-600">Gross Profit</div>
              <div className="text-2xl font-bold text-blue-700">{formatCurrency(data.sales.totalProfit)}</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-sm text-purple-600">Profit Margin</div>
              <div className="text-2xl font-bold text-purple-700">{data.sales.profitMargin.toFixed(1)}%</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards - Second Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Chart of Accounts Card */}
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Chart of Accounts</CardTitle>
            <BookOpen className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{data.chartOfAccounts.total}</div>
            <div className="space-y-1 mt-2">
              <div className="text-xs space-y-0.5">
                {Object.entries(data.chartOfAccounts.byType).map(([type, count]) => (
                  <div key={type} className="flex justify-between">
                    <span className="text-gray-600">{type}:</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Accounts Receivable Card */}
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Accounts Receivable</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{formatCurrency(data.receivables.totalAmount)}</div>
            <div className="space-y-1 mt-2">
              <p className="text-xs text-gray-600">
                From {data.receivables.customerCount} customers
              </p>
              <p className="text-xs font-medium text-blue-600">
                Outstanding balance
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Accounts Payable Card */}
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Accounts Payable</CardTitle>
            <Building2 className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{formatCurrency(data.payables.totalAmount)}</div>
            <div className="space-y-1 mt-2">
              <p className="text-xs text-gray-600">
                {data.payables.supplierCount} active suppliers
              </p>
              <p className="text-xs font-medium text-orange-600">
                Supplier balances
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Journal Entries Card */}
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Journal Entries</CardTitle>
            <Receipt className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{data.journalEntries.recentCount}</div>
            <div className="space-y-1 mt-2">
              <p className="text-xs text-gray-600">
                Last 30 days
              </p>
              <p className="text-xs font-medium text-green-600">
                Double-entry records
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trial Balance Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Trial Balance Summary
          </CardTitle>
          <CardDescription>
            Current financial position verification
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-sm text-green-600 font-medium">Total Debits</div>
              <div className="text-2xl font-bold text-green-700">
                {formatCurrency(data.trialBalance.totalDebits)}
              </div>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-sm text-blue-600 font-medium">Total Credits</div>
              <div className="text-2xl font-bold text-blue-700">
                {formatCurrency(data.trialBalance.totalCredits)}
              </div>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-sm text-gray-600 font-medium">Difference</div>
              <div className="text-2xl font-bold text-gray-700">
                {formatCurrency(data.trialBalance.difference)}
              </div>
            </div>
            <div className={`p-4 rounded-lg ${data.trialBalance.isBalanced ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className={`text-sm font-medium ${data.trialBalance.isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                Status
              </div>
              <div className={`text-2xl font-bold ${data.trialBalance.isBalanced ? 'text-green-700' : 'text-red-700'}`}>
                {data.trialBalance.isBalanced ? '✓ Balanced' : '✗ Unbalanced'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Navigate to common accounting tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <a href="/accounting/expenses" className="p-4 border rounded-lg hover:bg-gray-50 transition-colors text-center">
              <DollarSign className="w-6 h-6 mx-auto mb-2 text-blue-600" />
              <div className="text-sm font-medium">Manage Expenses</div>
            </a>
            <a href="/accounting/chart-of-accounts" className="p-4 border rounded-lg hover:bg-gray-50 transition-colors text-center">
              <BookOpen className="w-6 h-6 mx-auto mb-2 text-purple-600" />
              <div className="text-sm font-medium">Chart of Accounts</div>
            </a>
            <a href="/accounting/general-ledger" className="p-4 border rounded-lg hover:bg-gray-50 transition-colors text-center">
              <FileText className="w-6 h-6 mx-auto mb-2 text-green-600" />
              <div className="text-sm font-medium">General Ledger</div>
            </a>
            <a href="/accounting/financial-statements" className="p-4 border rounded-lg hover:bg-gray-50 transition-colors text-center">
              <TrendingUp className="w-6 h-6 mx-auto mb-2 text-orange-600" />
              <div className="text-sm font-medium">Financial Reports</div>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* System Status */}
      <Card className={`border ${data.trialBalance.isBalanced ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${data.trialBalance.isBalanced ? 'bg-green-100' : 'bg-yellow-100'}`}>
              {data.trialBalance.isBalanced ? (
                <TrendingUp className="w-4 h-4 text-green-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-yellow-600" />
              )}
            </div>
            <div>
              <h3 className={`font-semibold ${data.trialBalance.isBalanced ? 'text-green-900' : 'text-yellow-900'}`}>
                System Status: {data.trialBalance.isBalanced ? 'Healthy' : 'Attention Required'}
              </h3>
              <p className={`text-sm ${data.trialBalance.isBalanced ? 'text-green-700' : 'text-yellow-700'}`}>
                {data.trialBalance.isBalanced
                  ? 'All accounting records are properly balanced. Double-entry bookkeeping verified.'
                  : 'Trial balance shows discrepancy. Please review recent transactions.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountingIntegrationDashboard;
