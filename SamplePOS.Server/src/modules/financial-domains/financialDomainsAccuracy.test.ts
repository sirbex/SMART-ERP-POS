/**
 * Financial domains Phase 1–5 — business logic accuracy (amount-true).
 *
 * Fail loud: wrong journals / policies throw; nothing is soft-skipped.
 */

import { describe, expect, it } from '@jest/globals';
import {
  assertForbiddenAccounts,
  assertJournalMatchesExpected,
  assertPnlImpact,
  JournalAccuracyError,
  twoLineJournal,
} from '@shared/financial-accuracy/index.js';
import {
  assertWriteoffJournalShape,
  assertBadDebtExpenseAccount,
  assertCreditNoteReasonNotBadDebt,
} from '@shared/bad-debt/index.js';
import {
  assertQuarantineDoesNotPostGl,
  assertClassifierConsistent,
} from '@shared/loss-quarantine/index.js';
import { assertBalancedLines, assertLiquidityAccountsOnly } from '@shared/treasury/index.js';
import {
  assertVatRemittanceAccounts,
  assertVatPostingSourceNotWht,
} from '@shared/vat-remittance/index.js';
import {
  PHASE_ACCURACY_SCENARIOS,
  compositeClosePnlStory,
} from './phaseAccuracyScenarios.js';

function runScenario(id: string) {
  const s = PHASE_ACCURACY_SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown scenario ${id}`);
  return s;
}

function assertScenario(s: (typeof PHASE_ACCURACY_SCENARIOS)[number]) {
  if (s.id === 'P2-QUAR-01') {
    if (s.buildJournal().length !== 0) {
      throw new Error(`[${s.id}] quarantine must post zero GL lines`);
    }
    if (s.expectedNetIncomeDelta !== 0) {
      throw new Error(`[${s.id}] quarantine must not affect net income`);
    }
    return;
  }
  const j = s.buildJournal();
  try {
    assertJournalMatchesExpected(j, s.expectedLines);
    assertPnlImpact(j, {
      netIncomeDelta: s.expectedNetIncomeDelta,
      label: `${s.id}: ${s.businessMeaning}`,
    });
    assertForbiddenAccounts(j, s.forbiddenAccounts ?? [], s.id);
  } catch (err) {
    if (err instanceof JournalAccuracyError) {
      throw new JournalAccuracyError(`[${s.id}] ${err.message}`, err.code);
    }
    throw err;
  }
}

describe('Financial domains accuracy — Phase 1 Treasury', () => {
  it('P1-DEP-01 deposit: bank ↑ / undeposited ↓; profit unchanged', () => {
    const s = runScenario('P1-DEP-01');
    assertScenario(s);
    const j = s.buildJournal();
    assertBalancedLines(
      j.map((l) => ({
        debitAmount: Number(l.debitAmount ?? 0),
        creditAmount: Number(l.creditAmount ?? 0),
      })),
    );
  });

  it('P1-XFR-01 transfer: liquidity only', () => {
    const s = runScenario('P1-XFR-01');
    assertScenario(s);
    assertLiquidityAccountsOnly(s.buildJournal().map((l) => ({ accountCode: l.accountCode })));
  });

  it('P1-PET-01 petty expense: profit ↓ by exact amount', () => {
    assertScenario(runScenario('P1-PET-01'));
  });
});

describe('Financial domains accuracy — Phase 2 Loss/Quarantine', () => {
  it('P2-QUAR-01 quarantine: no GL / no P&L', () => {
    assertQuarantineDoesNotPostGl({
      economicEvent: 'QUARANTINE_TRANSFER',
      postsGl: false,
    });
    expect(() =>
      assertClassifierConsistent({
        economicEvent: 'QUARANTINE_TRANSFER',
        postsGl: true,
      }),
    ).toThrow();
    assertScenario(runScenario('P2-QUAR-01'));
  });

  it('P2-DISP-01 dispose damage: DR 5120 / CR 1300; profit ↓ 2500', () => {
    assertScenario(runScenario('P2-DISP-01'));
  });
});

describe('Financial domains accuracy — Phase 3 VAT', () => {
  it('P3-VAT-01 remit: DR 2300 / CR bank; P&L unchanged; not WHT', () => {
    const s = runScenario('P3-VAT-01');
    assertScenario(s);
    assertVatRemittanceAccounts({
      lines: s.buildJournal().map((l) => ({ accountCode: l.accountCode })),
    });
    assertVatPostingSourceNotWht('VAT_REMITTANCE');
    expect(() => assertVatPostingSourceNotWht('WHT_REMITTANCE')).toThrow();
  });
});

describe('Financial domains accuracy — Phase 4 Bad Debt', () => {
  it('P4-BD-01 write-off: DR 5210 / CR 1200; profit ↓; never 4010', () => {
    const s = runScenario('P4-BD-01');
    assertScenario(s);
    const j = s.buildJournal();
    assertWriteoffJournalShape({
      lines: j.map((l) => ({
        accountCode: l.accountCode,
        debitAmount: Number(l.debitAmount ?? 0),
        creditAmount: Number(l.creditAmount ?? 0),
      })),
      expenseAccountCode: '5210',
    });
    assertBadDebtExpenseAccount({ expenseAccountCode: '5210' });
    expect(() => assertBadDebtExpenseAccount({ expenseAccountCode: '4010' })).toThrow();
    expect(() => assertCreditNoteReasonNotBadDebt('Bad debt write-off')).toThrow();
    assertCreditNoteReasonNotBadDebt('Price correction');
  });

  it('P4-BD-02 wrong path CN/4010 is rejected (not acceptable write-off)', () => {
    const wrong = twoLineJournal('4010', '1200', 1_500);
    expect(() => assertForbiddenAccounts(wrong, ['4010'], 'P4-BD-02')).toThrow(
      JournalAccuracyError,
    );
    expect(() => assertBadDebtExpenseAccount({ expenseAccountCode: '4010' })).toThrow();
    expect(() => assertCreditNoteReasonNotBadDebt('Uncollectible write-off')).toThrow();
    expect(() =>
      assertWriteoffJournalShape({
        lines: wrong.map((l) => ({
          accountCode: l.accountCode,
          debitAmount: Number(l.debitAmount ?? 0),
          creditAmount: Number(l.creditAmount ?? 0),
        })),
        expenseAccountCode: '5210',
      }),
    ).toThrow();
  });
});

describe('Financial domains accuracy — Phase 5 Reporting consistency', () => {
  it('composite close: only disposal + bad debt move profit; treasury/VAT/quarantine do not', () => {
    const story = compositeClosePnlStory();
    expect(story.totalNetIncomeDelta).toBe(-4_000);
    const byId = Object.fromEntries(story.steps.map((s) => [s.id, s.netIncomeDelta]));
    expect(byId.quarantine).toBe(0);
    expect(byId['vat-remit']).toBe(0);
    expect(byId.deposit).toBe(0);
    expect(byId.disposal).toBe(-2_500);
    expect(byId['bad-debt']).toBe(-1_500);
  });

  it('every catalog scenario is amount-true (no soft skip)', () => {
    expect(PHASE_ACCURACY_SCENARIOS.length).toBeGreaterThanOrEqual(7);
    for (const s of PHASE_ACCURACY_SCENARIOS) {
      assertScenario(s);
    }
  });
});
