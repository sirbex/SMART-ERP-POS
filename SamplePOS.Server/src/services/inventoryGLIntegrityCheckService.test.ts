/**
 * InventoryGLIntegrityCheckService — Unit Tests
 *
 * Tests the drift detection, threshold math, and alert-level calculation
 * WITHOUT a live database connection. All DB calls are mocked.
 */

import { jest } from '@jest/globals';
import type { Pool } from 'pg';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal Pool mock whose `query` method returns preset values in order.
 * Rows must be pre-serialised as strings (like PostgreSQL actually returns them).
 */
function makePool(glBalanceStr: string, subledgerStr: string): Pool {
    const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ balance: glBalanceStr }] })   // GL query
        .mockResolvedValueOnce({ rows: [{ total: subledgerStr }] });    // subledger query

    return { query } as unknown as Pool;
}

// ---------------------------------------------------------------------------
// Import AFTER mocking dateRange so we have a deterministic date
// ---------------------------------------------------------------------------

jest.unstable_mockModule('../utils/dateRange.js', () => ({
    getBusinessDate: () => '2026-04-22',
}));

const { runInventoryGLIntegrityCheck } = await import('./inventoryGLIntegrityCheckService.js');

// ---------------------------------------------------------------------------
// TESTS
// ---------------------------------------------------------------------------

describe('runInventoryGLIntegrityCheck', () => {
    it('returns alertLevel=OK when GL and subledger match exactly', async () => {
        const pool = makePool('1000000', '1000000');
        const result = await runInventoryGLIntegrityCheck(pool);

        expect(result.glBalance).toBe(1000000);
        expect(result.subledgerBalance).toBe(1000000);
        expect(result.drift).toBe(0);
        expect(result.isDrifting).toBe(false);
        expect(result.alertLevel).toBe('OK');
    });

    it('returns alertLevel=OK when drift is within the fixed 5000 floor', async () => {
        // GL = 1000000, subledger = 999998 → drift = 2 < 5000
        const pool = makePool('1000000', '999998');
        const result = await runInventoryGLIntegrityCheck(pool);

        expect(result.drift).toBe(2);
        expect(result.isDrifting).toBe(false);
        expect(result.alertLevel).toBe('OK');
    });

    it('returns alertLevel=WARN when |drift| > threshold but <= 10x threshold', async () => {
        // GL = 1000000, subledger = 994000 → drift = 6000 > threshold(5000)
        const pool = makePool('1000000', '994000');
        const result = await runInventoryGLIntegrityCheck(pool);

        expect(result.drift).toBe(6000);
        expect(result.isDrifting).toBe(true);
        expect(result.alertLevel).toBe('WARN');
    });

    it('returns alertLevel=CRITICAL when |drift| > 10x threshold', async () => {
        // GL = 1000000, threshold = max(5000, 0.0001 * 1000000) = max(5000, 100) = 5000
        // drift = 60000 > 50000 (10x threshold) → CRITICAL
        const pool = makePool('1000000', '940000');
        const result = await runInventoryGLIntegrityCheck(pool);

        expect(result.drift).toBe(60000);
        expect(result.isDrifting).toBe(true);
        expect(result.alertLevel).toBe('CRITICAL');
    });

    it('correctly calculates percentage-based threshold for large GL balance', async () => {
        // GL = 500_000_000 → threshold = max(5000, 0.0001 * 500_000_000) = max(5000, 50000) = 50000
        // drift = 30000 < 50000 → OK
        const pool = makePool('500000000', '499970000');
        const result = await runInventoryGLIntegrityCheck(pool);

        expect(result.threshold).toBe(50000);
        expect(result.drift).toBe(30000);
        expect(result.isDrifting).toBe(false);
        expect(result.alertLevel).toBe('OK');
    });

    it('handles negative drift (GL understated vs subledger)', async () => {
        // GL = 900000, subledger = 910000 → drift = -10000 < threshold
        const pool = makePool('900000', '910000');
        const result = await runInventoryGLIntegrityCheck(pool);

        expect(result.drift).toBe(-10000);
        expect(result.glBalance).toBe(900000);
        expect(result.subledgerBalance).toBe(910000);
        expect(result.isDrifting).toBe(true);
        expect(result.alertLevel).toBe('WARN');
    });

    it('returns asOfDate from getBusinessDate', async () => {
        const pool = makePool('0', '0');
        const result = await runInventoryGLIntegrityCheck(pool);
        expect(result.asOfDate).toBe('2026-04-22');
    });

    it('handles zero GL balance gracefully (threshold = 5000 floor)', async () => {
        const pool = makePool('0', '0');
        const result = await runInventoryGLIntegrityCheck(pool);

        expect(result.glBalance).toBe(0);
        expect(result.subledgerBalance).toBe(0);
        expect(result.drift).toBe(0);
        expect(result.threshold).toBe(5000);
        expect(result.isDrifting).toBe(false);
        expect(result.alertLevel).toBe('OK');
    });

    it('returns a non-empty summary string in all cases', async () => {
        const pool1 = makePool('100000', '100000');
        const r1 = await runInventoryGLIntegrityCheck(pool1);
        expect(r1.summary.length).toBeGreaterThan(0);

        const pool2 = makePool('100000', '80000');
        const r2 = await runInventoryGLIntegrityCheck(pool2);
        expect(r2.summary.length).toBeGreaterThan(0);
    });
});
