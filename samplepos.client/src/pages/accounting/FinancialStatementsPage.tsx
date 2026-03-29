import { useState, useEffect } from 'react';
import { FileText, Eye, BarChart3 } from 'lucide-react';
import { ResponsiveTableWrapper } from '../../components/ui/ResponsiveTableWrapper';
import { Button } from '../../components/ui/temp-ui-components';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/temp-ui-components';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/temp-ui-components';
import { Badge } from '../../components/ui/temp-ui-components';
import { Label } from '../../components/ui/temp-ui-components';
import { DatePicker } from '../../components/ui/date-picker';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/temp-ui-components';
import { formatCurrency } from '../../utils/currency';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { accountingApi } from '../../services/api';

interface FinancialStatementItem {
  accountId?: string;
  accountNumber?: string;
  accountName: string;
  amount: number;
  isSubtotal?: boolean;
  isTotal?: boolean;
  level: number;
  children?: FinancialStatementItem[];
}

interface IncomeStatement {
  periodStart: string;
  periodEnd: string;
  revenue: FinancialStatementItem[];
  costOfGoodsSold: FinancialStatementItem[];
  operatingExpenses: FinancialStatementItem[];
  otherIncome: FinancialStatementItem[];
  otherExpenses: FinancialStatementItem[];
  totals: {
    totalRevenue: number;
    totalCOGS: number;
    grossProfit: number;
    grossProfitMargin: number;
    totalOperatingExpenses: number;
    operatingIncome: number;
    operatingMargin: number;
    totalOtherIncome: number;
    totalOtherExpenses: number;
    netIncome: number;
    netMargin: number;
  };
  generatedAt: string;
}

interface BalanceSheet {
  asOfDate: string;
  assets: {
    currentAssets: FinancialStatementItem[];
    fixedAssets: FinancialStatementItem[];
    otherAssets: FinancialStatementItem[];
  };
  liabilities: {
    currentLiabilities: FinancialStatementItem[];
    longTermLiabilities: FinancialStatementItem[];
  };
  equity: FinancialStatementItem[];
  totals: {
    totalCurrentAssets: number;
    totalFixedAssets: number;
    totalOtherAssets: number;
    totalAssets: number;
    totalCurrentLiabilities: number;
    totalLongTermLiabilities: number;
    totalLiabilities: number;
    totalEquity: number;
    totalLiabilitiesAndEquity: number;
    isBalanced: boolean;
  };
  generatedAt: string;
}

interface CashFlowStatement {
  periodStart: string;
  periodEnd: string;
  operatingActivities: FinancialStatementItem[];
  investingActivities: FinancialStatementItem[];
  financingActivities: FinancialStatementItem[];
  totals: {
    netCashFromOperating: number;
    netCashFromInvesting: number;
    netCashFromFinancing: number;
    netChangeInCash: number;
    beginningCashBalance: number;
    endingCashBalance: number;
  };
  generatedAt: string;
}

type ReportType = 'income-statement' | 'balance-sheet' | 'cash-flow';
type ReportPeriod = 'current-month' | 'current-quarter' | 'current-year' | 'last-month' | 'last-quarter' | 'last-year' | 'custom';

/** Raw item shape returned by the accounting API before frontend transformation */
interface RawStatementItem {
  accountCode?: string;
  accountNumber?: string;
  accountName?: string;
  description?: string;
  amount?: string | number;
  balance?: string | number;
}

const FinancialStatementsPage = () => {
  const [reportType, setReportType] = useState<ReportType>('income-statement');
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('current-month');
  const [customStartDate, setCustomStartDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [customEndDate, setCustomEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  const [incomeStatement, setIncomeStatement] = useState<IncomeStatement | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheet | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowStatement | null>(null);

  const [loading, setLoading] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  // Load data when report type or period changes
  useEffect(() => {
    loadFinancialStatement();
  }, [reportType, reportPeriod, customStartDate, customEndDate]);

  const getDateRange = (): { start: string; end: string } => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentQuarter = Math.floor(currentMonth / 3);

    const formatDateStr = (d: Date) => format(d, 'yyyy-MM-dd');

    switch (reportPeriod) {
      case 'current-month':
        return {
          start: formatDateStr(new Date(currentYear, currentMonth, 1)),
          end: formatDateStr(new Date(currentYear, currentMonth + 1, 0))
        };
      case 'current-quarter':
        return {
          start: formatDateStr(new Date(currentYear, currentQuarter * 3, 1)),
          end: formatDateStr(new Date(currentYear, (currentQuarter + 1) * 3, 0))
        };
      case 'current-year':
        return {
          start: formatDateStr(new Date(currentYear, 0, 1)),
          end: formatDateStr(new Date(currentYear, 11, 31))
        };
      case 'last-month':
        return {
          start: formatDateStr(new Date(currentYear, currentMonth - 1, 1)),
          end: formatDateStr(new Date(currentYear, currentMonth, 0))
        };
      case 'last-quarter':
        const lastQuarter = currentQuarter === 0 ? 3 : currentQuarter - 1;
        const quarterYear = currentQuarter === 0 ? currentYear - 1 : currentYear;
        return {
          start: formatDateStr(new Date(quarterYear, lastQuarter * 3, 1)),
          end: formatDateStr(new Date(quarterYear, (lastQuarter + 1) * 3, 0))
        };
      case 'last-year':
        return {
          start: formatDateStr(new Date(currentYear - 1, 0, 1)),
          end: formatDateStr(new Date(currentYear - 1, 11, 31))
        };
      case 'custom':
        return {
          start: customStartDate,
          end: customEndDate
        };
      default:
        return {
          start: formatDateStr(new Date(currentYear, currentMonth, 1)),
          end: formatDateStr(new Date(currentYear, currentMonth + 1, 0))
        };
    }
  };

  const loadFinancialStatement = async () => {
    try {
      setLoading(true);
      const { start, end } = getDateRange();

      let endpoint = '';
      let params = new URLSearchParams();

      if (reportType === 'income-statement' || reportType === 'cash-flow') {
        params.append('startDate', start);
        params.append('endDate', end);
      } else {
        params.append('asOfDate', end);
      }

      switch (reportType) {
        case 'income-statement':
          endpoint = '/income-statement';
          break;
        case 'balance-sheet':
          endpoint = '/balance-sheet';
          break;
        case 'cash-flow':
          endpoint = '/cash-flow';
          break;
      }

      const response = await accountingApi.get(`${endpoint}?${params}`);
      const result = response.data;
      if (result.success) {
        switch (reportType) {
          case 'income-statement':
            // Transform the Node.js API response to match the expected frontend structure
            // Backend returns nested objects: { items: [...], totalRevenue: number }
            // Frontend expects flat arrays with mapped property names
            const mapItems = (items: RawStatementItem[] | undefined): FinancialStatementItem[] => (items || []).map((item: RawStatementItem) => ({
              accountNumber: item.accountCode || item.accountNumber,
              accountName: item.accountName || '',
              amount: parseFloat(String(item.amount ?? '')) || parseFloat(String(item.balance ?? '')) || 0,
              level: 0,
            }));

            const data = result.data;
            const transformedIncomeStatement: IncomeStatement = {
              periodStart: data.periodStart,
              periodEnd: data.periodEnd,
              // Handle both formats: direct array or nested { items: [...] }
              revenue: Array.isArray(data.revenue) ? mapItems(data.revenue) : mapItems(data.revenue?.items),
              costOfGoodsSold: Array.isArray(data.costOfGoodsSold) ? mapItems(data.costOfGoodsSold) : mapItems(data.costOfGoodsSold?.items),
              operatingExpenses: Array.isArray(data.operatingExpenses) ? mapItems(data.operatingExpenses) : mapItems(data.operatingExpenses?.items),
              otherIncome: Array.isArray(data.otherIncome) ? mapItems(data.otherIncome) : mapItems(data.otherIncome?.items),
              otherExpenses: Array.isArray(data.otherExpenses) ? mapItems(data.otherExpenses) : mapItems(data.otherExpenses?.items),
              totals: {
                totalRevenue: data.revenue?.totalRevenue || data.totalRevenue || 0,
                totalCOGS: data.costOfGoodsSold?.totalCOGS || data.totalCOGS || 0,
                grossProfit: data.grossProfit || 0,
                grossProfitMargin: (data.grossProfitMargin || 0) / 100, // Convert percentage to decimal
                totalOperatingExpenses: data.operatingExpenses?.totalOperatingExpenses || data.totalOperatingExpenses || 0,
                operatingIncome: data.operatingIncome || 0,
                operatingMargin: (data.operatingMargin || 0) / 100, // Convert percentage to decimal
                totalOtherIncome: data.otherIncome?.totalOtherIncome || data.totalOtherIncome || 0,
                totalOtherExpenses: data.otherExpenses?.totalOtherExpenses || data.totalOtherExpenses || 0,
                netIncome: data.netIncome || 0,
                netMargin: (data.netProfitMargin || 0) / 100, // Convert percentage to decimal
              },
              generatedAt: data.generatedAt,
            };
            setIncomeStatement(transformedIncomeStatement);
            setBalanceSheet(null);
            setCashFlow(null);
            break;
          case 'balance-sheet':
            // Transform the Node.js API response to match the expected frontend structure
            const bsData = result.data;
            console.log('Balance Sheet API Response:', bsData);
            const mapBsItems = (items: RawStatementItem[] | undefined): FinancialStatementItem[] => (items || []).map((item: RawStatementItem) => ({
              accountNumber: item.accountCode || item.accountNumber,
              accountName: item.accountName || '',
              amount: parseFloat(String(item.amount ?? '')) || parseFloat(String(item.balance ?? '')) || 0,
              level: 0,
            }));

            const transformedBalanceSheet: BalanceSheet = {
              asOfDate: bsData.reportDate || bsData.asOfDate,
              assets: {
                currentAssets: mapBsItems(bsData.assets?.currentAssets),
                fixedAssets: mapBsItems(bsData.assets?.fixedAssets),
                otherAssets: mapBsItems(bsData.assets?.otherAssets || []),
              },
              liabilities: {
                currentLiabilities: mapBsItems(bsData.liabilities?.currentLiabilities),
                longTermLiabilities: mapBsItems(bsData.liabilities?.longTermLiabilities),
              },
              equity: mapBsItems(bsData.equity?.items),
              totals: {
                totalCurrentAssets: bsData.assets?.totalCurrentAssets || 0,
                totalFixedAssets: bsData.assets?.totalFixedAssets || 0,
                totalOtherAssets: bsData.assets?.totalOtherAssets || 0,
                totalAssets: bsData.assets?.totalAssets || 0,
                totalCurrentLiabilities: bsData.liabilities?.totalCurrentLiabilities || 0,
                totalLongTermLiabilities: bsData.liabilities?.totalLongTermLiabilities || 0,
                totalLiabilities: bsData.liabilities?.totalLiabilities || 0,
                totalEquity: bsData.equity?.totalEquity || 0,
                totalLiabilitiesAndEquity: bsData.totalLiabilitiesAndEquity || 0,
                isBalanced: Math.abs((bsData.assets?.totalAssets || 0) - (bsData.totalLiabilitiesAndEquity || 0)) < 0.01,
              },
              generatedAt: bsData.generatedAt,
            };
            console.log('Transformed Balance Sheet:', transformedBalanceSheet);
            setBalanceSheet(transformedBalanceSheet);
            setIncomeStatement(null);
            setCashFlow(null);
            break;
          case 'cash-flow':
            // Transform the Node.js API response to match the expected frontend structure
            const cfData = result.data;
            const mapCfItems = (items: RawStatementItem[] | undefined): FinancialStatementItem[] => (items || []).map((item: RawStatementItem) => ({
              accountNumber: item.accountCode || item.accountNumber || '',
              accountName: item.accountName || item.description || '',
              amount: parseFloat(String(item.amount ?? '')) || 0,
              level: 0,
            }));

            const transformedCashFlow: CashFlowStatement = {
              periodStart: cfData.periodStart || cfData.startDate,
              periodEnd: cfData.periodEnd || cfData.endDate,
              operatingActivities: mapCfItems(cfData.operatingActivities?.items || cfData.operatingActivities),
              investingActivities: mapCfItems(cfData.investingActivities?.items || cfData.investingActivities),
              financingActivities: mapCfItems(cfData.financingActivities?.items || cfData.financingActivities),
              totals: {
                netCashFromOperating: cfData.totals?.netCashFromOperating || cfData.totalOperatingCashFlow || 0,
                netCashFromInvesting: cfData.totals?.netCashFromInvesting || cfData.totalInvestingCashFlow || 0,
                netCashFromFinancing: cfData.totals?.netCashFromFinancing || cfData.totalFinancingCashFlow || 0,
                netChangeInCash: cfData.totals?.netChangeInCash || cfData.netChangeInCash || 0,
                beginningCashBalance: cfData.totals?.beginningCashBalance || cfData.beginningCashBalance || 0,
                endingCashBalance: cfData.totals?.endingCashBalance || cfData.endingCashBalance || 0,
              },
              generatedAt: cfData.generatedAt,
            };
            setCashFlow(transformedCashFlow);
            setIncomeStatement(null);
            setBalanceSheet(null);
            break;
        }
      } else {
        throw new Error(result.error || 'Failed to load financial statement');
      }
    } catch (error: unknown) {
      console.error('Error loading financial statement:', error);
      toast.error(`Failed to load financial statement: ${error instanceof Error ? error.message : 'Unknown error'}`);

      // Clear all statements on error
      setIncomeStatement(null);
      setBalanceSheet(null);
      setCashFlow(null);
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = async () => {
    try {
      const { start, end } = getDateRange();
      let params = new URLSearchParams({
        format: 'pdf'
      });

      if (reportType === 'income-statement' || reportType === 'cash-flow') {
        params.append('startDate', format(start, 'yyyy-MM-dd'));
        params.append('endDate', format(end, 'yyyy-MM-dd'));
      } else {
        params.append('asOfDate', format(end, 'yyyy-MM-dd'));
      }

      const response = await accountingApi.get(`/${reportType}/export?${params}`, {
        responseType: 'blob'
      });

      const blob = response.data;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      const filename = reportType === 'income-statement' ? 'income-statement' :
        reportType === 'balance-sheet' ? 'balance-sheet' : 'cash-flow-statement';
      const dateStr = reportType === 'balance-sheet' ? format(end, 'yyyy-MM-dd') :
        `${format(start, 'yyyy-MM-dd')}_to_${format(end, 'yyyy-MM-dd')}`;

      link.download = `${filename}-${dateStr}.pdf`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success('Financial statement exported to PDF successfully');
    } catch (error: unknown) {
      console.error('Error exporting financial statement:', error);
      toast.error(`Failed to export: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const renderStatementItem = (item: FinancialStatementItem, key: string | number) => (
    <tr
      key={key}
      className={`${item.isTotal ? 'border-t-2 border-gray-300 font-bold' : item.isSubtotal ? 'border-t border-gray-200 font-semibold' : 'hover:bg-gray-50'}`}
    >
      <td className={`py-2 ${item.level > 0 ? `pl-${item.level * 6}` : ''}`}>
        {item.accountNumber && (
          <span className="text-gray-500 text-sm font-mono mr-2">{item.accountNumber}</span>
        )}
        <span className={item.isTotal || item.isSubtotal ? 'font-semibold' : ''}>{item.accountName}</span>
      </td>
      <td className={`py-2 text-right font-mono ${item.amount < 0 ? 'text-red-600' : 'text-gray-900'} ${item.isTotal ? 'font-bold text-lg' : item.isSubtotal ? 'font-semibold' : ''}`}>
        {item.amount !== 0 ? formatCurrency(Math.abs(item.amount)) : '—'}
      </td>
    </tr>
  );

  const renderIncomeStatement = () => (
    <div className="space-y-6">
      {/* Revenue */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Revenue</h3>
        <ResponsiveTableWrapper>
          <table className="w-full">
            <tbody>
              {incomeStatement?.revenue.map((item, index) => renderStatementItem(item, `revenue-${index}`))}
            </tbody>
          </table>
        </ResponsiveTableWrapper>
      </div>

      {/* Gross Profit */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <div className="flex justify-between items-center">
          <span className="font-semibold text-blue-900">Gross Revenue</span>
          <span className="font-bold text-lg font-mono text-blue-900">
            {formatCurrency(incomeStatement?.totals.totalRevenue || 0)}
          </span>
        </div>
      </div>

      {/* Cost of Goods Sold */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Cost of Goods Sold</h3>
        <ResponsiveTableWrapper>
          <table className="w-full">
            <tbody>
              {incomeStatement?.costOfGoodsSold.map((item, index) => renderStatementItem(item, `cogs-${index}`))}
            </tbody>
          </table>
        </ResponsiveTableWrapper>
      </div>

      {/* Gross Profit */}
      <div className="bg-green-50 p-4 rounded-lg">
        <div className="flex justify-between items-center">
          <div>
            <span className="font-semibold text-green-900">Gross Profit</span>
            <span className="text-sm text-green-700 ml-2">
              ({((incomeStatement?.totals.grossProfitMargin || 0) * 100).toFixed(1)}% margin)
            </span>
          </div>
          <span className="font-bold text-lg font-mono text-green-900">
            {formatCurrency(incomeStatement?.totals.grossProfit || 0)}
          </span>
        </div>
      </div>

      {/* Operating Expenses */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Operating Expenses</h3>
        <ResponsiveTableWrapper>
          <table className="w-full">
            <tbody>
              {incomeStatement?.operatingExpenses.map((item, index) => renderStatementItem(item, `opex-${index}`))}
            </tbody>
          </table>
        </ResponsiveTableWrapper>
      </div>

      {/* Operating Income */}
      <div className="bg-yellow-50 p-4 rounded-lg">
        <div className="flex justify-between items-center">
          <div>
            <span className="font-semibold text-yellow-900">Operating Income</span>
            <span className="text-sm text-yellow-700 ml-2">
              ({((incomeStatement?.totals.operatingMargin || 0) * 100).toFixed(1)}% margin)
            </span>
          </div>
          <span className="font-bold text-lg font-mono text-yellow-900">
            {formatCurrency(incomeStatement?.totals.operatingIncome || 0)}
          </span>
        </div>
      </div>

      {/* Other Income/Expenses */}
      {(incomeStatement?.otherIncome.length || 0) > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Other Income</h3>
          <ResponsiveTableWrapper>
            <table className="w-full">
              <tbody>
                {incomeStatement?.otherIncome.map((item, index) => renderStatementItem(item, `other-income-${index}`))}
              </tbody>
            </table>
          </ResponsiveTableWrapper>
        </div>
      )}

      {(incomeStatement?.otherExpenses.length || 0) > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Other Expenses</h3>
          <ResponsiveTableWrapper>
            <table className="w-full">
              <tbody>
                {incomeStatement?.otherExpenses.map((item, index) => renderStatementItem(item, `other-expense-${index}`))}
              </tbody>
            </table>
          </ResponsiveTableWrapper>
        </div>
      )}

      {/* Net Income */}
      <div className={`p-4 rounded-lg ${(incomeStatement?.totals.netIncome || 0) >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
        <div className="flex justify-between items-center">
          <div>
            <span className={`font-bold text-xl ${(incomeStatement?.totals.netIncome || 0) >= 0 ? 'text-green-900' : 'text-red-900'}`}>
              Net Income
            </span>
            <span className={`text-sm ml-2 ${(incomeStatement?.totals.netIncome || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              ({((incomeStatement?.totals.netMargin || 0) * 100).toFixed(1)}% margin)
            </span>
          </div>
          <span className={`font-bold text-xl font-mono ${(incomeStatement?.totals.netIncome || 0) >= 0 ? 'text-green-900' : 'text-red-900'}`}>
            {formatCurrency(Math.abs(incomeStatement?.totals.netIncome || 0))}
          </span>
        </div>
      </div>
    </div>
  );

  const renderBalanceSheet = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Assets */}
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-gray-900 border-b-2 border-gray-300 pb-2">Assets</h2>

        {/* Current Assets */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Current Assets</h3>
          <ResponsiveTableWrapper>
            <table className="w-full">
              <tbody>
                {balanceSheet?.assets.currentAssets.map((item, index) => renderStatementItem(item, `current-assets-${index}`))}
              </tbody>
            </table>
          </ResponsiveTableWrapper>
        </div>

        {/* Fixed Assets */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Fixed Assets</h3>
          <ResponsiveTableWrapper>
            <table className="w-full">
              <tbody>
                {balanceSheet?.assets.fixedAssets.map((item, index) => renderStatementItem(item, `fixed-assets-${index}`))}
              </tbody>
            </table>
          </ResponsiveTableWrapper>
        </div>

        {/* Other Assets */}
        {(balanceSheet?.assets.otherAssets.length || 0) > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Other Assets</h3>
            <ResponsiveTableWrapper>
              <table className="w-full">
                <tbody>
                  {balanceSheet?.assets.otherAssets.map((item, index) => renderStatementItem(item, `other-assets-${index}`))}
                </tbody>
              </table>
            </ResponsiveTableWrapper>
          </div>
        )}

        {/* Total Assets */}
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="font-bold text-xl text-blue-900">Total Assets</span>
            <span className="font-bold text-xl font-mono text-blue-900">
              {formatCurrency(balanceSheet?.totals.totalAssets || 0)}
            </span>
          </div>
        </div>
      </div>

      {/* Liabilities & Equity */}
      <div className="space-y-6">
        <h2 className="text-xl font-bold text-gray-900 border-b-2 border-gray-300 pb-2">Liabilities & Equity</h2>

        {/* Current Liabilities */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Current Liabilities</h3>
          <ResponsiveTableWrapper>
            <table className="w-full">
              <tbody>
                {balanceSheet?.liabilities.currentLiabilities.map((item, index) => renderStatementItem(item, `current-liabilities-${index}`))}
              </tbody>
            </table>
          </ResponsiveTableWrapper>
        </div>

        {/* Long-term Liabilities */}
        {(balanceSheet?.liabilities.longTermLiabilities.length || 0) > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Long-term Liabilities</h3>
            <ResponsiveTableWrapper>
              <table className="w-full">
                <tbody>
                  {balanceSheet?.liabilities.longTermLiabilities.map((item, index) => renderStatementItem(item, `longterm-liabilities-${index}`))}
                </tbody>
              </table>
            </ResponsiveTableWrapper>
          </div>
        )}

        {/* Total Liabilities */}
        <div className="bg-red-50 p-3 rounded">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-red-900">Total Liabilities</span>
            <span className="font-semibold font-mono text-red-900">
              {formatCurrency(balanceSheet?.totals.totalLiabilities || 0)}
            </span>
          </div>
        </div>

        {/* Equity */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Equity</h3>
          <ResponsiveTableWrapper>
            <table className="w-full">
              <tbody>
                {balanceSheet?.equity.map((item, index) => renderStatementItem(item, `equity-${index}`))}
              </tbody>
            </table>
          </ResponsiveTableWrapper>
        </div>

        {/* Total Liabilities & Equity */}
        <div className={`p-4 rounded-lg ${balanceSheet?.totals.isBalanced ? 'bg-green-50' : 'bg-red-50'}`}>
          <div className="flex justify-between items-center">
            <span className={`font-bold text-xl ${balanceSheet?.totals.isBalanced ? 'text-green-900' : 'text-red-900'}`}>
              Total Liabilities & Equity
            </span>
            <span className={`font-bold text-xl font-mono ${balanceSheet?.totals.isBalanced ? 'text-green-900' : 'text-red-900'}`}>
              {formatCurrency(balanceSheet?.totals.totalLiabilitiesAndEquity || 0)}
            </span>
          </div>
          {!balanceSheet?.totals.isBalanced && (
            <p className="text-sm text-red-700 mt-1">
              ⚠️ Balance sheet does not balance. Please review your accounts.
            </p>
          )}
        </div>
      </div>
    </div>
  );

  const renderCashFlowStatement = () => (
    <div className="space-y-6">
      {/* Operating Activities */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Cash Flow from Operating Activities</h3>
        <ResponsiveTableWrapper>
          <table className="w-full">
            <tbody>
              {(cashFlow?.operatingActivities || []).map((item, index) => renderStatementItem(item, `operating-${index}`))}
            </tbody>
          </table>
        </ResponsiveTableWrapper>
        <div className="bg-green-50 p-3 rounded mt-3">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-green-900">Net Cash from Operating Activities</span>
            <span className="font-bold font-mono text-green-900">
              {formatCurrency(Math.abs(cashFlow?.totals?.netCashFromOperating || 0))}
            </span>
          </div>
        </div>
      </div>

      {/* Investing Activities */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Cash Flow from Investing Activities</h3>
        <ResponsiveTableWrapper>
          <table className="w-full">
            <tbody>
              {(cashFlow?.investingActivities || []).map((item, index) => renderStatementItem(item, `investing-${index}`))}
            </tbody>
          </table>
        </ResponsiveTableWrapper>
        <div className="bg-blue-50 p-3 rounded mt-3">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-blue-900">Net Cash from Investing Activities</span>
            <span className="font-bold font-mono text-blue-900">
              {formatCurrency(Math.abs(cashFlow?.totals?.netCashFromInvesting || 0))}
            </span>
          </div>
        </div>
      </div>

      {/* Financing Activities */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Cash Flow from Financing Activities</h3>
        <ResponsiveTableWrapper>
          <table className="w-full">
            <tbody>
              {(cashFlow?.financingActivities || []).map((item, index) => renderStatementItem(item, `financing-${index}`))}
            </tbody>
          </table>
        </ResponsiveTableWrapper>
        <div className="bg-purple-50 p-3 rounded mt-3">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-purple-900">Net Cash from Financing Activities</span>
            <span className="font-bold font-mono text-purple-900">
              {formatCurrency(Math.abs(cashFlow?.totals?.netCashFromFinancing || 0))}
            </span>
          </div>
        </div>
      </div>

      {/* Net Change in Cash */}
      <div className="bg-gray-100 p-4 rounded-lg">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-semibold">Net Change in Cash</span>
            <span className="font-bold font-mono">
              {formatCurrency(Math.abs(cashFlow?.totals?.netChangeInCash || 0))}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span>Beginning Cash Balance</span>
            <span className="font-mono">
              {formatCurrency(cashFlow?.totals?.beginningCashBalance || 0)}
            </span>
          </div>
          <div className="flex justify-between items-center font-semibold text-lg border-t pt-2">
            <span>Ending Cash Balance</span>
            <span className="font-mono">
              {formatCurrency(cashFlow?.totals?.endingCashBalance || 0)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  const getCurrentStatement = () => {
    switch (reportType) {
      case 'income-statement':
        return incomeStatement;
      case 'balance-sheet':
        return balanceSheet;
      case 'cash-flow':
        return cashFlow;
      default:
        return null;
    }
  };

  const getReportTitle = () => {
    switch (reportType) {
      case 'income-statement':
        return 'Income Statement';
      case 'balance-sheet':
        return 'Balance Sheet';
      case 'cash-flow':
        return 'Cash Flow Statement';
      default:
        return 'Financial Statement';
    }
  };

  const getReportDescription = () => {
    getDateRange(); // Called for side effects
    const currentStatement = getCurrentStatement();

    if (!currentStatement) return 'Configure and generate your financial statement';

    switch (reportType) {
      case 'income-statement':
        return `For the period ${format(new Date(incomeStatement!.periodStart), 'MMM dd, yyyy')} to ${format(new Date(incomeStatement!.periodEnd), 'MMM dd, yyyy')}`;
      case 'balance-sheet':
        return `As of ${format(new Date(balanceSheet!.asOfDate), 'MMMM dd, yyyy')}`;
      case 'cash-flow':
        return `For the period ${format(new Date(cashFlow!.periodStart), 'MMM dd, yyyy')} to ${format(new Date(cashFlow!.periodEnd), 'MMM dd, yyyy')}`;
      default:
        return '';
    }
  };

  return (
    <>
      <div className="p-4 lg:p-6">
        {/* Controls */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Report Configuration</CardTitle>
            <CardDescription>Select the type of financial statement and reporting period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Report Type and Period */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Report Type</Label>
                  <Select value={reportType} onValueChange={(value) => setReportType(value as ReportType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income-statement">Income Statement</SelectItem>
                      <SelectItem value="balance-sheet">Balance Sheet</SelectItem>
                      <SelectItem value="cash-flow">Cash Flow Statement</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Period</Label>
                  <Select value={reportPeriod} onValueChange={(value) => setReportPeriod(value as ReportPeriod)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current-month">Current Month</SelectItem>
                      <SelectItem value="current-quarter">Current Quarter</SelectItem>
                      <SelectItem value="current-year">Current Year</SelectItem>
                      <SelectItem value="last-month">Last Month</SelectItem>
                      <SelectItem value="last-quarter">Last Quarter</SelectItem>
                      <SelectItem value="last-year">Last Year</SelectItem>
                      <SelectItem value="custom">Custom Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Custom Date Range */}
              {reportPeriod === 'custom' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <DatePicker
                      value={customStartDate}
                      onChange={(date) => setCustomStartDate(date)}
                      placeholder="Select start date"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <DatePicker
                      value={customEndDate}
                      onChange={(date) => setCustomEndDate(date)}
                      placeholder="Select end date"
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
                <Button onClick={loadFinancialStatement} disabled={loading} className="flex-1 sm:flex-none">
                  {loading ? 'Generating...' : 'Generate Report'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPreviewMode(true)}
                  disabled={!getCurrentStatement() || loading}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Full Screen Preview
                </Button>
                <Button
                  variant="outline"
                  onClick={exportToPDF}
                  disabled={!getCurrentStatement() || loading}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Export PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Financial Statement */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{getReportTitle()}</CardTitle>
                <CardDescription>{getReportDescription()}</CardDescription>
              </div>
              {getCurrentStatement() && (
                <Badge variant="default">
                  Generated {format(new Date(getCurrentStatement()!.generatedAt), 'MMM dd, h:mm a')}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-500 mt-2">Generating {getReportTitle().toLowerCase()}...</p>
              </div>
            ) : !getCurrentStatement() ? (
              <div className="text-center py-12">
                <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">Click "Generate Report" to create your financial statement</p>
              </div>
            ) : (
              <div>
                {reportType === 'income-statement' && renderIncomeStatement()}
                {reportType === 'balance-sheet' && renderBalanceSheet()}
                {reportType === 'cash-flow' && renderCashFlowStatement()}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Full Screen Preview Modal */}
        <Dialog open={previewMode} onOpenChange={setPreviewMode}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{getReportTitle()}</DialogTitle>
              <DialogDescription>{getReportDescription()}</DialogDescription>
            </DialogHeader>
            <div className="mt-4">
              {reportType === 'income-statement' && renderIncomeStatement()}
              {reportType === 'balance-sheet' && renderBalanceSheet()}
              {reportType === 'cash-flow' && renderCashFlowStatement()}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

export default FinancialStatementsPage;