import type { CSSProperties, ReactNode } from 'react';
import { useAdaptiveLayoutOptional } from './AdaptiveAppShell';
import {
  resolveReportSummaryColumns,
  selectReportMetrics,
  type AdaptiveReportMetricPriority,
} from '../../lib/adaptiveReports';

export type AdaptiveReportMetric = {
  id: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
  toneClassName?: string;
  priority?: AdaptiveReportMetricPriority;
};

type AdaptiveReportSummaryProps = {
  metrics: AdaptiveReportMetric[];
  className?: string;
  /** Force column count (tests). Default: from layout tier. */
  columnsOverride?: 2 | 3 | 4 | 6;
};

/**
 * Tier-driven KPI summary strip — mobile emphasizes primary metrics.
 */
export function AdaptiveReportSummary({
  metrics,
  className = '',
  columnsOverride,
}: AdaptiveReportSummaryProps) {
  const layout = useAdaptiveLayoutOptional();
  const tier = layout?.tier ?? 'desktop';
  const columns = columnsOverride ?? resolveReportSummaryColumns(tier);
  const visible = selectReportMetrics(metrics, tier);

  const style = {
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
  } as CSSProperties;

  if (visible.length === 0) return null;

  return (
    <div
      className={`grid gap-2 lg:gap-3 ${className}`.trim()}
      style={style}
      data-report-summary="true"
      data-summary-columns={columns}
    >
      {visible.map((k) => (
        <div
          key={k.id}
          className={`rounded-xl border px-3 py-2.5 ${
            k.accent
              ? 'border-blue-200 bg-gradient-to-br from-blue-50 to-white'
              : 'border-slate-200 bg-white'
          }`}
          data-metric-priority={k.priority ?? 'primary'}
        >
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            {k.label}
          </div>
          <div
            className={`mt-0.5 text-sm font-semibold tabular-nums sm:text-base ${
              k.toneClassName || 'text-slate-900'
            }`}
          >
            {k.value}
          </div>
          {k.sub != null && (
            <div className="mt-0.5 text-[11px] text-slate-500">{k.sub}</div>
          )}
        </div>
      ))}
    </div>
  );
}
