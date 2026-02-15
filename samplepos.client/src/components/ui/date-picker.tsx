import React, { useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
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
  className
}) => {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value || '');

  // Parse the value to a Date object
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

    // Try to parse the input
    if (val === '') {
      onChange?.('');
      return;
    }

    // Support multiple date formats
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
            'w-full justify-start text-left font-normal',
            !isValidDate && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0" />
          {isValidDate ? format(selectedDate, 'PPP') : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-4 space-y-4">
          {/* Quick Select Buttons */}
          <div className="grid grid-cols-3 gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleQuickSelect(0)}
              className="text-xs"
            >
              Today
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleQuickSelect(1)}
              className="text-xs"
            >
              Yesterday
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleQuickSelect(7)}
              className="text-xs"
            >
              Last Week
            </Button>
          </div>

          {/* Calendar */}
          <div className="border-t pt-4">
            <DayPicker
              mode="single"
              selected={isValidDate ? selectedDate : undefined}
              onSelect={handleDayClick}
              disabled={(date) => {
                if (maxDate && date > maxDate) return true;
                if (minDate && date < minDate) return true;
                return false;
              }}
              showOutsideDays={true}
            />
          </div>

          {/* Manual Input */}
          <div className="border-t pt-4 space-y-2">
            <label className="text-xs font-medium text-gray-600">
              Or type a date (YYYY-MM-DD)
            </label>
            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              placeholder="YYYY-MM-DD"
              className={cn(
                'w-full px-3 py-2 text-sm border rounded-md',
                'focus:outline-none focus:ring-2 focus:ring-blue-500',
                'placeholder-gray-400'
              )}
            />
          </div>

          {/* Selected Date Display */}
          {isValidDate && (
            <div className="bg-blue-50 p-3 rounded text-sm">
              <p className="text-gray-700">
                <strong>Selected:</strong> {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
