/**
 * Orders Report — register designer with column chooser.
 * Column ids / defaults / never-empty resolution come from shared SSOT.
 * Screen, CSV, and PDF always use the same resolved column set.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import { DateRangeFilter } from '../../components/ui/DateRangeFilter';
import { Button } from '../../components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { useAuth } from '../../contexts/AuthContext';
import { getBusinessDate } from '../../utils/businessDate';
import { formatCurrency } from '../../utils/currency';
import {
  AdaptivePage,
  AdaptiveReportShell,
  AdaptiveReportSummary,
  type AdaptiveReportMetric,
} from '../../components/adaptive';
import { Columns3, Download, FileText, Loader2, RefreshCw } from 'lucide-react';
import { ReportBackLink } from '../../components/reports/ReportBackLink';
import {
  catalogForMode,
  defaultsForMode,
  resolveVisibleColumns,
  sanitizePersistedColumns,
  type OrdersReportColumnDef,
  type OrdersReportMode,
} from '@shared/reports/ordersReportColumnsSsot';

function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

type CellValue = string | number | boolean | null | undefined;
type OrderRow = Record<string, CellValue>;

type Summary = {
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalValue: number;
  cancelledValue: number;
  cancellationRate: number;
};

const STORAGE_KEY = 'orders-report-layout-v2';

function loadLayout(): {
  mode?: OrdersReportMode;
  columnsAll?: string[];
  columnsCancelled?: string[];
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // migrate v1 if present
      const v1 = localStorage.getItem('orders-report-layout-v1');
      if (v1) return JSON.parse(v1);
      return {};
    }
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function formatCell(col: OrdersReportColumnDef, value: CellValue): string {
  if (value === null || value === undefined || value === '') return '—';
  if (col.money) {
    const n = Number(value);
    return formatCurrency(Number.isFinite(n) ? n : 0);
  }
  if (col.count) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString() : '0';
  }
  if (col.datetime || col.id.toLowerCase().includes('date') || col.id.toLowerCase().includes('at')) {
    const s = String(value);
    if (s.includes('T')) {
      const [d, t] = s.split('T');
      return `${d} ${((t || '').slice(0, 8))}`;
    }
    return s;
  }
  return String(value);
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const body = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function statusClass(status: string): string {
  const s = (status || '').toUpperCase();
  if (s === 'COMPLETED') return 'bg-teal-100 text-teal-800';
  if (s === 'CANCELLED') return 'bg-red-100 text-red-800';
  if (s === 'PENDING') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-700';
}

function normalizeDateRange(start: string, end: string): { start: string; end: string; swapped: boolean } {
  if (!start || !end) return { start, end, swapped: false };
  if (start <= end) return { start, end, swapped: false };
  return { start: end, end: start, swapped: true };
}

export default function OrdersReportPage() {
  const { isAuthenticated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = getBusinessDate();
  const saved = useMemo(() => loadLayout(), []);
  const fetchGen = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const urlMode: OrdersReportMode =
    searchParams.get('mode') === 'cancelled' ? 'cancelled' : 'all';

  const [mode, setMode] = useState<OrdersReportMode>(urlMode || saved.mode || 'all');
  const [startDate, setStartDate] = useState(() => monthStart(today));
  const [endDate, setEndDate] = useState(today);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [columnsAll, setColumnsAll] = useState<string[]>(() =>
    sanitizePersistedColumns(saved.columnsAll, 'all'),
  );
  const [columnsCancelled, setColumnsCancelled] = useState<string[]>(() =>
    sanitizePersistedColumns(saved.columnsCancelled, 'cancelled'),
  );
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ recordCount?: number }>({});

  // URL is SSOT for mode when landing from Reports launcher
  useEffect(() => {
    const next = searchParams.get('mode') === 'cancelled' ? 'cancelled' : 'all';
    setMode((prev) => (prev === next ? prev : next));
  }, [searchParams]);

  const setModeAndUrl = (next: OrdersReportMode) => {
    setMode(next);
    if (next === 'cancelled') {
      setSearchParams({ mode: 'cancelled' }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  const catalog = useMemo(() => catalogForMode(mode), [mode]);
  const selectedRaw = mode === 'cancelled' ? columnsCancelled : columnsAll;
  const setSelectedRaw = mode === 'cancelled' ? setColumnsCancelled : setColumnsAll;
  const defaults = defaultsForMode(mode);

  const resolvedIds = useMemo(
    () => resolveVisibleColumns(selectedRaw, mode),
    [selectedRaw, mode],
  );

  const visibleCols = useMemo(
    () => catalog.filter((c) => resolvedIds.includes(c.id)),
    [catalog, resolvedIds],
  );

  // Heal persisted junk / mode switch leaving zero visible columns
  useEffect(() => {
    const healed = resolveVisibleColumns(selectedRaw, mode);
    if (healed.join(',') !== (selectedRaw || []).join(',')) {
      setSelectedRaw(healed);
    }
  }, [mode, selectedRaw, setSelectedRaw]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mode,
          columnsAll: resolveVisibleColumns(columnsAll, 'all'),
          columnsCancelled: resolveVisibleColumns(columnsCancelled, 'cancelled'),
        }),
      );
    } catch {
      /* ignore quota */
    }
  }, [mode, columnsAll, columnsCancelled]);

  const toggleColumn = (id: string) => {
    setSelectedRaw((prev) => {
      const current = resolveVisibleColumns(prev, mode);
      if (current.includes(id)) {
        if (current.length <= 2) return current;
        return resolveVisibleColumns(
          current.filter((c) => c !== id),
          mode,
        );
      }
      return resolveVisibleColumns([...current, id], mode);
    });
  };

  const generateReport = useCallback(async () => {
    const { start, end, swapped } = normalizeDateRange(startDate, endDate);
    if (swapped) {
      setStartDate(start);
      setEndDate(end);
    }
    if (!start || !end) {
      setError('Please select a start and end date');
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const gen = ++fetchGen.current;

    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Authentication required. Please log in.');

      const params = new URLSearchParams();
      params.set('start_date', start);
      params.set('end_date', end);
      if (mode === 'all' && statusFilter) {
        params.set('status', statusFilter);
      }

      const endpoint =
        mode === 'cancelled'
          ? `/api/reports/cancelled-orders?${params}`
          : `/api/reports/orders-report?${params}`;

      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ac.signal,
      });
      if (!response.ok) {
        const text = await response.text();
        let message = `Failed to generate report (${response.status})`;
        try {
          const json = JSON.parse(text);
          if (json.error) message = json.error;
        } catch {
          /* keep */
        }
        throw new Error(message);
      }
      const result = await response.json();
      if (gen !== fetchGen.current) return;
      if (!result.success) throw new Error(result.error || 'Invalid response');
      const data = result.data;
      const nextRows: OrderRow[] = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data)
          ? data
          : [];
      setRows(nextRows);
      const rawSummary = data?.summary as Record<string, unknown> | undefined;
      if (mode === 'cancelled') {
        const cancelledCount = Number(
          rawSummary?.totalCancelledOrders ?? data?.recordCount ?? nextRows.length ?? 0,
        );
        const lost = Number(rawSummary?.totalLostValue ?? 0);
        setSummary({
          totalOrders: cancelledCount,
          pendingOrders: 0,
          completedOrders: 0,
          cancelledOrders: cancelledCount,
          totalValue: lost,
          cancelledValue: lost,
          cancellationRate: 100,
        });
      } else if (rawSummary) {
        setSummary({
          totalOrders: Number(rawSummary.totalOrders ?? nextRows.length ?? 0),
          pendingOrders: Number(rawSummary.pendingOrders ?? 0),
          completedOrders: Number(rawSummary.completedOrders ?? 0),
          cancelledOrders: Number(rawSummary.cancelledOrders ?? 0),
          totalValue: Number(rawSummary.totalValue ?? 0),
          cancelledValue: Number(rawSummary.cancelledValue ?? 0),
          cancellationRate: Number(rawSummary.cancellationRate ?? 0),
        });
      } else {
        setSummary(null);
      }
      setMeta({ recordCount: Number(data?.recordCount ?? nextRows.length) });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (gen !== fetchGen.current) return;
      setError(err instanceof Error ? err.message : 'An error occurred');
      setRows([]);
      setSummary(null);
    } finally {
      if (gen === fetchGen.current) setLoading(false);
    }
  }, [startDate, endDate, statusFilter, mode]);

  useEffect(() => {
    if (isAuthenticated) void generateReport();
    return () => {
      abortRef.current?.abort();
    };
  }, [isAuthenticated, generateReport]);

  const exportVisibleCsv = () => {
    const cols = visibleCols.length ? visibleCols : catalog.filter((c) => defaults.includes(c.id));
    if (!rows.length || cols.length === 0) return;
    downloadCsv(
      `orders_${mode}_${startDate}_${endDate}.csv`,
      cols.map((c) => c.label),
      rows.map((row) => cols.map((c) => formatCell(c, row[c.id]))),
    );
  };

  const exportVisiblePdf = async () => {
    const cols = visibleCols.length ? visibleCols : catalog.filter((c) => defaults.includes(c.id));
    if (!cols.length) return;
    setExporting('pdf');
    setError(null);
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Authentication required');
      const { start, end } = normalizeDateRange(startDate, endDate);
      const params = new URLSearchParams();
      params.set('format', 'pdf');
      params.set('start_date', start);
      params.set('end_date', end);
      if (mode === 'all' && statusFilter) params.set('status', statusFilter);
      params.set('columns', cols.map((c) => c.id).join(','));

      const endpoint =
        mode === 'cancelled'
          ? `/api/reports/cancelled-orders?${params}`
          : `/api/reports/orders-report?${params}`;

      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const j = await response.json();
          throw new Error(j.error || 'PDF export failed');
        }
        throw new Error(`PDF export failed (${response.status})`);
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error('PDF export returned empty file');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orders_${mode}_${start}_${end}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF export failed');
    } finally {
      setExporting(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="mx-auto max-w-3xl p-6">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Log in to view orders reports.{' '}
            <Link to="/login" className="font-medium underline">
              Log in
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const metrics: AdaptiveReportMetric[] = summary
    ? [
        {
          id: 'total',
          label: mode === 'cancelled' ? 'Cancelled orders' : 'Total orders',
          value: String(
            mode === 'cancelled' ? summary.cancelledOrders || summary.totalOrders : summary.totalOrders,
          ),
          priority: 'primary',
        },
        ...(mode === 'all'
          ? [
              {
                id: 'completed',
                label: 'Completed',
                value: String(summary.completedOrders ?? 0),
                priority: 'secondary' as const,
              },
              {
                id: 'cancelled',
                label: 'Cancelled',
                value: String(summary.cancelledOrders ?? 0),
                priority: 'secondary' as const,
              },
            ]
          : []),
        {
          id: 'value',
          label: mode === 'cancelled' ? 'Cancelled value' : 'Total value',
          value: formatCurrency(
            mode === 'cancelled' ? summary.cancelledValue || summary.totalValue : summary.totalValue,
          ),
          priority: 'primary',
        },
        ...(mode === 'all'
          ? [
              {
                id: 'rate',
                label: 'Cancel rate',
                value: `${Number(summary.cancellationRate ?? 0).toFixed(1)}%`,
                priority: 'secondary' as const,
              },
            ]
          : []),
      ]
    : [];

  return (
    <Layout>
      <AdaptivePage
        className="mx-auto max-w-7xl p-6"
        title="Orders report"
        description="Order register with creator, cashier, status, and cancellation detail. Choose columns for screen and export."
        backLink={<ReportBackLink />}
        primaryActions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void generateReport()}
              disabled={loading}
              className="min-h-[var(--layout-touch-target)]"
            >
              {loading ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-4 w-4" />
              )}
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportVisibleCsv}
              disabled={!rows.length || loading}
              className="min-h-[var(--layout-touch-target)]"
            >
              <Download className="mr-1.5 h-4 w-4" />
              CSV ({visibleCols.length} cols)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void exportVisiblePdf()}
              disabled={!rows.length || exporting === 'pdf' || loading}
              className="min-h-[var(--layout-touch-target)]"
            >
              {exporting === 'pdf' ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-1.5 h-4 w-4" />
              )}
              PDF ({visibleCols.length} cols)
            </Button>
          </div>
        }
      >
        <div className="space-y-5" data-orders-report-designer="true">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Report
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setModeAndUrl('all')}
                className={`rounded-lg border px-3 py-3 text-left transition ${
                  mode === 'all'
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="text-sm font-semibold">All orders</div>
                <div className={`text-xs mt-0.5 ${mode === 'all' ? 'text-slate-300' : 'text-slate-500'}`}>
                  Pending, completed, and cancelled
                </div>
              </button>
              <button
                type="button"
                onClick={() => setModeAndUrl('cancelled')}
                className={`rounded-lg border px-3 py-3 text-left transition ${
                  mode === 'cancelled'
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="text-sm font-semibold">Cancelled only</div>
                <div
                  className={`text-xs mt-0.5 ${mode === 'cancelled' ? 'text-slate-300' : 'text-slate-500'}`}
                >
                  Reasons, canceller, and timing
                </div>
              </button>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <DateRangeFilter
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                  label="Date range"
                />
              </div>
              {mode === 'all' ? (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="orderStatus">
                    Status
                  </label>
                  <select
                    id="orderStatus"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All statuses</option>
                    <option value="PENDING">Pending</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="min-h-[var(--layout-touch-target)]">
                    <Columns3 className="mr-1.5 h-4 w-4" />
                    Columns ({visibleCols.length}/{catalog.length})
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-3">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Visible / export columns
                  </div>
                  <div className="max-h-72 space-y-1 overflow-auto">
                    {catalog.map((c) => (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={resolvedIds.includes(c.id)}
                          onChange={() => toggleColumn(c.id)}
                          className="rounded border-slate-300"
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 w-full"
                    onClick={() => setSelectedRaw(defaultsForMode(mode))}
                  >
                    Reset defaults
                  </Button>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-slate-500">
                CSV and PDF export only the columns you select. At least two columns stay visible.
              </p>
            </div>
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          <AdaptiveReportShell
            detailLabel={mode === 'cancelled' ? 'Cancelled orders' : 'Order register'}
            summary={summary ? <AdaptiveReportSummary metrics={metrics} /> : undefined}
            table={
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
                  {meta.recordCount != null
                    ? `${meta.recordCount} row(s) · ${visibleCols.length} column(s)`
                    : `${visibleCols.length} column(s)`}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-full text-sm" data-orders-column-table="true">
                    <thead className="bg-slate-50 border-b">
                      <tr>
                        {visibleCols.map((c) => (
                          <th
                            key={c.id}
                            className={`px-3 py-3 text-xs font-bold text-slate-600 uppercase whitespace-nowrap ${
                              c.money || c.count ? 'text-right' : 'text-left'
                            }`}
                          >
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading && !rows.length ? (
                        <tr>
                          <td
                            colSpan={Math.max(visibleCols.length, 1)}
                            className="px-3 py-8 text-center text-slate-500"
                          >
                            Loading…
                          </td>
                        </tr>
                      ) : !rows.length ? (
                        <tr>
                          <td
                            colSpan={Math.max(visibleCols.length, 1)}
                            className="px-3 py-8 text-center text-slate-500"
                          >
                            No orders in this period.
                          </td>
                        </tr>
                      ) : (
                        rows.map((row, idx) => (
                          <tr key={String(row.orderNumber ?? idx)} className="hover:bg-slate-50">
                            {visibleCols.map((c) => {
                              const raw = row[c.id];
                              if (c.id === 'status') {
                                return (
                                  <td key={c.id} className="px-3 py-2.5">
                                    <span
                                      className={`px-2 py-0.5 rounded text-xs font-semibold ${statusClass(String(raw ?? ''))}`}
                                    >
                                      {String(raw ?? '—')}
                                    </span>
                                  </td>
                                );
                              }
                              return (
                                <td
                                  key={c.id}
                                  className={`px-3 py-2.5 whitespace-nowrap ${
                                    c.money || c.count ? 'text-right tabular-nums' : 'text-left'
                                  } ${c.money ? 'font-semibold' : ''}`}
                                >
                                  {formatCell(c, raw)}
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            }
            cards={
              <div className="space-y-3 p-2">
                {rows.slice(0, 40).map((row, idx) => (
                  <div
                    key={String(row.orderNumber ?? idx)}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-mono text-sm font-semibold text-indigo-700">
                        {String(row.orderNumber ?? '—')}
                      </div>
                      {row.status != null ? (
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${statusClass(String(row.status))}`}
                        >
                          {String(row.status)}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      {visibleCols
                        .filter((c) => c.id !== 'orderNumber' && c.id !== 'status')
                        .slice(0, 6)
                        .map((c) => (
                          <div key={c.id}>
                            <div className="text-[10px] uppercase tracking-wide text-slate-500">{c.label}</div>
                            <div className="font-medium text-slate-900">{formatCell(c, row[c.id])}</div>
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
                {!rows.length ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                    No orders in this period.
                  </div>
                ) : null}
              </div>
            }
          />
        </div>
      </AdaptivePage>
    </Layout>
  );
}
