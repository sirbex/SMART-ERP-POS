import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useAdaptiveLayoutOptional } from './AdaptiveAppShell';
import { resolveReportSecondaryFiltersCollapsedDefault } from '../../lib/adaptiveReports';

type AdaptiveReportFiltersProps = {
  /**
   * Always-visible controls: period, section/dimension, payment method, etc.
   * Enterprise rule: navigational / dimensional filters must never be hidden.
   */
  primary: ReactNode;
  /**
   * Optional advanced toggles (include expenses, stock adj, …).
   * Progressive disclosure only — never put Section here.
   */
  secondary?: ReactNode;
  secondaryLabel?: string;
  className?: string;
  /** data-report-filters value for evidence / tests */
  dataAttr?: string;
  /** Force secondary collapsed default (tests). */
  secondaryCollapsedOverride?: boolean;
};

/**
 * Enterprise report filter bar (Fiori / Dynamics style):
 * primary always on screen; secondary behind "More options" on narrow tiers.
 */
export function AdaptiveReportFilters({
  primary,
  secondary,
  secondaryLabel = 'More options',
  className = '',
  dataAttr = 'true',
  secondaryCollapsedOverride,
}: AdaptiveReportFiltersProps) {
  const layout = useAdaptiveLayoutOptional();
  const tier = layout?.tier ?? 'desktop';
  const collapseSecondaryDefault =
    secondaryCollapsedOverride ??
    resolveReportSecondaryFiltersCollapsedDefault(tier);
  const [secondaryOpen, setSecondaryOpen] = useState(!collapseSecondaryDefault);

  useEffect(() => {
    setSecondaryOpen(
      !(
        secondaryCollapsedOverride ??
        resolveReportSecondaryFiltersCollapsedDefault(tier)
      ),
    );
  }, [tier, secondaryCollapsedOverride]);

  const hasSecondary = secondary != null;

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 space-y-3 sm:space-y-4 ${className}`.trim()}
      data-report-filters={dataAttr}
      data-report-filters-primary="true"
      data-report-filters-collapsed="false"
      data-report-secondary-collapsed={
        hasSecondary ? (secondaryOpen ? 'false' : 'true') : undefined
      }
    >
      <div data-report-filters-primary-slot="true">{primary}</div>

      {hasSecondary ? (
        collapseSecondaryDefault ? (
          <div
            className="rounded-lg border border-slate-100 bg-slate-50/80 overflow-hidden"
            data-report-filters-secondary="true"
          >
            <button
              type="button"
              onClick={() => setSecondaryOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-slate-700 min-h-[var(--layout-touch-target)] hover:bg-slate-100/80"
              aria-expanded={secondaryOpen}
            >
              <span>{secondaryLabel}</span>
              {secondaryOpen ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
              )}
            </button>
            {secondaryOpen ? (
              <div className="space-y-3 border-t border-slate-100 bg-white p-3">
                {secondary}
              </div>
            ) : null}
          </div>
        ) : (
          <div
            className="space-y-3 border-t border-slate-100 pt-3"
            data-report-filters-secondary="true"
          >
            {secondary}
          </div>
        )
      ) : null}
    </div>
  );
}
