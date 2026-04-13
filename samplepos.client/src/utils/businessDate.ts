/**
 * Business Date & Timestamp Utilities — Frontend
 * SAP-style: all timestamps stored in UTC, display in company timezone.
 * Must match the backend BUSINESS_TIMEZONE in dateRange.ts.
 */
export const BUSINESS_TIMEZONE = 'Africa/Kampala';

const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

/** Returns today's date in business timezone as 'YYYY-MM-DD' */
export function getBusinessDate(): string {
    return dtf.format(new Date());
}

/**
 * Format a UTC ISO timestamp for display in the business timezone.
 * Input: ISO 8601 string (e.g. '2026-04-12T07:00:00.000Z')
 * Output: Localized date+time string in business TZ (e.g. '12/04/2026, 10:00:00 AM')
 */
export function formatTimestamp(isoString: string | null | undefined): string {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return String(isoString);
    return date.toLocaleString('en-GB', { timeZone: BUSINESS_TIMEZONE });
}

/**
 * Format a UTC ISO timestamp as a date-only string in the business timezone.
 * Input: ISO 8601 string
 * Output: 'DD/MM/YYYY' in business TZ
 */
export function formatTimestampDate(isoString: string | null | undefined): string {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return String(isoString);
    return date.toLocaleDateString('en-GB', { timeZone: BUSINESS_TIMEZONE });
}

/**
 * Format a UTC ISO timestamp as a time-only string in the business timezone.
 * Input: ISO 8601 string
 * Output: 'HH:MM:SS' in business TZ
 */
export function formatTimestampTime(isoString: string | null | undefined): string {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return String(isoString);
    return date.toLocaleTimeString('en-GB', { timeZone: BUSINESS_TIMEZONE });
}

/**
 * Add (or subtract) days from a 'YYYY-MM-DD' date string.
 * Pure arithmetic — no timezone drift.
 */
export function addDaysToDateString(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const ms = Date.UTC(y, m - 1, d, 12, 0, 0) + days * 86_400_000;
    const dt = new Date(ms);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
