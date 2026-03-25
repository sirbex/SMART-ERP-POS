/**
 * Money Utility Tests
 * 
 * Comprehensive tests for the monetary calculation engine.
 * Tests parsing, arithmetic, rounding, comparison, formatting, and accounting helpers.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import Decimal from 'decimal.js';
import { Money, CURRENCIES } from './money.js';

describe('Money Utility', () => {
    // -----------------------------------------------------------------------
    // PARSING
    // -----------------------------------------------------------------------
    describe('parse', () => {
        it('should parse string values', () => {
            expect(Money.parse('1234.56').toNumber()).toBe(1234.56);
            expect(Money.parse('0').toNumber()).toBe(0);
            expect(Money.parse('-500').toNumber()).toBe(-500);
        });

        it('should parse number values', () => {
            expect(Money.parse(1234.56).toNumber()).toBe(1234.56);
            expect(Money.parse(0).toNumber()).toBe(0);
            expect(Money.parse(-500).toNumber()).toBe(-500);
        });

        it('should parse Decimal values', () => {
            const dec = new Decimal('1234.56');
            expect(Money.parse(dec).toNumber()).toBe(1234.56);
        });

        it('should handle null/undefined/empty string as zero', () => {
            expect(Money.parse(null).toNumber()).toBe(0);
            expect(Money.parse(undefined).toNumber()).toBe(0);
            expect(Money.parse('').toNumber()).toBe(0);
        });

        it('should clean currency symbols from strings', () => {
            expect(Money.parse('UGX 1,234').toNumber()).toBe(1234);
            expect(Money.parse('$1,000.50').toNumber()).toBe(1000.50);
            expect(Money.parse('€500').toNumber()).toBe(500);
        });

        it('should handle Infinity/NaN as zero', () => {
            expect(Money.parse(Infinity).toNumber()).toBe(0);
            expect(Money.parse(-Infinity).toNumber()).toBe(0);
            expect(Money.parse(NaN).toNumber()).toBe(0);
        });

        it('should handle dash-only string as zero', () => {
            expect(Money.parse('-').toNumber()).toBe(0);
        });
    });

    describe('parseDb', () => {
        it('should parse PostgreSQL numeric strings', () => {
            expect(Money.parseDb('1234.5600').toNumber()).toBe(1234.56);
            expect(Money.parseDb('0.00').toNumber()).toBe(0);
            expect(Money.parseDb(null).toNumber()).toBe(0);
        });
    });

    describe('zero', () => {
        it('should return a Decimal zero', () => {
            expect(Money.zero().isZero()).toBe(true);
            expect(Money.zero().toNumber()).toBe(0);
        });
    });

    // -----------------------------------------------------------------------
    // ARITHMETIC
    // -----------------------------------------------------------------------
    describe('add', () => {
        it('should add multiple values', () => {
            expect(Money.add(100, 200, 300).toNumber()).toBe(600);
        });

        it('should handle mixed types', () => {
            expect(Money.add('100', 200, new Decimal(300)).toNumber()).toBe(600);
        });

        it('should handle null values', () => {
            expect(Money.add(100, null, undefined).toNumber()).toBe(100);
        });
    });

    describe('subtract', () => {
        it('should subtract correctly', () => {
            expect(Money.subtract(1000, 300, 200).toNumber()).toBe(500);
        });

        it('should handle negative results', () => {
            expect(Money.subtract(100, 500).toNumber()).toBe(-400);
        });
    });

    describe('multiply', () => {
        it('should multiply correctly', () => {
            expect(Money.multiply(100, 3).toNumber()).toBe(300);
        });

        it('should handle decimal multipliers', () => {
            expect(Money.multiply(1000, 0.18).toNumber()).toBe(180);
        });

        it('should handle null as zero', () => {
            expect(Money.multiply(null, 100).toNumber()).toBe(0);
        });
    });

    describe('divide', () => {
        it('should divide correctly', () => {
            expect(Money.divide(1000, 4).toNumber()).toBe(250);
        });

        it('should handle division by zero safely', () => {
            expect(Money.divide(1000, 0).toNumber()).toBe(0);
        });

        it('should handle null divisor', () => {
            expect(Money.divide(1000, null).toNumber()).toBe(0);
        });
    });

    describe('percentage', () => {
        it('should calculate percentage correctly', () => {
            expect(Money.percentage(1000, 18).toNumber()).toBe(180);
        });

        it('should handle zero percent', () => {
            expect(Money.percentage(1000, 0).toNumber()).toBe(0);
        });

        it('should handle 100%', () => {
            expect(Money.percentage(1000, 100).toNumber()).toBe(1000);
        });
    });

    describe('percentageRate', () => {
        it('should calculate rate correctly', () => {
            expect(Money.percentageRate(180, 1000).toNumber()).toBe(18);
        });

        it('should handle zero whole safely', () => {
            expect(Money.percentageRate(100, 0).toNumber()).toBe(0);
        });
    });

    // -----------------------------------------------------------------------
    // ROUNDING
    // -----------------------------------------------------------------------
    describe('round', () => {
        it('should round to currency decimal places (UGX = 0)', () => {
            expect(Money.round(1234.56).toNumber()).toBe(1235);
        });

        it('should round with custom decimal places', () => {
            expect(Money.round(1234.5678, 2).toNumber()).toBe(1234.57);
        });

        it('should round half up', () => {
            expect(Money.round(1234.5, 0).toNumber()).toBe(1235);
        });
    });

    describe('roundUp', () => {
        it('should always round up', () => {
            expect(Money.roundUp(1234.1, 0).toNumber()).toBe(1235);
        });
    });

    describe('roundDown', () => {
        it('should always round down', () => {
            expect(Money.roundDown(1234.9, 0).toNumber()).toBe(1234);
        });
    });

    describe('roundBankers', () => {
        it('should use bankers rounding (half even)', () => {
            // 0.5 rounds to even: 2.5 -> 2, 3.5 -> 4
            expect(Money.roundBankers(2.5, 0).toNumber()).toBe(2);
            expect(Money.roundBankers(3.5, 0).toNumber()).toBe(4);
        });
    });

    // -----------------------------------------------------------------------
    // COMPARISON
    // -----------------------------------------------------------------------
    describe('isZero', () => {
        it('should identify zero values', () => {
            expect(Money.isZero(0)).toBe(true);
            expect(Money.isZero('0.00')).toBe(true);
            expect(Money.isZero(null)).toBe(true);
        });

        it('should reject non-zero values', () => {
            expect(Money.isZero(1)).toBe(false);
            expect(Money.isZero(-1)).toBe(false);
        });
    });

    describe('isPositive', () => {
        it('should identify positive values', () => {
            expect(Money.isPositive(100)).toBe(true);
            expect(Money.isPositive(0.01)).toBe(true);
        });

        it('should reject zero and negatives', () => {
            expect(Money.isPositive(0)).toBe(false);
            expect(Money.isPositive(-1)).toBe(false);
        });
    });

    describe('isNegative', () => {
        it('should identify negative values', () => {
            expect(Money.isNegative(-100)).toBe(true);
        });

        it('should reject zero and positives', () => {
            expect(Money.isNegative(0)).toBe(false);
            expect(Money.isNegative(100)).toBe(false);
        });
    });

    describe('equals', () => {
        it('should compare values with currency precision', () => {
            // UGX has 0 decimal places, so 1234.4 rounds to 1234
            expect(Money.equals(1234.4, 1234.3)).toBe(true); // both round to 1234
        });

        it('should detect inequality', () => {
            expect(Money.equals(1234, 1235)).toBe(false);
        });
    });

    describe('max / min', () => {
        it('should return the larger value', () => {
            expect(Money.max(100, 200).toNumber()).toBe(200);
        });

        it('should return the smaller value', () => {
            expect(Money.min(100, 200).toNumber()).toBe(100);
        });
    });

    describe('abs / negate', () => {
        it('should return absolute value', () => {
            expect(Money.abs(-500).toNumber()).toBe(500);
            expect(Money.abs(500).toNumber()).toBe(500);
        });

        it('should negate a value', () => {
            expect(Money.negate(500).toNumber()).toBe(-500);
            expect(Money.negate(-500).toNumber()).toBe(500);
        });
    });

    // -----------------------------------------------------------------------
    // FORMATTING
    // -----------------------------------------------------------------------
    describe('format', () => {
        it('should format with thousands separators (UGX, 0 decimals)', () => {
            expect(Money.format(1234567)).toBe('1,234,567');
        });

        it('should format with custom decimal places', () => {
            expect(Money.format(1234.5678, 2)).toBe('1,234.57');
        });

        it('should format zero', () => {
            expect(Money.format(0)).toBe('0');
        });

        it('should format negative numbers', () => {
            expect(Money.format(-1000)).toBe('-1,000');
        });
    });

    describe('formatCurrency', () => {
        it('should format with UGX symbol by default', () => {
            expect(Money.formatCurrency(1500)).toBe('UGX 1,500');
        });

        it('should format with specified currency', () => {
            expect(Money.formatCurrency(1500.50, 'USD')).toBe('$ 1,500.50');
        });
    });

    describe('toNumber', () => {
        it('should return rounded number', () => {
            expect(Money.toNumber('1234.5678')).toBe(1235); // UGX rounds to 0 places
        });
    });

    describe('toString', () => {
        it('should return fixed-precision string', () => {
            expect(Money.toString(1234.5, 4)).toBe('1234.5000');
        });
    });

    // -----------------------------------------------------------------------
    // ACCOUNTING
    // -----------------------------------------------------------------------
    describe('lineTotal', () => {
        it('should calculate line total correctly', () => {
            expect(Money.lineTotal(3, 1500).toNumber()).toBe(4500);
        });

        it('should round to currency precision', () => {
            expect(Money.lineTotal(3, 1234.56).toNumber()).toBe(3704); // 3703.68 → 3704 for UGX
        });
    });

    describe('applyDiscount', () => {
        it('should apply percentage discount', () => {
            expect(Money.applyDiscount(1000, 10, 'PERCENTAGE').toNumber()).toBe(900); // 10% off
        });

        it('should apply fixed discount', () => {
            expect(Money.applyDiscount(1000, 150, 'FIXED').toNumber()).toBe(850);
        });
    });

    describe('calculateTax', () => {
        it('should calculate tax at 18%', () => {
            expect(Money.calculateTax(1000, 18).toNumber()).toBe(180);
        });

        it('should calculate tax at 0%', () => {
            expect(Money.calculateTax(1000, 0).toNumber()).toBe(0);
        });
    });

    describe('grossMargin', () => {
        it('should calculate gross margin percentage', () => {
            // (1500 - 1200) / 1500 * 100 = 20%
            expect(Money.grossMargin(1500, 1200).toNumber()).toBe(20);
        });

        it('should handle zero revenue', () => {
            expect(Money.grossMargin(0, 1200).toNumber()).toBe(0);
        });
    });

    describe('markup', () => {
        it('should calculate markup percentage', () => {
            // (1500 - 1200) / 1200 * 100 = 25%
            expect(Money.markup(1500, 1200).toNumber()).toBe(25);
        });

        it('should handle zero cost', () => {
            expect(Money.markup(1500, 0).toNumber()).toBe(0);
        });
    });

    describe('applyMarkup', () => {
        it('should apply markup to cost', () => {
            // 1200 + 25% = 1500
            expect(Money.applyMarkup(1200, 25).toNumber()).toBe(1500);
        });
    });

    describe('allocate', () => {
        it('should allocate proportionally', () => {
            const allocated = Money.allocate(100, [1, 1, 1]);
            expect(allocated.length).toBe(3);
            // Sum should equal 100 exactly
            const sum = allocated.reduce((a, b) => a.plus(b), new Decimal(0));
            expect(sum.toNumber()).toBe(100);
        });

        it('should handle unequal ratios', () => {
            const allocated = Money.allocate(100, [3, 1]);
            // 75 and 25
            expect(allocated[0].toNumber()).toBe(75);
            expect(allocated[1].toNumber()).toBe(25);
        });

        it('should handle rounding remainder', () => {
            // 100 / 3 can't be split evenly in integers
            const allocated = Money.allocate(100, [1, 1, 1]);
            const sum = allocated.reduce((a, b) => a.plus(b), new Decimal(0));
            expect(sum.toNumber()).toBe(100); // Must still sum to 100
        });

        it('should handle empty ratios', () => {
            const allocated = Money.allocate(100, []);
            expect(allocated.length).toBe(0);
        });

        it('should handle all-zero ratios', () => {
            const allocated = Money.allocate(100, [0, 0]);
            expect(allocated.every(a => a.isZero())).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // VALIDATION
    // -----------------------------------------------------------------------
    describe('isValid', () => {
        it('should validate proper values', () => {
            expect(Money.isValid(100)).toBe(true);
            expect(Money.isValid('1234.56')).toBe(true);
            expect(Money.isValid(null)).toBe(true);
            expect(Money.isValid(undefined)).toBe(true);
        });
    });

    describe('ensureNonNegative', () => {
        it('should clamp negatives to zero', () => {
            expect(Money.ensureNonNegative(-500).toNumber()).toBe(0);
        });

        it('should keep positives as-is', () => {
            expect(Money.ensureNonNegative(500).toNumber()).toBe(500);
        });

        it('should keep zero as zero', () => {
            expect(Money.ensureNonNegative(0).toNumber()).toBe(0);
        });
    });

    // -----------------------------------------------------------------------
    // CURRENCY CONFIGURATION
    // -----------------------------------------------------------------------
    describe('setCurrency / getCurrency', () => {
        afterEach(() => {
            Money.setCurrency('UGX'); // Reset to default after each test
        });

        it('should switch active currency', () => {
            Money.setCurrency('USD');
            expect(Money.getCurrency().code).toBe('USD');
            expect(Money.getCurrency().decimalPlaces).toBe(2);
        });

        it('should ignore unknown currency codes', () => {
            Money.setCurrency('INVALID');
            expect(Money.getCurrency().code).toBe('UGX'); // Stays at current
        });

        it('should format after currency switch', () => {
            Money.setCurrency('USD');
            // USD has 2 decimal places
            expect(Money.format(1234.5678)).toBe('1,234.57');
        });
    });

    describe('CURRENCIES constant', () => {
        it('should include standard currencies', () => {
            expect(CURRENCIES).toHaveProperty('UGX');
            expect(CURRENCIES).toHaveProperty('USD');
            expect(CURRENCIES).toHaveProperty('EUR');
            expect(CURRENCIES).toHaveProperty('GBP');
            expect(CURRENCIES).toHaveProperty('KES');
        });
    });
});
