/**
 * Find and reverse duplicate GL postings that inflate GL 1300 vs batch subledger.
 *
 * SAP/Odoo rule: one FI document per business reference (ReferenceType + ReferenceId).
 * Keeps the earliest active posting; reverses later duplicates.
 */
import type { Pool } from 'pg';
import Decimal from 'decimal.js';
import { reverseTransaction } from './accountingCore.js';
import { captureInventoryCoupling, type InventoryCouplingSnapshot } from './inventorySubledgerCoupling.js';
import { healInventoryGlDrift, type HealInventoryGlDriftResult } from '../modules/system/glRepairService.js';
import { ACTIVE_GL_REFERENCE_PREDICATE } from '../utils/activeGlReference.js';
import { getBusinessDate } from '../utils/dateRange.js';
import { Money } from '../utils/money.js';
import logger from '../utils/logger.js';

export interface DuplicateGlGroup {
    referenceType: string;
    referenceId: string;
    referenceNumber: string | null;
    transactionIds: string[];
    transactionNumbers: string[];
    inventory1300Net: number;
    duplicateCount: number;
    /** All except earliest — candidates for reversal. */
    reverseTransactionIds: string[];
}

export interface FindDuplicateGlResult {
    groups: DuplicateGlGroup[];
    totalDuplicateTransactions: number;
    estimated1300Inflation: number;
    couplingBefore: InventoryCouplingSnapshot;
}

export interface RemediateDuplicateGlResult {
    dryRun: boolean;
    groupsFound: number;
    reversed: number;
    errors: string[];
    reversedTransactionNumbers: string[];
}

export interface HealInventoryCompleteResult {
    duplicates: FindDuplicateGlResult;
    remediation: RemediateDuplicateGlResult | null;
    couplingAfterDuplicates: InventoryCouplingSnapshot;
    heal: HealInventoryGlDriftResult;
}

/** Pure: keep earliest txn, reverse the rest. */
export function selectDuplicateTransactionsToReverse(
    transactions: Array<{ id: string; createdAt: string }>,
): string[] {
    if (transactions.length <= 1) return [];
    const sorted = [...transactions].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return sorted.slice(1).map((t) => t.id);
}

const INVENTORY_REFERENCE_TYPES = [
    'GOODS_RECEIPT',
    'RETURN_GRN',
    'SALE',
    'SALE_COGS',
    'STOCK_MOVEMENT',
    'OPENING_STOCK',
    'OPENING_BALANCE',
    'DELIVERY_NOTE_PGI',
    'CORRECTION',
    'SYSTEM_CORRECTION',
] as const;

export async function findDuplicateInventoryGlPostings(
    pool: Pool,
): Promise<FindDuplicateGlResult> {
    const couplingBefore = await captureInventoryCoupling(pool);

    const dupRes = await pool.query<{
        reference_type: string;
        reference_id: string;
        reference_number: string | null;
        txn_ids: string[];
        txn_numbers: string[];
        created_ats: string[];
        inv_1300_nets: string[];
    }>(`
        WITH inv_txns AS (
            SELECT
                lt."Id" AS txn_id,
                lt."TransactionNumber" AS txn_number,
                lt."ReferenceType" AS reference_type,
                lt."ReferenceId" AS reference_id,
                lt."ReferenceNumber" AS reference_number,
                lt."CreatedAt" AS created_at,
                COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0) AS inv_1300_net
            FROM ledger_transactions lt
            JOIN ledger_entries le ON le."TransactionId" = lt."Id"
            JOIN accounts a ON a."Id" = le."AccountId"
            WHERE a."AccountCode" = '1300'
              AND ${ACTIVE_GL_REFERENCE_PREDICATE}
              AND lt."ReferenceType" = ANY($1::text[])
              AND lt."ReferenceId" IS NOT NULL
            GROUP BY lt."Id", lt."TransactionNumber", lt."ReferenceType",
                     lt."ReferenceId", lt."ReferenceNumber", lt."CreatedAt"
        ),
        grouped AS (
            SELECT
                reference_type,
                reference_id,
                MAX(reference_number) AS reference_number,
                array_agg(txn_id ORDER BY created_at) AS txn_ids,
                array_agg(txn_number ORDER BY created_at) AS txn_numbers,
                array_agg(created_at::text ORDER BY created_at) AS created_ats,
                array_agg(inv_1300_net::text ORDER BY created_at) AS inv_1300_nets
            FROM inv_txns
            GROUP BY reference_type, reference_id
            HAVING COUNT(*) > 1
        )
        SELECT * FROM grouped
        ORDER BY ABS(
            (SELECT SUM(n::numeric) FROM unnest(inv_1300_nets) AS n)
        ) DESC
    `, [INVENTORY_REFERENCE_TYPES]);

    const groups: DuplicateGlGroup[] = [];
    let totalDuplicateTransactions = 0;
    let estimated1300Inflation = new Decimal(0);

    for (const row of dupRes.rows) {
        const txns = row.txn_ids.map((id, i) => ({
            id,
            createdAt: row.created_ats[i] ?? '',
        }));
        const reverseIds = selectDuplicateTransactionsToReverse(txns);
        const nets = row.inv_1300_nets.map((n) => Money.toNumber(Money.parseDb(n)));
        const inventory1300Net = nets.reduce((s, v) => s.plus(v), new Decimal(0)).toNumber();

        for (let i = 1; i < nets.length; i++) {
            estimated1300Inflation = estimated1300Inflation.plus(nets[i] ?? 0);
        }

        totalDuplicateTransactions += reverseIds.length;

        groups.push({
            referenceType: row.reference_type,
            referenceId: row.reference_id,
            referenceNumber: row.reference_number,
            transactionIds: row.txn_ids,
            transactionNumbers: row.txn_numbers,
            inventory1300Net,
            duplicateCount: row.txn_ids.length,
            reverseTransactionIds: reverseIds,
        });
    }

    return {
        groups,
        totalDuplicateTransactions,
        estimated1300Inflation: Money.toNumber(estimated1300Inflation),
        couplingBefore,
    };
}

export async function remediateDuplicateInventoryGlPostings(
    pool: Pool,
    userId: string,
    options: { dryRun?: boolean } = {},
): Promise<RemediateDuplicateGlResult> {
    const dryRun = options.dryRun ?? false;
    const found = await findDuplicateInventoryGlPostings(pool);
    const result: RemediateDuplicateGlResult = {
        dryRun,
        groupsFound: found.groups.length,
        reversed: 0,
        errors: [],
        reversedTransactionNumbers: [],
    };

    if (dryRun || found.groups.length === 0) {
        return result;
    }

    const today = getBusinessDate();

    for (const group of found.groups) {
        for (const txnId of group.reverseTransactionIds) {
            try {
                const rev = await reverseTransaction(
                    {
                        originalTransactionId: txnId,
                        reversalDate: today,
                        reason:
                            `Duplicate GL remediation: extra ${group.referenceType} posting ` +
                            `for ${group.referenceNumber ?? group.referenceId}. ` +
                            `Keeping earliest active journal; reversing duplicate to align GL 1300 with batches.`,
                        idempotencyKey: `DUP-GL-REM-${txnId}`,
                        userId,
                    },
                    pool,
                );
                result.reversed++;
                result.reversedTransactionNumbers.push(rev.transactionNumber);
                logger.info('Reversed duplicate inventory GL posting', {
                    referenceType: group.referenceType,
                    referenceId: group.referenceId,
                    reversedTxn: rev.transactionNumber,
                });
            } catch (err) {
                const msg = `${group.referenceType}/${group.referenceId} txn ${txnId}: ${
                    err instanceof Error ? err.message : String(err)
                }`;
                result.errors.push(msg);
                logger.error('Failed to reverse duplicate GL posting', { txnId, error: msg });
            }
        }
    }

    return result;
}

/**
 * Full heal: reverse duplicate 1300 postings, then align remaining gap to batch subledger.
 */
export async function healInventoryGlComplete(
    pool: Pool,
    userId: string,
    options: { dryRun?: boolean; skipDuplicateRemediation?: boolean } = {},
): Promise<HealInventoryCompleteResult> {
    const dryRun = options.dryRun ?? false;
    const duplicates = await findDuplicateInventoryGlPostings(pool);

    let remediation: RemediateDuplicateGlResult | null = null;
    if (!options.skipDuplicateRemediation && duplicates.groups.length > 0) {
        remediation = await remediateDuplicateInventoryGlPostings(pool, userId, { dryRun });
    }

    const couplingAfterDuplicates = dryRun
        ? duplicates.couplingBefore
        : await captureInventoryCoupling(pool);

    const heal = dryRun
        ? {
              drift: couplingAfterDuplicates.gap,
              glBalance: couplingAfterDuplicates.glNet1300,
              subledgerBalance: couplingAfterDuplicates.batchValuation,
              materialityThreshold: Math.max(
                  5000,
                  Math.abs(couplingAfterDuplicates.glNet1300) * 0.0001,
              ),
              action: 'no-op' as const,
              durationMs: 0,
          }
        : await healInventoryGlDrift(pool, userId);

    return {
        duplicates,
        remediation,
        couplingAfterDuplicates,
        heal,
    };
}
