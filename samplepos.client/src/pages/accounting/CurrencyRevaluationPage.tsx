import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useRevaluationPreview, useExecuteRevaluation } from '../../hooks/useAccountingModules';
import { ArrowRightLeft, Loader2, TrendingUp, TrendingDown, Globe } from 'lucide-react';
import { getBusinessDate } from '../../utils/businessDate';

interface CurrencyBalance {
  accountCode: string;
  accountName: string;
  currencyCode: string;
  foreignBalance: number;
  bookValueBase: number;
  revaluedBase: number;
  unrealizedGainLoss: number;
  exchangeRate: number;
}

export default function CurrencyRevaluationPage() {
  const today = getBusinessDate();
  const [date, setDate] = useState(today);
  const [autoReverse, setAutoReverse] = useState(true);

  const { data, isLoading } = useRevaluationPreview(date);
  const executeMutation = useExecuteRevaluation();

  const balances: CurrencyBalance[] = Array.isArray(data) ? data : [];
  const totalGain = balances.filter(b => b.unrealizedGainLoss > 0).reduce((s, b) => s + b.unrealizedGainLoss, 0);
  const totalLoss = balances.filter(b => b.unrealizedGainLoss < 0).reduce((s, b) => s + Math.abs(b.unrealizedGainLoss), 0);

  const handleExecute = async () => {
    if (!confirm(`Execute currency revaluation for ${date}? This will post journal entries for unrealized FX gains/losses.`)) return;
    await executeMutation.mutateAsync({ revaluationDate: date, autoReverse });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ArrowRightLeft className="h-6 w-6 text-blue-600" />
          Currency Revaluation
        </h1>
        <p className="text-gray-500 mt-1">Revalue foreign currency balances at period-end exchange rates</p>
        <Link
          to="/accounting/multi-currency"
          className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1"
        >
          <Globe className="h-3 w-3" /> Manage exchange rates
        </Link>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-4 flex items-center gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Revaluation Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoReverse}
            onChange={(e) => setAutoReverse(e.target.checked)}
            className="rounded border-gray-300"
          />
          Auto-reverse next day
        </label>
        <div className="flex-1" />
        <button
          onClick={handleExecute}
          disabled={executeMutation.isPending || balances.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {executeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
          Execute Revaluation
        </button>
      </div>

      {/* Summary */}
      {balances.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 min-w-0">
            <div className="flex items-center gap-2 text-green-700 mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-medium uppercase">Unrealized Gain</span>
            </div>
            <p className="text-base sm:text-2xl font-bold text-green-900">{totalGain.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 min-w-0">
            <div className="flex items-center gap-2 text-red-700 mb-1">
              <TrendingDown className="h-4 w-4" />
              <span className="text-xs font-medium uppercase">Unrealized Loss</span>
            </div>
            <p className="text-base sm:text-2xl font-bold text-red-900">{totalLoss.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 min-w-0">
            <span className="text-xs font-medium uppercase text-blue-700">Net FX Impact</span>
            <p className={`text-base sm:text-2xl font-bold ${totalGain - totalLoss >= 0 ? 'text-green-900' : 'text-red-900'}`}>
              {(totalGain - totalLoss).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}

      {/* Detail Table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Currency</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Foreign Bal.</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Book Value</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revalued</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gain/Loss</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-500" />
              </td></tr>
            ) : balances.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                No foreign currency balances found.
              </td></tr>
            ) : balances.map((b, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm">
                  <span className="font-mono font-medium text-gray-900">{b.accountCode}</span>
                  <span className="ml-2 text-gray-500">{b.accountName}</span>
                </td>
                <td className="px-6 py-4 text-sm font-medium">{b.currencyCode}</td>
                <td className="px-6 py-4 text-sm text-right tabular-nums">{b.foreignBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="px-6 py-4 text-sm text-right tabular-nums text-gray-500">{b.exchangeRate}</td>
                <td className="px-6 py-4 text-sm text-right tabular-nums">{b.bookValueBase.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="px-6 py-4 text-sm text-right tabular-nums">{b.revaluedBase.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className={`px-6 py-4 text-sm text-right tabular-nums font-semibold ${b.unrealizedGainLoss > 0 ? 'text-green-700' : b.unrealizedGainLoss < 0 ? 'text-red-700' : 'text-gray-500'
                  }`}>
                  {b.unrealizedGainLoss.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
