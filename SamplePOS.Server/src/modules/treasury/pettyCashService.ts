/**
 * Petty Cash — Phase 1D (1012 dedicated; 1015 = undeposited only)
 *
 * Operations:
 *   FUND / REPLENISH — DR 1012 / CR source (1010 drawer or 1030 bank)
 *   EXPENSE          — DR expense / CR 1012
 */

import type { Pool } from 'pg';
import { UnitOfWork } from '../../db/unitOfWork.js';
import {
  ValidationError,
  ForbiddenError,
  NotFoundError,
} from '../../middleware/errorHandler.js';
import {
  assertBalancedLines,
  roundMoney,
  TreasuryInvariantError,
  type TreasuryDocument,
} from '@shared/treasury/index.js';
import { isTreasuryDocumentEnabled } from './treasurySettings.js';
import { assertSufficientLiquidityFunds } from './liquidityFundsGuard.js';
import * as repo from './treasuryRepository.js';
import * as treasuryService from './treasuryService.js';
import { ensurePettyCashAccount } from './ensurePettyCashAccount.js';

export const PETTY_CASH_CODE = '1012';
export const CASH_DRAWER_CODE = '1010';
export const BANK_CODE = '1030';
export const DEFAULT_PETTY_EXPENSE_CODE = '6900';

export type PettyCashOperation = 'FUND' | 'REPLENISH' | 'EXPENSE';

export interface CreatePettyCashInput {
  transactionDate: string;
  operation: PettyCashOperation;
  amount: number;
  /** FUND/REPLENISH: liquidity source (default 1010). EXPENSE: expense account (default 6900). */
  contraAccountCode?: string;
  memo?: string;
  requiresApproval?: boolean;
  sourceSessionMovementId?: string;
  createdBy: string;
  postImmediately?: boolean;
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

async function assertAccountExists(pool: Pool, accountCode: string): Promise<void> {
  const result = await pool.query(
    `SELECT 1 FROM accounts WHERE "AccountCode" = $1 AND "IsActive" = true`,
    [accountCode],
  );
  if (result.rows.length === 0) {
    throw new NotFoundError(`Account ${accountCode} not found or inactive`);
  }
}

export async function getPettyCashBalance(pool: Pool): Promise<{
  pettyCash: number;
  cashDrawer: number;
  undepositedFunds: number;
}> {
  // Do NOT use accounts.CurrentBalance — bare POSTED / cache drift shows false
  // Undeposited overdraft after AR reverse. Liquidity SSOT = net-active ledger.
  const {
    postedLedgerBalanceLateralForList,
    availableFromPostedTotals,
  } = await import('./postedLedgerBalance.js');
  const result = await pool.query<{
    AccountCode: string;
    NormalBalance: string;
    debitTotal: string;
    creditTotal: string;
  }>(
    `
    SELECT
      a."AccountCode",
      a."NormalBalance",
      COALESCE(bal.debit_total, 0)::text AS "debitTotal",
      COALESCE(bal.credit_total, 0)::text AS "creditTotal"
    FROM accounts a
    ${postedLedgerBalanceLateralForList()}
    WHERE a."AccountCode" = ANY($1::text[])
      AND a."IsActive" = true
    `,
    [['1010', '1012', '1015']],
  );
  const map: Record<string, number> = {};
  for (const r of result.rows) {
    map[r.AccountCode] = availableFromPostedTotals(
      Number(r.debitTotal),
      Number(r.creditTotal),
      r.NormalBalance,
    );
  }
  return {
    cashDrawer: map['1010'] ?? 0,
    pettyCash: map['1012'] ?? 0,
    undepositedFunds: map['1015'] ?? 0,
  };
}

/**
 * Create (and optionally post) a PETTY_CASH Treasury Document.
 */
export async function createPettyCashDocument(
  pool: Pool,
  input: CreatePettyCashInput,
): Promise<TreasuryDocument> {
  await assertFeatureEnabled(pool);
  await ensurePettyCashAccount(pool);

  const amount = roundMoney(input.amount);
  if (amount <= 0) {
    throw new ValidationError('Amount must be greater than zero');
  }

  const postImmediately = input.postImmediately !== false;
  let lines: Parameters<typeof repo.createDocument>[1]['lines'];
  let memo = input.memo;
  let fromCode: string;
  let toCode: string;

  if (input.operation === 'EXPENSE') {
    const expenseCode = input.contraAccountCode?.trim() || DEFAULT_PETTY_EXPENSE_CODE;
    await assertAccountExists(pool, expenseCode);
    await assertAccountExists(pool, PETTY_CASH_CODE);
    fromCode = PETTY_CASH_CODE;
    toCode = expenseCode;
    memo = memo || `Petty cash expense → ${expenseCode}`;
    lines = [
      {
        lineType: 'ACCOUNT_MOVE',
        accountCode: expenseCode,
        description: memo,
        debitAmount: amount,
        creditAmount: 0,
        sourceSessionMovementId: input.sourceSessionMovementId,
      },
      {
        lineType: 'ACCOUNT_MOVE',
        accountCode: PETTY_CASH_CODE,
        description: memo,
        debitAmount: 0,
        creditAmount: amount,
        sourceSessionMovementId: input.sourceSessionMovementId,
      },
    ];
  } else {
    // FUND / REPLENISH: DR Petty Cash / CR source (drawer or bank)
    const sourceCode = input.contraAccountCode?.trim() || CASH_DRAWER_CODE;
    if (sourceCode === PETTY_CASH_CODE) {
      throw new ValidationError('Funding source cannot be Petty Cash itself');
    }
    if (sourceCode === '1015') {
      throw new ValidationError(
        'Cannot fund Petty Cash from Undeposited Funds (1015). Use Cash Drawer (1010) or Bank (1030).',
      );
    }
    await assertAccountExists(pool, sourceCode);
    await assertAccountExists(pool, PETTY_CASH_CODE);
    fromCode = sourceCode;
    toCode = PETTY_CASH_CODE;
    memo =
      memo ||
      (input.operation === 'REPLENISH'
        ? `Petty cash replenish from ${sourceCode}`
        : `Petty cash fund from ${sourceCode}`);
    lines = [
      {
        lineType: 'ACCOUNT_MOVE',
        accountCode: PETTY_CASH_CODE,
        description: memo,
        debitAmount: amount,
        creditAmount: 0,
        sourceSessionMovementId: input.sourceSessionMovementId,
      },
      {
        lineType: 'ACCOUNT_MOVE',
        accountCode: sourceCode,
        description: memo,
        debitAmount: 0,
        creditAmount: amount,
        sourceSessionMovementId: input.sourceSessionMovementId,
      },
    ];
  }

  try {
    assertBalancedLines(lines);
  } catch (err) {
    rethrowInvariant(err);
  }

  // Credit side must have funds (float for EXPENSE; drawer/bank for FUND/REPLENISH)
  await assertSufficientLiquidityFunds(pool, fromCode, amount, {
    asOfDate: input.transactionDate,
    actionLabel:
      input.operation === 'EXPENSE'
        ? 'spend from petty float'
        : `fund petty cash from ${fromCode}`,
  });

  const doc = await UnitOfWork.run(pool, async (client) =>
    repo.createDocument(client, {
      documentType: 'PETTY_CASH',
      transactionDate: input.transactionDate,
      memo,
      fromAccountCode: fromCode,
      toAccountCode: toCode,
      requiresApproval: input.requiresApproval ?? false,
      lines,
      createdBy: input.createdBy,
    }),
  );

  if (postImmediately && !doc.requiresApproval) {
    return treasuryService.post(pool, doc.id, input.createdBy);
  }
  return doc;
}
