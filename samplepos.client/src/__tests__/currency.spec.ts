/**
 * Currency Utility Tests
 * 
 * Tests for formatCurrency, parseCurrency, and arithmetic utilities.
 */

import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
    formatCurrency,
    formatCurrencyDisplay,
    formatCurrencyAccounting,
    parseCurrency,
    addCurrency,
    subtractCurrency,
    multiplyCurrency,
    divideCurrency,
    CURRENCY_CONFIG,
    PRECISION_MODES,
} from '../utils/currency';

describe('Currency Utilities', () => {
    // -------------------------------------------------------------------
    // formatCurrency
    // -------------------------------------------------------------------
    describe('formatCurrency', () => {
        it('should format with UGX symbol by default', () => {
            const result = formatCurrency(1500);
            expect(result).toContain('UGX');
            expect(result).toContain('1,500');
        });

        it('should format zero', () => {
            const result = formatCurrency(0);
            expect(result).toContain('0');
        });

        it('should format negative numbers', () => {
            const result = formatCurrency(-1500);
            expect(result).toContain('-');
            expect(result).toContain('1,500');
        });

        it('should format large numbers with thousands separators', () => {
            const result = formatCurrency(1234567);
            expect(result).toContain('1,234,567');
        });

        it('should format without symbol when showSymbol=false', () => {
            const result = formatCurrency(1500, false);
            expect(result).not.toContain('UGX');
            expect(result).toContain('1,500');
        });

        it('should format with custom precision', () => {
            const result = formatCurrency(1500.1234, true, 4);
            expect(result).toContain('1,500.1234');
        });

        it('should handle string input', () => {
            const result = formatCurrency('1500');
            expect(result).toContain('1,500');
        });

        it('should handle Decimal input', () => {
            const result = formatCurrency(new Decimal(1500));
            expect(result).toContain('1,500');
        });

        it('should handle null/undefined as zero', () => {
            expect(formatCurrency(null as unknown as number)).toContain('0');
            expect(formatCurrency(undefined as unknown as number)).toContain('0');
        });

        it('should handle empty string as zero', () => {
            expect(formatCurrency('')).toContain('0');
        });

        it('should handle NaN as zero', () => {
            expect(formatCurrency(NaN)).toContain('0');
        });
    });

    describe('formatCurrencyDisplay', () => {
        it('should format with DISPLAY precision (2 decimals)', () => {
            const result = formatCurrencyDisplay(1500.1234);
            expect(result).toContain('1,500.12');
        });
    });

    describe('formatCurrencyAccounting', () => {
        it('should format with ACCOUNTING precision (4 decimals)', () => {
            const result = formatCurrencyAccounting(1500.12345678);
            expect(result).toContain('1,500.1235');
        });
    });

    // -------------------------------------------------------------------
    // parseCurrency
    // -------------------------------------------------------------------
    describe('parseCurrency', () => {
        it('should parse numeric value', () => {
            expect(parseCurrency(1500).toNumber()).toBe(1500);
        });

        it('should parse formatted string', () => {
            expect(parseCurrency('UGX 1,500.50').toNumber()).toBe(1500.50);
        });

        it('should parse plain number string', () => {
            expect(parseCurrency('1234.56').toNumber()).toBe(1234.56);
        });

        it('should handle null as zero', () => {
            expect(parseCurrency(null).toNumber()).toBe(0);
        });

        it('should handle undefined as zero', () => {
            expect(parseCurrency(undefined).toNumber()).toBe(0);
        });
    });

    // -------------------------------------------------------------------
    // Arithmetic
    // -------------------------------------------------------------------
    describe('addCurrency', () => {
        it('should add two amounts', () => {
            expect(addCurrency(1000, 500).toNumber()).toBe(1500);
        });

        it('should handle decimal precision', () => {
            // 0.1 + 0.2 should not produce floating point errors
            const result = addCurrency(0.1, 0.2);
            expect(result.toNumber()).toBe(0.3);
        });
    });

    describe('subtractCurrency', () => {
        it('should subtract correctly', () => {
            expect(subtractCurrency(1000, 300).toNumber()).toBe(700);
        });

        it('should handle negative results', () => {
            expect(subtractCurrency(100, 500).toNumber()).toBe(-400);
        });
    });

    describe('multiplyCurrency', () => {
        it('should multiply correctly', () => {
            expect(multiplyCurrency(1000, 3).toNumber()).toBe(3000);
        });

        it('should handle percentage calculations', () => {
            expect(multiplyCurrency(1000, 0.18).toNumber()).toBe(180);
        });
    });

    describe('divideCurrency', () => {
        it('should divide correctly', () => {
            expect(divideCurrency(1000, 4).toNumber()).toBe(250);
        });

        it('should use 1 as divisor when 0 is falsy', () => {
            // divideCurrency uses (divisor || 1), so 0 becomes 1
            const result = divideCurrency(1000, 0);
            expect(result.toNumber()).toBe(1000);
        });
    });

    // -------------------------------------------------------------------
    // Configuration
    // -------------------------------------------------------------------
    describe('CURRENCY_CONFIG', () => {
        it('should be configured for UGX', () => {
            expect(CURRENCY_CONFIG.code).toBe('UGX');
            expect(CURRENCY_CONFIG.symbol).toBe('UGX');
        });

        it('should use comma as thousands separator', () => {
            expect(CURRENCY_CONFIG.thousandsSeparator).toBe(',');
        });

        it('should use dot as decimal separator', () => {
            expect(CURRENCY_CONFIG.decimalSeparator).toBe('.');
        });
    });

    describe('PRECISION_MODES', () => {
        it('should have correct precision levels', () => {
            expect(PRECISION_MODES.DISPLAY).toBe(2);
            expect(PRECISION_MODES.ACCOUNTING).toBe(4);
            expect(PRECISION_MODES.CALCULATION).toBe(6);
            expect(PRECISION_MODES.INPUT).toBe(6);
        });
    });
});
