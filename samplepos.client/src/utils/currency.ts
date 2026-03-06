/**
 * Currency Utilities
 * 
 * Bank-grade currency formatting using Decimal.js for precision.
 * Configured for UGX (Ugandan Shillings) by default.
 * 
 * CRITICAL: Always use Decimal.js for currency calculations to avoid floating-point errors.
 */

import Decimal from 'decimal.js';

// Configure Decimal.js for currency operations
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -9,
  toExpPos: 9
});

/**
 * Currency configuration
 */
export const CURRENCY_CONFIG = {
  code: 'UGX',
  symbol: 'UGX',
  name: 'Ugandan Shillings',
  decimals: 2, // Default display decimals (user-facing)
  maxDecimals: 6, // Bank-grade precision for calculations
  thousandsSeparator: ',',
  decimalSeparator: '.',
  symbolPosition: 'before' as const
};

/**
 * Precision levels for different use cases
 */
export const PRECISION_MODES = {
  DISPLAY: 2,      // Standard display (UGX 1,500.00)
  ACCOUNTING: 4,   // Accounting precision (UGX 1,500.0000)
  CALCULATION: 6,  // Internal calculations (UGX 1,500.000000)
  INPUT: 6         // Max input precision
} as const;

/**
 * Format a number as currency string with configurable precision
 * @param amount - Number or Decimal to format
 * @param showSymbol - Whether to include currency symbol (default: true)
 * @param precision - Number of decimal places (default: CURRENCY_CONFIG.decimals)
 * @returns Formatted currency string (e.g., "UGX 1,500.00")
 */
export function formatCurrency(
  amount: number | Decimal | string,
  showSymbol = true,
  precision = CURRENCY_CONFIG.decimals
): string {
  // Safely coerce to a finite number before passing to Decimal.
  // Guards against NaN, Infinity, null, undefined, and empty strings.
  let safe: number | string;
  if (amount == null || amount === '') {
    safe = 0;
  } else if (amount instanceof Decimal) {
    // Decimal instances: convert to number first for finality check
    const n = amount.toNumber();
    safe = Number.isFinite(n) ? n : 0;
  } else {
    const n = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
    safe = Number.isFinite(n) ? n : 0;
  }
  const decimal = new Decimal(safe);

  // Format to specified decimal places
  const formatted = decimal.toFixed(precision);

  // Split into integer and decimal parts
  const [integerPart, decimalPart] = formatted.split('.');

  // Add thousands separators
  const withSeparators = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, CURRENCY_CONFIG.thousandsSeparator);

  // Reconstruct the number (skip decimal when precision is 0)
  const fullAmount = decimalPart != null
    ? `${withSeparators}${CURRENCY_CONFIG.decimalSeparator}${decimalPart}`
    : withSeparators;

  // Add currency symbol if requested
  if (showSymbol) {
    return CURRENCY_CONFIG.symbolPosition === 'before'
      ? `${CURRENCY_CONFIG.symbol} ${fullAmount}`
      : `${fullAmount} ${CURRENCY_CONFIG.symbol}`;
  }

  return fullAmount;
}

/**
 * Format currency for display contexts (2 decimals)
 */
export function formatCurrencyDisplay(amount: number | Decimal | string): string {
  return formatCurrency(amount, true, PRECISION_MODES.DISPLAY);
}

/**
 * Format currency for accounting contexts (4 decimals)
 */
export function formatCurrencyAccounting(amount: number | Decimal | string): string {
  return formatCurrency(amount, true, PRECISION_MODES.ACCOUNTING);
}

/**
 * Format currency for calculation contexts (6 decimals)
 */
export function formatCurrencyCalculation(amount: number | Decimal | string): string {
  return formatCurrency(amount, true, PRECISION_MODES.CALCULATION);
}

/**
 * Parse a currency string or number to Decimal
 * @param currencyValue - Formatted currency string, numeric value, or null/undefined
 * @returns Decimal value (defaults to 0 for invalid inputs)
 * 
 * @example
 * parseCurrency("UGX 1,000.50") // Decimal(1000.50)
 * parseCurrency(1000.50)        // Decimal(1000.50)
 * parseCurrency(null)           // Decimal(0)
 */
export function parseCurrency(currencyValue: string | number | null | undefined): Decimal {
  // Handle null/undefined
  if (currencyValue == null) {
    return new Decimal(0);
  }

  // If it's already a number, convert directly
  if (typeof currencyValue === 'number') {
    return new Decimal(currencyValue);
  }

  // Handle string values
  if (typeof currencyValue === 'string') {
    // Remove currency symbol and separators
    const cleaned = currencyValue
      .replace(CURRENCY_CONFIG.symbol, '')
      .replace(new RegExp(`\\${CURRENCY_CONFIG.thousandsSeparator}`, 'g'), '')
      .replace(CURRENCY_CONFIG.decimalSeparator, '.')
      .trim();

    return new Decimal(cleaned || 0);
  }

  // Fallback for any other type
  return new Decimal(0);
}

/**
 * Add two currency amounts with precision
 * @param a - First amount
 * @param b - Second amount
 * @returns Sum as Decimal
 */
export function addCurrency(a: number | Decimal | string, b: number | Decimal | string): Decimal {
  return new Decimal(a || 0).plus(new Decimal(b || 0));
}

/**
 * Subtract two currency amounts with precision
 * @param a - First amount
 * @param b - Second amount to subtract
 * @returns Difference as Decimal
 */
export function subtractCurrency(a: number | Decimal | string, b: number | Decimal | string): Decimal {
  return new Decimal(a || 0).minus(new Decimal(b || 0));
}

/**
 * Multiply currency amount with precision
 * @param amount - Amount to multiply
 * @param multiplier - Multiplier
 * @returns Product as Decimal
 */
export function multiplyCurrency(amount: number | Decimal | string, multiplier: number | Decimal | string): Decimal {
  return new Decimal(amount || 0).times(new Decimal(multiplier || 0));
}

/**
 * Divide currency amount with precision
 * @param amount - Amount to divide
 * @param divisor - Divisor
 * @returns Quotient as Decimal
 */
export function divideCurrency(amount: number | Decimal | string, divisor: number | Decimal | string): Decimal {
  const divisorDecimal = new Decimal(divisor || 1);
  if (divisorDecimal.isZero()) {
    throw new Error('Cannot divide by zero');
  }
  return new Decimal(amount || 0).dividedBy(divisorDecimal);
}

/**
 * Calculate percentage of an amount
 * @param amount - Base amount
 * @param percentage - Percentage (e.g., 20 for 20%)
 * @returns Percentage value as Decimal
 */
export function calculatePercentage(amount: number | Decimal | string, percentage: number | Decimal | string): Decimal {
  return new Decimal(amount || 0).times(new Decimal(percentage || 0)).dividedBy(100);
}

/**
 * Calculate percentage change between two amounts
 * @param oldAmount - Original amount
 * @param newAmount - New amount
 * @returns Percentage change as Decimal (e.g., 15.5 for 15.5% increase)
 */
export function calculatePercentageChange(oldAmount: number | Decimal | string, newAmount: number | Decimal | string): Decimal {
  const oldDecimal = new Decimal(oldAmount || 0);
  const newDecimal = new Decimal(newAmount || 0);

  if (oldDecimal.isZero()) {
    return new Decimal(0);
  }

  return newDecimal.minus(oldDecimal).dividedBy(oldDecimal).times(100);
}

/**
 * Round currency to specified decimal places
 * @param amount - Amount to round
 * @param decimals - Number of decimal places (default: 2)
 * @returns Rounded Decimal
 */
export function roundCurrency(amount: number | Decimal | string, decimals = 2): Decimal {
  return new Decimal(amount || 0).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
}

/**
 * Compare two currency amounts
 * @param a - First amount
 * @param b - Second amount
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareCurrency(a: number | Decimal | string, b: number | Decimal | string): number {
  return new Decimal(a || 0).comparedTo(new Decimal(b || 0));
}

/**
 * Check if amount is positive
 * @param amount - Amount to check
 * @returns True if amount > 0
 */
export function isPositive(amount: number | Decimal | string): boolean {
  return new Decimal(amount || 0).greaterThan(0);
}

/**
 * Check if amount is negative
 * @param amount - Amount to check
 * @returns True if amount < 0
 */
export function isNegative(amount: number | Decimal | string): boolean {
  return new Decimal(amount || 0).lessThan(0);
}

/**
 * Check if amount is zero
 * @param amount - Amount to check
 * @returns True if amount === 0
 */
export function isZero(amount: number | Decimal | string): boolean {
  return new Decimal(amount || 0).isZero();
}

/**
 * Get absolute value of currency amount
 * @param amount - Amount
 * @returns Absolute value as Decimal
 */
export function absoluteCurrency(amount: number | Decimal | string): Decimal {
  return new Decimal(amount || 0).abs();
}

/**
 * Calculate total from array of amounts
 * @param amounts - Array of amounts
 * @returns Total as Decimal
 */
export function sumCurrency(amounts: Array<number | Decimal | string>): Decimal {
  return amounts.reduce((sum: Decimal, amount) => sum.plus(new Decimal(amount || 0)), new Decimal(0));
}

/**
 * Format currency for input field (no symbol, raw number)
 * @param amount - Amount to format
 * @param precision - Number of decimal places (default: accounting precision)
 * @returns Formatted string for input
 */
export function formatCurrencyInput(amount: number | Decimal | string, precision = PRECISION_MODES.ACCOUNTING): string {
  return new Decimal(amount || 0).toFixed(precision);
}

/**
 * Validate currency string format
 * @param value - String to validate
 * @param maxDecimals - Maximum decimal places allowed (default: bank-grade precision)
 * @returns True if valid currency format
 */
export function isValidCurrency(value: string, maxDecimals = CURRENCY_CONFIG.maxDecimals): boolean {
  const cleaned = value
    .replace(CURRENCY_CONFIG.symbol, '')
    .replace(new RegExp(`\\${CURRENCY_CONFIG.thousandsSeparator}`, 'g'), '')
    .trim();

  const regex = new RegExp(`^-?\\d+(\\.\\d{1,${maxDecimals}})?$`);
  return regex.test(cleaned);
}

/**
 * Validate currency for display context (2 decimals max)
 */
export function isValidCurrencyDisplay(value: string): boolean {
  return isValidCurrency(value, PRECISION_MODES.DISPLAY);
}

/**
 * Validate currency for accounting context (4 decimals max)
 */
export function isValidCurrencyAccounting(value: string): boolean {
  return isValidCurrency(value, PRECISION_MODES.ACCOUNTING);
}
