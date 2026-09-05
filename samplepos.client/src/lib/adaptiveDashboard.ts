/**
 * Adaptive KPI strip density — GLOBAL SSOT for Dashboard, Sales, Reports, Accounting.
 *
 * Enterprise rule (Fiori / Dynamics overview tiles):
 *   - Phone / handheld: never full-width towers for a single amount (2-up minimum
 *     unless the shell explicitly requests 1-col long currency via report summary)
 *   - Neutral (white) and accent (gradient) tiles share padding + value scale
 *   - Capability-based — no device-brand forks
 *
 * Consumers MUST import chrome from here (or AdaptiveReportSummary which does).
 */

/** Neutral KPI strip grid — Dashboard home */
export const DASHBOARD_KPI_GRID_CLASS =
  'grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4';

export const DASHBOARD_KPI_CARD_CLASS =
  'bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-5 hover:shadow-md transition-shadow min-w-0';

export const DASHBOARD_KPI_LABEL_CLASS =
  'text-xs sm:text-sm font-medium text-gray-500 truncate pr-1';

export const DASHBOARD_KPI_VALUE_CLASS =
  'text-lg sm:text-2xl font-bold tabular-nums leading-tight break-words';

export const DASHBOARD_KPI_SUB_CLASS = 'text-[11px] sm:text-xs text-gray-400 mt-0.5 sm:mt-1';

export const DASHBOARD_KPI_ICON_WRAP_CLASS =
  'w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center shrink-0';

export const DASHBOARD_KPI_ICON_CLASS = 'w-4 h-4 sm:w-5 sm:h-5';

export const DASHBOARD_PAGE_PAD_CLASS = 'p-3 sm:p-6 lg:p-8';

/** Standalone pages (no AdaptivePage vertical rhythm). */
export const DASHBOARD_PAGE_FRAME_CLASS = `${DASHBOARD_PAGE_PAD_CLASS} space-y-4 sm:space-y-6`;

/**
 * Use with AdaptivePage — pad only; AdaptivePage owns space-y so we do not
 * stack two vertical rhythms (was causing a large empty band under the shell).
 */
export const ADAPTIVE_PAGE_PAD_CLASS = DASHBOARD_PAGE_PAD_CLASS;

/**
 * Worklist filter/search card around AdaptiveToolbar — GLOBAL pad SSOT.
 * Do not invent p-4 vs p-2.5 forks per page.
 */
export const ADAPTIVE_TOOLBAR_CARD_CLASS =
  'bg-white rounded-lg border border-gray-200 p-2 sm:p-3';

/**
 * Inventory / catalog worklist AdaptivePage defaults — GLOBAL consistency.
 * Dense header + toolbar beside title; Filters = AdaptiveToolbar popover.
 * Every worklist toolbar MUST include AdaptiveSearch (fills leftover width).
 */
export const ADAPTIVE_WORKLIST_DENSITY = 'dense' as const;

/** Debounce for server-backed worklist search (PO / GR / Movements / Returns). */
export const ADAPTIVE_WORKLIST_SEARCH_DEBOUNCE_MS = 300;

/**
 * Worklist Filters popover body — GLOBAL phone-fit SSOT.
 * 2-up grid from the smallest width; dense labels; pair short fields.
 */
export const ADAPTIVE_FILTER_PANEL_CLASS = 'w-full space-y-2';

export const ADAPTIVE_FILTER_GRID_CLASS = 'grid grid-cols-2 gap-2';

export const ADAPTIVE_FILTER_FIELD_CLASS = 'min-w-0';

export const ADAPTIVE_FILTER_LABEL_CLASS =
  'block text-[11px] font-medium text-stone-600 mb-0.5 leading-tight';

export const ADAPTIVE_FILTER_CONTROL_CLASS =
  'w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[var(--layout-touch-target)]';

export const ADAPTIVE_FILTER_DONE_CLASS =
  'w-full rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white min-h-[var(--layout-touch-target)]';

/**
 * Accent / gradient KPI strip — Sales Analytics overview, similar surfaces.
 * 2-up on phone; 5-up only on wide (xl).
 */
export const KPI_ACCENT_GRID_CLASS =
  'grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5 sm:gap-4';

export const KPI_ACCENT_CARD_BASE_CLASS =
  'rounded-lg shadow p-3 sm:p-5 text-white min-w-0 bg-gradient-to-br';

export const KPI_ACCENT_LABEL_CLASS = 'text-xs sm:text-sm font-medium opacity-90';

export const KPI_ACCENT_VALUE_CLASS =
  'text-lg sm:text-2xl font-bold mt-1 sm:mt-2 tabular-nums leading-tight break-words';

export const KPI_ACCENT_SUB_CLASS = 'text-[11px] sm:text-sm mt-1 sm:mt-2 opacity-75';

export const KPI_ACCENT_TONES = {
  blue: 'from-blue-500 to-blue-600',
  green: 'from-green-500 to-green-600',
  purple: 'from-purple-500 to-purple-600',
  orange: 'from-orange-500 to-orange-600',
  pink: 'from-pink-500 to-pink-600',
} as const;

export type KpiAccentTone = keyof typeof KPI_ACCENT_TONES;

export function kpiAccentCardClass(tone: KpiAccentTone): string {
  return `${KPI_ACCENT_CARD_BASE_CLASS} ${KPI_ACCENT_TONES[tone]}`;
}

/**
 * Report / accounting summary tiles — same density as Dashboard neutral KPIs.
 * AdaptiveReportSummary MUST use these (single chrome SSOT).
 */
export const REPORT_KPI_CARD_CLASS =
  'rounded-xl border border-slate-200 bg-white px-3 py-2.5 sm:px-3.5 sm:py-3 min-w-0';

export const REPORT_KPI_CARD_ACCENT_CLASS =
  'rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white px-3 py-2.5 sm:px-3.5 sm:py-3 min-w-0';

export const REPORT_KPI_LABEL_CLASS =
  'text-[11px] font-semibold uppercase tracking-wide text-slate-600';

export const REPORT_KPI_VALUE_CLASS =
  'mt-1 text-base font-bold tabular-nums leading-snug break-words sm:text-lg';

export const REPORT_KPI_SUB_CLASS = 'mt-0.5 text-[11px] sm:text-xs font-medium text-slate-600';

/** Gap for report summary grids (columns come from resolveReportSummaryColumns). */
export const REPORT_KPI_GRID_GAP_CLASS = 'grid gap-2.5 sm:gap-3';

/**
 * Worklist / module summary strips (PO status counts, stock KPIs, etc.).
 * Same enterprise rule as Dashboard: never full-width single towers on phone.
 * Prefer AdaptiveKpiStrip — do not hand-roll `grid-cols-1 …` KPI grids.
 */
export const WORKLIST_KPI_CARD_CLASS = DASHBOARD_KPI_CARD_CLASS;
export const WORKLIST_KPI_LABEL_CLASS = DASHBOARD_KPI_LABEL_CLASS;
export const WORKLIST_KPI_VALUE_CLASS = DASHBOARD_KPI_VALUE_CLASS;
export const WORKLIST_KPI_SUB_CLASS = DASHBOARD_KPI_SUB_CLASS;

/** 4-up worklist (common inventory/dashboard counts). */
export const WORKLIST_KPI_GRID_4_CLASS =
  'grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4';

/** 5-up worklist (e.g. status + value). */
export const WORKLIST_KPI_GRID_5_CLASS =
  'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4';

/** 6-up worklist (PO totals strip). */
export const WORKLIST_KPI_GRID_6_CLASS =
  'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-4';

/**
 * Resolve worklist KPI grid by metric count.
 * Always ≥2 columns on the narrowest layout.
 */
export function worklistKpiGridClass(count: number): string {
  if (count <= 4) return WORKLIST_KPI_GRID_4_CLASS;
  if (count === 5) return WORKLIST_KPI_GRID_5_CLASS;
  return WORKLIST_KPI_GRID_6_CLASS;
}
