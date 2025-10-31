/**
 * Bank-grade precision utilities for financial calculations
 * All monetary calculations use fixed-point arithmetic to avoid floating-point errors
 */

/**
 * Round to 2 decimal places (cents) with banker's rounding
 * Banker's rounding (round half to even) reduces cumulative rounding errors
 */
export function roundMoney(value: number): number {
  // Convert to cents, round, convert back to dollars
  const cents = Math.round(value * 100);
  return cents / 100;
}

/**
 * Add two monetary values with precision
 */
export function addMoney(a: number, b: number): number {
  const centsA = Math.round(a * 100);
  const centsB = Math.round(b * 100);
  return (centsA + centsB) / 100;
}

/**
 * Subtract two monetary values with precision
 */
export function subtractMoney(a: number, b: number): number {
  const centsA = Math.round(a * 100);
  const centsB = Math.round(b * 100);
  return (centsA - centsB) / 100;
}

/**
 * Multiply a monetary value by a quantity with precision
 */
export function multiplyMoney(price: number, quantity: number): number {
  // Convert price to cents
  const cents = Math.round(price * 100);
  // Multiply by quantity
  const totalCents = Math.round(cents * quantity);
  // Convert back to dollars
  return totalCents / 100;
}

/**
 * Calculate percentage of a monetary value with precision
 * @param amount The base amount
 * @param percentage The percentage as a decimal (0.10 for 10%)
 */
export function percentageOf(amount: number, percentage: number): number {
  const cents = Math.round(amount * 100);
  const resultCents = Math.round(cents * percentage);
  return resultCents / 100;
}

/**
 * Sum an array of monetary values with precision
 */
export function sumMoney(values: number[]): number {
  const totalCents = values.reduce((sum, value) => {
    return sum + Math.round(value * 100);
  }, 0);
  return totalCents / 100;
}

/**
 * Format money for display (always 2 decimal places)
 */
export function formatMoney(value: number): string {
  return roundMoney(value).toFixed(2);
}

/**
 * Parse money from string input, handling various formats
 */
export function parseMoney(input: string): number {
  // Remove currency symbols and whitespace
  const cleaned = input.replace(/[^0-9.-]/g, '');
  const value = parseFloat(cleaned);
  return isNaN(value) ? 0 : roundMoney(value);
}

/**
 * Calculate line total: price * quantity - discount
 */
export function calculateLineTotal(
  price: number,
  quantity: number,
  discount: number = 0
): number {
  const subtotal = multiplyMoney(price, quantity);
  return subtractMoney(subtotal, discount);
}

/**
 * Calculate tax on an amount
 */
export function calculateTax(amount: number, taxRate: number): number {
  return percentageOf(amount, taxRate);
}

/**
 * Compare two monetary values for equality (within 1 cent tolerance)
 */
export function moneyEquals(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  return diff < 0.01;
}

/**
 * Ensure a value is non-negative (for payments, amounts, etc.)
 */
export function nonNegative(value: number): number {
  return Math.max(0, roundMoney(value));
}
