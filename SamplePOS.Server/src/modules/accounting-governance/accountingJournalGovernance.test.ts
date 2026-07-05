import { describe, expect, it } from '@jest/globals';
import { PostingGovernanceError } from '../../services/postingGovernanceService.js';
import { validateJournal } from './accountingJournalGovernance.js';

describe('accountingJournalGovernance', () => {
  it('runs AP rules through validateJournal', () => {
    expect(() =>
      validateJournal({
        referenceType: 'RETURN_GRN',
        source: 'INVENTORY_MOVE',
        lines: [
          { accountCode: '2100', debitAmount: 1000, creditAmount: 0, entityType: 'supplier', entityId: 'x' },
          { accountCode: '1300', debitAmount: 0, creditAmount: 1000 },
        ],
      }),
    ).toThrow(PostingGovernanceError);
  });

  it('runs AR drift-heal block through validateJournal', () => {
    expect(() =>
      validateJournal({
        idempotencyKey: 'AR-DRIFT-HEAL-2026-07-05',
        lines: [{ accountCode: '1200', debitAmount: 1, creditAmount: 0 }],
      }),
    ).toThrow(/GOV_RULE_I_AR_DRIFT_HEAL_DISABLED/);
  });

  it('allows untagged SALE AR when entity enforcement is off', () => {
    delete process.env.AR_GOVERNANCE_ENFORCE;
    delete process.env.ACCOUNTING_JOURNAL_GOVERNANCE_ENFORCE;
    expect(() =>
      validateJournal({
        referenceType: 'SALE',
        source: 'SALES_INVOICE',
        lines: [
          { accountCode: '1200', debitAmount: 500, creditAmount: 0 },
          { accountCode: '4000', debitAmount: 0, creditAmount: 500 },
        ],
      }),
    ).not.toThrow();
  });
});
