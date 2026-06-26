import { describe, expect, it } from '@jest/globals';
import { PostingGovernanceError } from '../../services/postingGovernanceService.js';
import { validateApJournalPosting } from './apJournalGovernance.js';

describe('apJournalGovernance', () => {
  it('blocks RETURN_GRN from touching 2100', () => {
    expect(() =>
      validateApJournalPosting({
        referenceType: 'RETURN_GRN',
        source: 'INVENTORY_MOVE',
        lines: [
          { accountCode: '2100', debitAmount: 1000, creditAmount: 0, entityType: 'supplier', entityId: 'x' },
          { accountCode: '1300', debitAmount: 0, creditAmount: 1000 },
        ],
      }),
    ).toThrow(PostingGovernanceError);
  });

  it('blocks GOODS_RECEIPT credit to 2100', () => {
    expect(() =>
      validateApJournalPosting({
        referenceType: 'GOODS_RECEIPT',
        source: 'PURCHASE_BILL',
        lines: [
          { accountCode: '1300', debitAmount: 500, creditAmount: 0 },
          { accountCode: '2100', debitAmount: 0, creditAmount: 500 },
        ],
      }),
    ).toThrow(PostingGovernanceError);
  });

  it('blocks AP-DRIFT-HEAL idempotency keys', () => {
    expect(() =>
      validateApJournalPosting({
        referenceType: 'CORRECTION',
        source: 'SYSTEM_CORRECTION',
        idempotencyKey: 'AP-DRIFT-HEAL-2026-06-26',
        lines: [
          { accountCode: '2100', debitAmount: 100, creditAmount: 0 },
          { accountCode: '5000', debitAmount: 0, creditAmount: 100 },
        ],
      }),
    ).toThrow(PostingGovernanceError);
  });

  it('blocks untagged CORRECTION on 2100', () => {
    expect(() =>
      validateApJournalPosting({
        referenceType: 'CORRECTION',
        source: 'SYSTEM_CORRECTION',
        lines: [
          { accountCode: '2100', debitAmount: 100, creditAmount: 0 },
          { accountCode: '5000', debitAmount: 0, creditAmount: 100 },
        ],
      }),
    ).toThrow(/entityType=supplier/);
  });

  it('allows tagged CORRECTION on 2100', () => {
    expect(() =>
      validateApJournalPosting({
        referenceType: 'CORRECTION',
        source: 'SYSTEM_CORRECTION',
        lines: [
          {
            accountCode: '2100',
            debitAmount: 100,
            creditAmount: 0,
            entityType: 'supplier',
            entityId: '4aaa54bf-c802-45d3-8a64-02e73e2172ac',
          },
          { accountCode: '5000', debitAmount: 0, creditAmount: 100 },
        ],
      }),
    ).not.toThrow();
  });
});
