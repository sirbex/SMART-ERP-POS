/**
 * Form Validation Hook
 * Reusable form validation with consistent error handling
 */

import { useState, useCallback } from 'react';

export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  custom?: (value: any) => string | null;
  message?: string;
}

export interface ValidationSchema {
  [field: string]: ValidationRule | ValidationRule[];
}

export interface FormErrors {
  [field: string]: string[];
}

export interface UseFormValidationResult {
  errors: FormErrors;
  validate: (data: Record<string, any>) => boolean;
  validateField: (field: string, value: any) => boolean;
  clearErrors: () => void;
  clearFieldError: (field: string) => void;
  setFieldError: (field: string, error: string) => void;
  hasErrors: boolean;
}

/**
 * Custom hook for form validation
 */
export const useFormValidation = (schema: ValidationSchema): UseFormValidationResult => {
  const [errors, setErrors] = useState<FormErrors>({});

  /**
   * Validate a single value against rules
   */
  const validateValue = useCallback((value: any, rules: ValidationRule | ValidationRule[]): string[] => {
    const ruleArray = Array.isArray(rules) ? rules : [rules];
    const fieldErrors: string[] = [];

    ruleArray.forEach((rule) => {
      // Required validation
      if (rule.required && (value === null || value === undefined || value === '')) {
        fieldErrors.push(rule.message || 'This field is required');
        return;
      }

      // Skip other validations if value is empty and not required
      if (!rule.required && (value === null || value === undefined || value === '')) {
        return;
      }

      // String length validation
      if (typeof value === 'string') {
        if (rule.minLength && value.trim().length < rule.minLength) {
          fieldErrors.push(rule.message || `Must be at least ${rule.minLength} characters`);
        }
        if (rule.maxLength && value.trim().length > rule.maxLength) {
          fieldErrors.push(rule.message || `Cannot exceed ${rule.maxLength} characters`);
        }
      }

      // Numeric validation
      if (typeof value === 'number' || !isNaN(Number(value))) {
        const numValue = Number(value);
        if (rule.min !== undefined && numValue < rule.min) {
          fieldErrors.push(rule.message || `Must be at least ${rule.min}`);
        }
        if (rule.max !== undefined && numValue > rule.max) {
          fieldErrors.push(rule.message || `Cannot exceed ${rule.max}`);
        }
      }

      // Pattern validation
      if (rule.pattern && typeof value === 'string') {
        if (!rule.pattern.test(value)) {
          fieldErrors.push(rule.message || 'Invalid format');
        }
      }

      // Custom validation
      if (rule.custom) {
        const customError = rule.custom(value);
        if (customError) {
          fieldErrors.push(customError);
        }
      }
    });

    return fieldErrors;
  }, []);

  /**
   * Validate entire form
   */
  const validate = useCallback((data: Record<string, any>): boolean => {
    const newErrors: FormErrors = {};

    Object.keys(schema).forEach((field) => {
      const fieldErrors = validateValue(data[field], schema[field]);
      if (fieldErrors.length > 0) {
        newErrors[field] = fieldErrors;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [schema, validateValue]);

  /**
   * Validate single field
   */
  const validateField = useCallback((field: string, value: any): boolean => {
    if (!schema[field]) return true;

    const fieldErrors = validateValue(value, schema[field]);
    
    setErrors((prev) => {
      const newErrors = { ...prev };
      if (fieldErrors.length > 0) {
        newErrors[field] = fieldErrors;
      } else {
        delete newErrors[field];
      }
      return newErrors;
    });

    return fieldErrors.length === 0;
  }, [schema, validateValue]);

  /**
   * Clear all errors
   */
  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  /**
   * Clear errors for specific field
   */
  const clearFieldError = useCallback((field: string) => {
    setErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  }, []);

  /**
   * Set error for specific field
   */
  const setFieldError = useCallback((field: string, error: string) => {
    setErrors((prev) => ({
      ...prev,
      [field]: [error]
    }));
  }, []);

  return {
    errors,
    validate,
    validateField,
    clearErrors,
    clearFieldError,
    setFieldError,
    hasErrors: Object.keys(errors).length > 0
  };
};

/**
 * Common validation rules
 */
export const CommonValidations = {
  email: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: 'Invalid email address'
  },
  phone: {
    pattern: /^[\d\s+()-]{7,20}$/,
    message: 'Invalid phone number'
  },
  positiveNumber: {
    min: 0,
    custom: (value: any) => {
      if (isNaN(Number(value))) return 'Must be a valid number';
      return null;
    }
  },
  currency: {
    min: 0,
    custom: (value: any) => {
      const num = Number(value);
      if (isNaN(num)) return 'Must be a valid amount';
      const decimals = (num.toString().split('.')[1] || '').length;
      if (decimals > 2) return 'Cannot have more than 2 decimal places';
      return null;
    }
  },
  required: {
    required: true,
    message: 'This field is required'
  }
};

/**
 * Helper to display first error for a field
 */
export const getFirstError = (errors: FormErrors, field: string): string | null => {
  return errors[field]?.[0] || null;
};

/**
 * Helper to check if field has error
 */
export const hasFieldError = (errors: FormErrors, field: string): boolean => {
  return errors[field] && errors[field].length > 0;
};
