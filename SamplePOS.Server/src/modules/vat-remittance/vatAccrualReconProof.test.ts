/**
 * Phase 3B — VAT accrual recon + Decision B metadata
 */
import { describe, expect, it } from '@jest/globals';
import { ytdStart } from './vatAccrualReconService.js';
import {
  resolvePeriodCloseBlocking,
  resolveSeverity,
  buildFinancialLaneResult,
} from '../financial-reconciliation/laneMetadata.js';

describe('VAT accrual recon (Phase 3B)', () => {
  it('ytdStart uses calendar year of asOfDate', () => {
    expect(ytdStart('2026-07-12')).toBe('2026-01-01');
  });

  it('Decision B: VAT integrity never blocks period close', () => {
    expect(resolvePeriodCloseBlocking('integrity', 'vat')).toBe(false);
    expect(resolvePeriodCloseBlocking('integrity', 'ap')).toBe(true);
  });

  it('INFORMATIONAL VAT drift is not critical severity', () => {
    expect(resolveSeverity('integrity', 'INFORMATIONAL', 50_000)).toBe('informational');
    const result = buildFinancialLaneResult('vat', 'integrity', '2026-07-12', {
      leftLabel: 'Document',
      leftAmount: 100,
      rightLabel: 'GL 2300',
      rightAmount: 150,
      difference: 50,
      status: 'INFORMATIONAL',
    });
    expect(result.periodCloseBlocking).toBe(false);
    expect(result.severity).toBe('informational');
    expect(result.recommendedAction).toMatch(/Decision B/i);
  });
});
