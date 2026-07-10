import { describe, expect, it } from '@jest/globals';
import { formatGrLabel, parseExceptionId } from './exceptionTraceService.js';

const SAMPLE_UUID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';

describe('parseExceptionId', () => {
    it('parses entity-level AP exception ids', () => {
        const id = `exc-ap-${SAMPLE_UUID}`;
        const parsed = parseExceptionId(id);
        expect(parsed.exceptionId).toBe(id);
        expect(parsed.domain).toBe('ap');
        expect(parsed.lane).toBe('integrity');
        expect(parsed.entityId).toBe(SAMPLE_UUID);
        expect(parsed.isDomainLevel).toBe(false);
    });

    it('parses entity-level AR and inventory exception ids', () => {
        const ar = parseExceptionId(`exc-ar-${SAMPLE_UUID}`);
        expect(ar.domain).toBe('ar');
        expect(ar.entityId).toBe(SAMPLE_UUID);

        const inv = parseExceptionId(`exc-inventory-${SAMPLE_UUID}`);
        expect(inv.domain).toBe('inventory');
        expect(inv.entityId).toBe(SAMPLE_UUID);
    });

    it('parses domain-level and cache warning ids', () => {
        const domain = parseExceptionId('exc-inventory-domain');
        expect(domain.isDomainLevel).toBe(true);
        expect(domain.domain).toBe('inventory');
        expect(domain.lane).toBe('integrity');

        const cache = parseExceptionId('warn-cache-ap');
        expect(cache.isDomainLevel).toBe(true);
        expect(cache.lane).toBe('cache');
        expect(cache.domain).toBe('ap');

        const cash = parseExceptionId('exc-cash-summary');
        expect(cash.domain).toBe('cash');
        expect(cash.isDomainLevel).toBe(true);
    });

    it('rejects unknown or malformed ids', () => {
        expect(() => parseExceptionId('exc-ap-not-a-uuid')).toThrow(/Invalid exception entity id/);
        expect(() => parseExceptionId('unknown-id')).toThrow(/Unknown exception id format/);
    });
});

describe('formatGrLabel', () => {
    it('preserves GR-prefixed receipt numbers', () => {
        expect(formatGrLabel('GR-2026-0245')).toBe('GR-2026-0245');
    });

    it('prefixes numeric receipt numbers', () => {
        expect(formatGrLabel('245')).toBe('GR-245');
    });
});
