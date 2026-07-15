/**
 * Liquidity Movements — cash / bank / MoMo / petty register (posted books).
 * Operator-facing UX: compact filters, column chooser, period summary.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../utils/api';
import { downloadFile } from '../../utils/download';
import { DateRangeFilter } from '../../components/ui/DateRangeFilter';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { getBusinessDate } from '../../utils/businessDate';
import { formatCurrency } from '../../utils/currency';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Columns3,
  FileSpreadsheet,
  FileText,
  Landmark,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';

function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

type ColumnDef = { id: string; label: string };

type ReportTotals = {
  moneyIn: number;
  moneyOut: number;
  net: number;
  count: number;
  truncated?: boolean;
};

const COLUMN_LABELS: Record<string, string> = {
  transactionDate: 'Date',
  transactionNumber: 'Journal #',
  documentNumber: 'Document',
  documentType: 'Type',
  accountCode: 'Account',
  accountName: 'Account name',
  debitAmount: 'Money in',
  creditAmount: 'Money out',
  description: 'Description',
  fromAccountCode: 'From',
  toAccountCode: 'To',
  referenceType: 'Source',
  journalId: 'Journal ID',
  treasuryDocumentId: 'Document ID',
};

const DEFAULT_COLUMNS = [
  'transactionDate',
  'documentNumber',
  'documentType',
  'accountCode',
  'accountName',
  'description',
  'debitAmount',
  'creditAmount',
];

const ADVANCED_COLUMNS = new Set(['journalId', 'treasuryDocumentId', 'referenceType', 'transactionNumber']);

const DOC_TYPE_LABELS: Record<string, string> = {
  TREASURY_TRANSFER: 'Transfer',
  DEPOSIT_WORKSHEET: 'Deposit',
  PETTY_CASH: 'Petty cash',
  TREASURY_REVERSAL: 'Reversal',
  VAT_REMITTANCE: 'VAT payment',
};

function labelForColumn(id: string, available: ColumnDef[]): string {
  return COLUMN_LABELS[id] || available.find((c) => c.id === id)?.label || id;
}

function friendlyDocType(raw: unknown): string {
  if (raw == null || raw === '') return 'Ledger';
  const key = String(raw);
  return DOC_TYPE_LABELS[key] || key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function LiquidityMovementsReportPage() {
  const today = getBusinessDate();
  const [startDate, setStartDate] = useState(() => monthStart(today));
  const [endDate, setEndDate] = useState(today);
  const [accountCode, setAccountCode] = useState('');
  const [documentType, setDocumentType] = useState('');
  const [treasuryOnly, setTreasuryOnly] = useState(false);
  const [includeReversals, setIncludeReversals] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [availableColumns, setAvailableColumns] = useState<ColumnDef[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [balances, setBalances] = useState<
    Array<{ accountCode: string; accountName: string; available: number }>
  >([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totals, setTotals] = useState<ReportTotals>({
    moneyIn: 0,
    moneyOut: 0,
    net: 0,
    count: 0,
  });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'csv' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    void (async () => {
      try {
        const [colsRes, balRes] = await Promise.all([
          api.reports.liquidityMovementsColumns(),
          api.reports.liquidityBalances(),
        ]);
        const cols = (colsRes.data?.data?.columns ?? []) as ColumnDef[];
        setAvailableColumns(cols);
        setBalances((balRes.data?.data?.items ?? []) as typeof balances);
      } catch {
        /* bootstrap optional — run() surfaces failures */
      }
    })();
  }, []);

  const filterParams = useMemo(
    () => ({
      startDate,
      endDate,
      accountCode: accountCode || undefined,
      documentType: documentType || undefined,
      q: search || undefined,
      treasuryDocumentsOnly: treasuryOnly,
      includeReversals,
      columns: selectedColumns.join(','),
    }),
    [
      startDate,
      endDate,
      accountCode,
      documentType,
      search,
      treasuryOnly,
      includeReversals,
      selectedColumns,
    ],
  );

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.reports.liquidityMovements({
        ...filterParams,
        limit: 1000,
      });
      setRows((res.data?.data?.rows ?? []) as Record<string, unknown>[]);
      const metaTotals = res.data?.data?.meta?.totals as ReportTotals | undefined;
      if (metaTotals) {
        setTotals(metaTotals);
      } else {
        const list = (res.data?.data?.rows ?? []) as Record<string, unknown>[];
        let moneyIn = 0;
        let moneyOut = 0;
        for (const row of list) {
          moneyIn += Number(row.debitAmount || 0);
          moneyOut += Number(row.creditAmount || 0);
        }
        setTotals({
          moneyIn,
          moneyOut,
          net: moneyIn - moneyOut,
          count: list.length,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
      setRows([]);
      setTotals({ moneyIn: 0, moneyOut: 0, net: 0, count: 0 });
    } finally {
      setLoading(false);
    }
  }, [filterParams]);

  useEffect(() => {
    void run();
  }, [run]);

  const toggleColumn = (id: string) => {
    setSelectedColumns((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 2) return prev;
        return prev.filter((c) => c !== id);
      }
      return [...prev, id];
    });
  };

  const visibleColumns = useMemo(() => {
    const order = availableColumns.length
      ? availableColumns.map((c) => c.id)
      : DEFAULT_COLUMNS;
    return order.filter((id) => selectedColumns.includes(id));
  }, [availableColumns, selectedColumns]);

  const runningBalances = useMemo(() => {
    if (!accountCode || rows.length === 0) return null;
    const bal = balances.find((b) => b.accountCode === accountCode)?.available ?? 0;
    const periodNet = rows.reduce(
      (n, r) => n + Number(r.debitAmount || 0) - Number(r.creditAmount || 0),
      0,
    );
    let running = bal - periodNet;
    const map = new Map<number, number>();
    rows.forEach((row, idx) => {
      running += Number(row.debitAmount || 0) - Number(row.creditAmount || 0);
      map.set(idx, Math.round(running * 100) / 100);
    });
    return map;
  }, [accountCode, balances, rows]);

  const cell = (row: Record<string, unknown>, col: string) => {
    if (col === 'documentType') {
      return (
        <Badge variant="secondary" className="font-medium normal-case">
          {friendlyDocType(row[col])}
        </Badge>
      );
    }
    if (col === 'debitAmount' || col === 'creditAmount') {
      const n = Number(row[col] || 0);
      if (!n) return <span className="text-muted-foreground">—</span>;
      const tone = col === 'debitAmount' ? 'text-emerald-700' : 'text-rose-700';
      return <span className={`font-medium tabular-nums ${tone}`}>{formatCurrency(n)}</span>;
    }
    if (col === 'transactionDate') {
      return <span className="tabular-nums text-slate-700">{String(row[col] ?? '—')}</span>;
    }
    if (col === 'accountCode') {
      return <span className="font-mono text-xs text-slate-600">{String(row[col] ?? '—')}</span>;
    }
    const v = row[col];
    if (v == null || v === '') return <span className="text-muted-foreground">—</span>;
    return String(v);
  };

  const buildExportPath = (format: 'pdf' | 'csv') => {
    const params = new URLSearchParams();
    params.set('startDate', filterParams.startDate);
    params.set('endDate', filterParams.endDate);
    params.set('format', format);
    params.set('columns', filterParams.columns);
    params.set('limit', '5000');
    params.set('treasuryDocumentsOnly', filterParams.treasuryDocumentsOnly ? 'true' : 'false');
    params.set('includeReversals', filterParams.includeReversals ? 'true' : 'false');
    if (filterParams.accountCode) params.set('accountCode', filterParams.accountCode);
    if (filterParams.documentType) params.set('documentType', filterParams.documentType);
    if (filterParams.q) params.set('q', filterParams.q);
    return `/reports/liquidity-movements?${params.toString()}`;
  };

  const exportReport = async (format: 'pdf' | 'csv') => {
    setExporting(format);
    setError(null);
    try {
      await downloadFile(
        buildExportPath(format),
        `liquidity-movements-${startDate}_${endDate}.${format}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to export ${format.toUpperCase()}`);
    } finally {
      setExporting(null);
    }
  };

  const primaryColumns = (availableColumns.length
    ? availableColumns
    : DEFAULT_COLUMNS.map((id) => ({ id, label: labelForColumn(id, []) }))
  ).filter((c) => !ADVANCED_COLUMNS.has(c.id));

  const advancedColumns = (availableColumns.length
    ? availableColumns
    : Object.keys(COLUMN_LABELS).map((id) => ({ id, label: labelForColumn(id, []) }))
  ).filter((c) => ADVANCED_COLUMNS.has(c.id));

  const canExport = !loading && exporting == null;
  return (
    <Layout>
      <div className="mx-auto max-w-[1400px] space-y-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
              <Landmark className="h-6 w-6 text-indigo-600" />
              Liquidity Movements
            </h1>
            <p className="mt-1 max-w-xl text-sm text-slate-500">
              Cash, bank, mobile money, and petty cash activity for the period — one register for
              where money moved.
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              <Link to="/reports" className="text-indigo-600 hover:text-indigo-800">
                All reports
              </Link>
              <Link to="/accounting/banking" className="text-indigo-600 hover:text-indigo-800">
                Banking &amp; Liquidity
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void exportReport('csv')}
              disabled={!canExport}
            >
              {exporting === 'csv' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              <span className="ml-2">Export CSV</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void exportReport('pdf')}
              disabled={!canExport}
              className="border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
            >
              {exporting === 'pdf' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              <span className="ml-2">Export PDF</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => void run()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Refresh</span>
            </Button>
          </div>
        </div>

        {balances.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setAccountCode('')}
              className={`shrink-0 rounded-xl border px-3 py-2 text-left transition ${
                !accountCode
                  ? 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                All accounts
              </div>
              <div className="text-sm font-semibold text-slate-800">
                {formatCurrency(balances.reduce((s, b) => s + b.available, 0))}
              </div>
            </button>
            {balances.map((b) => (
              <button
                key={b.accountCode}
                type="button"
                onClick={() => setAccountCode(b.accountCode === accountCode ? '' : b.accountCode)}
                className={`shrink-0 rounded-xl border px-3 py-2 text-left transition ${
                  accountCode === b.accountCode
                    ? 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="max-w-[140px] truncate text-[11px] font-medium text-slate-500">
                  {b.accountName}
                </div>
                <div className="text-sm font-semibold tabular-nums text-slate-800">
                  {formatCurrency(b.available)}
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
          <DateRangeFilter
            label="Period"
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            defaultPreset="THIS_MONTH"
            pickersMode="custom"
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Account
              </label>
              <select
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                value={accountCode}
                onChange={(e) => setAccountCode(e.target.value)}
              >
                <option value="">All liquidity</option>
                {balances.map((b) => (
                  <option key={b.accountCode} value={b.accountCode}>
                    {b.accountName}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Movement
              </label>
              <select
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
              >
                <option value="">All types</option>
                <option value="TREASURY_TRANSFER">Transfer</option>
                <option value="DEPOSIT_WORKSHEET">Deposit</option>
                <option value="PETTY_CASH">Petty cash</option>
                <option value="TREASURY_REVERSAL">Reversal</option>
                <option value="VAT_REMITTANCE">VAT payment</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search document, account, or description…"
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-10 flex-1 sm:flex-none">
                    <SlidersHorizontal className="h-4 w-4" />
                    <span className="ml-2">More filters</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 space-y-3">
                  <div className="text-sm font-medium text-slate-800">More filters</div>
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={treasuryOnly}
                      onChange={(e) => setTreasuryOnly(e.target.checked)}
                    />
                    <span>
                      Documented moves only
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Transfers, deposits, and petty cash with a banking document
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={includeReversals}
                      onChange={(e) => setIncludeReversals(e.target.checked)}
                    />
                    <span>
                      Include reversals
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Show voided / reversed banking documents
                      </span>
                    </span>
                  </label>
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-10 flex-1 sm:flex-none">
                    <Columns3 className="h-4 w-4" />
                    <span className="ml-2">Columns</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72">
                  <div className="mb-2 text-sm font-medium text-slate-800">Show columns</div>
                  <div className="space-y-1.5">
                    {primaryColumns.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={selectedColumns.includes(c.id)}
                          onChange={() => toggleColumn(c.id)}
                        />
                        {labelForColumn(c.id, availableColumns)}
                      </label>
                    ))}
                  </div>
                  {advancedColumns.length > 0 && (
                    <>
                      <div className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Advanced
                      </div>
                      <div className="space-y-1.5">
                        {advancedColumns.map((c) => (
                          <label key={c.id} className="flex items-center gap-2 text-sm text-slate-600">
                            <input
                              type="checkbox"
                              checked={selectedColumns.includes(c.id)}
                              onChange={() => toggleColumn(c.id)}
                            />
                            {labelForColumn(c.id, availableColumns)}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" />
              Money in
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-emerald-700">
              {formatCurrency(totals.moneyIn)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              <ArrowUpRight className="h-3.5 w-3.5 text-rose-600" />
              Money out
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-rose-700">
              {formatCurrency(totals.moneyOut)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Net</div>
            <div
              className={`mt-1 text-xl font-semibold tabular-nums ${
                totals.net >= 0 ? 'text-slate-900' : 'text-rose-700'
              }`}
            >
              {formatCurrency(totals.net)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Lines</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
              {totals.count}
              {totals.truncated ? (
                <span className="ml-1 text-sm font-normal text-amber-600">truncated</span>
              ) : null}
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur">
                <tr>
                  {visibleColumns.map((col) => (
                    <th
                      key={col}
                      className={`px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap ${
                        col === 'debitAmount' || col === 'creditAmount' ? 'text-right' : ''
                      }`}
                    >
                      {labelForColumn(col, availableColumns)}
                    </th>
                  ))}
                  {runningBalances && (
                    <th className="px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                      Balance
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length + (runningBalances ? 1 : 0) || 1}
                      className="p-12 text-center"
                    >
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-500" />
                      <p className="mt-2 text-sm text-slate-500">Loading register…</p>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length + (runningBalances ? 1 : 0) || 1}
                      className="p-12 text-center"
                    >
                      <Landmark className="mx-auto h-8 w-8 text-slate-300" />
                      <p className="mt-3 text-sm font-medium text-slate-700">
                        No movements in this period
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Try a wider date range, clear search, or pick another account.
                      </p>
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-indigo-50/40">
                      {visibleColumns.map((col) => (
                        <td
                          key={col}
                          className={`px-3 py-2.5 whitespace-nowrap ${
                            col === 'debitAmount' || col === 'creditAmount' ? 'text-right' : ''
                          } ${col === 'description' ? 'max-w-[280px] truncate' : ''}`}
                        >
                          {cell(row, col)}
                        </td>
                      ))}
                      {runningBalances && (
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums text-slate-700 whitespace-nowrap">
                          {formatCurrency(runningBalances.get(idx) ?? 0)}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
