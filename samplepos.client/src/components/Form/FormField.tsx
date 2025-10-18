/**
 * Reusable Form Field Component
 * Consistent labeled inputs across the entire application
 */

import React from 'react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';

export interface FormFieldProps {
  label: string;
  name: string;
  type?: 'text' | 'number' | 'email' | 'password' | 'tel' | 'url' | 'date' | 'time' | 'datetime-local' | 'textarea' | 'select' | 'checkbox' | 'switch';
  value?: string | number | boolean;
  onChange?: (value: any) => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  options?: Array<{ value: string; label: string }>;
  rows?: number;
  min?: number;
  max?: number;
  step?: number;
  helpText?: string;
  fullWidth?: boolean;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  name,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  required = false,
  disabled = false,
  className = '',
  options = [],
  rows = 4,
  min,
  max,
  step,
  helpText,
  fullWidth = false,
}) => {
  const inputClasses = `${error ? 'border-red-500 focus:ring-red-500' : ''} ${className}`;
  const containerClasses = fullWidth ? 'w-full' : '';

  const renderInput = () => {
    switch (type) {
      case 'textarea':
        return (
          <Textarea
            id={name}
            name={name}
            value={value as string}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            rows={rows}
            className={inputClasses}
          />
        );

      case 'select':
        return (
          <Select
            value={value as string}
            onValueChange={onChange}
            disabled={disabled}
            required={required}
          >
            <SelectTrigger className={inputClasses}>
              <SelectValue placeholder={placeholder || 'Select an option'} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'checkbox':
        return (
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id={name}
              name={name}
              checked={value as boolean}
              onChange={(e) => onChange?.(e.target.checked)}
              disabled={disabled}
              required={required}
              aria-label={label}
              className={`h-4 w-4 rounded border-gray-300 text-qb-blue-600 focus:ring-qb-blue-500 ${inputClasses}`}
            />
            <Label
              htmlFor={name}
              className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {label}
              {required && <span className="text-red-500 ml-1">*</span>}
            </Label>
          </div>
        );

      case 'switch':
        return (
          <div className="flex items-center justify-between">
            <Label htmlFor={name} className="flex-1">
              {label}
              {required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            <Switch
              id={name}
              checked={value as boolean}
              onCheckedChange={(checked: boolean) => onChange?.(checked)}
              disabled={disabled}
              className={inputClasses}
            />
          </div>
        );

      default:
        return (
          <Input
            id={name}
            name={name}
            type={type}
            value={value as string | number}
            onChange={(e) => {
              const newValue = type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
              onChange?.(newValue);
            }}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            min={min}
            max={max}
            step={step}
            className={inputClasses}
          />
        );
    }
  };

  // Checkbox and switch render their own labels
  if (type === 'checkbox' || type === 'switch') {
    return (
      <div className={`space-y-2 ${containerClasses}`}>
        {renderInput()}
        {helpText && <p className="text-sm text-muted-foreground">{helpText}</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${containerClasses}`}>
      <Label htmlFor={name}>
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </Label>
      {renderInput()}
      {helpText && <p className="text-sm text-muted-foreground">{helpText}</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
};

export default FormField;
