/**
 * Deposit Worksheet — Phase 1B (QuickBooks-style Undeposited Funds clear)
 */

import type { Pool, PoolClient } from 'pg';
import { UnitOfWork } from '../../db/unitOfWork.js';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from '../../middleware/errorHandler.js';
import {
  assertBalancedLines,
  roundMoney,
  TreasuryInvariantError,
  type TreasuryDocument,
  type TreasuryDocumentLineInput,
} from '@shared/treasury/index.js';
import { isTreasuryDocumentEnabled } from './treasurySettings.js';
import * as repo from './treasuryRepository.js';
import * as settlementRepo from './receiptSettlementRepository.js';
import {
  assertDepositConsumesUnsettled,
  assertSettlementCeiling,
} from '@shared/treasury/index.js';
import { ensureBankGlLiquidityTag } from '../banking/ensureBankGlLiquidityTag.js';
import {
  ensureDepositLiquidityBook,
  type DepositLiquidityKind,
} from './ensureDepositLiquidityBook.js';

const CLEARING_CODE = '1015';
const SHORTAGE_CODE = '6850';
const OVERAGE_CODE = '4900';

export type DepositDestinationKind = 'CASH' | 'MOBILE_MONEY' | 'BANK';

export type DepositReceiptApplication = {
  sourceType: settlementRepo.ReceiptSourceType;
  sourceId: string;
  amount: number;
};

export interface CreateDepositWorksheetInput {
  transactionDate: string;
  /** Required when destinationKind is BANK (default). Ignored for CASH / MOBILE_MONEY. */
  bankAccountId?: string;
  /** Explicit destination. CASH / MOBILE_MONEY auto-ensure Banking books for 1010 / 1040. */
  destinationKind?: DepositDestinationKind;
  depositReference?: string;
  memo?: string;
  receipts: DepositReceiptApplication[];
  shortageAmount?: number;
  overageAmount?: number;
  requiresApproval?: boolean;
  createdBy: string;
}

export type DepositDestinationOption = {
  kind: DepositDestinationKind;
  bankAccountId: string;
  name: string;
  glAccountCode: string;
  glAccountName: string | null;
  systemAccountTag: string | null;
  isDefault?: boolean;
};

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

async function resolveBankGlCode(client: PoolClient, bankAccountId: string): Promise<string> {
  const result = await client.query<{
    gl_account_id: string;
    gl_account_code: string;
    name: string;
    account_type: string;
    system_account_tag: string | null;
    is_posting: boolean;
  }>(
    `SELECT a."Id" AS gl_account_id,
            a."AccountCode" AS gl_account_code,
            ba.name,
            a."AccountType" AS account_type,
            a."SystemAccountTag" AS system_account_tag,
            a."IsPostingAccount" AS is_posting
     FROM bank_accounts ba
     JOIN accounts a ON a."Id" = ba.gl_account_id
     WHERE ba.id = $1 AND ba.is_active = TRUE`,
    [bankAccountId],
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('Bank account not found or inactive');
  }
  const row = result.rows[0];
  const tag = String(row.system_account_tag || '').toUpperCase();
  const type = String(row.account_type || '').toUpperCase();
  const code = String(row.gl_account_code || '');

  // Deposit worksheet must land on a real liquidity GL — never AR / equity / clearing / revenue.
  const blockedTags = new Set([
    'ACCOUNTS_RECEIVABLE',
    'ACCOUNTS_PAYABLE',
    'UNDEPOSITED_FUNDS',
    'OPENING_BALANCE_EQUITY',
    'COGS',
    'INVENTORY',
  ]);
  if (blockedTags.has(tag) || code === '1200' || code === '1015' || code === '3050') {
    throw new ValidationError(
      `Bank account "${row.name}" is linked to GL ${code} (${tag || type}), which cannot receive deposits. ` +
        `Edit the bank account under Banking → Accounts and link it to a Bank / Cash / Mobile Money asset account (e.g. 1030), ` +
        `or choose Cash / Mobile Money on Undeposited receipts.`,
    );
  }
  if (type !== 'ASSET') {
    throw new ValidationError(
      `Bank account "${row.name}" is linked to non-asset GL ${code}. Deposit destination must be an Asset bank/cash account.`,
    );
  }
  if (row.is_posting === false) {
    throw new ValidationError(
      `Bank account "${row.name}" is linked to header GL ${code}. Select a posting Asset account.`,
    );
  }

  // Never fail TREASURY_DEPOSIT because CoA create left SystemAccountTag null.
  await ensureBankGlLiquidityTag(client, row.gl_account_id);

  return code;
}

export async function listUnsettledReceipts(
  pool: Pool,
  opts?: { clearingAccountCode?: string; limit?: number },
) {
  await assertFeatureEnabled(pool);
  return settlementRepo.listUnsettledReceipts(pool, opts);
}

export async function getDepositReconciliation(pool: Pool) {
  await assertFeatureEnabled(pool);
  await settlementRepo.syncReceiptSettlements(pool);
  const [glBalance, unsettledResidual] = await Promise.all([
    settlementRepo.getClearingGlBalance(pool, CLEARING_CODE),
    settlementRepo.sumUnsettledResidual(pool, CLEARING_CODE),
  ]);
  return {
    clearingAccountCode: CLEARING_CODE,
    glBalance: roundMoney(glBalance),
    unsettledResidual: roundMoney(unsettledResidual),
    difference: roundMoney(glBalance - unsettledResidual),
  };
}

/**
 * Destinations for Undeposited receipt clearing:
 * - Cash Drawer (1010) and Mobile Money (1040) are always offered
 * - Banking books for those GLs are created on first deposit (not on list)
 * - Other Banking → Accounts books remain selectable as Bank
 */
export async function listDepositDestinations(pool: Pool): Promise<{
  cash: DepositDestinationOption;
  mobileMoney: DepositDestinationOption;
  banks: DepositDestinationOption[];
}> {
  await assertFeatureEnabled(pool);

  const [cashBook, momoBook, bankRows] = await Promise.all([
    findDepositLiquidityBook(pool, 'CASH'),
    findDepositLiquidityBook(pool, 'MOBILE_MONEY'),
    pool.query<{
      id: string;
      name: string;
      gl_account_code: string;
      gl_account_name: string | null;
      system_account_tag: string | null;
      is_default: boolean;
    }>(
      `SELECT ba.id,
              ba.name,
              a."AccountCode" AS gl_account_code,
              a."AccountName" AS gl_account_name,
              a."SystemAccountTag" AS system_account_tag,
              ba.is_default
       FROM bank_accounts ba
       JOIN accounts a ON a."Id" = ba.gl_account_id
       WHERE ba.is_active = TRUE
         AND a."IsActive" = TRUE
         AND a."AccountCode" NOT IN ('1010', '1040', '1015', '1012', '1200', '3050')
         AND COALESCE(UPPER(a."SystemAccountTag"), '') NOT IN (
           'CASH', 'MOBILE_MONEY', 'UNDEPOSITED_FUNDS', 'PETTY_CASH',
           'ACCOUNTS_RECEIVABLE', 'OPENING_BALANCE_EQUITY'
         )
       ORDER BY ba.is_default DESC, ba.name ASC`,
    ),
  ]);

  return {
    cash: cashBook,
    mobileMoney: momoBook,
    banks: bankRows.rows.map((row) => ({
      kind: 'BANK' as const,
      bankAccountId: row.id,
      name: row.name,
      glAccountCode: row.gl_account_code,
      glAccountName: row.gl_account_name,
      systemAccountTag: row.system_account_tag,
      isDefault: row.is_default,
    })),
  };
}

async function findDepositLiquidityBook(
  pool: Pool,
  kind: DepositLiquidityKind,
): Promise<DepositDestinationOption> {
  const glCode = kind === 'CASH' ? '1010' : '1040';
  const fallbackName = kind === 'CASH' ? 'Cash Drawer' : 'Mobile Money';
  const tag = kind;

  const result = await pool.query<{
    bank_account_id: string | null;
    bank_name: string | null;
    gl_account_code: string | null;
    gl_account_name: string | null;
  }>(
    `SELECT ba.id AS bank_account_id,
            ba.name AS bank_name,
            a."AccountCode" AS gl_account_code,
            a."AccountName" AS gl_account_name
     FROM accounts a
     LEFT JOIN bank_accounts ba
       ON ba.gl_account_id = a."Id" AND ba.is_active = TRUE
     WHERE a."AccountCode" = $1
     ORDER BY ba.is_default DESC NULLS LAST, ba.created_at ASC NULLS LAST
     LIMIT 1`,
    [glCode],
  );

  const row = result.rows[0];
  return {
    kind,
    bankAccountId: row?.bank_account_id ?? '',
    name: row?.bank_name || row?.gl_account_name || fallbackName,
    glAccountCode: row?.gl_account_code || glCode,
    glAccountName: row?.gl_account_name || fallbackName,
    systemAccountTag: tag,
  };
}

async function resolveDepositBankAccountId(
  client: PoolClient,
  input: CreateDepositWorksheetInput,
): Promise<{ bankAccountId: string; destinationKind: DepositDestinationKind }> {
  const kind = input.destinationKind ?? 'BANK';
  if (kind === 'CASH' || kind === 'MOBILE_MONEY') {
    const book = await ensureDepositLiquidityBook(client, kind as DepositLiquidityKind);
    return { bankAccountId: book.bankAccountId, destinationKind: kind };
  }
  if (!input.bankAccountId) {
    throw new ValidationError('Select a bank account to deposit into');
  }
  return { bankAccountId: input.bankAccountId, destinationKind: 'BANK' };
}

function depositLineDescription(
  kind: DepositDestinationKind,
  depositReference?: string,
): string {
  const base =
    kind === 'CASH'
      ? 'Cash deposit'
      : kind === 'MOBILE_MONEY'
        ? 'Mobile money deposit'
        : 'Bank deposit';
  return depositReference ? `${base} ${depositReference}` : base;
}

/**
 * Build a balanced DEPOSIT_WORKSHEET draft from selected unsettled receipts.
 * Journal shape:
 *   DR Bank (sum − shortage + overage)
 *   DR Cash Shortage (shortage) optional
 *   CR Undeposited Funds (sum of receipt applications)
 *   CR Other Income (overage) optional
 */
export async function createDepositWorksheet(
  pool: Pool,
  input: CreateDepositWorksheetInput,
): Promise<TreasuryDocument> {
  await assertFeatureEnabled(pool);

  if (!input.receipts?.length) {
    throw new ValidationError('Select at least one receipt to deposit');
  }

  const shortageAmount = roundMoney(input.shortageAmount ?? 0);
  const overageAmount = roundMoney(input.overageAmount ?? 0);
  if (shortageAmount > 0 && overageAmount > 0) {
    throw new ValidationError('Cannot have both shortage and overage on the same worksheet');
  }

  return UnitOfWork.run(pool, async (client) => {
    const { bankAccountId, destinationKind } = await resolveDepositBankAccountId(client, input);
    const bankGlCode = await resolveBankGlCode(client, bankAccountId);
    const lines: TreasuryDocumentLineInput[] = [];
    let receiptTotal = 0;

    for (const receipt of input.receipts) {
      const amount = roundMoney(receipt.amount);
      if (amount <= 0) {
        throw new ValidationError('Each receipt application amount must be positive');
      }

      let settlement: settlementRepo.ReceiptSettlement;
      try {
        settlement = await settlementRepo.lockSettlement(
          client,
          receipt.sourceType,
          receipt.sourceId,
        );
      } catch (err) {
        if ((err as { code?: string }).code === 'NOT_FOUND') {
          throw new NotFoundError(
            `Receipt not found for deposit: ${receipt.sourceType}/${receipt.sourceId}`,
          );
        }
        throw err;
      }

      try {
        assertDepositConsumesUnsettled({
          settlementStatus: settlement.settlementStatus,
          residualAmount: settlement.residualAmount,
          sourceLabel: settlement.sourceNumber ?? undefined,
        });
        assertSettlementCeiling({
          applyAmount: amount,
          residualAmount: settlement.residualAmount,
          sourceLabel: settlement.sourceNumber ?? undefined,
        });
      } catch (err) {
        rethrowInvariant(err);
      }

      receiptTotal = roundMoney(receiptTotal + amount);
      lines.push({
        lineType: 'RECEIPT_APPLICATION',
        accountCode: CLEARING_CODE,
        description: `Deposit ${settlement.sourceNumber ?? settlement.sourceId}`,
        creditAmount: amount,
        debitAmount: 0,
        sourcePaymentId:
          receipt.sourceType === 'AR_CUSTOMER_PAYMENT' ||
          receipt.sourceType === 'INVOICE_PAYMENT'
            ? receipt.sourceId
            : undefined,
        sourceReceiptId:
          receipt.sourceType === 'CUSTOMER_DEPOSIT' ? receipt.sourceId : undefined,
        memo: `${receipt.sourceType}:${receipt.sourceId}`,
      });
    }

    const bankDebit = roundMoney(receiptTotal - shortageAmount + overageAmount);
    if (bankDebit <= 0) {
      throw new ValidationError('Bank deposit amount must be greater than zero after shortage');
    }

    lines.unshift({
      lineType: 'ACCOUNT_MOVE',
      accountCode: bankGlCode,
      description: depositLineDescription(destinationKind, input.depositReference),
      debitAmount: bankDebit,
      creditAmount: 0,
    });

    if (shortageAmount > 0) {
      lines.push({
        lineType: 'SHORTAGE',
        accountCode: SHORTAGE_CODE,
        description: 'Cash shortage on deposit',
        debitAmount: shortageAmount,
        creditAmount: 0,
      });
    }
    if (overageAmount > 0) {
      lines.push({
        lineType: 'OVERAGE',
        accountCode: OVERAGE_CODE,
        description: 'Cash overage on deposit',
        debitAmount: 0,
        creditAmount: overageAmount,
      });
    }

    try {
      assertBalancedLines(
        lines.map((l) => ({
          debitAmount: l.debitAmount ?? 0,
          creditAmount: l.creditAmount ?? 0,
        })),
      );
    } catch (err) {
      rethrowInvariant(err);
    }

    return repo.createDocument(client, {
      documentType: 'DEPOSIT_WORKSHEET',
      transactionDate: input.transactionDate,
      memo: input.memo ?? `Deposit worksheet — ${input.receipts.length} receipt(s)`,
      fromAccountCode: CLEARING_CODE,
      toAccountCode: bankGlCode,
      bankAccountId,
      depositReference: input.depositReference,
      shortageAmount,
      overageAmount,
      requiresApproval: input.requiresApproval ?? false,
      lines,
      createdBy: input.createdBy,
    });
  });
}

/**
 * Apply receipt settlements for a posted (or about-to-post) deposit worksheet.
 * Called from treasuryService.postInternal before the journal commits.
 */
export async function applySettlementsForDepositWorksheet(
  client: PoolClient,
  doc: TreasuryDocument,
): Promise<void> {
  if (doc.documentType !== 'DEPOSIT_WORKSHEET') return;

  const receiptLines = doc.lines.filter((l) => l.lineType === 'RECEIPT_APPLICATION');
  if (receiptLines.length === 0) {
    throw new ValidationError('Deposit Worksheet has no receipt application lines');
  }

  for (const line of receiptLines) {
    const amount = roundMoney(line.creditAmount || line.amount || 0);
    const memo = line.memo ?? '';
    let sourceType: settlementRepo.ReceiptSourceType | null = null;
    let sourceId: string | null = null;

    const memoMatch = /^([A-Z_]+):([0-9a-f-]{36})$/i.exec(memo);
    if (memoMatch) {
      sourceType = memoMatch[1] as settlementRepo.ReceiptSourceType;
      sourceId = memoMatch[2];
    } else if (line.sourcePaymentId) {
      sourceType = 'AR_CUSTOMER_PAYMENT';
      sourceId = line.sourcePaymentId;
    } else if (line.sourceReceiptId) {
      sourceType = 'CUSTOMER_DEPOSIT';
      sourceId = line.sourceReceiptId;
    }

    if (!sourceType || !sourceId) {
      throw new ValidationError(
        `Receipt application line ${line.lineNumber} is missing source identity`,
      );
    }

    try {
      await settlementRepo.applySettlement(client, {
        sourceType,
        sourceId,
        amount,
        treasuryDocumentId: doc.id,
        treasuryDocumentLineId: line.id,
        sourceLabel: line.description,
      });
    } catch (err) {
      rethrowInvariant(err);
    }
  }
}

export async function releaseSettlementsForDepositWorksheet(
  client: PoolClient,
  doc: TreasuryDocument,
): Promise<void> {
  if (doc.documentType !== 'DEPOSIT_WORKSHEET') return;
  await settlementRepo.reverseApplicationsForDocument(client, doc.id);
}
