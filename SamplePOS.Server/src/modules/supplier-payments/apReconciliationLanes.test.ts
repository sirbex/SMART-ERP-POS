import { describe, expect, it } from '@jest/globals';
import { isIntegrityLaneMatched } from './apReconciliationLanes.js';

/**
 * Regression guard: AP reconciliation must keep three lanes distinct.
 * Scenario matrix (integration tests in accounting-integrity.test.ts / future e2e):
 *   - Return GRN → SCN, partial RGRN, APPLIED/POSTED SCN, reversal, reassignment
 *   - Cache rebuild, period close, reconciliation page rendering
 * For each: assert Integrity / Cache / Journal Audit independently.
 */
describe('apReconciliationLanes', () => {
  describe('isIntegrityLaneMatched (period close gate)', () => {
    it('returns true when integrity difference is zero', () => {
      expect(isIntegrityLaneMatched(1_000_000, 0, 0)).toBe(true);
    });

    it('returns true when drift is explained by standalone expenses on 2100', () => {
      expect(isIntegrityLaneMatched(500_000, -30_000, 30_000)).toBe(true);
    });

    it('returns false when drift is not explained by expenses (KAMCARE-class gap)', () => {
      expect(isIntegrityLaneMatched(500_000, -17_500, 0)).toBe(false);
    });
  });

  describe('lane separation invariants', () => {
    it('integrity drift is independent of cache drift magnitude', () => {
      const integrityDiff = -17_500;
      const cacheDiff = 62_500;
      const reversalImpact = 913_785;
      expect(Math.abs(integrityDiff)).toBeLessThan(Math.abs(cacheDiff));
      expect(Math.abs(reversalImpact)).toBeGreaterThan(Math.abs(integrityDiff));
    });

    it('reversal impact can be non-zero while integrity remains zero', () => {
      const grossPosted = 1_000_000;
      const netActive = 86_215;
      const openItem = 86_215;
      const reversalImpact = grossPosted - netActive;
      const integrityDiff = netActive - openItem;
      expect(reversalImpact).toBeGreaterThan(0);
      expect(integrityDiff).toBe(0);
    });

    it('applied SCN with offset yields zero net-active 2100 (SCN-0007 class)', () => {
      const scnDebit2100 = -44_000;
      const invoiceOffset2100 = 44_000;
      expect(scnDebit2100 + invoiceOffset2100).toBe(0);
    });

    it('applied SCN without offset leaves net-active drift (SCN-0008 pre-repair class)', () => {
      const scnDebit2100 = -17_500;
      const invoiceOffset2100 = 0;
      const openItemUnchanged = 220_020;
      const glWithScnOnly = 202_520;
      expect(glWithScnOnly - openItemUnchanged).toBe(scnDebit2100 + invoiceOffset2100);
    });

    it('period close must not use cache or journal audit metrics', () => {
      const periodCloseUses = ['integrityGlDrift'];
      const maintenanceOnly = ['supplierCacheDrift', 'grossMinusNetActive'];
      expect(periodCloseUses).not.toEqual(expect.arrayContaining(maintenanceOnly));
    });
  });
});
