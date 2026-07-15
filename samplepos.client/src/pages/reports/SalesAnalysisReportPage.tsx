/**
 * Sales Analysis — modern responsive designer (SAP/Odoo-style).
 * Business logic: dimension presets, share-of-total, ranking, margin health, Pareto insight.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { apiClient } from '../../utils/api';
import type { ApiResponse } from '../../utils/api';
import { downloadFile } from '../../utils/download';
import { DateRangeFilter } from '../../components/ui/DateRangeFilter';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { getBusinessDate } from '../../utils/businessDate';
import { formatCurrency } from '../../utils/currency';
import {
  AlertTriangle,
  ArrowDownWideNarrow,
  Columns3,
  FileSpreadsheet,
  FileText,
  Lightbulb,
  Loader2,
  RefreshCw,
  Search,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react';

function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

type GroupBy =
  | 'day'
  | 'week'
  | 'month'
  | 'cashier'
  | 'payment_method'
  | 'product'
  | 'category'
  | 'customer';

type SortKey =
  | 'netRevenue'
  | 'totalSales'
  | 'grossProfit'
  | 'profitMargin'
  | 'totalQuantitySold'
  | 'transactionCount'
  | 'period';

type TopN = 'all' | '10' | '20';

type SalesRow = {
  period: string;
  category?: string | null;
  totalSales: number;
  totalDiscounts: number;
  netRevenue: number;
  totalCost: number;
  grossProfit: number;
  profitMargin: number;
  transactionCount: number;
  averageTransactionValue: number;
  totalQuantitySold: number;
};

type SalesSummary = {
  totalSales: number;
  totalDiscounts: number;
  netRevenue: number;
  totalCost: number;
  grossProfit: number;
  profitMargin: number;
  averageDiscountRate: number;
  totalTransactions: number;
  totalQuantitySold: number;
};

type EnrichedRow = SalesRow & {
  shareOfNet: number;
  cumulativeShare: number;
  rank: number;
};

const STORAGE_KEY = 'sales-analysis-layout-v2';

const DIMENSIONS: Array<{
  id: GroupBy;
  label: string;
  short: string;
  periodLabel: string;
  group: 'Time' | 'People' | 'Payments' | 'Catalog';
  hint: string;
  defaultSort: SortKey;
}> = [
  {
    id: 'day',
    label: 'By day',
    short: 'Day',
    periodLabel: 'Date',
    group: 'Time',
    hint: 'Daily run-rate and trend',
    defaultSort: 'period',
  },
  {
    id: 'week',
    label: 'By week',
    short: 'Week',
    periodLabel: 'Week',
    group: 'Time',
    hint: 'Week-over-week rhythm',
    defaultSort: 'period',
  },
  {
    id: 'month',
    label: 'By month',
    short: 'Month',
    periodLabel: 'Month',
    group: 'Time',
    hint: 'Monthly close view',
    defaultSort: 'period',
  },
  {
    id: 'cashier',
    label: 'By user / cashier',
    short: 'Cashier',
    periodLabel: 'Cashier',
    group: 'People',
    hint: 'Who closed the sales',
    defaultSort: 'netRevenue',
  },
  {
    id: 'customer',
    label: 'By customer',
    short: 'Customer',
    periodLabel: 'Customer',
    group: 'People',
    hint: 'Who bought',
    defaultSort: 'netRevenue',
  },
  {
    id: 'payment_method',
    label: 'By payment type',
    short: 'Payment',
    periodLabel: 'Payment',
    group: 'Payments',
    hint: 'Cash / card / MoMo mix',
    defaultSort: 'netRevenue',
  },
  {
    id: 'category',
    label: 'By item category',
    short: 'Category',
    periodLabel: 'Category',
    group: 'Catalog',
    hint: 'What category sold',
    defaultSort: 'netRevenue',
  },
  {
    id: 'product',
    label: 'By product',
    short: 'Product',
    periodLabel: 'Product',
    group: 'Catalog',
    hint: 'SKU / item performance',
    defaultSort: 'netRevenue',
  },
];

const PRESETS: Array<{ id: string; label: string; groupBy: GroupBy; topN: TopN }> = [
  { id: 'daily', label: 'Daily pulse', groupBy: 'day', topN: 'all' },
  { id: 'mix', label: 'Payment mix', groupBy: 'payment_method', topN: 'all' },
  { id: 'cat', label: 'Category mix', groupBy: 'category', topN: 'all' },
  { id: 'top-sku', label: 'Top products', groupBy: 'product', topN: '10' },
  { id: 'team', label: 'Cashier score', groupBy: 'cashier', topN: 'all' },
];

const COLUMN_DEFS: Array<{
  id: keyof SalesRow | 'shareOfNet' | 'rank';
  label: string;
  money?: boolean;
  pct?: boolean;
  productOnly?: boolean;
  computed?: boolean;
}> = [
  { id: 'rank', label: '#', computed: true },
  { id: 'period', label: 'Group' },
  { id: 'category', label: 'Category', productOnly: true },
  { id: 'transactionCount', label: 'Tickets' },
  { id: 'totalQuantitySold', label: 'Qty' },
  { id: 'totalSales', label: 'Gross', money: true },
  { id: 'totalDiscounts', label: 'Discount', money: true },
  { id: 'netRevenue', label: 'Net', money: true },
  { id: 'shareOfNet', label: 'Share', pct: true, computed: true },
  { id: 'totalCost', label: 'Cost', money: true },
  { id: 'grossProfit', label: 'GP', money: true },
  { id: 'profitMargin', label: 'Margin', pct: true },
  { id: 'averageTransactionValue', label: 'Avg ticket', money: true },
];

const DEFAULT_COLUMNS: Array<(typeof COLUMN_DEFS)[number]['id']> = [
  'rank',
  'period',
  'category',
  'transactionCount',
  'totalQuantitySold',
  'netRevenue',
  'shareOfNet',
  'grossProfit',
  'profitMargin',
];

const LOW_MARGIN_PCT = 15;
const CONCENTRATION_PCT = 40;

function fmtQty(n: number): string {
  return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function fmtPct(n: number): string {
  return `${Number(n || 0).toFixed(1)}%`;
}

function loadLayout(): {
  groupBy?: GroupBy;
  columns?: Array<(typeof COLUMN_DEFS)[number]['id']>;
  sortKey?: SortKey;
  topN?: TopN;
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function marginTone(margin: number): string {
  if (margin < LOW_MARGIN_PCT) return 'text-red-700';
  if (margin < 25) return 'text-amber-700';
  return 'text-emerald-700';
}

export default function SalesAnalysisReportPage() {
  const today = getBusinessDate();
  const saved = useMemo(() => loadLayout(), []);
  const [startDate, setStartDate] = useState(() => monthStart(today));
  const [endDate, setEndDate] = useState(today);
  const [groupBy, setGroupBy] = useState<GroupBy>(saved.groupBy || 'day');
  const [selectedColumns, setSelectedColumns] = useState(saved.columns || DEFAULT_COLUMNS);
  const [sortKey, setSortKey] = useState<SortKey>(saved.sortKey || 'netRevenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [topN, setTopN] = useState<TopN>(saved.topN || 'all');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'csv' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ recordCount?: number; executionTimeMs?: number }>({});

  const dimension = DIMENSIONS.find((d) => d.id === groupBy) ?? DIMENSIONS[0]!;

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ groupBy, columns: selectedColumns, sortKey, topN }),
      );
    } catch {
      /* ignore quota */
    }
  }, [groupBy, selectedColumns, sortKey, topN]);

  const availableCols = useMemo(
    () => COLUMN_DEFS.filter((c) => !c.productOnly || groupBy === 'product'),
    [groupBy],
  );
  const visibleCols = useMemo(
    () => availableCols.filter((c) => selectedColumns.includes(c.id)),
    [availableCols, selectedColumns],
  );

  const applyDimension = (id: GroupBy) => {
    const dim = DIMENSIONS.find((d) => d.id === id);
    setGroupBy(id);
    if (dim) {
      setSortKey(dim.defaultSort);
      setSortDir(dim.defaultSort === 'period' ? 'asc' : 'desc');
    }
  };

  const applyPreset = (presetId: string) => {
    const p = PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    applyDimension(p.groupBy);
    setTopN(p.topN);
  };

  const toggleColumn = (id: (typeof COLUMN_DEFS)[number]['id']) => {
    setSelectedColumns((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 2) return prev;
        return prev.filter((c) => c !== id);
      }
      return [...prev, id];
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<
        ApiResponse<{
          data: SalesRow[];
          summary: SalesSummary;
          recordCount: number;
          executionTimeMs: number;
        }>
      >('reports/sales', {
        params: {
          start_date: startDate,
          end_date: endDate,
          group_by: groupBy,
        },
      });
      const payload = res.data?.data;
      setRows(Array.isArray(payload?.data) ? payload.data : []);
      setSummary(payload?.summary ?? null);
      setMeta({
        recordCount: payload?.recordCount,
        executionTimeMs: payload?.executionTimeMs,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sales report');
      setRows([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, groupBy]);

  useEffect(() => {
    void load();
  }, [load]);

  const enriched: EnrichedRow[] = useMemo(() => {
    const netBase = Math.abs(Number(summary?.netRevenue || 0)) > 0.0001
      ? Number(summary!.netRevenue)
      : rows.reduce((a, r) => a + Number(r.netRevenue || 0), 0);

    const q = query.trim().toLowerCase();
    let list = rows.filter((r) => {
      if (!q) return true;
      return (
        String(r.period).toLowerCase().includes(q) ||
        String(r.category || '')
          .toLowerCase()
          .includes(q)
      );
    });

    list = [...list].sort((a, b) => {
      if (sortKey === 'period') {
        const cmp = String(a.period).localeCompare(String(b.period), undefined, {
          numeric: true,
          sensitivity: 'base',
        });
        return sortDir === 'asc' ? cmp : -cmp;
      }
      const av = Number(a[sortKey] || 0);
      const bv = Number(b[sortKey] || 0);
      return sortDir === 'asc' ? av - bv : bv - av;
    });

    let running = 0;
    const withShare = list.map((r) => {
      const share = netBase === 0 ? 0 : (Number(r.netRevenue) / netBase) * 100;
      running += share;
      return { ...r, shareOfNet: share, cumulativeShare: running, rank: 0 };
    });

    // Rank by net revenue contribution (business ranking), independent of current sort for clarity
    const byNet = [...withShare].sort(
      (a, b) => Number(b.netRevenue) - Number(a.netRevenue),
    );
    const rankMap = new Map(byNet.map((r, i) => [`${r.period}|${r.category ?? ''}`, i + 1]));
    const ranked = withShare.map((r) => ({
      ...r,
      rank: rankMap.get(`${r.period}|${r.category ?? ''}`) ?? 0,
    }));

    if (topN === '10') return ranked.slice(0, 10);
    if (topN === '20') return ranked.slice(0, 20);
    return ranked;
  }, [rows, summary, query, sortKey, sortDir, topN]);

  const insights = useMemo(() => {
    if (!summary || rows.length === 0) return [];
    const tips: Array<{ tone: 'info' | 'warn' | 'ok'; text: string }> = [];
    const byNet = [...rows].sort((a, b) => Number(b.netRevenue) - Number(a.netRevenue));
    const top = byNet[0];
    if (top) {
      const share =
        summary.netRevenue === 0
          ? 0
          : (Number(top.netRevenue) / Number(summary.netRevenue)) * 100;
      tips.push({
        tone: share >= CONCENTRATION_PCT ? 'warn' : 'ok',
        text: `Top ${dimension.periodLabel.toLowerCase()}: ${top.period} · ${fmtPct(share)} of net (${formatCurrency(top.netRevenue)})`,
      });
    }
    const lowMargin = rows.filter((r) => Number(r.profitMargin) < LOW_MARGIN_PCT && Number(r.netRevenue) > 0);
    if (lowMargin.length > 0) {
      tips.push({
        tone: 'warn',
        text: `${lowMargin.length} group${lowMargin.length === 1 ? '' : 's'} below ${LOW_MARGIN_PCT}% margin — review pricing or mix`,
      });
    }
    if (Number(summary.averageDiscountRate) > 5) {
      tips.push({
        tone: 'warn',
        text: `Average discount ${fmtPct(summary.averageDiscountRate)} — check promo leakage`,
      });
    } else if (summary.totalTransactions > 0) {
      tips.push({
        tone: 'info',
        text: `Avg ticket ${formatCurrency(summary.netRevenue / summary.totalTransactions)} across ${summary.totalTransactions} sales`,
      });
    }
    return tips.slice(0, 3);
  }, [rows, summary, dimension.periodLabel]);

  const buildExportPath = (format: 'pdf' | 'csv') => {
    const params = new URLSearchParams();
    params.set('start_date', startDate);
    params.set('end_date', endDate);
    params.set('group_by', groupBy);
    params.set('format', format);
    return `/reports/sales?${params.toString()}`;
  };

  const exportReport = async (format: 'pdf' | 'csv') => {
    setExporting(format);
    setError(null);
    try {
      await downloadFile(
        buildExportPath(format),
        `sales-analysis-${startDate}_${endDate}-${groupBy}.${format}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to export ${format.toUpperCase()}`);
    } finally {
      setExporting(null);
    }
  };

  const canExport = !loading && exporting == null;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'period' ? 'asc' : 'desc');
    }
  };

  const cellValue = (row: EnrichedRow, col: (typeof COLUMN_DEFS)[number]) => {
    if (col.id === 'rank') return String(row.rank);
    if (col.id === 'shareOfNet') return fmtPct(row.shareOfNet);
    const v = row[col.id as keyof SalesRow];
    if (col.id === 'period' || col.id === 'category') return String(v ?? '—');
    if (col.money) return formatCurrency(Number(v));
    if (col.pct) return fmtPct(Number(v));
    if (col.id === 'totalQuantitySold') return fmtQty(Number(v));
    return String(v ?? '');
  };

  const groups = useMemo(() => {
    const map = new Map<string, typeof DIMENSIONS>();
    for (const d of DIMENSIONS) {
      const list = map.get(d.group) || [];
      list.push(d);
      map.set(d.group, list);
    }
    return [...map.entries()];
  }, []);

  return (
    <Layout>
      <div className="mx-auto max-w-[1440px] space-y-4 p-3 sm:p-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-xs text-slate-500 sm:text-sm">
              <Link to="/reports" className="hover:text-blue-700">
                Reports
              </Link>
              <span>/</span>
              <span>Sales Analysis</span>
            </div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                <ShoppingCart className="h-5 w-5" />
              </span>
              Sales Analysis
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Slice sales by time, team, payment, category, or product — with share of net, ranking,
              and margin health.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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
              <span className="ml-1.5">Export CSV</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void exportReport('pdf')}
              disabled={!canExport}
              className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
            >
              {exporting === 'pdf' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              <span className="ml-1.5">Export PDF</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-1.5">Refresh</span>
            </Button>
          </div>
        </div>

        {/* Controls — Date Range + dropdowns (same responsive pattern) */}
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <DateRangeFilter
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            pickersMode="custom"
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Smart views — dropdown like Date Range */}
            <div className="flex flex-col gap-2 min-w-0">
              <label
                htmlFor="sales-smart-view"
                className="text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                Smart views
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  id="sales-smart-view"
                  value={
                    PRESETS.find((p) => p.groupBy === groupBy && p.topN === topN)?.id ?? 'custom'
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'custom') return;
                    applyPreset(v);
                  }}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 sm:max-w-xs"
                  aria-label="Select smart view"
                >
                  {PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                  <option value="custom">Custom layout</option>
                </select>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 sm:h-10">
                  <span className="truncate text-sm font-medium text-slate-700">
                    {PRESETS.find((p) => p.groupBy === groupBy && p.topN === topN)?.label ??
                      `${dimension.label}${topN !== 'all' ? ` · Top ${topN}` : ''}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Analyse by — dropdown with grouped options */}
            <div className="flex flex-col gap-2 min-w-0">
              <label
                htmlFor="sales-analyse-by"
                className="text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                Analyse by
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  id="sales-analyse-by"
                  value={groupBy}
                  onChange={(e) => applyDimension(e.target.value as GroupBy)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 sm:max-w-xs"
                  aria-label="Select analysis dimension"
                >
                  {groups.map(([group, dims]) => (
                    <optgroup key={group} label={group}>
                      {dims.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 sm:h-10">
                  <span className="truncate text-sm text-slate-600">{dimension.hint}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Rank / search / columns */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Filter ${dimension.periodLabel.toLowerCase()}…`}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs">
                {(
                  [
                    ['all', 'All'],
                    ['10', 'Top 10'],
                    ['20', 'Top 20'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTopN(id)}
                    className={`rounded-md px-2.5 py-1.5 ${
                      topN === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <ArrowDownWideNarrow className="mr-1.5 h-4 w-4" />
                    Sort
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 space-y-1 p-2">
                  {(
                    [
                      ['netRevenue', 'Net revenue'],
                      ['grossProfit', 'Gross profit'],
                      ['profitMargin', 'Margin %'],
                      ['totalQuantitySold', 'Quantity'],
                      ['transactionCount', 'Tickets'],
                      ['period', dimension.periodLabel],
                    ] as Array<[SortKey, string]>
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleSort(key)}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm ${
                        sortKey === key ? 'bg-blue-50 text-blue-800' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span>{label}</span>
                      {sortKey === key && (
                        <span className="text-xs text-slate-500">
                          {sortDir === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Columns3 className="mr-1.5 h-4 w-4" />
                    Columns
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 space-y-2 p-3">
                  <p className="text-xs font-medium uppercase text-slate-500">Show columns</p>
                  {availableCols.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedColumns.includes(c.id)}
                        onChange={() => toggleColumn(c.id)}
                        className="rounded border-slate-300"
                      />
                      {c.id === 'period' ? dimension.periodLabel : c.label}
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        {/* KPIs */}
        {summary && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 lg:gap-3">
            {[
              {
                label: 'Net revenue',
                value: formatCurrency(summary.netRevenue),
                sub: `Gross ${formatCurrency(summary.totalSales)}`,
                accent: true,
              },
              {
                label: 'Gross profit',
                value: formatCurrency(summary.grossProfit),
                sub: `Cost ${formatCurrency(summary.totalCost)}`,
              },
              {
                label: 'Margin',
                value: fmtPct(summary.profitMargin),
                sub: Number(summary.profitMargin) < LOW_MARGIN_PCT ? 'Below target' : 'Healthy',
                tone: marginTone(summary.profitMargin),
              },
              {
                label: 'Discounts',
                value: formatCurrency(summary.totalDiscounts),
                sub: `Avg ${fmtPct(summary.averageDiscountRate)}`,
              },
              {
                label: 'Quantity',
                value: fmtQty(summary.totalQuantitySold),
                sub: `${summary.totalTransactions} tickets`,
              },
              {
                label: 'Avg ticket',
                value:
                  summary.totalTransactions > 0
                    ? formatCurrency(summary.netRevenue / summary.totalTransactions)
                    : formatCurrency(0),
                sub: dimension.short,
              },
            ].map((k) => (
              <div
                key={k.label}
                className={`rounded-xl border px-3 py-2.5 ${
                  k.accent
                    ? 'border-blue-200 bg-gradient-to-br from-blue-50 to-white'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {k.label}
                </div>
                <div
                  className={`mt-0.5 text-sm font-semibold tabular-nums sm:text-base ${k.tone || 'text-slate-900'}`}
                >
                  {k.value}
                </div>
                {k.sub && <div className="mt-0.5 text-[11px] text-slate-500">{k.sub}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Insights */}
        {insights.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-3">
            {insights.map((tip, i) => (
              <div
                key={i}
                className={`flex gap-2 rounded-xl border px-3 py-2.5 text-sm ${
                  tip.tone === 'warn'
                    ? 'border-amber-200 bg-amber-50 text-amber-950'
                    : tip.tone === 'ok'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                      : 'border-slate-200 bg-slate-50 text-slate-800'
                }`}
              >
                {tip.tone === 'warn' ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                ) : tip.tone === 'ok' ? (
                  <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span>{tip.text}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            Showing {enriched.length}
            {topN !== 'all' || query ? ` of ${rows.length}` : ''} groups
            {meta.executionTimeMs != null ? ` · ${meta.executionTimeMs}ms` : ''}
          </span>
          <Badge variant="outline" className="font-normal">
            {dimension.label} · sorted by {sortKey} {sortDir === 'asc' ? '↑' : '↓'}
          </Badge>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Desktop table */}
        <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : enriched.length === 0 ? (
            <div className="py-20 text-center text-sm text-slate-500">No sales in this period</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    {visibleCols.map((c) => {
                      const sortable =
                        c.id === 'period' ||
                        c.id === 'netRevenue' ||
                        c.id === 'grossProfit' ||
                        c.id === 'profitMargin' ||
                        c.id === 'totalQuantitySold' ||
                        c.id === 'transactionCount' ||
                        c.id === 'totalSales';
                      const right =
                        c.money ||
                        c.pct ||
                        c.id === 'totalQuantitySold' ||
                        c.id === 'transactionCount' ||
                        c.id === 'rank' ||
                        c.id === 'shareOfNet';
                      return (
                        <th
                          key={c.id}
                          className={`whitespace-nowrap px-3 py-2.5 ${right ? 'text-right' : 'text-left'} ${
                            sortable ? 'cursor-pointer select-none hover:text-slate-800' : ''
                          }`}
                          onClick={() =>
                            sortable ? toggleSort(c.id as SortKey) : undefined
                          }
                        >
                          {c.id === 'period' ? dimension.periodLabel : c.label}
                          {sortKey === c.id ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {enriched.map((row, i) => (
                    <tr key={`${row.period}-${row.category}-${i}`} className="hover:bg-slate-50/80">
                      {visibleCols.map((c) => {
                        const right =
                          c.money ||
                          c.pct ||
                          c.id === 'totalQuantitySold' ||
                          c.id === 'transactionCount' ||
                          c.id === 'rank' ||
                          c.id === 'shareOfNet';
                        const isMargin = c.id === 'profitMargin';
                        return (
                          <td
                            key={c.id}
                            className={`whitespace-nowrap px-3 py-2 tabular-nums ${
                              right ? 'text-right' : 'text-left'
                            } ${isMargin ? marginTone(Number(row.profitMargin)) : ''}`}
                          >
                            {c.id === 'shareOfNet' ? (
                              <div className="inline-flex min-w-[5.5rem] flex-col items-end gap-1">
                                <span>{fmtPct(row.shareOfNet)}</span>
                                <span className="h-1 w-16 overflow-hidden rounded-full bg-slate-100">
                                  <span
                                    className="block h-full rounded-full bg-blue-500"
                                    style={{
                                      width: `${Math.min(100, Math.max(0, row.shareOfNet))}%`,
                                    }}
                                  />
                                </span>
                              </div>
                            ) : (
                              cellValue(row, c)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Mobile cards */}
        <div className="space-y-2 md:hidden">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : enriched.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-500">
              No sales in this period
            </div>
          ) : (
            enriched.map((row, i) => (
              <div
                key={`${row.period}-${i}`}
                className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                        {row.rank}
                      </span>
                      <div className="truncate font-medium text-slate-900">{row.period}</div>
                    </div>
                    {groupBy === 'product' && row.category && (
                      <div className="mt-0.5 pl-8 text-xs text-slate-500">{row.category}</div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums text-slate-900">
                      {formatCurrency(row.netRevenue)}
                    </div>
                    <div className="text-[11px] text-slate-500">{fmtPct(row.shareOfNet)} of net</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-xs">
                  <div>
                    <div className="text-slate-400">Qty</div>
                    <div className="font-medium tabular-nums">{fmtQty(row.totalQuantitySold)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">GP</div>
                    <div className="font-medium tabular-nums">
                      {formatCurrency(row.grossProfit)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Margin</div>
                    <div className={`font-medium tabular-nums ${marginTone(row.profitMargin)}`}>
                      {fmtPct(row.profitMargin)}
                    </div>
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${Math.min(100, Math.max(0, row.shareOfNet))}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
