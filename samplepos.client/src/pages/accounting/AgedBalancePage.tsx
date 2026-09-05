import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAgedReceivables, useAgedPayables } from '../../hooks/useAccountingModules';
import { getBusinessDate } from '../../utils/businessDate';
import { DatePicker } from '../../components/ui/date-picker';
import { Clock, Users, Truck, Loader2, AlertTriangle } from 'lucide-react';
import {
  AdaptivePage,
  AdaptiveReportShell,
  AdaptiveReportSummary,
  type AdaptiveReportMetric,
} from '../../components/adaptive';
import { REPORT_PAGE_FRAME_CLASS } from '../../lib/adaptiveReports';

/** Per-party aging row (API: entities) */
interface AgedEntityRow {
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
    /** Prefer; falls back to grandTotal for older API shapes */
    total?: number;
    grandTotal?: number;
    entityCount?: number;
  };
  /** Entity bucket matrix — primary table SSOT */
  entities?: AgedEntityRow[];
  /** @deprecated Never use for entity table — line-level docs only */
  details?: unknown[];
}

const tabs = [
  { key: 'receivables', label: 'Aged Receivables', icon: Users },
  { key: 'payables', label: 'Aged Payables', icon: Truck },
] as const;

type TabKey = (typeof tabs)[number]['key'];

const bucketHeaders = ['Current', '1–30', '31–60', '61–90', '90+', 'Total'];

function fmt(n: number | undefined | null): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Normalize API → UI (entities table + total/grandTotal alias). */
export function normalizeAgedReport(raw: unknown): AgedReport | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const summaryRaw = (r.summary ?? {}) as Record<string, unknown>;
  const grand = num(summaryRaw.grandTotal ?? summaryRaw.total);
  const total = num(summaryRaw.total ?? summaryRaw.grandTotal);

  // Prefer entities; never treat invoice line "details" as bucket rows
  const entitySource = Array.isArray(r.entities)
    ? r.entities
    : Array.isArray(r.details) &&
        (r.details as Record<string, unknown>[]).every(
          (d) => d && typeof d === 'object' && 'current' in d,
        )
      ? (r.details as Record<string, unknown>[])
      : [];

  const entities: AgedEntityRow[] = entitySource.map((row, idx) => {
    const e = row as Record<string, unknown>;
    const current = num(e.current);
    const days1to30 = num(e.days1to30);
    const days31to60 = num(e.days31to60);
    const days61to90 = num(e.days61to90);
    const over90 = num(e.over90);
    const rowTotal = num(e.total) || current + days1to30 + days31to60 + days61to90 + over90;
    return {
      entityId: String(e.entityId ?? e.entity_id ?? `row-${idx}`),
      entityName: String(e.entityName ?? e.entity_name ?? 'Unknown'),
      current,
      days1to30,
      days31to60,
      days61to90,
      over90,
      total: rowTotal,
    };
  });

  return {
    asOfDate: String(r.asOfDate ?? r.as_of_date ?? ''),
    summary: {
      current: num(summaryRaw.current),
      days1to30: num(summaryRaw.days1to30),
      days31to60: num(summaryRaw.days31to60),
      days61to90: num(summaryRaw.days61to90),
      over90: num(summaryRaw.over90),
      total: total || grand,
      grandTotal: grand || total,
      entityCount: num(summaryRaw.entityCount ?? entities.length),
    },
    entities,
  };
}

export default function AgedBalancePage() {
  const [activeTab, setActiveTab] = useState<TabKey>('receivables');
  const [asOfDate, setAsOfDate] = useState(() => getBusinessDate());

  const receivables = useAgedReceivables(activeTab === 'receivables' ? asOfDate : undefined);
  const payables = useAgedPayables(activeTab === 'payables' ? asOfDate : undefined);

  const { data, isLoading, isError, error } =
    activeTab === 'receivables' ? receivables : payables;

  const report = useMemo(() => normalizeAgedReport(data), [data]);
  const entities = report?.entities ?? [];

  const agingMetrics: AdaptiveReportMetric[] = report
    ? [
        { id: 'current', label: 'Current', value: fmt(report.summary.current), toneClassName: 'text-green-600', priority: 'primary' },
        { id: 'd30', label: '1–30 Days', value: fmt(report.summary.days1to30), toneClassName: 'text-yellow-600', priority: 'primary' },
        { id: 'd60', label: '31–60 Days', value: fmt(report.summary.days31to60), toneClassName: 'text-orange-500', priority: 'secondary' },
        { id: 'd90', label: '61–90 Days', value: fmt(report.summary.days61to90), toneClassName: 'text-red-500', priority: 'secondary' },
        { id: 'over90', label: '90+ Days', value: fmt(report.summary.over90), toneClassName: 'text-red-700', priority: 'secondary' },
        {
          id: 'total',
          label: 'Total',
          value: fmt(report.summary.total ?? report.summary.grandTotal),
          toneClassName: 'text-gray-900',
          priority: 'primary',
          accent: true,
        },
      ]
    : [];

  const detailTable = report ? (
    <div className="bg-white rounded-lg shadow overflow-hidden" data-aged-detail="table">
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
            {entities.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No outstanding balances</td>
              </tr>
            ) : (
              entities.map((row) => (
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
  ) : null;

  return (
    <AdaptivePage
      className={REPORT_PAGE_FRAME_CLASS.replace('max-w-7xl', 'max-w-6xl')}
      title="Aged Balances"
      description="Analyze outstanding receivables and payables by aging bucket"
      primaryActions={
        <DatePicker
          value={asOfDate}
          onChange={setAsOfDate}
          placeholder="As of date"
          aria-label="As of date"
        />
      }
      toolbar={
        <div className="space-y-2" data-aged-filters="true">
          <Link
            to="/accounting/dunning"
            className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
          >
            <AlertTriangle className="h-3 w-3" /> Manage dunning actions for overdue balances
          </Link>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors min-h-[var(--layout-touch-target)] ${activeTab === t.key ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-900'
                    }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      }
    >
      {isLoading ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500" />
        </div>
      ) : isError ? (
        <div className="bg-white rounded-lg shadow p-12 text-center text-red-600">
          <p>Failed to load aged balances.</p>
          <p className="text-sm text-gray-500 mt-2">
            {(error as Error)?.message || 'Unknown error'}
          </p>
        </div>
      ) : report ? (
        <AdaptiveReportShell
          detailLabel="Aging detail"
          summary={<AdaptiveReportSummary metrics={agingMetrics} />}
          table={detailTable}
          cards={
            <div className="space-y-3" data-aged-detail="cards">
              {entities.length === 0 ? (
                <p className="text-center text-gray-500 py-6">No outstanding balances</p>
              ) : (
                entities.map((row) => (
                  <div key={row.entityId} className="rounded-lg border bg-white p-4 shadow-sm">
                    <div className="font-semibold text-gray-900">{row.entityName}</div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <div>Current: <span className="text-green-600 font-medium">{fmt(row.current)}</span></div>
                      <div>1–30: <span className="text-yellow-600 font-medium">{fmt(row.days1to30)}</span></div>
                      <div>31–60: <span className="text-orange-500 font-medium">{fmt(row.days31to60)}</span></div>
                      <div>61–90: <span className="text-red-500 font-medium">{fmt(row.days61to90)}</span></div>
                      <div>90+: <span className="text-red-700 font-medium">{fmt(row.over90)}</span></div>
                      <div>Total: <span className="font-semibold">{fmt(row.total)}</span></div>
                    </div>
                  </div>
                ))
              )}
            </div>
          }
        />
      ) : (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
          <Clock className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p>Select a date to view aged balances.</p>
        </div>
      )}
    </AdaptivePage>
  );
}
