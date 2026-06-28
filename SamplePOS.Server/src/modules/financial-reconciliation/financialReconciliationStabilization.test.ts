import { describe, expect, it } from '@jest/globals';
import {
  LEGACY_RECONCILIATION_SURFACES,
  getLegacySurface,
} from './legacyReconciliationRegistry.js';
import { legacyReconciliationMeta } from './legacyReconciliationAudit.js';

describe('Phase F0 stabilization', () => {
  describe('legacy consumer registry', () => {
    it('includes all ERP legacy account report endpoints', () => {
      const ids = LEGACY_RECONCILIATION_SURFACES.map((s) => s.id);
      expect(ids).toContain('erp.reconciliation.summary');
      expect(ids).toContain('erp.reconciliation.accounts-payable');
      expect(ids).toContain('erp.reconciliation.accounts-receivable');
      expect(ids).toContain('erp.reconciliation.inventory');
    });

    it('includes integrity route successors for ap ar inventory', () => {
      const ap = getLegacySurface('accounting.integrity.ap');
      const ar = getLegacySurface('accounting.integrity.ar');
      const inv = getLegacySurface('accounting.integrity.inventory');
      expect(ap?.successor).toContain('/ap/integrity');
      expect(ar?.successor).toContain('/ar/integrity');
      expect(inv?.successor).toContain('/inventory/integrity');
    });

    it('marks all surfaces for Phase F sunset', () => {
      for (const surface of LEGACY_RECONCILIATION_SURFACES) {
        expect(surface.sunsetPhase).toBe('F');
        expect(surface.successor.length).toBeGreaterThan(0);
      }
    });
  });

  describe('legacyReconciliationMeta', () => {
    it('returns F0 stabilization metadata with successor', () => {
      const surface = getLegacySurface('erp.reconciliation.summary')!;
      const meta = legacyReconciliationMeta(surface);
      expect(meta.deprecated).toBe(true);
      expect(meta.stabilizationPhase).toBe('F0');
      expect(meta.successor).toContain('financial-health');
    });
  });
});
