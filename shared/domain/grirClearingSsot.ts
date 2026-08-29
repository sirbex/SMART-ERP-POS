/**
 * GR/IR Clearing SSOT — MR11 worklist + F.13 auto-match.
 * Server SQL clearing_status CASE mirrors resolveGrirClearingStatus; evidence tests lock both.
 */

export const GRIR_CLEARING_ROUTE = '/accounting/grir-clearing';
export const GRIR_CLEARING_API = 'grir-clearing';

export const GRIR_PAGE_SUBTITLE = 'Match GRs to supplier bills · clear 2150';

export type GrirResidualClearMethod =
  | 'TO_PRICE_VARIANCE'
  | 'TO_RETURN_CLEARING'
  | 'RECLASS_FROM_EXPENSE';

/** Short UI labels — full text in GRIR_HELP only (HelpTrigger popover). */
export const GRIR_RESIDUAL_CLEAR_METHOD_OPTIONS: ReadonlyArray<{
  value: GrirResidualClearMethod;
  label: string;
}> = [
  { value: 'TO_PRICE_VARIANCE', label: 'Price variance (5020)' },
  { value: 'TO_RETURN_CLEARING', label: 'Return clearing (2160)' },
  { value: 'RECLASS_FROM_EXPENSE', label: 'Reclass expense (6900)' },
];

/** RECLASS_FROM_EXPENSE only clears credit residual on 2150 (open GR). Mirrors server clearGlResidual. */
export function isResidualClearMethodAllowed(
  method: GrirResidualClearMethod,
  netCr: number,
): boolean {
  if (Math.abs(netCr) < 0.01) return false;
  if (method === 'RECLASS_FROM_EXPENSE') return netCr > 0.01;
  return true;
}

/** Pick a valid method before POST — avoids 400 from clear-residual. */
export function resolveResidualClearMethod(
  requested: GrirResidualClearMethod,
  netCr: number,
  recommended?: GrirResidualClearMethod,
): GrirResidualClearMethod {
  if (isResidualClearMethodAllowed(requested, netCr)) return requested;
  if (recommended && isResidualClearMethodAllowed(recommended, netCr)) return recommended;
  return netCr > 0.01 ? 'RECLASS_FROM_EXPENSE' : 'TO_PRICE_VARIANCE';
}

export function residualClearMethodBlockedReason(
  method: GrirResidualClearMethod,
  netCr: number,
): string | null {
  if (Math.abs(netCr) < 0.01) return 'Residual already cleared.';
  if (method === 'RECLASS_FROM_EXPENSE' && netCr <= 0.01) {
    return 'Reclass expense (6900) applies to credit residuals only. Use price variance (5020) for debit balance.';
  }
  return null;
}

export function grirResidualMethodLabel(method: string): string {
  const opt = GRIR_RESIDUAL_CLEAR_METHOD_OPTIONS.find((o) => o.value === method);
  return opt?.label ?? String(method).replace(/_/g, ' ');
}

/** Help copy SSOT — shown only via HelpTrigger, not inline on the page. */
export const GRIR_HELP = {
  page: {
    title: 'GR/IR Clearing',
    summary:
      'Match completed goods receipts to supplier invoices (SAP MR11). F.13 auto-match pairs GR↔bill within tolerance.',
    bullets: [
      'Work list — open GR/IR items and manual clear (MR11N).',
      'GL Residuals — true 2150 ledger balance by document when MR11 is clean but trial balance is not.',
      'Search — PO, GR, supplier, or invoice.',
      'Match candidates — F.13 preview before you run.',
    ],
  },
  residuals: {
    title: 'GL Residuals on 2150',
    when:
      'Use when AP is already posted, or the MR11 work list looks clean but trial balance still shows a balance on 2150.',
    methods: [
      {
        label: 'Reclass expense (6900)',
        detail: 'GR still open on 2150 (credit residual only). Not valid for debit balance — use price variance.',
      },
      {
        label: 'Price variance (5020)',
        detail: 'Amount gap between GR and bill, or a small write-off.',
      },
      {
        label: 'Return clearing (2160)',
        detail: 'Move polluted RGRN/SCN residual from 2150 to supplier return clearing 2160.',
      },
    ],
    note: 'Never double-posts AP — only adjusts 2150 and the target account.',
  },
  autoMatch: {
    title: 'Automatic clearing (F.13)',
    body:
      'Matches goods receipts to supplier invoices via GR links, same PO, or internal GR reference. Pairs are 1:1 (best fit) within tolerance %. If the bill is not posted to GL, F.13 posts 2150 / 2100 / 5020. If already posted, only the clearing record is written.',
  },
  autoMatchEmpty: {
    title: 'No match candidates',
    body:
      'No open GR↔bill pairs to clear. Common causes: no invoice linked to the GR/PO, pair already cleared, empty GR lines, or supplier filter too narrow. Use GL Residuals for remaining 2150 without a bill pair.',
  },
  tolerance: {
    title: 'Tolerance %',
    body: 'Amount difference ≤ this % of GR value can still match; variance posts to 5020.',
  },
} as const;

export const F13_DEFAULT_TOLERANCE_PERCENT = 2;

export type GrirClearingStatus =
  | 'UNMATCHED'
  | 'MATCHED'
  | 'VARIANCE'
  | 'CLEARED'
  | 'OPEN'
  | 'PARTIALLY_MATCHED';

/** Whitelist for MR11 status filter (never interpolate raw query strings). */
export const OPEN_STATUS_WHITELIST = new Set<string>([
  'UNMATCHED',
  'MATCHED',
  'VARIANCE',
  'CLEARED',
]);

export const OPEN_STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'UNMATCHED', label: 'Unmatched' },
  { value: 'MATCHED', label: 'Matched' },
  { value: 'VARIANCE', label: 'Variance' },
];

export const GRIR_CLEARING_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open',
  UNMATCHED: 'Unmatched',
  PARTIALLY_MATCHED: 'Partial',
  MATCHED: 'Matched',
  VARIANCE: 'Variance',
  CLEARED: 'Cleared',
};

export function grirClearingStatusLabel(status: string): string {
  const key = String(status || '').toUpperCase();
  return GRIR_CLEARING_STATUS_LABELS[key] ?? String(status || '').replace(/_/g, ' ');
}

export function normalizeOpenStatusFilter(raw?: string | null): string | null {
  if (!raw || !String(raw).trim()) return null;
  const s = String(raw).trim().toUpperCase();
  if (s === 'PARTIALLY_MATCHED') return 'VARIANCE';
  if (OPEN_STATUS_WHITELIST.has(s)) return s;
  return null;
}

export function parseF13TolerancePercent(raw: string | number | null | undefined): number {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''));
  return Number.isFinite(n) && n >= 0 ? n : F13_DEFAULT_TOLERANCE_PERCENT;
}

export interface GrirClearingWorklistRow {
  clearingStatus?: string | null;
  invoiceId?: string | null;
}

/** MR11N manual clear — bill linked and not already matched/cleared. */
export function canShowManualClearAction(row: GrirClearingWorklistRow): boolean {
  const st = String(row.clearingStatus || '').toUpperCase();
  return st !== 'MATCHED' && st !== 'CLEARED' && Boolean(row.invoiceId);
}

export interface ResolveGrirClearingStatusInput {
  gcStatus?: string | null;
  invoiceId?: string | null;
  grAmount?: number | null;
  invoiceAmount?: number | null;
}

/**
 * Mirrors repository CASE clearing_status (gc prefer → unmatched → exact → variance).
 */
export function resolveGrirClearingStatus(input: ResolveGrirClearingStatusInput): GrirClearingStatus {
  const gc = String(input.gcStatus || '').toUpperCase();
  if (gc === 'MATCHED' || gc === 'VARIANCE') return gc;
  if (!input.invoiceId) return 'UNMATCHED';
  const gr = Number(input.grAmount) || 0;
  const inv = Number(input.invoiceAmount) || 0;
  if (Math.abs(gr - inv) < 0.01) return 'MATCHED';
  return 'VARIANCE';
}

export interface GrirOpenListPagination {
  page: number;
  total: number;
  totalPages: number;
  limit: number;
}

/** Never silently treat failed/malformed API bodies as empty lists. */
export function unwrapGrirOpenPayload(body: unknown): {
  rows: unknown[];
  pagination: GrirOpenListPagination | null;
} {
  if (!body || typeof body !== 'object') {
    return { rows: [], pagination: null };
  }
  const api = body as { success?: boolean; data?: unknown; error?: string; message?: string };
  if (api.success === false) {
    throw new Error(api.error || api.message || 'GR/IR open list request failed');
  }
  const inner = api.data;
  if (Array.isArray(inner)) {
    return { rows: inner, pagination: null };
  }
  if (inner && typeof inner === 'object') {
    const page = inner as {
      data?: unknown;
      total?: number;
      page?: number;
      limit?: number;
      totalPages?: number;
    };
    if (Array.isArray(page.data)) {
      return {
        rows: page.data,
        pagination: {
          page: Number(page.page) || 1,
          total: Number(page.total ?? page.data.length),
          totalPages: Number(page.totalPages) || 1,
          limit: Number(page.limit) || page.data.length,
        },
      };
    }
  }
  return { rows: [], pagination: null };
}

/** Standard list/search/candidates — array or { success, data: rows }. */
export function unwrapGrirListPayload(body: unknown): unknown[] {
  if (!body || typeof body !== 'object') return [];
  const api = body as { success?: boolean; data?: unknown; error?: string; message?: string };
  if (api.success === false) {
    throw new Error(api.error || api.message || 'GR/IR list request failed');
  }
  if (Array.isArray(api.data)) return api.data;
  if (Array.isArray(body)) return body;
  return [];
}

export interface GrirAutoMatchResult {
  matched: number;
  withVariance: number;
  skipped: number;
  failures?: Array<{ grNumber: string; invoiceNumber: string; error: string }>;
}

export function unwrapGrirAutoMatchPayload(body: unknown): GrirAutoMatchResult {
  if (!body || typeof body !== 'object') {
    throw new Error('Auto-match returned no data');
  }
  const api = body as { success?: boolean; data?: unknown; error?: string; message?: string };
  if (api.success === false) {
    throw new Error(api.error || api.message || 'Auto-match failed');
  }
  const data = api.data as GrirAutoMatchResult | undefined;
  if (!data || typeof data !== 'object') {
    throw new Error('Auto-match returned no result');
  }
  return {
    matched: Number(data.matched) || 0,
    withVariance: Number(data.withVariance) || 0,
    skipped: Number(data.skipped) || 0,
    failures: Array.isArray(data.failures) ? data.failures : [],
  };
}
