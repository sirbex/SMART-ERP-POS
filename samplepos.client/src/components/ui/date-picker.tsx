import React, { useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import './date-picker.css';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format, parse, isValid } from 'date-fns';

interface DatePickerProps {
  value?: string; // YYYY-MM-DD format
  onChange?: (date: string) => void;
  placeholder?: string;
  disabled?: boolean;
  maxDate?: Date;
  minDate?: Date;
  className?: string;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  placeholder = 'Pick a date',
  disabled = false,
  maxDate,
  minDate,
  className,
}) => {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value || '');

  const selectedDate = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
  const isValidDate = selectedDate && isValid(selectedDate);

  const handleDayClick = (date: Date | undefined) => {
    if (!date) return;

    const formatted = format(date, 'yyyy-MM-dd');
    setInputValue(formatted);
    onChange?.(formatted);
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);

    if (val === '') {
      onChange?.('');
      return;
    }

    const formats = ['yyyy-MM-dd', 'MM/dd/yyyy', 'dd/MM/yyyy', 'MM-dd-yyyy'];
    for (const fmt of formats) {
      const parsed = parse(val, fmt, new Date());
      if (isValid(parsed)) {
        const formatted = format(parsed, 'yyyy-MM-dd');
        onChange?.(formatted);
        setInputValue(formatted);
        break;
      }
    }
  };

  const handleQuickSelect = (days: number) => {
    const today = new Date();
    const newDate = new Date(today);
    newDate.setDate(today.getDate() - days);
    handleDayClick(newDate);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
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
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex max-h-[inherit] flex-col md:flex-row md:divide-x md:divide-gray-100">
          {/* Calendar — primary focus; grows on large screens */}
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

          {/* Actions panel — beside calendar on md+, below on mobile */}
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
                htmlFor="date-picker-manual-input"
                className="text-xs font-semibold uppercase tracking-wide text-gray-500"
              >
                Type a date
              </label>
              <input
                id="date-picker-manual-input"
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                placeholder="YYYY-MM-DD"
                className={cn(
                  'h-10 w-full rounded-md border px-3 text-sm',
                  'focus:outline-none focus:ring-2 focus:ring-blue-500',
                  'placeholder:text-gray-400',
                )}
              />
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
