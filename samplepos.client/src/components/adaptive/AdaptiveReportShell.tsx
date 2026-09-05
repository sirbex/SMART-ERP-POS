import type { ReactNode } from 'react';
import { useAdaptiveLayoutOptional } from './AdaptiveAppShell';
import {
  resolveReportDetailMode,
  type AdaptiveReportDetailMode,
} from '../../lib/adaptiveReports';

type AdaptiveReportShellProps = {
  /** KPI / summary strip (always first). */
  summary?: ReactNode;
  /** Optional insight chips under summary. */
  insights?: ReactNode;
  /** Detail body: pass both table and cards; shell picks by tier. */
  table: ReactNode;
  /**
   * Mobile/card presentation of the SAME report sections/lines — not a KPI
   * duplicate. Prefer real rows/sections; fall back to table if omitted.
   */
  cards?: ReactNode;
  /** Optional reduced/compact table (falls back to table). */
  reducedTable?: ReactNode;
  className?: string;
  /** @deprecated Accordion chrome removed — body is always visible. */
  detailLabel?: string;
  detailModeOverride?: AdaptiveReportDetailMode;
};

/**
 * Report composition: KPIs + always-visible body (enterprise analytical pattern).
 * Tier only changes chrome density (cards / reduced / table) — never hides content.
 */
export function AdaptiveReportShell({
  summary,
  insights,
  table,
  cards,
  reducedTable,
  className = '',
  detailModeOverride,
}: AdaptiveReportShellProps) {
  const layout = useAdaptiveLayoutOptional();
  const tier = layout?.tier ?? 'desktop';
  const detailMode = detailModeOverride ?? resolveReportDetailMode(tier);

  const detailBody =
    detailMode === 'cards'
      ? (cards ?? reducedTable ?? table)
      : detailMode === 'reduced'
        ? (reducedTable ?? table)
        : table;

  return (
    <div
      className={`space-y-4 ${className}`.trim()}
      data-report-detail-mode={detailMode}
      data-report-body-visible="true"
    >
      {summary}
      {insights}
      <div data-report-detail-body="true">{detailBody}</div>
    </div>
  );
}
