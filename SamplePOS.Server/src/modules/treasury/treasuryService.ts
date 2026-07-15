/**
 * TreasuryService — write gateway for Treasury Documents (ADR-003 Phase 1A)
 */

import type { Pool } from 'pg';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { AccountingCore } from '../../services/accountingCore.js';
import { ValidationError, ConflictError, NotFoundError, ForbiddenError } from '../../middleware/errorHandler.js';
import {
  assertBalancedLines,
  assertMutableStatus,
  assertPostedAuditFields,
  TreasuryInvariantError,
  postingSourceForDocumentType,
  type TreasuryDocument,
  type TreasuryDocumentLineInput,
  type TreasuryDocumentType,
} from '@shared/treasury/index.js';
import * as repo from './treasuryRepository.js';
import { isTreasuryDocumentEnabled } from './treasurySettings.js';
import * as depositWorksheet from './depositWorksheetService.js';

export interface CreateTreasuryDocumentRequest {
  documentType: TreasuryDocumentType;
  transactionDate: string;
  currencyCode?: string;
  memo?: string;
  fromAccountCode?: string;
  toAccountCode?: string;
  bankAccountId?: string;
  depositReference?: string;
  requiresApproval?: boolean;
  overageAmount?: number;
  shortageAmount?: number;
  lines: TreasuryDocumentLineInput[];
  createdBy: string;
}

async function assertFeatureEnabled(pool: Pool): Promise<void> {
  const enabled = await isTreasuryDocumentEnabled(pool);
  if (!enabled) {
    throw new ForbiddenError(
      'Treasury Documents are disabled. Enable treasury_document_enabled in system settings (ADR-003 Phase 1A).',
    );
  }
}

function rethrowInvariant(err: unknown): never {
  if (err instanceof TreasuryInvariantError) {
    throw new ValidationError(err.message);
  }
  throw err;
}

export async function createDraft(
  pool: Pool,
  input: CreateTreasuryDocumentRequest,
): Promise<TreasuryDocument> {
  await assertFeatureEnabled(pool);
  if (!input.lines?.length) {
    throw new ValidationError('At least one line is required');
  }
  try {
    // Draft may be unbalanced until complete; still normalize amounts
    for (const line of input.lines) {
      if (!line.accountCode) throw new ValidationError('Each line requires accountCode');
    }
  } catch (err) {
    rethrowInvariant(err);
  }

  return UnitOfWork.run(pool, async (client) =>
    repo.createDocument(client, {
      ...input,
      createdBy: input.createdBy,
    }),
  );
}

export async function updateDraft(
  pool: Pool,
  id: string,
  input: {
    transactionDate?: string;
    memo?: string | null;
    fromAccountCode?: string | null;
    toAccountCode?: string | null;
    bankAccountId?: string | null;
    depositReference?: string | null;
    requiresApproval?: boolean;
    overageAmount?: number;
    shortageAmount?: number;
    lines?: TreasuryDocumentLineInput[];
    expectedRowVersion: number;
    actorUserId: string;
  },
): Promise<TreasuryDocument> {
  await assertFeatureEnabled(pool);

  return UnitOfWork.run(pool, async (client) => {
    const current = await repo.getById(client, id);
    if (!current) throw new NotFoundError('Treasury Document not found');
    try {
      assertMutableStatus(current.status);
      if (current.status !== 'DRAFT') {
        throw new TreasuryInvariantError(
          'Only DRAFT documents can be updated',
          'TD_STATUS_NOT_DRAFT',
        );
      }
    } catch (err) {
      rethrowInvariant(err);
    }

    try {
      return await repo.updateDraft(client, id, input);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'NOT_FOUND') throw new NotFoundError('Treasury Document not found');
      if (code === 'CONFLICT') throw new ConflictError('Treasury Document was modified by another user');
      throw err;
    }
  });
}

export async function getDocument(pool: Pool, id: string): Promise<TreasuryDocument | null> {
  return repo.getById(pool, id);
}

export async function listDocuments(
  pool: Pool,
  opts: { page?: number; limit?: number; status?: string; documentType?: string } = {},
) {
  return repo.listDocuments(pool, opts);
}

export async function isEnabled(pool: Pool): Promise<boolean> {
  return isTreasuryDocumentEnabled(pool);
}

export async function submit(
  pool: Pool,
  id: string,
  actorUserId: string,
): Promise<TreasuryDocument> {
  await assertFeatureEnabled(pool);

  return UnitOfWork.run(pool, async (client) => {
    const doc = await repo.getById(client, id);
    if (!doc) throw new NotFoundError('Treasury Document not found');
    try {
      assertMutableStatus(doc.status);
      if (doc.status !== 'DRAFT') {
        throw new TreasuryInvariantError('Only DRAFT documents can be submitted', 'TD_STATUS_NOT_DRAFT');
      }
      assertBalancedLines(doc.lines);
    } catch (err) {
      rethrowInvariant(err);
    }

    const submittedAt = new Date().toISOString();
    await repo.setStatus(client, id, {
      status: 'PENDING_APPROVAL',
      submittedAt,
    });
    await repo.insertAudit(client, id, 'SUBMITTED', actorUserId, {});
    return (await repo.getById(client, id))!;
  });
}

export async function reject(
  pool: Pool,
  id: string,
  actorUserId: string,
  reason?: string,
): Promise<TreasuryDocument> {
  await assertFeatureEnabled(pool);

  return UnitOfWork.run(pool, async (client) => {
    const doc = await repo.getById(client, id);
    if (!doc) throw new NotFoundError('Treasury Document not found');
    if (doc.status !== 'PENDING_APPROVAL') {
      throw new ValidationError('Only PENDING_APPROVAL documents can be rejected');
    }
    await repo.clearApprovalOnReject(client, id);
    await repo.insertAudit(client, id, 'REJECTED', actorUserId, { reason: reason ?? null });
    return (await repo.getById(client, id))!;
  });
}

async function postInternal(
  client: import('pg').PoolClient,
  pool: Pool,
  doc: TreasuryDocument,
  actorUserId: string,
  options: { asApproval?: boolean } = {},
): Promise<TreasuryDocument> {
  try {
    if (doc.status === 'POSTED') {
      throw new TreasuryInvariantError('Document is already posted', 'TD_ALREADY_POSTED');
    }
    if (doc.requiresApproval && doc.status !== 'PENDING_APPROVAL' && !options.asApproval) {
      throw new TreasuryInvariantError(
        'Document requires approval before posting',
        'TD_REQUIRES_APPROVAL',
      );
    }
    if (!doc.requiresApproval && doc.status !== 'DRAFT' && doc.status !== 'PENDING_APPROVAL') {
      throw new TreasuryInvariantError(
        `Cannot post document in status ${doc.status}`,
        'TD_BAD_STATUS',
      );
    }
    assertBalancedLines(doc.lines);
  } catch (err) {
    rethrowInvariant(err);
  }

  if (doc.documentType === 'DEPOSIT_WORKSHEET') {
    await depositWorksheet.applySettlementsForDepositWorksheet(client, doc);
  }

  const source = postingSourceForDocumentType(doc.documentType);
  const journal = await AccountingCore.createJournalEntry(
    {
      entryDate: doc.transactionDate,
      description: doc.memo || `${doc.documentType} ${doc.documentNumber}`,
      referenceType: 'TREASURY_DOCUMENT',
      referenceId: doc.id,
      referenceNumber: doc.documentNumber,
      lines: doc.lines.map((l) => ({
        accountCode: l.accountCode,
        description: l.description || doc.documentNumber,
        debitAmount: l.debitAmount,
        creditAmount: l.creditAmount,
      })),
      userId: actorUserId,
      idempotencyKey: `TREASURY-POST-${doc.id}`,
      source,
    },
    pool,
    client,
  );

  await repo.stampLedgerTreasuryDocument(client, journal.transactionId, doc.id);

  const postedAt = new Date().toISOString();
  const approvedBy = options.asApproval || doc.requiresApproval ? actorUserId : doc.approvedBy;
  const approvedAt =
    options.asApproval || doc.requiresApproval ? postedAt : doc.approvedAt;

  await repo.setStatus(client, doc.id, {
    status: 'POSTED',
    postedAt,
    postingDate: doc.transactionDate,
    journalEntryId: journal.transactionId,
    approvedBy: approvedBy ?? undefined,
    approvedAt: approvedAt ?? undefined,
  });

  await repo.insertAudit(client, doc.id, options.asApproval ? 'APPROVED_AND_POSTED' : 'POSTED', actorUserId, {
    journalEntryId: journal.transactionId,
    transactionNumber: journal.transactionNumber,
    totalDebits: journal.totalDebits,
  });

  const posted = (await repo.getById(client, doc.id))!;
  try {
    assertPostedAuditFields(posted);
  } catch (err) {
    rethrowInvariant(err);
  }
  return posted;
}

export async function post(
  pool: Pool,
  id: string,
  actorUserId: string,
): Promise<TreasuryDocument> {
  await assertFeatureEnabled(pool);

  return UnitOfWork.run(pool, async (client) => {
    const doc = await repo.getById(client, id);
    if (!doc) throw new NotFoundError('Treasury Document not found');
    return postInternal(client, pool, doc, actorUserId);
  });
}

export async function approve(
  pool: Pool,
  id: string,
  actorUserId: string,
): Promise<TreasuryDocument> {
  await assertFeatureEnabled(pool);

  return UnitOfWork.run(pool, async (client) => {
    const doc = await repo.getById(client, id);
    if (!doc) throw new NotFoundError('Treasury Document not found');
    if (doc.status !== 'PENDING_APPROVAL') {
      throw new ValidationError('Only PENDING_APPROVAL documents can be approved');
    }
    return postInternal(client, pool, doc, actorUserId, { asApproval: true });
  });
}

/**
 * TD-INV-3: create a TREASURY_REVERSAL document and post opposite lines.
 * Original remains POSTED and immutable.
 */
export async function reverse(
  pool: Pool,
  id: string,
  actorUserId: string,
  reason?: string,
): Promise<{ original: TreasuryDocument; reversal: TreasuryDocument }> {
  await assertFeatureEnabled(pool);

  return UnitOfWork.run(pool, async (client) => {
    const original = await repo.getById(client, id);
    if (!original) throw new NotFoundError('Treasury Document not found');
    if (original.status !== 'POSTED') {
      throw new ValidationError('Only POSTED documents can be reversed');
    }
    if (original.reversedByDocumentId) {
      throw new ConflictError('Document has already been reversed');
    }
    if (!original.journalEntryId) {
      throw new ValidationError('Posted document is missing journalEntryId');
    }

    if (original.documentType === 'DEPOSIT_WORKSHEET') {
      await depositWorksheet.releaseSettlementsForDepositWorksheet(client, original);
    }

    const oppositeLines: TreasuryDocumentLineInput[] = original.lines.map((l) => ({
      lineType: l.lineType,
      accountCode: l.accountCode,
      description: `Reversal: ${l.description || l.accountCode}`,
      debitAmount: l.creditAmount,
      creditAmount: l.debitAmount,
      memo: reason,
    }));

    const reversal = await repo.createDocument(client, {
      documentType: 'TREASURY_REVERSAL',
      transactionDate: new Date().toISOString().slice(0, 10),
      currencyCode: original.currencyCode,
      memo: reason || `Reversal of ${original.documentNumber}`,
      requiresApproval: false,
      lines: oppositeLines,
      createdBy: actorUserId,
      reversesDocumentId: original.id,
    });

    const postedReversal = await postInternal(client, pool, reversal, actorUserId);
    await repo.setStatus(client, original.id, {
      status: 'POSTED',
      reversedByDocumentId: postedReversal.id,
    });
    await repo.insertAudit(client, original.id, 'REVERSED_BY', actorUserId, {
      reversalDocumentId: postedReversal.id,
      reason: reason ?? null,
    });

    return {
      original: (await repo.getById(client, original.id))!,
      reversal: postedReversal,
    };
  });
}
