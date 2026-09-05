import type { CSSProperties, ReactNode } from 'react';
import { useAdaptiveLayoutOptional } from './AdaptiveAppShell';
import {
  REPORT_KPI_CARD_ACCENT_CLASS,
  REPORT_KPI_CARD_CLASS,
  REPORT_KPI_GRID_GAP_CLASS,
  REPORT_KPI_LABEL_CLASS,
  REPORT_KPI_SUB_CLASS,
  REPORT_KPI_VALUE_CLASS,
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
  columnsOverride?: 1 | 2 | 3 | 4 | 6;
};

/**
 * Tier-driven KPI summary — chrome from adaptiveDashboard SSOT (global).
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
      className={`${REPORT_KPI_GRID_GAP_CLASS} ${className}`.trim()}
      style={style}
      data-report-summary="true"
      data-summary-columns={columns}
      data-summary-tier={tier}
      data-kpi-ssot="adaptiveDashboard"
    >
      {visible.map((k) => (
        <div
          key={k.id}
          className={k.accent ? REPORT_KPI_CARD_ACCENT_CLASS : REPORT_KPI_CARD_CLASS}
          data-metric-priority={k.priority ?? 'primary'}
        >
          <div className={REPORT_KPI_LABEL_CLASS}>{k.label}</div>
          <div className={`${REPORT_KPI_VALUE_CLASS} ${k.toneClassName || 'text-slate-900'}`}>
            {k.value}
          </div>
          {k.sub != null && <div className={REPORT_KPI_SUB_CLASS}>{k.sub}</div>}
        </div>
      ))}
    </div>
  );
}
