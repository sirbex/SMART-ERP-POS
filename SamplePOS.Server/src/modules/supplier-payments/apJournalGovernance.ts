/**
 * AP (2100) journal posting rules — defense in depth on top of PostingGovernanceService.
 * Prevents legacy procure-to-pay paths that corrupt GL vs open-item integrity.
 */
import { PostingGovernanceError } from '../../services/postingGovernanceService.js';
import type { PostingSource } from '../../services/postingGovernanceService.js';

export const AP_ACCOUNT_CODE = '2100';

export type ApJournalLine = {
  accountCode: string;
  debitAmount: number;
  creditAmount: number;
  entityType?: string | null;
  entityId?: string | null;
};

export function validateApJournalPosting(params: {
  referenceType?: string;
  source?: PostingSource;
  idempotencyKey?: string;
  lines: ApJournalLine[];
}): void {
  const { referenceType, source, idempotencyKey, lines } = params;

  const touchesAp = (l: ApJournalLine) =>
    l.accountCode === AP_ACCOUNT_CODE && (l.debitAmount > 0.009 || l.creditAmount > 0.009);

  if (referenceType === 'RETURN_GRN' && lines.some(touchesAp)) {
    throw new PostingGovernanceError(
      'RETURN_GRN must not post to Accounts Payable (2100). '
        + 'Use Supplier Return Clearing (2160) or GR/IR (2150), then create a Supplier Credit Note.',
      'GOV_RULE_I_AP_RETURN_GRN',
      { referenceType, source },
    );
  }

  if (referenceType === 'GOODS_RECEIPT' && lines.some(
    (l) => l.accountCode === AP_ACCOUNT_CODE && l.creditAmount > 0.009,
  )) {
    throw new PostingGovernanceError(
      'GOODS_RECEIPT must not credit Accounts Payable (2100). Post to GR/IR Clearing (2150).',
      'GOV_RULE_I_AP_GOODS_RECEIPT',
      { referenceType, source },
    );
  }

  if (idempotencyKey?.startsWith('AP-DRIFT-HEAL-')) {
    throw new PostingGovernanceError(
      'Global AP drift heal journals are disabled. '
        + 'Decompose drift per supplier/document (proof-ap-drift-decompose) and fix at source.',
      'GOV_RULE_I_AP_DRIFT_HEAL_DISABLED',
      { idempotencyKey },
    );
  }

  if (referenceType === 'CORRECTION' || referenceType === 'SYSTEM_CORRECTION') {
    for (const line of lines) {
      if (!touchesAp(line)) continue;
      const hasSupplierEntity =
        line.entityType?.toLowerCase() === 'supplier' &&
        Boolean(line.entityId?.trim());
      if (!hasSupplierEntity) {
        throw new PostingGovernanceError(
          'CORRECTION on Accounts Payable (2100) requires entityType=supplier and entityId. '
            + 'Untagged AP adjustments break supplier subledger reconciliation.',
          'GOV_RULE_I_AP_CORRECTION_ENTITY',
          { referenceType, accountCode: line.accountCode },
        );
      }
    }
  }
}
