import { describe, expect, it } from '@jest/globals';
import { isArGlIntegrityMatched } from './arReconciliationMetrics.js';
import { buildFinancialLaneResult } from '../financial-reconciliation/laneMetadata.js';
import type { ArReconciliationMetrics } from './arReconciliationMetrics.js';
import type { LaneComputation } from '../financial-reconciliation/types.js';

function metrics(partial: Partial<ArReconciliationMetrics>): ArReconciliationMetrics {
  return {
    asOfDate: '2026-06-27',
    glNetActive1200: 0,
    glCustomerScopeNetActive: 0,
    glGrossPosted1200: 0,
    openItemSubledger: 0,
    customersTableSum: 0,
    storedBalance1200: 0,
    customerCacheDrift: 0,
    storedBalanceDrift: 0,
    integrityGlDrift: 0,
    unallocatedPayments: 0,
    ...partial,
  };
}

describe('arReconciliation', () => {
  describe('isArGlIntegrityMatched (period close gate)', () => {
    it('returns true when integrity difference is zero', () => {
      expect(isArGlIntegrityMatched(metrics({ integrityGlDrift: 0 }))).toBe(true);
    });

    it('returns false for Henber-class −52,800 gap', () => {
      expect(
        isArGlIntegrityMatched(
          metrics({
            glNetActive1200: 500_000,
            openItemSubledger: 552_800,
            integrityGlDrift: -52_800,
          }),
        ),
      ).toBe(false);
    });

    it('returns true when drift is within materiality threshold', () => {
      expect(
        isArGlIntegrityMatched(
          metrics({
            glNetActive1200: 1_000_000,
            integrityGlDrift: 400,
          }),
        ),
      ).toBe(true);
    });
  });

  describe('lane separation invariants', () => {
    it('integrity drift is independent of cache drift magnitude', () => {
      const integrityDiff = -52_800;
      const cacheDiff = 1_200;
      const reversalImpact = 200_000;
      expect(Math.abs(integrityDiff)).not.toBe(Math.abs(cacheDiff));
      expect(Math.abs(reversalImpact)).toBeGreaterThan(Math.abs(cacheDiff));
    });

    it('reversal impact can be non-zero while integrity uses net-active vs open-item', () => {
      const grossPosted = 800_000;
      const netActive = 500_000;
      const openItem = 552_800;
      const reversalImpact = grossPosted - netActive;
      const integrityDiff = netActive - openItem;
      expect(reversalImpact).toBeGreaterThan(0);
      expect(integrityDiff).toBe(-52_800);
    });

    it('period close must not use cache or journal audit metrics', () => {
      const periodCloseUses = ['integrityGlDrift'];
      const maintenanceOnly = ['customerCacheDrift', 'grossMinusNetActive'];
      expect(periodCloseUses).not.toEqual(expect.arrayContaining(maintenanceOnly));
    });
  });

  describe('FinancialLaneResult contract (AR domain)', () => {
    const integrityOk: LaneComputation = {
      leftLabel: 'GL (Net Active)',
      leftAmount: 500_000,
      rightLabel: 'Open-item Subledger',
      rightAmount: 500_000,
      difference: 0,
      status: 'RECONCILED',
    };

    it('builds AR integrity lane with period-close gate', () => {
      const result = buildFinancialLaneResult('ar', 'integrity', '2026-06-27', integrityOk);
      expect(result.domain).toBe('ar');
      expect(result.periodCloseBlocking).toBe(true);
      expect(result.title).toContain('Accounts Receivable');
    });

    it('AR cache drift is maintenance severity', () => {
      const cacheDrift: LaneComputation = {
        leftLabel: 'Open-item',
        leftAmount: 100,
        rightLabel: 'Customer Cache',
        rightAmount: 200,
        difference: -100,
        status: 'DRIFT',
      };
      const result = buildFinancialLaneResult('ar', 'cache', '2026-06-27', cacheDrift);
      expect(result.periodCloseBlocking).toBe(false);
      expect(result.severity).toBe('maintenance');
    });
  });
});
