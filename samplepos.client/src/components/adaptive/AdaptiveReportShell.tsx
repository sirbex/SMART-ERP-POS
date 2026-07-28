import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useAdaptiveLayoutOptional } from './AdaptiveAppShell';
import {
  resolveReportDetailCollapsedDefault,
  resolveReportDetailMode,
  type AdaptiveReportDetailMode,
} from '../../lib/adaptiveReports';

type AdaptiveReportShellProps = {
  /** KPI / summary strip (always first on mobile). */
  summary?: ReactNode;
  /** Optional insight chips under summary. */
  insights?: ReactNode;
  /** Detail body: pass both table and cards; shell picks by tier. */
  table: ReactNode;
  cards: ReactNode;
  /** Optional reduced/compact table (falls back to table). */
  reducedTable?: ReactNode;
  className?: string;
  detailLabel?: string;
  detailModeOverride?: AdaptiveReportDetailMode;
};

/**
 * Report composition: summary-first on mobile, tier-driven detail chrome.
 * Does not change data or print backends — layout only.
 */
export function AdaptiveReportShell({
  summary,
  insights,
  table,
  cards,
  reducedTable,
  className = '',
  detailLabel = 'Details',
  detailModeOverride,
}: AdaptiveReportShellProps) {
  const layout = useAdaptiveLayoutOptional();
  const tier = layout?.tier ?? 'desktop';
  const detailMode = detailModeOverride ?? resolveReportDetailMode(tier);
  const collapseDefault = resolveReportDetailCollapsedDefault(tier);
  const [detailOpen, setDetailOpen] = useState(!collapseDefault);

  useEffect(() => {
    setDetailOpen(!resolveReportDetailCollapsedDefault(tier));
  }, [tier]);

  const detailBody =
    detailMode === 'cards'
      ? cards
      : detailMode === 'reduced'
        ? (reducedTable ?? table)
        : table;

  return (
    <div className={`space-y-4 ${className}`.trim()} data-report-detail-mode={detailMode}>
      {summary}
      {insights}

      {collapseDefault ? (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => setDetailOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-800 min-h-[var(--layout-touch-target)] hover:bg-slate-50"
            aria-expanded={detailOpen}
          >
            <span>{detailLabel}</span>
            {detailOpen ? (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-500" />
            )}
          </button>
          {detailOpen && <div className="border-t border-slate-100 p-2 sm:p-3">{detailBody}</div>}
        </div>
      ) : (
        detailBody
      )}
    </div>
  );
}
