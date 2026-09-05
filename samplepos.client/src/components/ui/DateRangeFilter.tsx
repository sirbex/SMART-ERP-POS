/**
 * DateRangeFilter — reusable date-range selector with dropdown presets.
 *
 * Usage:
 *   <DateRangeFilter
 *     startDate={startDate}
 *     endDate={endDate}
 *     onStartDateChange={setStartDate}
 *     onEndDateChange={setEndDate}
 *   />
 *
 * Preset lives in a dropdown. With pickersMode="auto" (default for compact
 * screens / modern reports), date pickers appear only for Custom Range —
 * otherwise a readable period summary is shown.
 * The parent's date strings remain the single source of truth.
 */

import React, { useState, useCallback, useEffect, useId, useMemo } from 'react';
import { format, parse, isValid } from 'date-fns';
import { DatePicker } from '@/components/ui/date-picker';
import {
    DatePresetKey,
    DATE_PRESET_OPTIONS,
    computeDateRange,
} from '@/utils/dateRangePresets';
import { cn } from '@/lib/utils';

interface DateRangeFilterProps {
    /** Current start date (YYYY-MM-DD) */
    startDate: string;
    /** Current end date (YYYY-MM-DD) */
    endDate: string;
    /** Callback when start date changes */
    onStartDateChange: (date: string) => void;
    /** Callback when end date changes */
    onEndDateChange: (date: string) => void;
    /** Additional CSS class */
    className?: string;
    /** Label for the whole section (default: "Date Range") */
    label?: string;
    /** Compact layout — hides labels on date pickers */
    compact?: boolean;
    /** Default preset to apply on mount (default: 'THIS_MONTH') */
    defaultPreset?: DatePresetKey;
    /**
     * When to show From/To pickers:
     * - always: always show (legacy reports)
     * - custom: only when Custom Range is selected (modern / responsive)
     */
    pickersMode?: 'always' | 'custom';
}

function formatPeriodLabel(startDate: string, endDate: string): string {
    const start = startDate ? parse(startDate, 'yyyy-MM-dd', new Date()) : null;
    const end = endDate ? parse(endDate, 'yyyy-MM-dd', new Date()) : null;
    if (!start || !end || !isValid(start) || !isValid(end)) {
        return startDate && endDate ? `${startDate} → ${endDate}` : 'Select a period';
    }
    if (startDate === endDate) return format(start, 'MMM d, yyyy');
    if (start.getFullYear() === end.getFullYear()) {
        return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
    }
    return `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`;
}

export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
    startDate,
    endDate,
    onStartDateChange,
    onEndDateChange,
    className,
    label = 'Date Range',
    compact = false,
    defaultPreset = 'THIS_MONTH',
    pickersMode = 'always',
}) => {
    const presetId = useId();
    const [activePreset, setActivePreset] = useState<DatePresetKey>(defaultPreset);

    // Apply default preset on mount (only once)
    useEffect(() => {
        if (!startDate && !endDate && defaultPreset !== 'CUSTOM') {
            const range = computeDateRange(defaultPreset);
            if (range) {
                onStartDateChange(range.startDate);
                onEndDateChange(range.endDate);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Intentionally run only on mount

    const handlePresetChange = useCallback(
        (key: DatePresetKey) => {
            setActivePreset(key);
            if (key === 'CUSTOM') return; // Keep existing dates, show pickers

            const range = computeDateRange(key);
            if (range) {
                onStartDateChange(range.startDate);
                onEndDateChange(range.endDate);
            }
        },
        [onStartDateChange, onEndDateChange],
    );

    const handleStartChange = useCallback(
        (date: string) => {
            setActivePreset('CUSTOM');
            onStartDateChange(date);
        },
        [onStartDateChange],
    );

    const handleEndChange = useCallback(
        (date: string) => {
            setActivePreset('CUSTOM');
            onEndDateChange(date);
        },
        [onEndDateChange],
    );

    const showPickers = pickersMode === 'always' || activePreset === 'CUSTOM';
    const periodSummary = useMemo(
        () => formatPeriodLabel(startDate, endDate),
        [startDate, endDate],
    );

    return (
        <div className={cn('space-y-3', className)}>
            <div className="flex flex-col gap-2">
                {label && (
                    <label
                        htmlFor={presetId}
                        className="text-xs font-semibold uppercase tracking-wide text-slate-600"
                    >
                        {label}
                    </label>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <select
                        id={presetId}
                        value={activePreset}
                        onChange={(e) => handlePresetChange(e.target.value as DatePresetKey)}
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 sm:max-w-xs"
                        aria-label="Select date range"
                    >
                        {DATE_PRESET_OPTIONS.map((opt) => (
                            <option key={opt.key} value={opt.key}>
                                {opt.label}
                            </option>
                        ))}
                    </select>

                    {!showPickers && (
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 sm:h-10">
                            <span className="text-sm font-medium tabular-nums text-slate-700">
                                {periodSummary}
                            </span>
                            <button
                                type="button"
                                onClick={() => setActivePreset('CUSTOM')}
                                className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                            >
                                Custom dates
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {showPickers && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="min-w-0">
                        {!compact && (
                            <label className="mb-1 block text-xs font-medium text-slate-500">
                                From
                            </label>
                        )}
                        <DatePicker
                            value={startDate}
                            onChange={handleStartChange}
                            placeholder="Start date"
                            maxDate={endDate ? new Date(endDate) : undefined}
                            className="w-full"
                        />
                    </div>
                    <div className="min-w-0">
                        {!compact && (
                            <label className="mb-1 block text-xs font-medium text-slate-500">
                                To
                            </label>
                        )}
                        <DatePicker
                            value={endDate}
                            onChange={handleEndChange}
                            placeholder="End date"
                            minDate={startDate ? new Date(startDate) : undefined}
                            className="w-full"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
