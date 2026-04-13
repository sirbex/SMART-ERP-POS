/**
 * Date Range Presets
 * Centralized, deterministic date range calculations.
 *
 * Rules (per TIMEZONE_STRATEGY):
 *  - All dates are plain YYYY-MM-DD strings (no Date objects sent to API).
 *  - Calculations use local calendar day.
 *  - "Week" starts Monday (ISO).
 */

import {
    format,
    startOfDay,
    subDays,
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    subWeeks,
    subMonths,
    startOfYear,
    endOfYear,
    subYears,
} from 'date-fns';
import { getBusinessDate } from './businessDate';

// ─── Types ───────────────────────────────────────────────────────

export type DatePresetKey =
    | 'TODAY'
    | 'YESTERDAY'
    | '3_DAYS'
    | 'THIS_WEEK'
    | 'LAST_WEEK'
    | 'THIS_MONTH'
    | 'LAST_MONTH'
    | '3_MONTHS'
    | 'THIS_YEAR'
    | 'LAST_YEAR'
    | 'CUSTOM';

export interface DatePresetOption {
    key: DatePresetKey;
    label: string;
    icon: string;
}

export interface DateRange {
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
}

// ─── Ordered list shown in UI ────────────────────────────────────

export const DATE_PRESET_OPTIONS: DatePresetOption[] = [
    { key: 'TODAY', label: 'Today', icon: '📌' },
    { key: 'YESTERDAY', label: 'Yesterday', icon: '⏪' },
    { key: '3_DAYS', label: 'Last 3 Days', icon: '3️⃣' },
    { key: 'THIS_WEEK', label: 'This Week', icon: '📅' },
    { key: 'LAST_WEEK', label: 'Last Week', icon: '📆' },
    { key: 'THIS_MONTH', label: 'This Month', icon: '🗓️' },
    { key: 'LAST_MONTH', label: 'Last Month', icon: '🗓️' },
    { key: '3_MONTHS', label: 'Last 3 Months', icon: '📊' },
    { key: 'THIS_YEAR', label: 'This Year', icon: '🎯' },
    { key: 'LAST_YEAR', label: 'Last Year', icon: '📁' },
    { key: 'CUSTOM', label: 'Custom Range', icon: '✏️' },
];

// ─── Pure date calculation ──────────────────────────────────────

const fmt = (d: Date): string => format(d, 'yyyy-MM-dd');

/** Week starts Monday (locale-independent). */
const WEEK_OPTS = { weekStartsOn: 1 as const };

export function computeDateRange(preset: DatePresetKey): DateRange | null {
    const bizDate = getBusinessDate();
    const [y, m, d] = bizDate.split('-').map(Number);
    const today = startOfDay(new Date(y, m - 1, d));

    switch (preset) {
        case 'TODAY':
            return { startDate: fmt(today), endDate: fmt(today) };

        case 'YESTERDAY': {
            const yesterday = subDays(today, 1);
            return { startDate: fmt(yesterday), endDate: fmt(yesterday) };
        }

        case '3_DAYS':
            return { startDate: fmt(subDays(today, 2)), endDate: fmt(today) };

        case 'THIS_WEEK':
            return {
                startDate: fmt(startOfWeek(today, WEEK_OPTS)),
                endDate: fmt(endOfWeek(today, WEEK_OPTS)),
            };

        case 'LAST_WEEK': {
            const lastWeek = subWeeks(today, 1);
            return {
                startDate: fmt(startOfWeek(lastWeek, WEEK_OPTS)),
                endDate: fmt(endOfWeek(lastWeek, WEEK_OPTS)),
            };
        }

        case 'THIS_MONTH':
            return {
                startDate: fmt(startOfMonth(today)),
                endDate: fmt(endOfMonth(today)),
            };

        case 'LAST_MONTH': {
            const lastMonth = subMonths(today, 1);
            return {
                startDate: fmt(startOfMonth(lastMonth)),
                endDate: fmt(endOfMonth(lastMonth)),
            };
        }

        case '3_MONTHS':
            return {
                startDate: fmt(startOfMonth(subMonths(today, 2))),
                endDate: fmt(today),
            };

        case 'THIS_YEAR':
            return {
                startDate: fmt(startOfYear(today)),
                endDate: fmt(endOfYear(today)),
            };

        case 'LAST_YEAR': {
            const lastYear = subYears(today, 1);
            return {
                startDate: fmt(startOfYear(lastYear)),
                endDate: fmt(endOfYear(lastYear)),
            };
        }

        case 'CUSTOM':
            return null; // Caller keeps existing custom dates
    }
}
