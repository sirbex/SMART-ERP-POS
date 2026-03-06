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
 * Preset selection lives in a dropdown. Date pickers only appear
 * when the "Custom Range" preset is active.
 * The parent's date strings remain the single source of truth.
 */

import React, { useState, useCallback, useEffect } from 'react';
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
}) => {
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

    return (
        <div className={cn('space-y-3', className)}>
            {/* Label + Dropdown row */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                {label && (
                    <label
                        htmlFor="date-range-preset"
                        className="text-sm font-semibold text-gray-700 whitespace-nowrap"
                    >
                        📅 {label}
                    </label>
                )}

                <select
                    id="date-range-preset"
                    value={activePreset}
                    onChange={(e) => handlePresetChange(e.target.value as DatePresetKey)}
                    className="w-full sm:w-64 px-3 py-2 border-2 border-gray-300 rounded-lg text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all cursor-pointer"
                    aria-label="Select date range"
                >
                    {DATE_PRESET_OPTIONS.map((opt) => (
                        <option key={opt.key} value={opt.key}>
                            {opt.icon} {opt.label}
                        </option>
                    ))}
                </select>

            </div>

            {/* Date pickers — always visible so user can adjust dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    {!compact && (
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                            From
                        </label>
                    )}
                    <DatePicker
                        value={startDate}
                        onChange={handleStartChange}
                        placeholder="Start date"
                        maxDate={endDate ? new Date(endDate) : undefined}
                    />
                </div>
                <div>
                    {!compact && (
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                            To
                        </label>
                    )}
                    <DatePicker
                        value={endDate}
                        onChange={handleEndChange}
                        placeholder="End date"
                        minDate={startDate ? new Date(startDate) : undefined}
                    />
                </div>
            </div>
        </div>
    );
};
