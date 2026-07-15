import { describe, expect, it } from '@jest/globals';
import {
  buildFinancialLaneResult,
  resolvePeriodCloseBlocking,
  resolveRecommendedAction,
  resolveSeverity,
} from './laneMetadata.js';
import type { LaneComputation } from './types.js';

describe('financial reconciliation framework', () => {
  const integrityOk: LaneComputation = {
    leftLabel: 'GL',
    leftAmount: 1_000_000,
    rightLabel: 'Subledger',
    rightAmount: 1_000_000,
    difference: 0,
    status: 'RECONCILED',
  };

  const integrityBad: LaneComputation = {
    ...integrityOk,
    difference: -17_500,
    status: 'DISCREPANCY',
  };

  const cacheDrift: LaneComputation = {
    leftLabel: 'Open-item',
    leftAmount: 100,
    rightLabel: 'Cache',
    rightAmount: 600,
    difference: -500,
    status: 'DRIFT',
  };

  describe('lane metadata', () => {
    it('integrity lane is period-close gate; cache, history, quarantine, and writeoff are not', () => {
      expect(resolvePeriodCloseBlocking('integrity')).toBe(true);
      expect(resolvePeriodCloseBlocking('cache')).toBe(false);
      expect(resolvePeriodCloseBlocking('history')).toBe(false);
      expect(resolvePeriodCloseBlocking('quarantine')).toBe(false);
      expect(resolvePeriodCloseBlocking('writeoff')).toBe(false);
    });

    it('assigns critical severity only when integrity is discrepant', () => {
      expect(resolveSeverity('integrity', 'RECONCILED', 0)).toBe('informational');
      expect(resolveSeverity('integrity', 'DISCREPANCY', -17_500)).toBe('critical');
    });

    it('assigns maintenance severity for cache drift', () => {
      expect(resolveSeverity('cache', 'DRIFT', -500)).toBe('maintenance');
      expect(resolveSeverity('cache', 'HEALTHY', 0)).toBe('informational');
    });

    it('history and quarantine lanes are always informational', () => {
      expect(resolveSeverity('history', 'INFORMATIONAL', -913_285)).toBe('informational');
      expect(resolveSeverity('quarantine', 'INFORMATIONAL', 50_000)).toBe('informational');
      expect(resolveSeverity('writeoff', 'INFORMATIONAL', 50_000)).toBe('informational');
    });

    it('recommends maintenance action for cache drift only', () => {
      expect(resolveRecommendedAction('ap', 'cache', 'DRIFT', -500)).toMatch(/supplier/i);
      expect(resolveRecommendedAction('ar', 'cache', 'DRIFT', -100)).toMatch(/customer/i);
      expect(resolveRecommendedAction('inventory', 'cache', 'DRIFT', -100)).toMatch(/product|inventory/i);
      expect(resolveRecommendedAction('inventory', 'cache', 'DRIFT', -100)).not.toMatch(/POST \/api/i);
      expect(resolveRecommendedAction('ap', 'integrity', 'RECONCILED', 0)).toBeNull();
    });
  });

  describe('FinancialLaneResult contract', () => {
    it('builds unified result with gatesPeriodClose alias', () => {
      const result = buildFinancialLaneResult('ap', 'integrity', '2026-06-27', integrityOk);
      expect(result.domain).toBe('ap');
      expect(result.lane).toBe('integrity');
      expect(result.periodCloseBlocking).toBe(true);
      expect(result.gatesPeriodClose).toBe(true);
      expect(result.difference).toBe(0);
      expect(result.title).toContain('Accounts Payable');
    });

    it('cache lane does not gate period close', () => {
      const result = buildFinancialLaneResult('ap', 'cache', '2026-06-27', cacheDrift);
      expect(result.periodCloseBlocking).toBe(false);
      expect(result.severity).toBe('maintenance');
      expect(result.recommendedAction).not.toBeNull();
    });

    it('integrity discrepancy is critical with recommended action', () => {
      const result = buildFinancialLaneResult('ap', 'integrity', '2026-06-27', integrityBad);
      expect(result.severity).toBe('critical');
      expect(result.recommendedAction).toMatch(/Review source documents|Investigate/i);
    });
  });

  describe('lane separation invariants (platform)', () => {
    it('reversal impact can be large while integrity difference is zero', () => {
      const audit: LaneComputation = {
        leftLabel: 'Gross',
        leftAmount: 1_000_000,
        rightLabel: 'Net',
        rightAmount: 86_215,
        difference: 913_785,
        status: 'INFORMATIONAL',
      };
      const auditResult = buildFinancialLaneResult('ap', 'history', '2026-06-27', audit);
      const integrityResult = buildFinancialLaneResult('ap', 'integrity', '2026-06-27', integrityOk);
      expect(Math.abs(auditResult.difference)).toBeGreaterThan(0);
      expect(integrityResult.difference).toBe(0);
      expect(auditResult.periodCloseBlocking).toBe(false);
      expect(integrityResult.periodCloseBlocking).toBe(true);
    });
  });
});
