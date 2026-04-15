import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAgedReceivables, useAgedPayables } from '../../hooks/useAccountingModules';
import { Clock, Users, Truck, Loader2, AlertTriangle } from 'lucide-react';
import { getBusinessDate } from '../../utils/businessDate';

interface AgedBucket {
  entityId: string;
  entityName: string;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  total: number;
}

interface AgedReport {
  asOfDate: string;
  summary: {
    current: number;
    days1to30: number;
    days31to60: number;
    days61to90: number;
    over90: number;
    total: number;
  };
  details: AgedBucket[];
}

const tabs = [
  { key: 'receivables', label: 'Aged Receivables', icon: Users },
  { key: 'payables', label: 'Aged Payables', icon: Truck },
] as const;

type TabKey = (typeof tabs)[number]['key'];

const bucketHeaders = ['Current', '1–30', '31–60', '61–90', '90+', 'Total'];

function fmt(n: number | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function AgedBalancePage() {
  const [activeTab, setActiveTab] = useState<TabKey>('receivables');
  const [asOfDate, setAsOfDate] = useState(() => getBusinessDate());

  const receivables = useAgedReceivables(activeTab === 'receivables' ? asOfDate : undefined);
  const payables = useAgedPayables(activeTab === 'payables' ? asOfDate : undefined);

  const { data, isLoading } = activeTab === 'receivables' ? receivables : payables;
  const report = data as AgedReport | undefined;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Clock className="h-6 w-6 text-blue-600" />
            Aged Balances
          </h1>
          <p className="text-gray-500 mt-1">Analyze outstanding receivables and payables by aging bucket</p>
          <Link
            to="/accounting/dunning"
            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-1"
          >
            <AlertTriangle className="h-3 w-3" /> Manage dunning actions for overdue balances
          </Link>
        </div>
        <input
          type="date"
          value={asOfDate}
          onChange={(e) => setAsOfDate(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          aria-label="As of date"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === t.key ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500" />
        </div>
      ) : report ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { label: 'Current', value: report.summary.current, color: 'text-green-600' },
              { label: '1–30 Days', value: report.summary.days1to30, color: 'text-yellow-600' },
              { label: '31–60 Days', value: report.summary.days31to60, color: 'text-orange-500' },
              { label: '61–90 Days', value: report.summary.days61to90, color: 'text-red-500' },
              { label: '90+ Days', value: report.summary.over90, color: 'text-red-700' },
              { label: 'Total', value: report.summary.total, color: 'text-gray-900 font-bold' },
            ].map((c) => (
              <div key={c.label} className="bg-white rounded-lg shadow p-3 text-center">
                <p className="text-xs text-gray-500">{c.label}</p>
                <p className={`text-lg font-semibold ${c.color}`}>{fmt(c.value)}</p>
              </div>
            ))}
          </div>

          {/* Detail Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {activeTab === 'receivables' ? 'Customer' : 'Supplier'}
                    </th>
                    {bucketHeaders.map((h) => (
                      <th key={h} className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {report.details.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No outstanding balances</td>
                    </tr>
                  ) : (
                    report.details.map((row) => (
                      <tr key={row.entityId} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.entityName}</td>
                        <td className="px-4 py-3 text-sm text-right text-green-600">{fmt(row.current)}</td>
                        <td className="px-4 py-3 text-sm text-right text-yellow-600">{fmt(row.days1to30)}</td>
                        <td className="px-4 py-3 text-sm text-right text-orange-500">{fmt(row.days31to60)}</td>
                        <td className="px-4 py-3 text-sm text-right text-red-500">{fmt(row.days61to90)}</td>
                        <td className="px-4 py-3 text-sm text-right text-red-700">{fmt(row.over90)}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{fmt(row.total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
          <Clock className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p>Select a date to view aged balances.</p>
        </div>
      )}
    </div>
  );
}
