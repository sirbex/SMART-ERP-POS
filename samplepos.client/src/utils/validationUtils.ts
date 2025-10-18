/**
 * Validation Utilities
 * 
 * Reusable validation rules and input sanitization
 */

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export type ValidationRule<T = any> = (value: T, allValues?: any) => string | undefined;

/**
 * Required field validator
 */
export function required(message: string = 'This field is required'): ValidationRule {
  return (value: any) => {
    if (value === undefined || value === null || value === '') {
      return message;
    }
    if (typeof value === 'string' && value.trim() === '') {
      return message;
    }
    if (Array.isArray(value) && value.length === 0) {
      return message;
    }
    return undefined;
  };
}

/**
 * Email validator
 */
export function email(message: string = 'Invalid email address'): ValidationRule<string> {
  return (value: string) => {
    if (!value) return undefined;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value) ? undefined : message;
  };
}

/**
 * Phone number validator
 */
export function phone(message: string = 'Invalid phone number'): ValidationRule<string> {
  return (value: string) => {
    if (!value) return undefined;
    
    // Remove all non-numeric characters
    const cleaned = value.replace(/\D/g, '');
    
    // Check if it's between 10-15 digits
    if (cleaned.length < 10 || cleaned.length > 15) {
      return message;
    }
    
    return undefined;
  };
}

/**
 * Minimum length validator
 */
export function minLength(min: number, message?: string): ValidationRule<string> {
  return (value: string) => {
    if (!value) return undefined;
    
    if (value.length < min) {
      return message || `Must be at least ${min} characters`;
    }
    
    return undefined;
  };
}

/**
 * Maximum length validator
 */
export function maxLength(max: number, message?: string): ValidationRule<string> {
  return (value: string) => {
    if (!value) return undefined;
    
    if (value.length > max) {
      return message || `Must be at most ${max} characters`;
    }
    
    return undefined;
  };
}

/**
 * Minimum value validator
 */
export function min(minValue: number, message?: string): ValidationRule<number> {
  return (value: number) => {
    if (value === undefined || value === null) return undefined;
    
    if (value < minValue) {
      return message || `Must be at least ${minValue}`;
    }
    
    return undefined;
  };
}

/**
 * Maximum value validator
 */
export function max(maxValue: number, message?: string): ValidationRule<number> {
  return (value: number) => {
    if (value === undefined || value === null) return undefined;
    
    if (value > maxValue) {
      return message || `Must be at most ${maxValue}`;
    }
    
    return undefined;
  };
}

/**
 * Positive number validator
 */
export function positive(message: string = 'Must be a positive number'): ValidationRule<number> {
  return (value: number) => {
    if (value === undefined || value === null) return undefined;
    
    return value > 0 ? undefined : message;
  };
}

/**
 * Non-negative number validator
 */
export function nonNegative(message: string = 'Must be a non-negative number'): ValidationRule<number> {
  return (value: number) => {
    if (value === undefined || value === null) return undefined;
    
    return value >= 0 ? undefined : message;
  };
}

/**
 * Pattern validator
 */
export function pattern(regex: RegExp, message: string): ValidationRule<string> {
  return (value: string) => {
    if (!value) return undefined;
    
    return regex.test(value) ? undefined : message;
  };
}

/**
 * Matches field validator (for password confirmation)
 */
export function matches(fieldName: string, message?: string): ValidationRule {
  return (value: any, allValues?: any) => {
    if (!value || !allValues) return undefined;
    
    const otherValue = allValues[fieldName];
    if (value !== otherValue) {
      return message || `Must match ${fieldName}`;
    }
    
    return undefined;
  };
}

/**
 * Compose multiple validators
 */
export function composeValidators<T>(...validators: ValidationRule<T>[]): ValidationRule<T> {
  return (value: T, allValues?: any) => {
    for (const validator of validators) {
      const error = validator(value, allValues);
      if (error) {
        return error;
      }
    }
    return undefined;
  };
}

/**
 * Validate form fields
 */
export function validateFields(
  values: Record<string, any>,
  rules: Record<string, ValidationRule | ValidationRule[]>
): ValidationResult {
  const errors: Record<string, string> = {};
  
  Object.entries(rules).forEach(([field, rule]) => {
    const value = values[field];
    
    if (Array.isArray(rule)) {
      // Multiple rules for this field
      const composedRule = composeValidators(...rule);
      const error = composedRule(value, values);
      if (error) {
        errors[field] = error;
      }
    } else {
      // Single rule
      const error = rule(value, values);
      if (error) {
        errors[field] = error;
      }
    }
  });
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Sanitize string input (trim and normalize whitespace)
 */
export function sanitizeString(value: string): string {
  if (!value) return '';
  
  return value
    .trim()
    .replace(/\s+/g, ' '); // Replace multiple spaces with single space
}

/**
 * Sanitize phone number (remove all non-numeric characters)
 */
export function sanitizePhone(value: string): string {
  if (!value) return '';
  
  return value.replace(/\D/g, '');
}

/**
 * Sanitize email (lowercase and trim)
 */
export function sanitizeEmail(value: string): string {
  if (!value) return '';
  
  return value.trim().toLowerCase();
}

/**
 * Sanitize number input
 */
export function sanitizeNumber(value: any, defaultValue: number = 0): number {
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Sanitize currency input (remove currency symbols, commas)
 */
export function sanitizeCurrency(value: string): number {
  if (!value) return 0;
  
  // Remove currency symbols and commas
  const cleaned = value.replace(/[$,]/g, '');
  const num = Number(cleaned);
  
  return isNaN(num) ? 0 : num;
}

/**
 * Format currency for display
 */
export function formatCurrency(value: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(value);
}

/**
 * Format phone number for display
 */
export function formatPhone(value: string): string {
  if (!value) return '';
  
  const cleaned = sanitizePhone(value);
  
  // Format as (XXX) XXX-XXXX for 10-digit numbers
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  
  // Return as-is for other lengths
  return cleaned;
}

/**
 * Validate credit card number (Luhn algorithm)
 */
export function validateCreditCard(cardNumber: string): boolean {
  if (!cardNumber) return false;
  
  const cleaned = cardNumber.replace(/\D/g, '');
  
  if (cleaned.length < 13 || cleaned.length > 19) {
    return false;
  }
  
  let sum = 0;
  let isEven = false;
  
  // Loop through values starting from the rightmost side
  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = parseInt(cleaned[i], 10);
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    
    sum += digit;
    isEven = !isEven;
  }
  
  return sum % 10 === 0;
}

/**
 * Check if string is numeric
 */
export function isNumeric(value: string): boolean {
  if (!value) return false;
  return !isNaN(Number(value)) && !isNaN(parseFloat(value));
}

/**
 * Check if value is empty
 */
export function isEmpty(value: any): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Validate barcode format (EAN-13, UPC-A, etc.)
 */
export function validateBarcode(barcode: string): boolean {
  if (!barcode) return false;
  
  const cleaned = barcode.replace(/\D/g, '');
  
  // Common barcode lengths: 8 (EAN-8), 12 (UPC-A), 13 (EAN-13), 14 (ITF-14)
  const validLengths = [8, 12, 13, 14];
  
  return validLengths.includes(cleaned.length);
}

/**
 * Validate SKU format (alphanumeric, hyphens, underscores)
 */
export function validateSKU(sku: string): boolean {
  if (!sku) return false;
  
  // Allow alphanumeric characters, hyphens, and underscores
  const skuRegex = /^[A-Za-z0-9_-]+$/;
  
  return skuRegex.test(sku);
}

/**
 * Common validation rule sets
 */
export const validationRules = {
  // User fields
  username: [required(), minLength(3), maxLength(50)],
  password: [required(), minLength(6)],
  email: [required(), email()],
  
  // Customer fields
  customerName: [required(), minLength(2), maxLength(100)],
  customerPhone: [phone()],
  customerEmail: [email()],
  
  // Product fields
  productName: [required(), minLength(2), maxLength(200)],
  productSKU: [required(), pattern(/^[A-Za-z0-9_-]+$/, 'Invalid SKU format')],
  productPrice: [required(), positive()],
  productStock: [required(), nonNegative()],
  
  // Transaction fields
  amount: [required(), positive()],
  quantity: [required(), positive()],
  discount: [nonNegative(), max(100, 'Discount cannot exceed 100%')]
};

export default {
  // Validators
  required,
  email,
  phone,
  minLength,
  maxLength,
  min,
  max,
  positive,
  nonNegative,
  pattern,
  matches,
  composeValidators,
  validateFields,
  
  // Sanitizers
  sanitizeString,
  sanitizePhone,
  sanitizeEmail,
  sanitizeNumber,
  sanitizeCurrency,
  
  // Formatters
  formatCurrency,
  formatPhone,
  
  // Validators
  validateCreditCard,
  validateBarcode,
  validateSKU,
  isNumeric,
  isEmpty,
  
  // Rule sets
  validationRules
};
