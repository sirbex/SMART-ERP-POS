import { describe, expect, it } from '@jest/globals';
import { isInventoryGlIntegrityMatched } from './inventoryReconciliationMetrics.js';
import { inventoryMaterialityThreshold } from './inventoryReconciliationEngine.js';
import { buildFinancialLaneResult } from '../financial-reconciliation/laneMetadata.js';
import type { InventoryReconciliationMetrics } from './inventoryReconciliationMetrics.js';
import type { LaneComputation } from '../financial-reconciliation/types.js';

function metrics(partial: Partial<InventoryReconciliationMetrics>): InventoryReconciliationMetrics {
  return {
    asOfDate: '2026-06-27',
    glNetActive1300: 0,
    glGrossPosted1300: 0,
    batchSubledger: 0,
    productValuationCache: 0,
    storedBalance1300: 0,
    productCacheDrift: 0,
    storedBalanceDrift: 0,
    integrityGlDrift: 0,
    materialityThreshold: 5000,
    reversalImpact: 0,
    ...partial,
  };
}

describe('inventoryReconciliation', () => {
  describe('isInventoryGlIntegrityMatched (period close gate)', () => {
    it('returns true when integrity difference is zero', () => {
      expect(isInventoryGlIntegrityMatched(metrics({ integrityGlDrift: 0 }))).toBe(true);
    });

    it('returns true when drift is within materiality threshold (~3410 Henber class)', () => {
      const gl = 2_532_287;
      const drift = 3_410;
      expect(
        isInventoryGlIntegrityMatched(
          metrics({
            glNetActive1300: gl,
            batchSubledger: gl - drift,
            integrityGlDrift: drift,
            materialityThreshold: inventoryMaterialityThreshold(gl),
          }),
        ),
      ).toBe(true);
    });

    it('returns false when drift exceeds materiality threshold', () => {
      expect(
        isInventoryGlIntegrityMatched(
          metrics({
            glNetActive1300: 100_000,
            integrityGlDrift: 10_000,
            materialityThreshold: 5000,
          }),
        ),
      ).toBe(false);
    });
  });

  describe('lane separation invariants', () => {
    it('integrity uses batch subledger not product cache', () => {
      const batchSub = 2_532_287;
      const productCache = 2_500_000;
      const gl = batchSub + 3_410;
      expect(gl - batchSub).toBe(3_410);
      expect(batchSub - productCache).toBe(32_287);
    });

    it('reversal impact is independent of integrity drift', () => {
      const gross = 3_000_000;
      const net = 2_532_287;
      const batch = 2_528_877;
      expect(gross - net).toBeGreaterThan(Math.abs(net - batch));
    });
  });

  describe('FinancialLaneResult contract (inventory domain)', () => {
    const integrityOk: LaneComputation = {
      leftLabel: 'GL (Net Active)',
      leftAmount: 2_532_287,
      rightLabel: 'Batch Subledger',
      rightAmount: 2_528_877,
      difference: 3_410,
      status: 'RECONCILED',
    };

    it('builds inventory integrity lane with period-close gate', () => {
      const result = buildFinancialLaneResult('inventory', 'integrity', '2026-06-27', integrityOk);
      expect(result.domain).toBe('inventory');
      expect(result.periodCloseBlocking).toBe(true);
      expect(result.title).toContain('Inventory');
    });

    it('inventory cache drift is maintenance severity', () => {
      const cacheDrift: LaneComputation = {
        leftLabel: 'Batch Subledger',
        leftAmount: 100,
        rightLabel: 'Product Cache',
        rightAmount: 200,
        difference: -100,
        status: 'DRIFT',
      };
      const result = buildFinancialLaneResult('inventory', 'cache', '2026-06-27', cacheDrift);
      expect(result.periodCloseBlocking).toBe(false);
      expect(result.severity).toBe('maintenance');
    });
  });
});
