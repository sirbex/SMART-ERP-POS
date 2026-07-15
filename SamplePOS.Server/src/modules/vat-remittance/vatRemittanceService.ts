/**
 * VAT Remittance — ADR-005 Phase 3C
 *
 * Creates/posts Treasury Document type VAT_REMITTANCE:
 *   DR 2300 Tax Payable / CR liquidity
 * Ceiling: Decision B document net VAT payable − already remitted (capped by GL 2300).
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
  roundMoney as treasuryRound,
  type TreasuryDocument,
  TreasuryInvariantError,
} from '@shared/treasury/index.js';
import {
  assertRemittanceCeiling,
  assertRemittanceDebitsVatControl,
  assertVatRemittanceAccounts,
  assertVatPostingSourceNotWht,
  VAT_CONTROL_ACCOUNT,
  VatRemittanceInvariantError,
  roundMoney,
} from '@shared/vat-remittance/index.js';
import {
  assertForbiddenAccounts,
  assertJournalMatchesExpected,
  JournalAccuracyError,
} from '@shared/financial-accuracy/index.js';
import { isTreasuryDocumentEnabled } from '../treasury/treasurySettings.js';
import { isVatRemittanceDocumentEnabled } from './vatRemittanceSettings.js';
import { sumPostedVatRemittances } from './vatRemittanceSettled.js';
import * as repo from '../treasury/treasuryRepository.js';
import * as treasuryService from '../treasury/treasuryService.js';
import { getTaxComplianceSummary } from '../withholding-tax/whtReportService.js';
import { AccountCodes } from '../../services/glEntryService.js';
import { LEDGER_NET_ACTIVE_SQL } from '../../utils/ledgerNetActive.js';

export { sumPostedVatRemittances } from './vatRemittanceSettled.js';

type Db = Pool | PoolClient;

export interface CreateVatRemittanceInput {
  periodFrom: string;
  periodTo: string;
  amount: number;
  transactionDate: string;
  paymentAccountCode: string;
  authorityReference: string;
  memo?: string;
  createdBy: string;
  postImmediately?: boolean;
}

export interface VatRemittanceWorksheet {
  enabled: boolean;
  periodFrom: string;
  periodTo: string;
  documentNetVatPayable: number;
  netOutputTax: number;
  netInputTax: number;
  alreadyRemitted: number;
  availableVatPayable: number;
  glTaxPayable2300: number;
  defaultPaymentAccountCode: string;
  decision: 'B';
  note: string;
}

async function assertFeatureEnabled(pool: Pool): Promise<void> {
  const [treasuryOn, vatOn] = await Promise.all([
    isTreasuryDocumentEnabled(pool),
    isVatRemittanceDocumentEnabled(pool),
  ]);
  if (!treasuryOn) {
    throw new ForbiddenError(
      'Treasury Documents are disabled. Enable treasury_document_enabled in system settings.',
    );
  }
  if (!vatOn) {
    throw new ForbiddenError(
      'VAT remittance documents are disabled. Enable vat_remittance_document_enabled in system settings.',
    );
  }
}

function rethrowInvariant(err: unknown): never {
  if (
    err instanceof VatRemittanceInvariantError ||
    err instanceof TreasuryInvariantError ||
    err instanceof JournalAccuracyError
  ) {
    throw new ValidationError(err.message);
  }
  throw err;
}

async function assertAccountExists(conn: Db, accountCode: string): Promise<void> {
  const result = await conn.query(
    `SELECT 1 FROM accounts WHERE "AccountCode" = $1 AND "IsActive" = true`,
    [accountCode],
  );
  if (result.rows.length === 0) {
    throw new NotFoundError(`Account ${accountCode} not found or inactive`);
  }
}

async function gl2300LiabilityAsOf(conn: Db, asOfDate: string): Promise<number> {
  const result = await conn.query<{ debits: string; credits: string }>(
    `SELECT
       COALESCE(SUM(le."DebitAmount"), 0) AS debits,
       COALESCE(SUM(le."CreditAmount"), 0) AS credits
     FROM ledger_entries le
     JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
     JOIN accounts a ON a."Id" = le."AccountId"
     WHERE a."AccountCode" = $1
       AND ${LEDGER_NET_ACTIVE_SQL}
       AND lt."TransactionDate"::DATE <= $2::date`,
    [AccountCodes.TAX_PAYABLE, asOfDate],
  );
  const debits = Number(result.rows[0]?.debits ?? 0);
  const credits = Number(result.rows[0]?.credits ?? 0);
  return roundMoney(credits - debits);
}

export async function getAvailableVatPayable(
  conn: Db,
  periodFrom: string,
  periodTo: string,
): Promise<{
  documentNetVatPayable: number;
  netOutputTax: number;
  netInputTax: number;
  alreadyRemitted: number;
  availableVatPayable: number;
  glTaxPayable2300: number;
}> {
  const [summary, alreadyRemitted, glTaxPayable2300] = await Promise.all([
    getTaxComplianceSummary(conn as Pool, periodFrom, periodTo),
    sumPostedVatRemittances(conn, periodFrom, periodTo),
    gl2300LiabilityAsOf(conn, periodTo),
  ]);

  const documentNetVatPayable = roundMoney(summary.vat.netVatPayable);
  const fromBoxes = roundMoney(Math.max(0, documentNetVatPayable - alreadyRemitted));
  const availableVatPayable = roundMoney(
    Math.max(0, Math.min(fromBoxes, Math.max(0, glTaxPayable2300))),
  );

  return {
    documentNetVatPayable,
    netOutputTax: roundMoney(summary.vat.netOutputTax),
    netInputTax: roundMoney(summary.vat.netInputTax),
    alreadyRemitted,
    availableVatPayable,
    glTaxPayable2300,
  };
}

export async function getVatRemittanceWorksheet(
  pool: Pool,
  periodFrom: string,
  periodTo: string,
): Promise<VatRemittanceWorksheet> {
  const [treasuryOn, vatOn] = await Promise.all([
    isTreasuryDocumentEnabled(pool),
    isVatRemittanceDocumentEnabled(pool),
  ]);
  const avail = await getAvailableVatPayable(pool, periodFrom, periodTo);

  return {
    enabled: treasuryOn && vatOn,
    periodFrom,
    periodTo,
    ...avail,
    defaultPaymentAccountCode: AccountCodes.CASH,
    decision: 'B',
    note:
      'Decision B: remit up to document net VAT payable (capped by GL 2300). Purchase input may be inventory-embedded.',
  };
}

/**
 * Create and optionally post a VAT_REMITTANCE Treasury Document.
 */
export async function createAndPostVatRemittance(
  pool: Pool,
  input: CreateVatRemittanceInput,
): Promise<TreasuryDocument> {
  await assertFeatureEnabled(pool);

  const amount = roundMoney(input.amount);
  if (amount <= 0) {
    throw new ValidationError('Remittance amount must be greater than zero');
  }
  const authorityReference = String(input.authorityReference || '').trim();
  if (!authorityReference) {
    throw new ValidationError('Authority reference is required');
  }
  if (!input.periodFrom || !input.periodTo || input.periodFrom > input.periodTo) {
    throw new ValidationError('Valid periodFrom and periodTo are required');
  }

  const paymentCode = input.paymentAccountCode?.trim() || AccountCodes.CASH;
  await assertAccountExists(pool, paymentCode);
  await assertAccountExists(pool, VAT_CONTROL_ACCOUNT);

  const postImmediately = input.postImmediately !== false;

  const doc = await UnitOfWork.run(pool, async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
      `VAT-REM-${input.periodFrom}-${input.periodTo}`,
    ]);

    const avail = await getAvailableVatPayable(client, input.periodFrom, input.periodTo);
    try {
      assertRemittanceCeiling({
        remittanceAmount: amount,
        availableVatPayable: avail.availableVatPayable,
      });
      assertVatPostingSourceNotWht('VAT_REMITTANCE');
    } catch (err) {
      rethrowInvariant(err);
    }

    const dup = await client.query(
      `SELECT id FROM treasury_documents
       WHERE document_type = 'VAT_REMITTANCE'
         AND deposit_reference = $1
         AND status IN ('POSTED', 'DRAFT', 'PENDING_APPROVAL')
         AND reversed_by_document_id IS NULL
       LIMIT 1`,
      [authorityReference],
    );
    if (dup.rows.length > 0) {
      throw new ValidationError(
        `VAT remittance with authority reference "${authorityReference}" already exists`,
      );
    }

    const memo =
      input.memo?.trim() ||
      `VAT remittance ${input.periodFrom}..${input.periodTo} — ${authorityReference}`;

    const lines = [
      {
        lineType: 'ACCOUNT_MOVE' as const,
        accountCode: VAT_CONTROL_ACCOUNT,
        description: `Clear Tax Payable — ${authorityReference}`,
        debitAmount: amount,
        creditAmount: 0,
      },
      {
        lineType: 'ACCOUNT_MOVE' as const,
        accountCode: paymentCode,
        description: `VAT remittance payment — ${authorityReference}`,
        debitAmount: 0,
        creditAmount: amount,
      },
    ];

    try {
      assertBalancedLines(
        lines.map((l) => ({
          ...l,
          debitAmount: treasuryRound(l.debitAmount),
          creditAmount: treasuryRound(l.creditAmount),
        })),
      );
      assertVatRemittanceAccounts({ lines });
      assertRemittanceDebitsVatControl({ lines });
      assertJournalMatchesExpected(lines, [
        {
          accountCode: VAT_CONTROL_ACCOUNT,
          side: 'debit',
          amount,
          label: 'Tax Payable reduced',
        },
        {
          accountCode: paymentCode,
          side: 'credit',
          amount,
          label: 'Bank/cash pays VAT',
        },
      ]);
      assertForbiddenAccounts(
        lines,
        ['2350', '1250', '5210', '4010', '5110'],
        `VAT remittance ${authorityReference}`,
      );
    } catch (err) {
      rethrowInvariant(err);
    }

    return repo.createDocument(client, {
      documentType: 'VAT_REMITTANCE',
      transactionDate: input.transactionDate,
      memo,
      fromAccountCode: paymentCode,
      toAccountCode: VAT_CONTROL_ACCOUNT,
      depositReference: authorityReference,
      requiresApproval: false,
      lines,
      createdBy: input.createdBy,
    });
  });

  if (postImmediately) {
    return treasuryService.post(pool, doc.id, input.createdBy);
  }
  return doc;
}

export async function reverseVatRemittance(
  pool: Pool,
  treasuryDocumentId: string,
  actorUserId: string,
  reason?: string,
): Promise<{ original: TreasuryDocument; reversal: TreasuryDocument }> {
  await assertFeatureEnabled(pool);

  const existing = await UnitOfWork.run(pool, async (client) =>
    repo.getById(client, treasuryDocumentId),
  );
  if (!existing) throw new NotFoundError('VAT remittance document not found');
  if (existing.documentType !== 'VAT_REMITTANCE') {
    throw new ValidationError('Document is not a VAT_REMITTANCE');
  }
  return treasuryService.reverse(pool, treasuryDocumentId, actorUserId, reason);
}
