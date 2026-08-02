/**
 * DatePicker — global SSOT for single-date selection in the client.
 *
 * Rules:
 * - Prefer this over `<input type="date">` or ad-hoc calendars.
 * - Value is always YYYY-MM-DD (API / Zod date-only contract).
 * - "Today" / relative quick picks use business timezone via getBusinessDate().
 * - Date ranges should use DateRangeFilter (which wraps this component).
 * - Custom typed dates commit on Enter / blur (and immediately when fully valid).
 */
import React, { useEffect, useId, useRef, useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import './date-picker.css';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, parse, isValid } from 'date-fns';
import { addDaysToDateString, getBusinessDate } from '@/utils/businessDate';

export interface DatePickerProps {
  value?: string; // YYYY-MM-DD format
  onChange?: (date: string) => void;
  placeholder?: string;
  disabled?: boolean;
  maxDate?: Date;
  minDate?: Date;
  className?: string;
  id?: string;
  required?: boolean;
  /** Accessible name when no visible label is associated */
  'aria-label'?: string;
}

/** Strict YYYY-MM-DD (avoids date-fns accepting partial junk). */
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse user-typed dates into YYYY-MM-DD.
 * Accepts ISO and common local forms (zero-padded or not).
 * Ambiguous mid-typed values (e.g. "12") return null — commit on Enter/blur/Apply.
 */
export function parseTypedDateToIso(raw: string): string | null {
  const val = raw.trim();
  if (!val) return null;

  const iso = val.match(ISO_DATE_RE);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m - 1 &&
      dt.getUTCDate() === d
    ) {
      return `${iso[1]}-${iso[2]}-${iso[3]}`;
    }
    return null;
  }

  // Need day + month + year tokens before we accept (avoid partial keystroke commits)
  const parts = val.split(/[/. -]/).filter(Boolean);
  if (parts.length !== 3) return null;
  if (parts.some((p) => !/^\d{1,4}$/.test(p))) return null;
  const yearPart = parts.find((p) => p.length === 4) ?? parts[2];
  if (yearPart.length !== 4) return null;

  const formats = [
    'dd/MM/yyyy',
    'd/M/yyyy',
    'dd-MM-yyyy',
    'd-M-yyyy',
    'MM/dd/yyyy',
    'M/d/yyyy',
    'MM-dd-yyyy',
    'M-d-yyyy',
    'dd.MM.yyyy',
    'd.M.yyyy',
    'yyyy/MM/dd',
    'yyyy/M/d',
  ];

  for (const fmt of formats) {
    const parsed = parse(val, fmt, new Date());
    if (!isValid(parsed)) continue;
    const out = format(parsed, 'yyyy-MM-dd');
    // Round-trip calendar validity (rejects 32/01/2026 overflow)
    const [yy, mm, dd] = out.split('-').map(Number);
    const check = new Date(Date.UTC(yy, mm - 1, dd));
    if (
      check.getUTCFullYear() === yy &&
      check.getUTCMonth() === mm - 1 &&
      check.getUTCDate() === dd
    ) {
      return out;
    }
  }

  return null;
}

function withinBounds(iso: string, minDate?: Date, maxDate?: Date): boolean {
  const parsed = parse(iso, 'yyyy-MM-dd', new Date());
  if (!isValid(parsed)) return false;
  if (minDate) {
    const min = new Date(minDate);
    min.setHours(0, 0, 0, 0);
    if (parsed < min) return false;
  }
  if (maxDate) {
    const max = new Date(maxDate);
    max.setHours(23, 59, 59, 999);
    if (parsed > max) return false;
  }
  return true;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  placeholder = 'Pick a date',
  disabled = false,
  maxDate,
  minDate,
  className,
  id,
  required,
  'aria-label': ariaLabel,
}) => {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value || '');
  const [typeError, setTypeError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const manualInputId = useId();

  useEffect(() => {
    setInputValue(value || '');
    setTypeError(null);
  }, [value]);

  const selectedDate = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
  const isValidDate = selectedDate && isValid(selectedDate);

  const commitIso = (iso: string | null, opts?: { close?: boolean }) => {
    if (!iso) {
      onChange?.('');
      setInputValue('');
      setTypeError(null);
      if (opts?.close) setOpen(false);
      return;
    }
    if (!withinBounds(iso, minDate, maxDate)) {
      setTypeError('Date is outside the allowed range');
      return;
    }
    setInputValue(iso);
    setTypeError(null);
    onChange?.(iso);
    if (opts?.close) setOpen(false);
  };

  const handleDayClick = (date: Date | undefined) => {
    if (!date) return;
    commitIso(format(date, 'yyyy-MM-dd'), { close: true });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    setTypeError(null);

    if (val.trim() === '') {
      onChange?.('');
      return;
    }

    // Commit immediately only when the typed value is a complete, unambiguous date
    const iso = parseTypedDateToIso(val);
    if (iso && withinBounds(iso, minDate, maxDate)) {
      onChange?.(iso);
    }
  };

  const commitTypedDate = (close = false) => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      commitIso(null, { close });
      return;
    }
    const iso = parseTypedDateToIso(trimmed);
    if (!iso) {
      setTypeError('Use YYYY-MM-DD, DD/MM/YYYY, or MM/DD/YYYY');
      return;
    }
    commitIso(iso, { close });
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      commitTypedDate(true);
    }
  };

  /** Offset from business "today" (0 = today, 1 = yesterday, 7 = last week). */
  const handleQuickSelect = (daysBack: number) => {
    const businessToday = getBusinessDate();
    const next = daysBack === 0 ? businessToday : addDaysToDateString(businessToday, -daysBack);
    commitIso(next, { close: true });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel ?? placeholder}
          aria-required={required || undefined}
          className={cn(
            'w-full min-h-10 justify-start text-left font-normal',
            !isValidDate && 'text-muted-foreground',
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
          <span className="truncate">
            {isValidDate ? format(selectedDate, 'PPP') : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        side="bottom"
        sideOffset={8}
        collisionPadding={20}
        avoidCollisions
        className={cn(
          'date-picker-popover p-0 w-[min(100vw-1.5rem,22rem)]',
          'sm:w-[min(100vw-2rem,28rem)]',
          'md:w-[min(100vw-2rem,40rem)]',
          'lg:w-[min(42rem,calc(100vw-2rem))]',
          'max-h-[min(var(--radix-popover-content-available-height),calc(100vh-1.5rem))]',
          'overflow-hidden shadow-xl border-gray-200',
        )}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          // Focus the type-in field so custom dates work immediately
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex max-h-[inherit] flex-col md:flex-row md:divide-x md:divide-gray-100">
          <div className="min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
            <DayPicker
              mode="single"
              selected={isValidDate ? selectedDate : undefined}
              onSelect={handleDayClick}
              disabled={(date) => {
                if (maxDate && date > maxDate) return true;
                if (minDate && date < minDate) return true;
                return false;
              }}
              showOutsideDays
              className="mx-auto w-fit"
            />
          </div>

          <div className="flex shrink-0 flex-col gap-4 border-t border-gray-100 p-4 sm:p-5 md:w-56 md:border-t-0 md:bg-gray-50/80">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Quick pick
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:grid-cols-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleQuickSelect(0)}
                  className="h-10 w-full text-sm"
                >
                  Today
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleQuickSelect(1)}
                  className="h-10 w-full text-sm"
                >
                  Yesterday
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleQuickSelect(7)}
                  className="h-10 w-full text-sm"
                >
                  Last week
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor={manualInputId}
                className="text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Type a date
              </label>
              <input
                ref={inputRef}
                id={manualInputId}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={inputValue}
                onChange={handleInputChange}
                onBlur={() => commitTypedDate(false)}
                onKeyDown={handleInputKeyDown}
                placeholder="YYYY-MM-DD or DD/MM/YYYY"
                className={cn(
                  'h-10 w-full rounded-md border px-3 text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-blue-500',
                  'placeholder:text-gray-400',
                  typeError ? 'border-red-400' : 'border-gray-300',
                )}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-9 flex-1"
                  onClick={() => commitTypedDate(true)}
                >
                  Apply
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-9"
                  onClick={() => commitIso(null)}
                >
                  Clear
                </Button>
              </div>
              {typeError ? (
                <p className="text-xs text-red-600">{typeError}</p>
              ) : (
                <p className="text-xs text-gray-500">
                  Press Enter or Apply after typing.
                </p>
              )}
            </div>

            {isValidDate && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-gray-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Selected
                </p>
                <p className="mt-1 font-medium leading-snug">
                  {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                </p>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DatePicker;
