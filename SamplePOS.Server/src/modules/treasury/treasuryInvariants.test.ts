/**
 * Treasury Document invariants — unit tests (ADR-003 Phase 1A exit criteria)
 */

import {
  assertBalancedLines,
  assertMutableStatus,
  assertPostedAuditFields,
  normalizeLineAmounts,
  TreasuryInvariantError,
} from '@shared/treasury/index.js';

function expectInvariantCode(fn: () => unknown, code: string): void {
  try {
    fn();
    throw new Error(`Expected TreasuryInvariantError ${code}`);
  } catch (err) {
    expect(err).toBeInstanceOf(TreasuryInvariantError);
    expect((err as TreasuryInvariantError).code).toBe(code);
  }
}

describe('Treasury invariants (TD-INV)', () => {
  describe('TD-INV-1 balanced journal', () => {
    it('accepts balanced lines', () => {
      const result = assertBalancedLines([
        { debitAmount: 1000, creditAmount: 0 },
        { debitAmount: 0, creditAmount: 1000 },
      ]);
      expect(result.totalDebits).toBe(1000);
      expect(result.totalCredits).toBe(1000);
    });

    it('rejects unbalanced lines', () => {
      expectInvariantCode(
        () =>
          assertBalancedLines([
            { debitAmount: 1000, creditAmount: 0 },
            { debitAmount: 0, creditAmount: 900 },
          ]),
        'TD_INV_1_UNBALANCED',
      );
    });

    it('rejects empty lines', () => {
      expectInvariantCode(() => assertBalancedLines([]), 'TD_INV_1_NO_LINES');
    });
  });

  describe('TD-INV-3 immutability', () => {
    it('allows DRAFT and PENDING_APPROVAL', () => {
      expect(() => assertMutableStatus('DRAFT')).not.toThrow();
      expect(() => assertMutableStatus('PENDING_APPROVAL')).not.toThrow();
    });

    it('blocks POSTED', () => {
      expectInvariantCode(() => assertMutableStatus('POSTED'), 'TD_INV_3_IMMUTABLE');
    });
  });

  describe('TD-INV-7 audit fields', () => {
    it('requires journal and postedAt for POSTED shape', () => {
      expect(() =>
        assertPostedAuditFields({
          createdBy: 'u1',
          postedAt: '2026-07-12T00:00:00Z',
          journalEntryId: 'j1',
        }),
      ).not.toThrow();

      expectInvariantCode(
        () =>
          assertPostedAuditFields({
            createdBy: 'u1',
            postedAt: '2026-07-12T00:00:00Z',
            journalEntryId: null,
          }),
        'TD_INV_7_JOURNAL',
      );
    });

    it('requires approver when requiresApproval', () => {
      expectInvariantCode(
        () =>
          assertPostedAuditFields({
            createdBy: 'u1',
            postedAt: '2026-07-12T00:00:00Z',
            journalEntryId: 'j1',
            requiresApproval: true,
            approvedBy: null,
          }),
        'TD_INV_7_APPROVER',
      );
    });
  });

  describe('normalizeLineAmounts', () => {
    it('rejects both sides', () => {
      expectInvariantCode(
        () => normalizeLineAmounts({ accountCode: '1010', debitAmount: 10, creditAmount: 10 }),
        'TD_LINE_BOTH_SIDES',
      );
    });
  });
});
