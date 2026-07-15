/**
 * Phase-by-phase business scenarios — Odoo/SAP/Tally plain economics.
 *
 * Each scenario: one economic event → expected journal → P&L/BS effect.
 * Used by financialDomainsAccuracy.test.ts (no UI, amount-accurate).
 */

import type { ActualJournalLine, ExpectedJournalLine } from '@shared/financial-accuracy/index.js';
import { twoLineJournal } from '@shared/financial-accuracy/index.js';

export type PhaseId = 1 | 2 | 3 | 4 | 5;

export interface AccuracyScenario {
  id: string;
  phase: PhaseId;
  phaseName: string;
  /** One sentence a bookkeeper understands */
  businessMeaning: string;
  amount: number;
  /** Service would post these lines */
  buildJournal: () => ActualJournalLine[];
  expectedLines: ExpectedJournalLine[];
  /** Expected change to Net Income (0 = balance-sheet only) */
  expectedNetIncomeDelta: number;
  /** What must NOT happen */
  forbiddenAccounts?: string[];
}

export const PHASE_ACCURACY_SCENARIOS: AccuracyScenario[] = [
  // ── Phase 1 Treasury ──────────────────────────────────────────
  {
    id: 'P1-DEP-01',
    phase: 1,
    phaseName: 'Treasury',
    businessMeaning: 'Bank the day’s undeposited cash — money moves to bank, clearing empties.',
    amount: 1_000,
    buildJournal: () => twoLineJournal('1030', '1015', 1_000),
    expectedLines: [
      { accountCode: '1030', side: 'debit', amount: 1_000, label: 'Bank receives cash' },
      { accountCode: '1015', side: 'credit', amount: 1_000, label: 'Undeposited funds clear' },
    ],
    expectedNetIncomeDelta: 0,
    forbiddenAccounts: ['1200', '5210', '4010', '2300'],
  },
  {
    id: 'P1-XFR-01',
    phase: 1,
    phaseName: 'Treasury',
    businessMeaning: 'Move cash from till to bank — both are money; profit unchanged.',
    amount: 500,
    buildJournal: () => twoLineJournal('1030', '1010', 500),
    expectedLines: [
      { accountCode: '1030', side: 'debit', amount: 500, label: 'Bank increases' },
      { accountCode: '1010', side: 'credit', amount: 500, label: 'Cash on hand decreases' },
    ],
    expectedNetIncomeDelta: 0,
    forbiddenAccounts: ['1200', '6900', '5210'],
  },
  {
    id: 'P1-PET-01',
    phase: 1,
    phaseName: 'Treasury',
    businessMeaning: 'Spend from petty cash — expense hits profit; petty float drops.',
    amount: 75,
    buildJournal: () => twoLineJournal('6900', '1012', 75),
    expectedLines: [
      { accountCode: '6900', side: 'debit', amount: 75, label: 'Expense recognized' },
      { accountCode: '1012', side: 'credit', amount: 75, label: 'Petty cash float reduced' },
    ],
    expectedNetIncomeDelta: -75,
    forbiddenAccounts: ['1015', '1200', '4010'],
  },

  // ── Phase 2 Loss / Quarantine ─────────────────────────────────
  {
    id: 'P2-QUAR-01',
    phase: 2,
    phaseName: 'Loss/Quarantine',
    businessMeaning: 'Move stock to quarantine — still inventory (asset); no loss yet, no journal.',
    amount: 0,
    buildJournal: () => [],
    expectedLines: [],
    expectedNetIncomeDelta: 0,
    forbiddenAccounts: ['5110', '5120', '5130', '1200'],
  },
  {
    id: 'P2-DISP-01',
    phase: 2,
    phaseName: 'Loss/Quarantine',
    businessMeaning: 'Write off damaged stock — inventory down, loss expense up (cost of goods).',
    amount: 2_500,
    buildJournal: () => twoLineJournal('5120', '1300', 2_500),
    expectedLines: [
      { accountCode: '5120', side: 'debit', amount: 2_500, label: 'Damage loss expense' },
      { accountCode: '1300', side: 'credit', amount: 2_500, label: 'Inventory asset reduced' },
    ],
    expectedNetIncomeDelta: -2_500,
    forbiddenAccounts: ['1200', '5210', '4010', '1010'],
  },

  // ── Phase 3 VAT ───────────────────────────────────────────────
  {
    id: 'P3-VAT-01',
    phase: 3,
    phaseName: 'VAT Remittance',
    businessMeaning: 'Pay tax authority — Tax Payable clears; bank pays. Profit unchanged.',
    amount: 800,
    buildJournal: () => twoLineJournal('2300', '1030', 800),
    expectedLines: [
      { accountCode: '2300', side: 'debit', amount: 800, label: 'Tax Payable reduced' },
      { accountCode: '1030', side: 'credit', amount: 800, label: 'Bank pays tax' },
    ],
    expectedNetIncomeDelta: 0,
    forbiddenAccounts: ['2350', '1250', '5210', '4010'],
  },

  // ── Phase 4 Bad Debt ──────────────────────────────────────────
  {
    id: 'P4-BD-01',
    phase: 4,
    phaseName: 'Bad Debt',
    businessMeaning: 'Customer will not pay — clear the receivable as expense (not a sales return).',
    amount: 1_500,
    buildJournal: () => twoLineJournal('5210', '1200', 1_500),
    expectedLines: [
      { accountCode: '5210', side: 'debit', amount: 1_500, label: 'Bad debt expense' },
      { accountCode: '1200', side: 'credit', amount: 1_500, label: 'Accounts Receivable cleared' },
    ],
    expectedNetIncomeDelta: -1_500,
    forbiddenAccounts: ['4010', '5110', '5120', '5130', '1010'],
  },
];

/** Composite close story for Phase 5 — chain impacts. */
export function compositeClosePnlStory(): {
  steps: Array<{ id: string; netIncomeDelta: number; description: string }>;
  totalNetIncomeDelta: number;
} {
  const steps = [
    {
      id: 'quarantine',
      netIncomeDelta: 0,
      description: 'Quarantine stock — profit unchanged (still on balance sheet)',
    },
    {
      id: 'disposal',
      netIncomeDelta: -2_500,
      description: 'Dispose damage — loss 2,500 hits profit',
    },
    {
      id: 'bad-debt',
      netIncomeDelta: -1_500,
      description: 'Write off uncollectible — expense 1,500 hits profit',
    },
    {
      id: 'vat-remit',
      netIncomeDelta: 0,
      description: 'Remit VAT — bank and tax payable only; profit unchanged',
    },
    {
      id: 'deposit',
      netIncomeDelta: 0,
      description: 'Deposit cash to bank — cash form changes; profit unchanged',
    },
  ];
  const totalNetIncomeDelta = steps.reduce((s, x) => s + x.netIncomeDelta, 0);
  return { steps, totalNetIncomeDelta };
}
