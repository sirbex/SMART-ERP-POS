/**
 * Timezone-aware date range utility for ERP report queries.
 *
 * Converts user-facing date range (local calendar dates YYYY-MM-DD) into
 * UTC TIMESTAMPTZ boundaries suitable for PostgreSQL queries.
 *
 * This fixes the classic ERP timezone bug where DATE(timestamptz) evaluates
 * in UTC, causing sales made in early morning local time to appear on the
 * wrong calendar date in reports.
 *
 * Example:
 *   toUtcRange('2026-04-04', '2026-04-04', 'Africa/Kampala')
 *   → { startUtc: '2026-04-03T21:00:00.000Z', endUtc: '2026-04-04T21:00:00.000Z' }
 *
 * SQL usage:
 *   WHERE column >= $startUtc AND column < $endUtc
 *
 * Works correctly for both DATE and TIMESTAMPTZ columns when the PostgreSQL
 * session timezone is set to UTC (as ours is in pool.ts).
 */

/** Canonical business timezone for all date-range conversions. */
export const BUSINESS_TIMEZONE = 'Africa/Kampala';

export function toUtcRange(
  startDate: string,
  endDate: string,
  timezone: string
): { startUtc: string; endUtc: string } {
  return {
    startUtc: localMidnightToUtc(startDate, timezone),
    endUtc: localMidnightToUtc(nextDay(endDate), timezone),
  };
}

/**
 * Convert 'YYYY-MM-DD' midnight in a timezone to a UTC ISO-8601 string.
 * E.g. localMidnightToUtc('2026-04-04', 'Africa/Kampala') → '2026-04-03T21:00:00.000Z'
 */
function localMidnightToUtc(dateStr: string, timezone: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const offsetMs = tzOffsetMs(y, m, d, timezone);
  return new Date(Date.UTC(y, m - 1, d) - offsetMs).toISOString();
}

/**
 * Get the next calendar day as 'YYYY-MM-DD'.
 * Handles month/year rollover via Date.UTC auto-correction.
 */
function nextDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

/**
 * Compute the UTC offset (in ms) for a given date in an IANA timezone.
 * Positive means ahead of UTC (e.g. Africa/Kampala UTC+3 = +10_800_000).
 * Uses noon to safely avoid DST-transition edge cases.
 */
function tzOffsetMs(year: number, month: number, day: number, tz: string): number {
  const ref = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const utcStr = ref.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = ref.toLocaleString('en-US', { timeZone: tz });
  return new Date(tzStr).getTime() - new Date(utcStr).getTime();
}

/**
 * Return today's date as 'YYYY-MM-DD' in the business timezone.
 *
 * Fixes the classic bug where `new Date().toLocaleDateString('en-CA')` or
 * `.toISOString().slice(0,10)` returns the UTC date, causing sales made
 * between midnight and 03:00 EAT (21:00–00:00 UTC) to land on the wrong day.
 */
export function getBusinessDate(tz: string = BUSINESS_TIMEZONE): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}
