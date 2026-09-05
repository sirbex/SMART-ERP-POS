/**
 * Adaptive reports policy — Phase 4 (+ enterprise filter + body SSOT).
 *
 * Learns from SAP Fiori / Dynamics analytical reports:
 *   - Primary filters (period, section/dimension, payment) are ALWAYS visible
 *   - Secondary / advanced options use progressive disclosure ("More options")
 *   - Report BODY (sections / lines) is ALWAYS visible after load — never
 *     hidden behind a "Details" accordion that leaves only KPI totals on screen
 *   - Mobile/compact use stacked or scrollable section chrome; same data as desk
 *
 * Print: always the same PrintService strategies (no device-brand forks).
 * Layout is capability/tier based — never UA / Sunmi brand forks.
 */

import type { LayoutTier } from './layoutTiers';

export type AdaptiveReportDetailMode = 'cards' | 'reduced' | 'table';

export type AdaptiveReportMetricPriority = 'primary' | 'secondary';

/**
 * Report filter disclosure — enterprise SSOT.
 * primary   = period + dimensional/navigational controls (always on screen)
 * secondary = optional toggles that do not change which section is browsable
 */
export type AdaptiveReportFilterTier = 'primary' | 'secondary';

/**
 * KPI columns — mobile is 1 so long currency (e.g. UGX) stays readable
 * on phone / handheld portrait instead of cramped 2-up cells.
 */
export function resolveReportSummaryColumns(tier: LayoutTier): 1 | 2 | 3 | 4 | 6 {
  if (tier === 'mobile') return 1;
  if (tier === 'compact') return 2;
  if (tier === 'desktop') return 4;
  return 6;
}

/**
 * Detail chrome density — never means "hide the report".
 * Mobile/compact prefer card or reduced layouts; content stays on screen.
 */
export function resolveReportDetailMode(tier: LayoutTier): AdaptiveReportDetailMode {
  if (tier === 'mobile') return 'cards';
  if (tier === 'compact') return 'reduced';
  return 'table';
}

/**
 * Enterprise rule: do not collapse the report body by default.
 * KPI summary + sections must both be visible (Fiori ALP / Dynamics pattern).
 */
export function resolveReportDetailCollapsedDefault(_tier: LayoutTier): boolean {
  return false;
}

/**
 * @deprecated Whole filter bar must never collapse (hides Section).
 */
export function resolveReportFiltersCollapsedDefault(_tier: LayoutTier): boolean {
  return false;
}

/**
 * Secondary options (Include Expenses, Stock Adj, …) start collapsed on mobile.
 * Primary filters never use this.
 */
export function resolveReportSecondaryFiltersCollapsedDefault(tier: LayoutTier): boolean {
  return tier === 'mobile';
}

/**
 * Date pickers: hide From/To until Custom on phone/Sunmi compact;
 * always show on desk for power users who compare ranges often.
 */
export function resolveReportDatePickersMode(tier: LayoutTier): 'always' | 'custom' {
  if (tier === 'mobile' || tier === 'compact') return 'custom';
  return 'always';
}

/** Page frame: tighter gutters on narrow viewports (was fixed p-6 everywhere). */
export const REPORT_PAGE_FRAME_CLASS = 'mx-auto max-w-7xl p-3 sm:p-4 md:p-6';

/** Primary filter row — stack on phone, multi-col from sm. */
export const REPORT_FILTER_PRIMARY_CLASS =
  'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 items-end';

/** @deprecated alias — prefer REPORT_FILTER_PRIMARY_CLASS */
export const REPORT_FILTER_FIELDS_CLASS = REPORT_FILTER_PRIMARY_CLASS;

export const REPORT_FILTER_LABEL_CLASS =
  'mb-1 block text-xs font-semibold text-slate-700';

export const REPORT_FILTER_CONTROL_CLASS =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 min-h-[var(--layout-touch-target)]';

/** Re-export KPI chrome from adaptiveDashboard — single global SSOT. */
export {
  REPORT_KPI_CARD_CLASS,
  REPORT_KPI_CARD_ACCENT_CLASS,
  REPORT_KPI_LABEL_CLASS,
  REPORT_KPI_VALUE_CLASS,
  REPORT_KPI_SUB_CLASS,
  REPORT_KPI_GRID_GAP_CLASS,
} from './adaptiveDashboard';

export function selectReportMetrics<T extends { priority?: AdaptiveReportMetricPriority }>(
  metrics: T[],
  tier: LayoutTier,
): T[] {
  if (tier === 'mobile') {
    const primary = metrics.filter((m) => (m.priority ?? 'primary') === 'primary');
    return primary.length > 0 ? primary : metrics;
  }
  return metrics;
}
