/**
 * Loss & Quarantine invariants — Phase 2A unit tests (ADR-004)
 */

import {
  assertClassifierConsistent,
  assertDisposalCouplesSubledger,
  assertQuarantineDoesNotPostGl,
  classifyStockMovement,
  expenseAccountForDisposal,
  expenseAccountForLossReason,
  shouldSkipGlRepairForMovement,
  LossQuarantineInvariantError,
} from '@shared/loss-quarantine/index.js';

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
    throw new Error(`Expected ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(LossQuarantineInvariantError);
    expect((err as LossQuarantineInvariantError).code).toBe(code);
  }
}

describe('Loss & Quarantine invariants (LQ-INV Phase 2A)', () => {
  describe('LQ-INV-1 / LQ-INV-3 classifiers', () => {
    it('rejects quarantine with postsGl=true', () => {
      expectCode(
        () =>
          assertQuarantineDoesNotPostGl({
            economicEvent: 'QUARANTINE_TRANSFER',
            postsGl: true,
          }),
        'LQ_INV_1_QUARANTINE_GL',
      );
    });

    it('accepts quarantine with postsGl=false', () => {
      expect(() =>
        assertClassifierConsistent({
          economicEvent: 'QUARANTINE_TRANSFER',
          postsGl: false,
        }),
      ).not.toThrow();
    });

    it('rejects LOSS_DISPOSAL without GL', () => {
      expectCode(
        () =>
          assertClassifierConsistent({
            economicEvent: 'LOSS_DISPOSAL',
            postsGl: false,
          }),
        'LQ_INV_3_DISPOSAL_NO_GL',
      );
    });
  });

  describe('LQ-INV-2 coupling', () => {
    it('accepts matching amounts', () => {
      expect(() =>
        assertDisposalCouplesSubledger({
          glAmount: 1000,
          batchConsumptionValue: 1000,
        }),
      ).not.toThrow();
    });

    it('rejects drift', () => {
      expectCode(
        () =>
          assertDisposalCouplesSubledger({
            glAmount: 1000,
            batchConsumptionValue: 900,
          }),
        'LQ_INV_2_COUPLING',
      );
    });
  });

  describe('classifyStockMovement heuristics', () => {
    it('tags internal quarantine notes as QUARANTINE_TRANSFER', () => {
      const c = classifyStockMovement({
        movementType: 'DAMAGE',
        notes: 'DAMAGE: broken (internal quarantine transfer)',
      });
      expect(c.economicEvent).toBe('QUARANTINE_TRANSFER');
      expect(c.postsGl).toBe(false);
      expect(shouldSkipGlRepairForMovement(c)).toBe(true);
    });

    it('tags EXPIRY_AUTOMATION as quarantine', () => {
      const c = classifyStockMovement({
        movementType: 'EXPIRY',
        referenceType: 'EXPIRY_AUTOMATION',
      });
      expect(c.economicEvent).toBe('QUARANTINE_TRANSFER');
      expect(c.postsGl).toBe(false);
    });

    it('tags valued DAMAGE as LOSS_DISPOSAL', () => {
      const c = classifyStockMovement({ movementType: 'DAMAGE', notes: 'write off' });
      expect(c.economicEvent).toBe('LOSS_DISPOSAL');
      expect(c.postsGl).toBe(true);
      expect(shouldSkipGlRepairForMovement(c)).toBe(false);
    });
  });

  describe('LQ-INV-7 account map', () => {
    it('maps reasons to 5110/5120/5130', () => {
      expect(expenseAccountForLossReason('DAMAGE')).toBe('5120');
      expect(expenseAccountForLossReason('EXPIRY')).toBe('5130');
      expect(expenseAccountForLossReason('WRITE_OFF')).toBe('5110');
    });

    it('WRITE_OFF from DAMAGE store → 5120', () => {
      expect(
        expenseAccountForDisposal({ reason: 'WRITE_OFF', fromStoreType: 'DAMAGE' }),
      ).toBe('5120');
      expect(
        expenseAccountForDisposal({ reason: 'WRITE_OFF', fromStoreType: 'EXPIRED' }),
      ).toBe('5130');
    });
  });
});
