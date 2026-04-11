import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFiscalYearStatus, useCloseFiscalYear } from '../../hooks/useAccountingModules';
import { Calendar, Lock, CheckCircle, AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';

interface FiscalYearStatus {
  isClosed: boolean;
  closedAt?: string;
  openPeriods: number;
  totalPeriods: number;
  retainedEarnings: number | null;
  closingTransactionId?: string;
}

export default function FiscalYearClosePage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear - 1);
  const { data, isLoading } = useFiscalYearStatus(year);
  const status = data as FiscalYearStatus | undefined;
  const closeMutation = useCloseFiscalYear();

  const handleClose = async () => {
    if (!confirm(`Are you sure you want to close fiscal year ${year}? This action cannot be undone.`)) return;
    await closeMutation.mutateAsync({ year, closingDate: `${year}-12-31` });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="h-6 w-6 text-blue-600" />
            Fiscal Year Close
          </h1>
          <p className="text-gray-500 mt-1">Close P&L accounts and transfer net income to Retained Earnings</p>
        </div>
        <Link
          to="/accounting/gl-integrity"
          className="flex items-center gap-2 px-4 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
        >
          <ShieldCheck className="h-4 w-4" />
          Run Pre-Close Audit
        </Link>
      </div>

      {/* Year Selector */}
      <div className="bg-white rounded-lg shadow p-4 flex items-center gap-4">
        <label className="text-sm font-medium text-gray-700">Fiscal Year</label>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border rounded-md px-3 py-2 text-sm"
        >
          {Array.from({ length: 5 }, (_, i) => currentYear - i).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Status Card */}
      {isLoading ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500" />
          <p className="mt-2 text-gray-500">Loading fiscal year status...</p>
        </div>
      ) : status ? (
        <div className="bg-white rounded-lg shadow divide-y">
          {/* Status Banner */}
          <div className={`p-6 ${status.isClosed ? 'bg-green-50' : 'bg-yellow-50'}`}>
            <div className="flex items-center gap-3">
              {status.isClosed ? (
                <CheckCircle className="h-8 w-8 text-green-600" />
              ) : (
                <AlertTriangle className="h-8 w-8 text-yellow-600" />
              )}
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {status.isClosed ? `Fiscal Year ${year} — Closed` : `Fiscal Year ${year} — Open`}
                </h2>
                <p className="text-sm text-gray-600">
                  {status.isClosed
                    ? `Closed on ${status.closedAt}`
                    : `${status.openPeriods} period(s) still open out of ${status.totalPeriods}`}
                </p>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="p-6 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Total Periods</p>
              <p className="text-xl font-semibold text-gray-900">{status.totalPeriods}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase">Open Periods</p>
              <p className="text-xl font-semibold text-gray-900">{status.openPeriods}</p>
            </div>
            {status.retainedEarnings !== null && (
              <div className="col-span-2">
                <p className="text-xs font-medium text-gray-500 uppercase">Retained Earnings (Net Income)</p>
                <p className="text-xl font-semibold text-gray-900">
                  {Number(status.retainedEarnings).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}
            {status.closingTransactionId && (
              <div className="col-span-2">
                <p className="text-xs font-medium text-gray-500 uppercase">Closing Transaction</p>
                <p className="text-sm font-mono text-gray-700">{status.closingTransactionId}</p>
              </div>
            )}
          </div>

          {/* Action */}
          {!status.isClosed && (
            <div className="p-6">
              <button
                onClick={handleClose}
                disabled={closeMutation.isPending || status.openPeriods > 0}
                className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {closeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4" />
                )}
                Close Fiscal Year {year}
              </button>
              {status.openPeriods > 0 && (
                <p className="mt-2 text-sm text-red-600">
                  All periods must be closed before closing the fiscal year.
                </p>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
