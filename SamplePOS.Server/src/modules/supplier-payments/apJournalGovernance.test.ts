import { describe, expect, it } from '@jest/globals';
import { PostingGovernanceError } from '../../services/postingGovernanceService.js';
import { validateApJournalPosting } from './apJournalGovernance.js';

describe('apJournalGovernance (re-export shim)', () => {
  it('re-exports validateApJournalPosting from accounting-governance', () => {
    expect(() =>
      validateApJournalPosting({
        referenceType: 'RETURN_GRN',
        source: 'INVENTORY_MOVE',
        lines: [{ accountCode: '2100', debitAmount: 1, creditAmount: 0 }],
      }),
    ).toThrow(PostingGovernanceError);
  });
});
