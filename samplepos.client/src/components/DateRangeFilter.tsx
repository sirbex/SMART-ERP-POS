import { useState, useEffect } from 'react';
import { DatePicker } from './ui/date-picker';
import { formatTimestampDate } from '../utils/businessDate';

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'custom';

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  onDateRangeChange: (startDate: string, endDate: string, preset: DateRangePreset) => void;
  className?: string;
  defaultPreset?: DateRangePreset;
}

interface PresetOption {
  value: DateRangePreset;
  label: string;
  icon: string;
}

const PRESET_OPTIONS: PresetOption[] = [
  { value: 'today', label: 'Today', icon: '📅' },
  { value: 'yesterday', label: 'Yesterday', icon: '📆' },
  { value: 'this_week', label: 'This Week', icon: '📊' },
  { value: 'last_week', label: 'Last Week', icon: '📉' },
  { value: 'this_month', label: 'This Month', icon: '📈' },
  { value: 'last_month', label: 'Last Month', icon: '📋' },
  { value: 'custom', label: 'Custom', icon: '🔧' },
];

/**
 * Calculate date range based on preset
 * Uses precise date calculations with no timezone issues
 */
export function getDateRange(preset: DateRangePreset): { startDate: string; endDate: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();
  const day = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

  let start: Date;
  let end: Date;

  switch (preset) {
    case 'today':
      start = new Date(year, month, date);
      end = new Date(year, month, date);
      break;

    case 'yesterday':
      start = new Date(year, month, date - 1);
      end = new Date(year, month, date - 1);
      break;

    case 'this_week':
      // Week starts on Monday (1), ends on Sunday (0)
      const daysFromMonday = day === 0 ? 6 : day - 1; // If Sunday, go back 6 days
      start = new Date(year, month, date - daysFromMonday);
      end = new Date(year, month, date + (6 - daysFromMonday));
      break;

    case 'last_week':
      const lastWeekDaysFromMonday = day === 0 ? 6 : day - 1;
      start = new Date(year, month, date - lastWeekDaysFromMonday - 7);
      end = new Date(year, month, date - lastWeekDaysFromMonday - 1);
      break;

    case 'this_month':
      start = new Date(year, month, 1);
      end = new Date(year, month + 1, 0); // Last day of current month
      break;

    case 'last_month':
      start = new Date(year, month - 1, 1);
      end = new Date(year, month, 0); // Last day of previous month
      break;

    case 'custom':
    default:
      // Return current values for custom (user will manually adjust)
      return {
        startDate: formatDateForInput(new Date(year, month, date)),
        endDate: formatDateForInput(new Date(year, month, date)),
      };
  }

  return {
    startDate: formatDateForInput(start),
    endDate: formatDateForInput(end),
  };
}

/**
 * Format date to YYYY-MM-DD for input[type="date"]
 */
function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Reusable Date Range Filter Dropdown Component
 * 
 * Features:
 * - Preset date ranges (Today, Yesterday, Week, Month variants)
 * - Custom date range picker
 * - Automatic date calculation with precision
 * - Clean dropdown UI
 * 
 * @example
 * ```tsx
 * <DateRangeFilter
 *   startDate={startDate}
 *   endDate={endDate}
 *   onDateRangeChange={(start, end, preset) => {
 *     setStartDate(start);
 *     setEndDate(end);
 *     setDateRangePreset(preset);
 *   }}
 *   defaultPreset="today"
 * />
 * ```
 */
export default function DateRangeFilter({
  startDate,
  endDate,
  onDateRangeChange,
  className = '',
  defaultPreset = 'today',
}: DateRangeFilterProps) {
  const [selectedPreset, setSelectedPreset] = useState<DateRangePreset>(defaultPreset);
  const [showCustomDates, setShowCustomDates] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  // Initialize dates on mount
  useEffect(() => {
    // Always initialize to the provided default preset on mount
    const { startDate: start, endDate: end } = getDateRange(defaultPreset);
    onDateRangeChange(start, end, defaultPreset);
    setSelectedPreset(defaultPreset);
    setShowCustomDates(defaultPreset === 'custom');
  }, []);

  const handlePresetChange = (preset: DateRangePreset) => {
    setSelectedPreset(preset);

    if (preset === 'custom') {
      setShowCustomDates(true);
      setIsOpen(false); // Keep dropdown closed for custom
    } else {
      setShowCustomDates(false);
      const { startDate: start, endDate: end } = getDateRange(preset);
      onDateRangeChange(start, end, preset);
      setIsOpen(false); // Close dropdown after selection
    }
  };

  const handleCustomDateChange = (field: 'start' | 'end', value: string) => {
    if (field === 'start') {
      onDateRangeChange(value, endDate, 'custom');
    } else {
      onDateRangeChange(startDate, value, 'custom');
    }
  };

  const currentOption = PRESET_OPTIONS.find(opt => opt.value === selectedPreset) || PRESET_OPTIONS[0];

  return (
    <div className={`relative ${className}`}>
      {/* Dropdown Button */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700">Date Range:</label>
        <div className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors min-w-[180px]"
            type="button"
          >
            <span className="text-lg">{currentOption.icon}</span>
            <span className="flex-1 text-left font-medium">{currentOption.label}</span>
            <svg
              className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Dropdown Menu */}
          {isOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setIsOpen(false)}
              />

              {/* Menu */}
              <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg z-20 overflow-hidden">
                {PRESET_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handlePresetChange(option.value)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors text-left ${selectedPreset === option.value ? 'bg-blue-100 font-semibold' : ''
                      }`}
                    type="button"
                  >
                    <span className="text-lg">{option.icon}</span>
                    <span>{option.label}</span>
                    {selectedPreset === option.value && (
                      <span className="ml-auto text-blue-600">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Custom Date Inputs */}
      {showCustomDates && (
        <div className="flex items-center gap-3 mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex flex-col">
            <label htmlFor="custom-start-date" className="text-xs font-medium text-gray-600 mb-1">
              Start Date
            </label>
            <DatePicker
              value={startDate}
              onChange={(date) => handleCustomDateChange('start', date)}
              placeholder="Start date"
              maxDate={endDate ? new Date(endDate) : undefined}
            />
          </div>
          <span className="text-gray-400 mt-5" aria-hidden="true">→</span>
          <div className="flex flex-col">
            <label htmlFor="custom-end-date" className="text-xs font-medium text-gray-600 mb-1">
              End Date
            </label>
            <DatePicker
              value={endDate}
              onChange={(date) => handleCustomDateChange('end', date)}
              placeholder="End date"
              minDate={startDate ? new Date(startDate) : undefined}
            />
          </div>
        </div>
      )}

      {/* Date Range Display */}
      {!showCustomDates && startDate && endDate && (
        <div className="text-xs text-gray-500 mt-1 ml-20">
          {formatTimestampDate(startDate)} - {formatTimestampDate(endDate)}
        </div>
      )}
    </div>
  );
}
