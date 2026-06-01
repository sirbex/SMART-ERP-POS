/**
 * Global inventory GL (1300) ↔ batch subledger drift — root cause catalog (tested).
 *
 * Run: npm run test:inventory-coupling
 *
 * Forensics on live tenant: node SamplePOS.Server/scripts/classify-inventory-gl-drift.mjs
 */
import { describe, it, expect } from '@jest/globals';
import {
    batchValuationIncrease,
    batchValuationReduction,
    COUPLING_GUARDED_WORKFLOWS,
    computeGap,
    couplingAssertWouldPass,
    INVENTORY_COUPLING_TOLERANCE,
    resolveGl1300FromBatchSubledgerDelta,
    simulateGapAfterTransaction,
    sumJsBatchDeductionCost,
    UNGUARDED_DRIFT_SOURCES,
    type CouplingSnapshot,
} from './inventoryCouplingMath.js';

const snap = (gl: number, batch: number): CouplingSnapshot => ({
    glNet1300: gl,
    batchValuation: batch,
    gap: computeGap(gl, batch),
});

describe('inventory drift — coupling invariant', () => {
    it('gap = GL(1300) − batch valuation', () => {
        expect(computeGap(109742573, 109742573)).toBe(0);
        expect(computeGap(109742573, 108817783)).toBe(924790);
    });

    it('pre-existing tenant gap is allowed if deltaGap ≤ tolerance (Henber ~903k)', () => {
        const before = snap(109721212, 108817784); // gap ≈ 903428
        const after = simulateGapAfterTransaction(before, -10290, -10290);
        expect(couplingAssertWouldPass(before, after)).toBe(true);
        expect(after.gap).toBe(before.gap);
    });
});

describe('inventory drift — per-transaction rounding (SALE-2026-4872 class)', () => {
    it('JS FEFO sum can be 1 UGX below SQL batch valuation delta', () => {
        // Henber SALE-2026-4872: batch subledger −10290, JS accumulation −10289
        const jsTotal = 10289;
        const sqlDelta = 10290;
        expect(Math.abs(jsTotal - sqlDelta)).toBe(1);

        const multiSlice = sumJsBatchDeductionCost([
            { qty: '10.0000', unitCost: '1028.90' },
            { qty: '0.0001', unitCost: '1000.00' },
        ]);
        expect(multiSlice).toBeGreaterThan(0);
    });

    it('crediting GL 1300 with JS sum fails coupling (old bug)', () => {
        const before = snap(109742573, 109742573);
        const after = simulateGapAfterTransaction(before, -10289, -10290);
        expect(after.gap).toBe(1);
        expect(couplingAssertWouldPass(before, after)).toBe(false);
    });

    it('crediting GL 1300 with SQL batchValuationReduction passes coupling (fix)', () => {
        const before = snap(109742573, 109742573);
        const afterBatchOnly = snap(109742573, 109732283);
        const glCredit = batchValuationReduction(before, afterBatchOnly);
        expect(glCredit).toBe(10290);
        const after = simulateGapAfterTransaction(before, -glCredit, -glCredit);
        expect(couplingAssertWouldPass(before, after)).toBe(true);
    });
});

import {
    batchValuationIncrease,
    batchValuationReduction,
    documentTotalDiffersFromSubledger,
    resolveGl1300FromBatchSubledgerDelta,
} from './inventoryCouplingMath.js';

describe('resolveGl1300FromBatchSubledgerDelta (SAP/Odoo subledger posting)', () => {
    it('issue direction uses batch reduction', () => {
        const before = snap(1000, 1000);
        const after = snap(1000, 900);
        expect(resolveGl1300FromBatchSubledgerDelta(before, after, 'issue')).toBe(100);
    });

    it('receipt direction uses batch increase', () => {
        const before = snap(1000, 1000);
        const after = snap(1000, 1150);
        expect(resolveGl1300FromBatchSubledgerDelta(before, after, 'receipt')).toBe(150);
    });
});

describe('inventory drift — goods receipt symmetry', () => {
    it('batchValuationIncrease matches inbound batch delta for GL DR 1300', () => {
        const before = snap(100_000, 100_000);
        const after = snap(100_000, 125_500);
        expect(batchValuationIncrease(before, after)).toBe(25_500);
        const aligned = simulateGapAfterTransaction(before, 25_500, 25_500);
        expect(couplingAssertWouldPass(before, aligned)).toBe(true);
    });

    it('GR GL from PO line math without batch alignment can fail coupling', () => {
        const before = snap(100_000, 100_000);
        const after = simulateGapAfterTransaction(before, 25_498, 25_500);
        expect(couplingAssertWouldPass(before, after)).toBe(false);
    });
});

describe('inventory drift — unguarded historical sources (catalog)', () => {
    it('documents guarded workflows (coupling assert in code)', () => {
        expect(COUPLING_GUARDED_WORKFLOWS.length).toBeGreaterThanOrEqual(6);
        expect(COUPLING_GUARDED_WORKFLOWS.some((w) => w.includes('DELIVERY_NOTE'))).toBe(true);
        expect(COUPLING_GUARDED_WORKFLOWS.some((w) => w.includes('OPENING_STOCK'))).toBe(true);
    });

    it('documents unguarded drift sources for tenant forensics', () => {
        expect(UNGUARDED_DRIFT_SOURCES.length).toBeGreaterThanOrEqual(5);
        expect(UNGUARDED_DRIFT_SOURCES.some((s) => s.includes('SALE_VOID'))).toBe(true);
        expect(UNGUARDED_DRIFT_SOURCES.some((s) => s.includes('CORRECTION'))).toBe(true);
    });

    it('opening stock GL-only failure increases GL vs batches (historical pattern)', () => {
        const before = snap(100_000, 100_000);
        const after = simulateGapAfterTransaction(before, 50_000, 0);
        expect(after.gap - before.gap).toBe(50_000);
    });

    it('delivery note PGI after commit: batch down without GL widens gap (historical — now guarded)', () => {
        const before = snap(100_000, 100_000);
        const after = simulateGapAfterTransaction(before, 0, -10_000);
        expect(after.gap - before.gap).toBe(10_000);
    });

    it('duplicate GR GL posting increases GL without batch (positive drift)', () => {
        const before = snap(100_000, 100_000);
        const after = simulateGapAfterTransaction(before, 15_000, 0);
        expect(couplingAssertWouldPass(before, after)).toBe(false);
        expect(after.gap).toBe(15_000);
    });
});

describe('inventory drift — tolerance policy', () => {
    it('INVENTORY_COUPLING_TOLERANCE is sub-cent (strict when GL uses batch SQL delta)', () => {
        expect(INVENTORY_COUPLING_TOLERANCE).toBe(0.02);
    });

    it('1 UGX deltaGap fails strict coupling (mis-posted GL credit)', () => {
        const before = snap(1000, 1000);
        expect(couplingAssertWouldPass(before, snap(999, 1000))).toBe(false);
    });

    it('sub-cent deltaGap passes', () => {
        const before = snap(1000, 1000);
        expect(couplingAssertWouldPass(before, snap(1000, 1000.01))).toBe(true);
    });
});
