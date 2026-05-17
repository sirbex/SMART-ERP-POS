/**
 * Cutover Correction Service
 *
 * Detects and corrects fixed assets that were registered with mode=PURCHASE
 * before the ERP go-live (cutover) date. Pre-ERP assets must NEVER credit
 * Cash or Accounts Payable — they must credit Opening Balance Equity (3050).
 *
 * Correction journal per wrongly-registered asset:
 *   DR Cash  OR  DR Accounts Payable   (reverse the wrong credit)
 *   CR Opening Balance Equity (3050)   (declare the correct OBE credit)
 *
 * Source: CUTOVER_CORRECTION (system-locked, audit-trailed)
 *
 * HARD PROTECTION: This routine will NEVER touch journals whose source is
 * AP_INVOICE, SUPPLIER_INVOICE, or PURCHASE_INVOICE — those are real
 * transactions that must remain untouched.
 */

import { pool as globalPool } from '../../db/pool.js';
import type pg from 'pg';
import { UnitOfWork } from '../../db/unitOfWork.js';
import { AccountingCore } from '../../services/accountingCore.js';
import { AccountCodes } from '../../services/glEntryService.js';
import logger from '../../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

export interface CutoverAssetCandidate {
    assetId: string;
    assetNumber: string;
    assetName: string;
    acquisitionDate: string;
    acquisitionCost: number;
    registrationMode: string;
    originalCreditAccountCode: string;
    originalCreditAccountName: string;
    originalTransactionId: string;
    originalSource: string;
    alreadyCorrected: boolean;
}

export interface CutoverCorrectionResult {
    assetId: string;
    assetNumber: string;
    assetName: string;
    correctionTransactionId: string | null;
    status: 'APPLIED' | 'SKIPPED_ALREADY_CORRECTED' | 'SKIPPED_PROTECTED_SOURCE';
    reason?: string;
}

export interface CutoverCorrectionSummary {
    cutoverDate: string;
    candidatesFound: number;
    applied: number;
    skipped: number;
    dryRun: boolean;
    results: CutoverCorrectionResult[];
}

// Sources that indicate a real AP/purchasing transaction — MUST NEVER be touched
const PROTECTED_SOURCES = new Set([
    'AP_INVOICE',
    'SUPPLIER_INVOICE',
    'PURCHASE_INVOICE',
]);

// =============================================================================
// DETECT WRONGLY REGISTERED ASSETS
// =============================================================================

/**
 * Find all assets where:
 *   1. registration_mode = 'PURCHASE'  (not already in OPENING mode)
 *   2. acquisition_date < cutoverDate
 *   3. The original acquisition GL journal credit was Cash (1xxx) or AP (2100)
 *   4. The GL source is NOT a protected AP/invoice source
 */
export async function detectCutoverAssetCandidates(
    cutoverDate: string,
    pool?: pg.Pool
): Promise<CutoverAssetCandidate[]> {
    const dbPool = pool || globalPool;

    const result = await dbPool.query<{
        asset_id: string;
        asset_number: string;
        asset_name: string;
        acquisition_date: string;
        acquisition_cost: string;
        registration_mode: string;
        credit_account_code: string;
        credit_account_name: string;
        transaction_id: string;
        posting_source: string | null;
        already_corrected: boolean;
    }>(
        `SELECT
           fa.id                           AS asset_id,
           fa.asset_number,
           fa.name                         AS asset_name,
           fa.acquisition_date::text       AS acquisition_date,
           fa.acquisition_cost::text       AS acquisition_cost,
           fa.registration_mode,
           a."AccountCode"                 AS credit_account_code,
           a."AccountName"                 AS credit_account_name,
           lt."Id"                         AS transaction_id,
           lt."PostingSource"              AS posting_source,
           -- already corrected = a CUTOVER_CORRECTION journal referencing this asset exists
           EXISTS (
               SELECT 1
               FROM ledger_transactions lt2
               WHERE lt2."ReferenceType" = 'CUTOVER_ASSET_CORRECTION'
                 AND lt2."ReferenceId"   = fa.id
           )                               AS already_corrected
         FROM fixed_assets fa
         -- Join to the acquisition GL transaction
         JOIN ledger_transactions lt
           ON lt."ReferenceType" = 'ASSET_ACQUISITION'
          AND lt."ReferenceId"   = fa.id
         -- Find the credit line of that transaction
         JOIN ledger_entries le
           ON le."TransactionId" = lt."Id"
          AND le."EntryType"     = 'CREDIT'
         JOIN accounts a
           ON a."Id" = le."AccountId"
         WHERE fa.registration_mode = 'PURCHASE'
           AND fa.acquisition_date < $1::date
           AND fa.status != 'DISPOSED'
         ORDER BY fa.acquisition_date, fa.asset_number`,
        [cutoverDate]
    );

    return result.rows.map((row) => ({
        assetId: row.asset_id,
        assetNumber: row.asset_number,
        assetName: row.asset_name,
        acquisitionDate: row.acquisition_date,
        acquisitionCost: parseFloat(row.acquisition_cost),
        registrationMode: row.registration_mode,
        originalCreditAccountCode: row.credit_account_code,
        originalCreditAccountName: row.credit_account_name,
        originalTransactionId: row.transaction_id,
        originalSource: row.posting_source ?? 'UNKNOWN',
        alreadyCorrected: row.already_corrected,
    }));
}

// =============================================================================
// APPLY CUTOVER CORRECTIONS
// =============================================================================

/**
 * For each wrongly registered pre-ERP asset:
 *   - Skip if already corrected
 *   - Skip if the original journal source is a protected AP/invoice source
 *   - Post correction: DR (wrong credit account) / CR OBE (3050)
 *
 * @param cutoverDate  YYYY-MM-DD — assets acquired before this date are candidates
 * @param userId       Operator ID for audit trail
 * @param dryRun       If true, detect only — no DB writes
 * @param pool         Tenant pool (defaults to global pool)
 */
export async function applyCutoverAssetCorrections(
    cutoverDate: string,
    userId: string,
    dryRun: boolean = false,
    pool?: pg.Pool
): Promise<CutoverCorrectionSummary> {
    const dbPool = pool || globalPool;

    const candidates = await detectCutoverAssetCandidates(cutoverDate, dbPool);
    logger.info('[CutoverCorrection] Candidates detected', {
        cutoverDate,
        count: candidates.length,
        dryRun,
    });

    const results: CutoverCorrectionResult[] = [];

    if (dryRun) {
        // Dry-run: classify without writing
        for (const c of candidates) {
            if (c.alreadyCorrected) {
                results.push({
                    assetId: c.assetId,
                    assetNumber: c.assetNumber,
                    assetName: c.assetName,
                    correctionTransactionId: null,
                    status: 'SKIPPED_ALREADY_CORRECTED',
                });
            } else if (PROTECTED_SOURCES.has(c.originalSource)) {
                results.push({
                    assetId: c.assetId,
                    assetNumber: c.assetNumber,
                    assetName: c.assetName,
                    correctionTransactionId: null,
                    status: 'SKIPPED_PROTECTED_SOURCE',
                    reason: `Original journal source '${c.originalSource}' is a real AP transaction — not touched`,
                });
            } else {
                results.push({
                    assetId: c.assetId,
                    assetNumber: c.assetNumber,
                    assetName: c.assetName,
                    correctionTransactionId: null,
                    status: 'APPLIED',
                    reason: `Would post DR ${c.originalCreditAccountCode} / CR ${AccountCodes.OPENING_BALANCE_EQUITY}`,
                });
            }
        }
    } else {
        // Live run: one transaction per asset so a single failure doesn't roll back others
        for (const c of candidates) {
            if (c.alreadyCorrected) {
                results.push({
                    assetId: c.assetId,
                    assetNumber: c.assetNumber,
                    assetName: c.assetName,
                    correctionTransactionId: null,
                    status: 'SKIPPED_ALREADY_CORRECTED',
                });
                continue;
            }

            if (PROTECTED_SOURCES.has(c.originalSource)) {
                results.push({
                    assetId: c.assetId,
                    assetNumber: c.assetNumber,
                    assetName: c.assetName,
                    correctionTransactionId: null,
                    status: 'SKIPPED_PROTECTED_SOURCE',
                    reason: `Original journal source '${c.originalSource}' is a real AP transaction — not touched`,
                });
                continue;
            }

            const txResult = await UnitOfWork.run(dbPool, async (client) => {
                const entry = await AccountingCore.createJournalEntry(
                    {
                        entryDate: cutoverDate,
                        description: `Cutover correction — asset existed before ERP: ${c.assetName} (${c.assetNumber})`,
                        referenceType: 'CUTOVER_ASSET_CORRECTION',
                        referenceId: c.assetId,
                        referenceNumber: c.assetNumber,
                        lines: [
                            {
                                // Reverse the wrong credit (Cash or AP) — debit it back
                                accountCode: c.originalCreditAccountCode,
                                description: `Cutover correction — reverse wrong credit: ${c.assetNumber}`,
                                debitAmount: c.acquisitionCost,
                                creditAmount: 0,
                                entityType: 'FIXED_ASSET',
                                entityId: c.assetId,
                            },
                            {
                                // Declare correct OBE credit
                                accountCode: AccountCodes.OPENING_BALANCE_EQUITY,
                                description: `Cutover correction — opening balance equity: ${c.assetNumber}`,
                                debitAmount: 0,
                                creditAmount: c.acquisitionCost,
                                entityType: 'FIXED_ASSET',
                                entityId: c.assetId,
                            },
                        ],
                        userId,
                        idempotencyKey: `CUTOVER-CORRECTION-${c.assetId}`,
                        source: 'CUTOVER_CORRECTION',
                    },
                    undefined,
                    client
                );
                return entry;
            });

            logger.info('[CutoverCorrection] Correction posted', {
                assetNumber: c.assetNumber,
                transactionId: txResult.transactionId,
                amount: c.acquisitionCost,
            });

            results.push({
                assetId: c.assetId,
                assetNumber: c.assetNumber,
                assetName: c.assetName,
                correctionTransactionId: txResult.transactionId,
                status: 'APPLIED',
            });
        }
    }

    const applied = results.filter((r) => r.status === 'APPLIED').length;
    const skipped = results.length - applied;

    logger.info('[CutoverCorrection] Complete', { applied, skipped, dryRun });

    return {
        cutoverDate,
        candidatesFound: candidates.length,
        applied,
        skipped,
        dryRun,
        results,
    };
}
