/**
 * Treasury Transfer — Phase 1C (liquidity ↔ liquidity via Treasury Document)
 */

import type { Pool, PoolClient } from 'pg';
import { UnitOfWork } from '../../db/unitOfWork.js';
import {
  ValidationError,
  ForbiddenError,
  NotFoundError,
} from '../../middleware/errorHandler.js';
import {
  assertBalancedLines,
  assertLiquidityAccountsOnly,
  roundMoney,
  TreasuryInvariantError,
  type TreasuryDocument,
  type TreasuryDocumentType,
} from '@shared/treasury/index.js';
import { isTreasuryDocumentEnabled } from './treasurySettings.js';
import { assertSufficientLiquidityFunds } from './liquidityFundsGuard.js';
import * as repo from './treasuryRepository.js';
import * as treasuryService from './treasuryService.js';

export type DbConn = Pool | PoolClient;

export interface CreateTreasuryTransferInput {
  transactionDate: string;
  fromAccountCode: string;
  toAccountCode: string;
  amount: number;
  memo?: string;
  depositReference?: string;
  bankAccountId?: string;
  documentType?: Extract<
    TreasuryDocumentType,
    'TREASURY_TRANSFER' | 'CASH_WITHDRAWAL' | 'CASH_DEPOSIT' | 'CARD_SETTLEMENT' | 'MOBILE_MONEY_SETTLEMENT'
  >;
  requiresApproval?: boolean;
  sourceSessionMovementId?: string;
  createdBy: string;
  /** When true (default), post immediately after create. */
  postImmediately?: boolean;
}

export interface LiquidityAccount {
  accountCode: string;
  accountName: string;
  systemAccountTag: string | null;
  currentBalance: number;
}

async function assertFeatureEnabled(pool: Pool): Promise<void> {
  const enabled = await isTreasuryDocumentEnabled(pool);
  if (!enabled) {
    throw new ForbiddenError(
      'Treasury Documents are disabled. Enable treasury_document_enabled in system settings.',
    );
  }
}

function rethrowInvariant(err: unknown): never {
  if (err instanceof TreasuryInvariantError) {
    throw new ValidationError(err.message);
  }
  throw err;
}

async function loadAccountMeta(
  conn: DbConn,
  accountCode: string,
): Promise<{ accountCode: string; accountName: string; systemAccountTag: string | null }> {
  const result = await conn.query<{
    AccountCode: string;
    AccountName: string;
    SystemAccountTag: string | null;
  }>(
    `SELECT "AccountCode", "AccountName", "SystemAccountTag"
     FROM accounts
     WHERE "AccountCode" = $1 AND "IsActive" = true`,
    [accountCode],
  );
  if (result.rows.length === 0) {
    throw new NotFoundError(`Account ${accountCode} not found or inactive`);
  }
  const row = result.rows[0];
  return {
    accountCode: row.AccountCode,
    accountName: row.AccountName,
    systemAccountTag: row.SystemAccountTag,
  };
}

export async function listLiquidityAccounts(pool: Pool): Promise<LiquidityAccount[]> {
  await assertFeatureEnabled(pool);
  const { getLiquidityAccountBalances } = await import(
    '../reports/liquidityMovementsReportService.js'
  );
  const items = await getLiquidityAccountBalances(pool);
  return items.map((r) => ({
    accountCode: r.accountCode,
    accountName: r.accountName,
    systemAccountTag: r.systemAccountTag,
    currentBalance: r.available,
  }));
}

/**
 * Create (and optionally post) a TREASURY_TRANSFER:
 *   DR toAccount / CR fromAccount
 */
export async function createTreasuryTransfer(
  pool: Pool,
  input: CreateTreasuryTransferInput,
): Promise<TreasuryDocument> {
  await assertFeatureEnabled(pool);

  const amount = roundMoney(input.amount);
  if (amount <= 0) {
    throw new ValidationError('Transfer amount must be greater than zero');
  }
  if (input.fromAccountCode === input.toAccountCode) {
    throw new ValidationError('From and to accounts must be different');
  }

  const documentType = input.documentType ?? 'TREASURY_TRANSFER';
  const postImmediately = input.postImmediately !== false;

  const doc = await UnitOfWork.run(pool, async (client) => {
    const fromAcct = await loadAccountMeta(client, input.fromAccountCode);
    const toAcct = await loadAccountMeta(client, input.toAccountCode);

    try {
      assertLiquidityAccountsOnly([fromAcct, toAcct]);
    } catch (err) {
      rethrowInvariant(err);
    }

    await assertSufficientLiquidityFunds(client, fromAcct.accountCode, amount, {
      asOfDate: input.transactionDate,
      actionLabel: `transfer to ${toAcct.accountCode}`,
    });

    const description =
      input.memo ||
      `Transfer ${fromAcct.accountCode} → ${toAcct.accountCode}`;

    const lines = [
      {
        lineType: 'ACCOUNT_MOVE' as const,
        accountCode: toAcct.accountCode,
        description: `Transfer from ${fromAcct.accountCode}`,
        debitAmount: amount,
        creditAmount: 0,
        sourceSessionMovementId: input.sourceSessionMovementId,
      },
      {
        lineType: 'ACCOUNT_MOVE' as const,
        accountCode: fromAcct.accountCode,
        description: `Transfer to ${toAcct.accountCode}`,
        debitAmount: 0,
        creditAmount: amount,
        sourceSessionMovementId: input.sourceSessionMovementId,
      },
    ];

    try {
      assertBalancedLines(lines);
    } catch (err) {
      rethrowInvariant(err);
    }

    return repo.createDocument(client, {
      documentType,
      transactionDate: input.transactionDate,
      memo: description,
      fromAccountCode: fromAcct.accountCode,
      toAccountCode: toAcct.accountCode,
      bankAccountId: input.bankAccountId,
      depositReference: input.depositReference,
      requiresApproval: input.requiresApproval ?? false,
      lines,
      createdBy: input.createdBy,
    });
  });

  if (postImmediately && !doc.requiresApproval) {
    return treasuryService.post(pool, doc.id, input.createdBy);
  }
  return doc;
}

/**
 * Post a liquidity transfer inside an existing transaction (register / banking shims).
 * Returns the posted Treasury Document (journal already created).
 */
export async function createAndPostTransferInTx(
  client: PoolClient,
  pool: Pool,
  input: CreateTreasuryTransferInput,
): Promise<TreasuryDocument> {
  const amount = roundMoney(input.amount);
  if (amount <= 0) {
    throw new ValidationError('Transfer amount must be greater than zero');
  }
  if (input.fromAccountCode === input.toAccountCode) {
    throw new ValidationError('From and to accounts must be different');
  }

  const fromAcct = await loadAccountMeta(client, input.fromAccountCode);
  const toAcct = await loadAccountMeta(client, input.toAccountCode);
  try {
    assertLiquidityAccountsOnly([fromAcct, toAcct]);
  } catch (err) {
    rethrowInvariant(err);
  }

  await assertSufficientLiquidityFunds(client, fromAcct.accountCode, amount, {
    asOfDate: input.transactionDate,
    actionLabel: `transfer to ${toAcct.accountCode}`,
  });

  const description =
    input.memo || `Transfer ${fromAcct.accountCode} → ${toAcct.accountCode}`;
  const documentType = input.documentType ?? 'TREASURY_TRANSFER';

  const draft = await repo.createDocument(client, {
    documentType,
    transactionDate: input.transactionDate,
    memo: description,
    fromAccountCode: fromAcct.accountCode,
    toAccountCode: toAcct.accountCode,
    bankAccountId: input.bankAccountId,
    depositReference: input.depositReference,
    requiresApproval: false,
    lines: [
      {
        lineType: 'ACCOUNT_MOVE',
        accountCode: toAcct.accountCode,
        description: `Transfer from ${fromAcct.accountCode}`,
        debitAmount: amount,
        creditAmount: 0,
        sourceSessionMovementId: input.sourceSessionMovementId,
      },
      {
        lineType: 'ACCOUNT_MOVE',
        accountCode: fromAcct.accountCode,
        description: `Transfer to ${toAcct.accountCode}`,
        debitAmount: 0,
        creditAmount: amount,
        sourceSessionMovementId: input.sourceSessionMovementId,
      },
    ],
    createdBy: input.createdBy,
  });

  // Use AccountingCore via treasury postInternal path — call public post on same client
  // by inlining the journal through treasuryService.post is a nested UoW — avoid that.
  const { AccountingCore } = await import('../../services/accountingCore.js');
  const { postingSourceForDocumentType, assertPostedAuditFields } = await import(
    '@shared/treasury/index.js'
  );

  const source = postingSourceForDocumentType(draft.documentType);
  const journal = await AccountingCore.createJournalEntry(
    {
      entryDate: draft.transactionDate,
      description: draft.memo || description,
      referenceType: 'TREASURY_DOCUMENT',
      referenceId: draft.id,
      referenceNumber: draft.documentNumber,
      lines: draft.lines.map((l) => ({
        accountCode: l.accountCode,
        description: l.description || draft.documentNumber,
        debitAmount: l.debitAmount,
        creditAmount: l.creditAmount,
      })),
      userId: input.createdBy,
      idempotencyKey: `TREASURY-POST-${draft.id}`,
      source,
    },
    pool,
    client,
  );

  await repo.stampLedgerTreasuryDocument(client, journal.transactionId, draft.id);
  const postedAt = new Date().toISOString();
  await repo.setStatus(client, draft.id, {
    status: 'POSTED',
    postedAt,
    postingDate: draft.transactionDate,
    journalEntryId: journal.transactionId,
  });
  await repo.insertAudit(client, draft.id, 'POSTED', input.createdBy, {
    journalEntryId: journal.transactionId,
    transactionNumber: journal.transactionNumber,
    shim: true,
  });

  const posted = (await repo.getById(client, draft.id))!;
  try {
    assertPostedAuditFields(posted);
  } catch (err) {
    rethrowInvariant(err);
  }
  return posted;
}
