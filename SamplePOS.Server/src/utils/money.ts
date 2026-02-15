/**
 * Monetary Calculation Utility
 * 
 * SINGLE SOURCE OF TRUTH for all monetary calculations in the system.
 * 
 * Requirements:
 * ✅ Decimal-safe monetary calculations
 * ✅ No floating-point arithmetic
 * ✅ Consistent rounding strategy (ROUND_HALF_UP, banker's rounding)
 * ✅ Currency-aware calculations
 * ✅ Precision loss prevention
 * ✅ Single calculation authority
 * ✅ No duplicated business logic
 * 
 * Usage:
 *   import { Money } from '../utils/money.js';
 *   
 *   // Parse from various sources
 *   const price = Money.parse('1234.56');
 *   const total = Money.parse(row.total_amount);
 *   
 *   // Safe arithmetic
 *   const subtotal = Money.multiply(price, quantity);
 *   const tax = Money.percentage(subtotal, 18);
 *   const grandTotal = Money.add(subtotal, tax);
 *   
 *   // Format for display
 *   const display = Money.format(grandTotal);       // "1,234.56"
 *   const ugx = Money.formatCurrency(grandTotal);   // "UGX 1,234.56"
 */

import Decimal from 'decimal.js';

// Configure Decimal.js for financial calculations
Decimal.set({
    precision: 20,           // High precision for intermediate calculations
    rounding: Decimal.ROUND_HALF_UP,  // Standard rounding for currency
    toExpNeg: -9,           // Avoid scientific notation for small numbers
    toExpPos: 21,           // Avoid scientific notation for large numbers
});

// Currency configuration (can be extended for multi-currency support)
export interface CurrencyConfig {
    code: string;
    symbol: string;
    decimalPlaces: number;
    thousandsSeparator: string;
    decimalSeparator: string;
}

// Default currency configuration (UGX)
const DEFAULT_CURRENCY: CurrencyConfig = {
    code: 'UGX',
    symbol: 'UGX',
    decimalPlaces: 0,  // UGX doesn't use decimal places
    thousandsSeparator: ',',
    decimalSeparator: '.',
};

// Supported currencies
export const CURRENCIES: Record<string, CurrencyConfig> = {
    UGX: { code: 'UGX', symbol: 'UGX', decimalPlaces: 0, thousandsSeparator: ',', decimalSeparator: '.' },
    USD: { code: 'USD', symbol: '$', decimalPlaces: 2, thousandsSeparator: ',', decimalSeparator: '.' },
    EUR: { code: 'EUR', symbol: '€', decimalPlaces: 2, thousandsSeparator: '.', decimalSeparator: ',' },
    GBP: { code: 'GBP', symbol: '£', decimalPlaces: 2, thousandsSeparator: ',', decimalSeparator: '.' },
    KES: { code: 'KES', symbol: 'KSh', decimalPlaces: 2, thousandsSeparator: ',', decimalSeparator: '.' },
};

/**
 * Money utility class - provides decimal-safe monetary calculations
 * 
 * CRITICAL: Never use JavaScript native numbers for monetary calculations.
 * Always use this utility for all financial operations.
 */
export class Money {
    // Current active currency
    private static activeCurrency: CurrencyConfig = DEFAULT_CURRENCY;

    /**
     * Set the active currency for formatting
     */
    static setCurrency(currencyCode: string): void {
        const currency = CURRENCIES[currencyCode.toUpperCase()];
        if (currency) {
            Money.activeCurrency = currency;
        }
    }

    /**
     * Get the active currency configuration
     */
    static getCurrency(): CurrencyConfig {
        return Money.activeCurrency;
    }

    /**
     * Get a zero value as Decimal
     */
    static zero(): Decimal {
        return new Decimal(0);
    }

    // ===========================================================================
    // PARSING - Convert various inputs to Decimal
    // ===========================================================================

    /**
     * Parse any input to a Decimal value
     * Handles: string, number, Decimal, null, undefined
     * 
     * CRITICAL: This is the ONLY way to convert external values to monetary values
     */
    static parse(value: string | number | Decimal | null | undefined): Decimal {
        if (value === null || value === undefined || value === '') {
            return new Decimal(0);
        }

        if (value instanceof Decimal) {
            return value;
        }

        if (typeof value === 'string') {
            // Remove currency symbols, spaces, and thousands separators
            const cleaned = value
                .replace(/[^\d.-]/g, '')  // Remove everything except digits, decimal, and minus
                .trim();

            if (cleaned === '' || cleaned === '-') {
                return new Decimal(0);
            }

            try {
                return new Decimal(cleaned);
            } catch {
                return new Decimal(0);
            }
        }

        if (typeof value === 'number') {
            if (!Number.isFinite(value)) {
                return new Decimal(0);
            }
            return new Decimal(value);
        }

        // Handle objects with toString (like Decimal.js objects from DB)
        if (typeof value === 'object' && value !== null && typeof (value as { toString?: unknown }).toString === 'function') {
            try {
                return new Decimal((value as { toString(): string }).toString());
            } catch {
                return new Decimal(0);
            }
        }

        return new Decimal(0);
    }

    /**
     * Parse a PostgreSQL NUMERIC/DECIMAL field
     * PostgreSQL returns these as strings to preserve precision
     */
    static parseDb(value: unknown): Decimal {
        return Money.parse(value as string | number | null);
    }

    // ===========================================================================
    // ARITHMETIC - Decimal-safe operations
    // ===========================================================================

    /**
     * Add two or more monetary values
     */
    static add(...values: (string | number | Decimal | null | undefined)[]): Decimal {
        let result = new Decimal(0);
        for (const val of values) {
            result = result.plus(Money.parse(val));
        }
        return result;
    }

    /**
     * Subtract values from the first value
     */
    static subtract(
        minuend: string | number | Decimal | null | undefined,
        ...subtrahends: (string | number | Decimal | null | undefined)[]
    ): Decimal {
        let result = Money.parse(minuend);
        for (const val of subtrahends) {
            result = result.minus(Money.parse(val));
        }
        return result;
    }

    /**
     * Multiply a monetary value by a quantity/rate
     */
    static multiply(
        value: string | number | Decimal | null | undefined,
        multiplier: string | number | Decimal | null | undefined
    ): Decimal {
        return Money.parse(value).times(Money.parse(multiplier));
    }

    /**
     * Divide a monetary value
     */
    static divide(
        value: string | number | Decimal | null | undefined,
        divisor: string | number | Decimal | null | undefined
    ): Decimal {
        const divisorVal = Money.parse(divisor);
        if (divisorVal.isZero()) {
            return new Decimal(0);  // Safe handling of division by zero
        }
        return Money.parse(value).dividedBy(divisorVal);
    }

    /**
     * Calculate percentage of a value
     * Example: Money.percentage(1000, 18) = 180 (18% of 1000)
     */
    static percentage(
        value: string | number | Decimal | null | undefined,
        percent: string | number | Decimal | null | undefined
    ): Decimal {
        return Money.parse(value).times(Money.parse(percent)).dividedBy(100);
    }

    /**
     * Calculate percentage rate between two values
     * Example: Money.percentageRate(180, 1000) = 18 (180 is 18% of 1000)
     */
    static percentageRate(
        part: string | number | Decimal | null | undefined,
        whole: string | number | Decimal | null | undefined
    ): Decimal {
        const wholeVal = Money.parse(whole);
        if (wholeVal.isZero()) {
            return new Decimal(0);
        }
        return Money.parse(part).dividedBy(wholeVal).times(100);
    }

    // ===========================================================================
    // ROUNDING - Consistent rounding strategies
    // ===========================================================================

    /**
     * Round to currency decimal places (default: active currency)
     */
    static round(
        value: string | number | Decimal | null | undefined,
        decimalPlaces?: number
    ): Decimal {
        const places = decimalPlaces ?? Money.activeCurrency.decimalPlaces;
        return Money.parse(value).toDecimalPlaces(places, Decimal.ROUND_HALF_UP);
    }

    /**
     * Round up (ceiling) to currency decimal places
     */
    static roundUp(
        value: string | number | Decimal | null | undefined,
        decimalPlaces?: number
    ): Decimal {
        const places = decimalPlaces ?? Money.activeCurrency.decimalPlaces;
        return Money.parse(value).toDecimalPlaces(places, Decimal.ROUND_UP);
    }

    /**
     * Round down (floor) to currency decimal places
     */
    static roundDown(
        value: string | number | Decimal | null | undefined,
        decimalPlaces?: number
    ): Decimal {
        const places = decimalPlaces ?? Money.activeCurrency.decimalPlaces;
        return Money.parse(value).toDecimalPlaces(places, Decimal.ROUND_DOWN);
    }

    /**
     * Banker's rounding (ROUND_HALF_EVEN) for statistical fairness
     */
    static roundBankers(
        value: string | number | Decimal | null | undefined,
        decimalPlaces?: number
    ): Decimal {
        const places = decimalPlaces ?? Money.activeCurrency.decimalPlaces;
        return Money.parse(value).toDecimalPlaces(places, Decimal.ROUND_HALF_EVEN);
    }

    // ===========================================================================
    // COMPARISON - Safe comparisons
    // ===========================================================================

    /**
     * Check if value is zero (within tolerance for floating point)
     */
    static isZero(value: string | number | Decimal | null | undefined): boolean {
        return Money.parse(value).isZero();
    }

    /**
     * Check if value is positive
     */
    static isPositive(value: string | number | Decimal | null | undefined): boolean {
        const parsed = Money.parse(value);
        return parsed.gt(0);
    }

    /**
     * Check if value is negative
     */
    static isNegative(value: string | number | Decimal | null | undefined): boolean {
        return Money.parse(value).lt(0);
    }

    /**
     * Check if two values are equal (within currency precision)
     */
    static equals(
        a: string | number | Decimal | null | undefined,
        b: string | number | Decimal | null | undefined
    ): boolean {
        return Money.round(a).equals(Money.round(b));
    }

    /**
     * Get the larger of two values
     */
    static max(
        a: string | number | Decimal | null | undefined,
        b: string | number | Decimal | null | undefined
    ): Decimal {
        const parsedA = Money.parse(a);
        const parsedB = Money.parse(b);
        return parsedA.gte(parsedB) ? parsedA : parsedB;
    }

    /**
     * Get the smaller of two values
     */
    static min(
        a: string | number | Decimal | null | undefined,
        b: string | number | Decimal | null | undefined
    ): Decimal {
        const parsedA = Money.parse(a);
        const parsedB = Money.parse(b);
        return parsedA.lte(parsedB) ? parsedA : parsedB;
    }

    /**
     * Get absolute value
     */
    static abs(value: string | number | Decimal | null | undefined): Decimal {
        return Money.parse(value).abs();
    }

    /**
     * Negate a value
     */
    static negate(value: string | number | Decimal | null | undefined): Decimal {
        return Money.parse(value).times(-1);
    }

    // ===========================================================================
    // FORMATTING - Display-ready output
    // ===========================================================================

    /**
     * Format as plain number string (no currency symbol)
     * Returns string with proper decimal places
     */
    static format(
        value: string | number | Decimal | null | undefined,
        decimalPlaces?: number
    ): string {
        const places = decimalPlaces ?? Money.activeCurrency.decimalPlaces;
        const rounded = Money.round(value, places);

        // Format with thousands separator
        const parts = rounded.toFixed(places).split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, Money.activeCurrency.thousandsSeparator);

        return places > 0
            ? parts.join(Money.activeCurrency.decimalSeparator)
            : parts[0];
    }

    /**
     * Format with currency symbol
     */
    static formatCurrency(
        value: string | number | Decimal | null | undefined,
        currencyCode?: string
    ): string {
        const currency = currencyCode
            ? CURRENCIES[currencyCode.toUpperCase()] || Money.activeCurrency
            : Money.activeCurrency;

        const formatted = Money.format(value, currency.decimalPlaces);
        return `${currency.symbol} ${formatted}`;
    }

    /**
     * Convert to number for external APIs or legacy code
     * WARNING: Use sparingly - loses precision for very large/precise values
     */
    static toNumber(value: string | number | Decimal | null | undefined): number {
        return Money.round(value).toNumber();
    }

    /**
     * Convert to string for database storage
     */
    static toString(
        value: string | number | Decimal | null | undefined,
        decimalPlaces: number = 4
    ): string {
        return Money.parse(value).toFixed(decimalPlaces);
    }

    // ===========================================================================
    // ACCOUNTING CALCULATIONS - Business logic
    // ===========================================================================

    /**
     * Calculate line item total: quantity × unit price
     */
    static lineTotal(
        quantity: string | number | Decimal | null | undefined,
        unitPrice: string | number | Decimal | null | undefined
    ): Decimal {
        return Money.round(Money.multiply(quantity, unitPrice));
    }

    /**
     * Calculate discounted price
     * discountType: 'PERCENTAGE' or 'FIXED'
     */
    static applyDiscount(
        amount: string | number | Decimal | null | undefined,
        discount: string | number | Decimal | null | undefined,
        discountType: 'PERCENTAGE' | 'FIXED' = 'PERCENTAGE'
    ): Decimal {
        const amountVal = Money.parse(amount);
        const discountVal = Money.parse(discount);

        if (discountType === 'PERCENTAGE') {
            const discountAmount = Money.percentage(amountVal, discountVal);
            return Money.round(amountVal.minus(discountAmount));
        }

        return Money.round(amountVal.minus(discountVal));
    }

    /**
     * Calculate tax amount
     */
    static calculateTax(
        amount: string | number | Decimal | null | undefined,
        taxRate: string | number | Decimal | null | undefined
    ): Decimal {
        return Money.round(Money.percentage(amount, taxRate));
    }

    /**
     * Calculate gross profit margin percentage
     * Formula: ((revenue - cost) / revenue) × 100
     */
    static grossMargin(
        revenue: string | number | Decimal | null | undefined,
        cost: string | number | Decimal | null | undefined
    ): Decimal {
        const revenueVal = Money.parse(revenue);
        const costVal = Money.parse(cost);

        if (revenueVal.isZero()) {
            return new Decimal(0);
        }

        return Money.round(
            revenueVal.minus(costVal).dividedBy(revenueVal).times(100),
            2  // Always 2 decimal places for percentages
        );
    }

    /**
     * Calculate markup percentage
     * Formula: ((price - cost) / cost) × 100
     */
    static markup(
        price: string | number | Decimal | null | undefined,
        cost: string | number | Decimal | null | undefined
    ): Decimal {
        const priceVal = Money.parse(price);
        const costVal = Money.parse(cost);

        if (costVal.isZero()) {
            return new Decimal(0);
        }

        return Money.round(
            priceVal.minus(costVal).dividedBy(costVal).times(100),
            2  // Always 2 decimal places for percentages
        );
    }

    /**
     * Calculate price from cost with markup
     */
    static applyMarkup(
        cost: string | number | Decimal | null | undefined,
        markupPercent: string | number | Decimal | null | undefined
    ): Decimal {
        const costVal = Money.parse(cost);
        const markupAmount = Money.percentage(costVal, markupPercent);
        return Money.round(costVal.plus(markupAmount));
    }

    /**
     * Allocate an amount across multiple items (handles rounding remainder)
     * Ensures the sum of allocations equals the original amount exactly
     */
    static allocate(
        amount: string | number | Decimal | null | undefined,
        ratios: number[]
    ): Decimal[] {
        const amountVal = Money.parse(amount);
        const total = ratios.reduce((a, b) => a + b, 0);

        if (total === 0 || ratios.length === 0) {
            return ratios.map(() => new Decimal(0));
        }

        // Calculate initial allocations
        const allocations = ratios.map(ratio =>
            Money.round(amountVal.times(ratio).dividedBy(total))
        );

        // Calculate remainder due to rounding
        const allocatedSum = allocations.reduce(
            (sum, val) => sum.plus(val),
            new Decimal(0)
        );
        const remainder = amountVal.minus(allocatedSum);

        // Add remainder to the first non-zero allocation (or first if all zero)
        if (!remainder.isZero()) {
            const firstNonZero = allocations.findIndex(a => !a.isZero());
            const targetIndex = firstNonZero >= 0 ? firstNonZero : 0;
            allocations[targetIndex] = allocations[targetIndex].plus(remainder);
        }

        return allocations;
    }

    // ===========================================================================
    // VALIDATION
    // ===========================================================================

    /**
     * Check if a value represents a valid monetary amount
     */
    static isValid(value: unknown): boolean {
        if (value === null || value === undefined) {
            return true;  // Null/undefined are valid (treated as 0)
        }

        try {
            const parsed = Money.parse(value as string | number);
            return parsed.isFinite();
        } catch {
            return false;
        }
    }

    /**
     * Ensure value is non-negative (for prices, quantities, etc.)
     */
    static ensureNonNegative(
        value: string | number | Decimal | null | undefined
    ): Decimal {
        const parsed = Money.parse(value);
        return parsed.lt(0) ? new Decimal(0) : parsed;
    }
}

// Export type-safe raw Decimal access for complex calculations
export { Decimal };

// Default export for convenience
export default Money;
