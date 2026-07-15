/**
 * Journal accuracy engine — negative paths must throw (no soft pass).
 */
import { describe, expect, it } from '@jest/globals';
import {
  assertForbiddenAccounts,
  assertJournalBalanced,
  assertJournalMatchesExpected,
  assertOneSidedLines,
  assertPnlImpact,
  JournalAccuracyError,
  netIncomeImpactFromJournal,
  twoLineJournal,
} from '@shared/financial-accuracy/index.js';

function expectCode(fn: () => void, code: string) {
  try {
    fn();
    throw new Error(`Expected JournalAccuracyError ${code} but nothing was thrown`);
  } catch (err) {
    if (!(err instanceof JournalAccuracyError)) throw err;
    expect(err.code).toBe(code);
  }
}

describe('journalAccuracy engine — fail loud', () => {
  it('rejects empty journal', () => {
    expectCode(() => assertJournalBalanced([]), 'JA_NO_LINES');
  });

  it('rejects unbalanced journal', () => {
    expectCode(
      () =>
        assertJournalBalanced([
          { accountCode: '5210', debitAmount: 100, creditAmount: 0 },
          { accountCode: '1200', debitAmount: 0, creditAmount: 90 },
        ]),
      'JA_UNBALANCED',
    );
  });

  it('rejects dual-sided line', () => {
    expectCode(
      () =>
        assertOneSidedLines([
          { accountCode: '5210', debitAmount: 50, creditAmount: 50 },
        ]),
      'JA_DUAL_SIDED',
    );
  });

  it('rejects zero line', () => {
    expectCode(
      () => assertOneSidedLines([{ accountCode: '5210', debitAmount: 0, creditAmount: 0 }]),
      'JA_ZERO_LINE',
    );
  });

  it('rejects missing expected line', () => {
    expectCode(
      () =>
        assertJournalMatchesExpected(twoLineJournal('5210', '1200', 100), [
          { accountCode: '4010', side: 'debit', amount: 100, label: 'wrong sales return' },
          { accountCode: '1200', side: 'credit', amount: 100, label: 'AR' },
        ]),
      'JA_MISSING_LINE',
    );
  });

  it('rejects extra unexpected line (exact)', () => {
    const actual = [
      ...twoLineJournal('5210', '1200', 100),
      { accountCode: '6900', debitAmount: 10, creditAmount: 0 },
      { accountCode: '1010', debitAmount: 0, creditAmount: 10 },
    ];
    expectCode(
      () =>
        assertJournalMatchesExpected(actual, [
          { accountCode: '5210', side: 'debit', amount: 100, label: 'expense' },
          { accountCode: '1200', side: 'credit', amount: 100, label: 'AR' },
        ]),
      'JA_LINE_COUNT',
    );
  });

  it('rejects empty expected spec (no silent match)', () => {
    expectCode(
      () => assertJournalMatchesExpected(twoLineJournal('1030', '1015', 50), []),
      'JA_EMPTY_EXPECTED',
    );
  });

  it('rejects forbidden account', () => {
    expectCode(
      () => assertForbiddenAccounts(twoLineJournal('4010', '1200', 50), ['4010'], 'bad debt'),
      'JA_FORBIDDEN_ACCOUNT',
    );
  });

  it('accepts correct bad-debt shape and P&L impact', () => {
    const j = twoLineJournal('5210', '1200', 1_500);
    assertJournalMatchesExpected(j, [
      { accountCode: '5210', side: 'debit', amount: 1_500, label: 'Bad debt expense' },
      { accountCode: '1200', side: 'credit', amount: 1_500, label: 'AR' },
    ]);
    assertPnlImpact(j, { netIncomeDelta: -1_500, label: 'bad debt' });
    expect(netIncomeImpactFromJournal(j)).toBe(-1_500);
  });

  it('treasury deposit does not move profit', () => {
    const j = twoLineJournal('1030', '1015', 1_000);
    assertPnlImpact(j, { netIncomeDelta: 0, label: 'deposit' });
  });

  it('twoLineJournal refuses same account / non-positive', () => {
    expectCode(() => twoLineJournal('1030', '1030', 10), 'JA_SAME_ACCOUNT');
    expectCode(() => twoLineJournal('1030', '1015', 0), 'JA_BAD_AMOUNT');
  });
});
