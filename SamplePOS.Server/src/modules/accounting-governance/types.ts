/**
 * Shared types for the accounting journal governance framework.
 *
 * All GL persistence is application-layer only (AccountingCore) — no SQL posting triggers.
 */
import type { PostingSource } from '../../services/postingGovernanceService.js';

export type GovernanceJournalLine = {
  accountCode: string;
  debitAmount: number;
  creditAmount: number;
  entityType?: string | null;
  entityId?: string | null;
};

export type GovernanceJournalContext = {
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  source?: PostingSource;
  idempotencyKey?: string;
  lines: GovernanceJournalLine[];
};
