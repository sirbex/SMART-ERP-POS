import { useState, useEffect } from 'react';
import Decimal from 'decimal.js';
import { BarChart3, FileText, Download, AlertTriangle, TrendingUp } from 'lucide-react';
import { Button } from '../../components/ui/temp-ui-components';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/temp-ui-components';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/temp-ui-components';
import { Badge } from '../../components/ui/temp-ui-components';
import { Label } from '../../components/ui/temp-ui-components';
import { DatePicker } from '../../components/ui/date-picker';
import { formatCurrency } from '../../utils/currency';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { accountingApi } from '../../services/api';

interface TrialBalanceEntry {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  debitBalance: number;
  creditBalance: number;
  netBalance: number;
}

interface TrialBalanceReport {
  asOfDate: string;
  entries: TrialBalanceEntry[];
  totals: {
    totalDebits: number;
    totalCredits: number;
    difference?: number;        // Node.js API format
    netDifference?: number;     // C# API format
    isBalanced: boolean;
  };
  generatedAt: string;
}

/** Raw account shape returned by trial-balance API */
interface RawTrialBalanceAccount {
  accountId: string;
  accountCode?: string;
  accountNumber?: string;
  accountName?: string;
  accountType: TrialBalanceEntry['accountType'];
  debitBalance: string | number;
  creditBalance: string | number;
  netBalance: string | number;
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const ACCOUNT_TYPE_ORDER = {
  'ASSET': 1,
  'LIABILITY': 2,
  'EQUITY': 3,
  'REVENUE': 4,
  'EXPENSE': 5
};

/**
 * Format net balance with proper accounting conventions:
 * - Negative balances shown in parentheses (standard accounting notation)
 * - Positive balances shown normally
 */
const formatNetBalance = (amount: number): string => {
  if (amount < 0) {
    return `(${formatCurrency(Math.abs(amount))})`;
  }
  return formatCurrency(amount);
};

const TrialBalancePage = () => {
  const [trialBalance, setTrialBalance] = useState<TrialBalanceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [asOfDate, setAsOfDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [includeZeroBalances, setIncludeZeroBalances] = useState(false);

  useEffect(() => {
    loadTrialBalance();
  }, []);

  const loadTrialBalance = async (dateOverride?: string) => {
    try {
      setLoading(true);

      const params = {
        asOfDate: dateOverride || asOfDate,
        includeZeroBalances: includeZeroBalances.toString()
      };

      const response = await accountingApi.get('/trial-balance', { params });
      const result = response.data;
      if (result.success) {
        // Map API response format to frontend interface
        // API returns accountCode, frontend uses accountNumber
        const rawAccounts = result.data.accounts || result.data.entries || [];
        const mappedEntries = rawAccounts.map((acc: RawTrialBalanceAccount) => ({
          accountId: acc.accountId,
          accountNumber: acc.accountCode || acc.accountNumber || '',
          accountName: acc.accountName || '',
          accountType: acc.accountType,
          debitBalance: parseFloat(String(acc.debitBalance)) || 0,
          creditBalance: parseFloat(String(acc.creditBalance)) || 0,
          netBalance: parseFloat(String(acc.netBalance)) || 0
        }));
        const mappedData = {
          ...result.data,
          entries: mappedEntries
        };
        setTrialBalance(mappedData);
      } else {
        throw new Error(result.error || 'Failed to load trial balance');
      }
    } catch (error: unknown) {
      console.error('Error loading trial balance:', error);
      toast.error(`Failed to load trial balance: ${getErrorMessage(error)}`);
      setTrialBalance(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (date: string) => {
    if (date) {
      setAsOfDate(date);
      loadTrialBalance(date);
    }
  };

  const exportToPDF = async () => {
    try {
      const params = new URLSearchParams({
        asOfDate,
        includeZeroBalances: includeZeroBalances.toString(),
        format: 'pdf'
      });

      const response = await accountingApi.get(`/trial-balance/export?${params}`, {
        responseType: 'blob'
      });

      const blob = response.data;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `trial-balance-${asOfDate}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success('Trial balance exported to PDF successfully');
    } catch (error: unknown) {
      console.error('Error exporting trial balance:', error);
      toast.error(`Failed to export: ${getErrorMessage(error)}`);
    }
  };

  const exportToCSV = async () => {
    try {
      const params = new URLSearchParams({
        asOfDate,
        includeZeroBalances: includeZeroBalances.toString(),
        format: 'csv'
      });

      const response = await accountingApi.get(`/trial-balance/export?${params}`, {
        responseType: 'blob'
      });

      const blob = response.data;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `trial-balance-${asOfDate}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success('Trial balance exported to CSV successfully');
    } catch (error: unknown) {
      console.error('Error exporting trial balance:', error);
      toast.error(`Failed to export: ${getErrorMessage(error)}`);
    }
  };

  const getAccountTypeColor = (type: string) => {
    const colors = {
      'ASSET': 'bg-blue-100 text-blue-800',
      'LIABILITY': 'bg-red-100 text-red-800',
      'EQUITY': 'bg-purple-100 text-purple-800',
      'REVENUE': 'bg-green-100 text-green-800',
      'EXPENSE': 'bg-orange-100 text-orange-800'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const groupedEntries = trialBalance?.entries?.reduce((groups, entry) => {
    const type = entry.accountType;
    if (!groups[type]) {
      groups[type] = [];
    }
    groups[type].push(entry);
    return groups;
  }, {} as Record<string, TrialBalanceEntry[]>) || {};

  // Sort groups by account type order
  const sortedAccountTypes = Object.keys(groupedEntries).sort((a, b) => {
    return ACCOUNT_TYPE_ORDER[a as keyof typeof ACCOUNT_TYPE_ORDER] - ACCOUNT_TYPE_ORDER[b as keyof typeof ACCOUNT_TYPE_ORDER];
  });

  return (
    <>
      <div className="p-4 lg:p-6">
        {/* Controls */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Report Options</CardTitle>
            <CardDescription>Configure your trial balance report parameters</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="space-y-2">
                <Label>As of Date</Label>
                <DatePicker
                  value={asOfDate}
                  onChange={handleDateChange}
                  placeholder="Select date"
                  className="w-48"
                />
              </div>

              <div className="space-y-2">
                <Label>Options</Label>
                <Select value={includeZeroBalances.toString()} onValueChange={(value) => setIncludeZeroBalances(value === 'true')}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">Hide Zero Balances</SelectItem>
                    <SelectItem value="true">Include Zero Balances</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button onClick={() => loadTrialBalance()} disabled={loading}>
                  {loading ? 'Generating...' : 'Generate Report'}
                </Button>
                <Button variant="outline" onClick={exportToPDF} disabled={!trialBalance || loading}>
                  <FileText className="h-4 w-4 mr-2" />
                  Export PDF
                </Button>
                <Button variant="outline" onClick={exportToCSV} disabled={!trialBalance || loading}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Balance Status */}
        {trialBalance && (
          <Card className={`mb-6 ${trialBalance.totals.isBalanced ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {trialBalance.totals?.isBalanced ? (
                    <TrendingUp className="h-6 w-6 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-6 w-6 text-red-600" />
                  )}
                  <div>
                    <h3 className={`text-lg font-semibold ${trialBalance.totals?.isBalanced ? 'text-green-900' : 'text-red-900'}`}>
                      {trialBalance.totals?.isBalanced ? 'Books are Balanced' : 'Books are Out of Balance'}
                    </h3>
                    <p className={`text-sm ${trialBalance.totals?.isBalanced ? 'text-green-700' : 'text-red-700'}`}>
                      {trialBalance.totals?.isBalanced
                        ? 'All debits equal credits. Your books are in balance.'
                        : `Difference of ${formatCurrency(Math.abs(trialBalance.totals?.difference || 0))} needs investigation.`
                      }
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Total Debits</p>
                      <p className="text-lg font-mono font-semibold text-red-600">
                        {formatCurrency(trialBalance.totals?.totalDebits || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Total Credits</p>
                      <p className="text-lg font-mono font-semibold text-green-600">
                        {formatCurrency(trialBalance.totals?.totalCredits || 0)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Trial Balance Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Trial Balance Report</CardTitle>
                <CardDescription>
                  {trialBalance ? (
                    <>
                      As of {trialBalance.asOfDate ? format(new Date(trialBalance.asOfDate), 'MMMM dd, yyyy') : 'Unknown Date'} •
                      Generated on {trialBalance.generatedAt ? format(new Date(trialBalance.generatedAt), 'MMM dd, yyyy \'at\' h:mm a') : 'Unknown Date'}
                    </>
                  ) : (
                    'Account balances and verification'
                  )}
                </CardDescription>
              </div>
              {trialBalance && (
                <Badge variant={trialBalance.totals?.isBalanced ? 'default' : 'destructive'}>
                  {trialBalance.totals?.isBalanced ? 'Balanced' : 'Unbalanced'}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-500 mt-2">Generating trial balance...</p>
              </div>
            ) : !trialBalance ? (
              <div className="text-center py-12">
                <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">Click "Generate Report" to create your trial balance</p>
              </div>
            ) : (
              <div className="space-y-6">
                {sortedAccountTypes.map((accountType) => (
                  <div key={accountType}>
                    <div className="flex items-center gap-2 mb-3">
                      <Badge className={getAccountTypeColor(accountType)}>
                        {accountType}
                      </Badge>
                      <span className="text-sm text-gray-500">
                        ({groupedEntries[accountType].length} accounts)
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="border-b">
                          <tr className="text-left">
                            <th className="pb-2 font-medium text-gray-500">Account #</th>
                            <th className="pb-2 font-medium text-gray-500">Account Name</th>
                            <th className="pb-2 font-medium text-gray-500 text-right">Debit Balance</th>
                            <th className="pb-2 font-medium text-gray-500 text-right">Credit Balance</th>
                            <th className="pb-2 font-medium text-gray-500 text-right">Net Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groupedEntries[accountType]
                            .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber))
                            .map((entry) => (
                              <tr key={entry.accountId} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="py-2 font-mono text-sm">{entry.accountNumber}</td>
                                <td className="py-2">{entry.accountName}</td>
                                <td className="py-2 text-right font-mono">
                                  {entry.debitBalance > 0 ? (
                                    <span className="text-red-600">
                                      {formatCurrency(entry.debitBalance)}
                                    </span>
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                                <td className="py-2 text-right font-mono">
                                  {entry.creditBalance > 0 ? (
                                    <span className="text-green-600">
                                      {formatCurrency(entry.creditBalance)}
                                    </span>
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                                <td className="py-2 text-right font-mono">
                                  <span className={entry.netBalance < 0 ? 'text-red-600' : 'text-gray-900'}>
                                    {formatNetBalance(entry.netBalance)}
                                  </span>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 font-semibold">
                            <td className="py-3" colSpan={2}>
                              {accountType} Subtotal
                            </td>
                            <td className="py-3 text-right font-mono text-red-600">
                              {formatCurrency(
                                groupedEntries[accountType].reduce((sum, entry) => new Decimal(sum).plus(entry.debitBalance).toNumber(), 0)
                              )}
                            </td>
                            <td className="py-3 text-right font-mono text-green-600">
                              {formatCurrency(
                                groupedEntries[accountType].reduce((sum, entry) => new Decimal(sum).plus(entry.creditBalance).toNumber(), 0)
                              )}
                            </td>
                            <td className="py-3 text-right font-mono">
                              {(() => {
                                const subtotalNet = groupedEntries[accountType].reduce((sum, entry) => new Decimal(sum).plus(entry.netBalance).toNumber(), 0);
                                return (
                                  <span className={subtotalNet < 0 ? 'text-red-600' : ''}>
                                    {formatNetBalance(subtotalNet)}
                                  </span>
                                );
                              })()}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                ))}

                {/* Grand Totals */}
                <div className="border-t-4 border-gray-300 pt-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left">
                          <th className="pb-2 font-medium">Grand Totals</th>
                          <th className="pb-2 font-medium text-right">Total Debits</th>
                          <th className="pb-2 font-medium text-right">Total Credits</th>
                          <th className="pb-2 font-medium text-right">Difference</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="text-lg font-bold">
                          <td className="py-2">All Accounts</td>
                          <td className="py-2 text-right font-mono text-red-600">
                            {formatCurrency(trialBalance.totals?.totalDebits || 0)}
                          </td>
                          <td className="py-2 text-right font-mono font-semibold text-green-600">
                            {formatCurrency(trialBalance.totals?.totalCredits || 0)}
                          </td>
                          <td className={`py-2 text-right font-mono ${trialBalance.totals?.isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                            {trialBalance.totals?.isBalanced ? '—' : formatCurrency(Math.abs(trialBalance.totals?.netDifference || trialBalance.totals?.difference || 0))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer Note */}
        {trialBalance && (
          <Card className="mt-6 border-gray-200 bg-gray-50">
            <CardContent className="pt-6">
              <div className="text-sm text-gray-600">
                <h4 className="font-medium mb-2">Understanding Your Trial Balance:</h4>
                <ul className="space-y-1 list-disc list-inside">
                  <li><strong>Assets & Expenses</strong> normally have debit balances</li>
                  <li><strong>Liabilities, Equity & Revenue</strong> normally have credit balances</li>
                  <li><strong>Total Debits must equal Total Credits</strong> for books to be in balance</li>
                  <li>If unbalanced, review recent transactions and journal entries</li>
                </ul>
                {trialBalance.totals && !trialBalance.totals.isBalanced && (
                  <div className="mt-3 p-3 bg-red-100 border border-red-200 rounded">
                    <p className="text-red-800 font-medium">
                      ⚠️ Your books are out of balance by {formatCurrency(Math.abs(trialBalance.totals?.netDifference || trialBalance.totals?.difference || 0))}.
                      Please review your recent transactions and ensure all journal entries are complete.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
};

export default TrialBalancePage;