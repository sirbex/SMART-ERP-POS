/**
 * GL Account Reconciliation Service
 *
 * Odoo's signature accounting feature — the ability to mark GL entries
 * as "reconciled" against each other. This is how Odoo ensures every
 * invoice is matched to a payment, every bank statement line to a GL entry.
 *
 * Enterprise Features:
 *   ✔ Mark ledger entries as reconciled (grouped by reconciliation number)
 *   ✔ Partial reconciliation (payment covers part of an invoice)
 *   ✔ Auto-reconciliation suggestions (matching amounts, references)
 *   ✔ Unreconciled items report (for AR/AP follow-up)
 *   ✔ Full/partial write-off for small differences
 *   ✔ Lock-date enforcement (Odoo's advisor + hard lock date)
 *   ✔ Decimal-safe via Money utility
 *
 * Odoo Equivalence:
 *   account.partial.reconcile  → partial reconciliation record
 *   account.full.reconcile     → full reconciliation group
 *   account.move.line.reconcile → mark as reconciled
 */

import type pg from 'pg';
import { pool as globalPool } from '../db/pool.js';
import { UnitOfWork } from '../db/unitOfWork.js';
import { Money, Decimal } from '../utils/money.js';
import { AccountingCore, AccountingError } from './accountingCore.js';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ReconciliationGroup {
  reconcileNumber: string;     // e.g. 'REC-000001'
  entries: ReconciliationEntry[];
  isFullyReconciled: boolean;
  totalDebit: number;
  totalCredit: number;
  residual: number;            // Unmatched amount
  reconciledAt: string;
  reconciledBy: string;
}

export interface ReconciliationEntry {
  ledgerEntryId: string;
  transactionNumber: string;
  accountCode: string;
  entryDate: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  reconciledAmount: number;    // Portion matched in this reconciliation
  residual: number;            // Remaining unmatched
}

export interface UnreconciledItem {
  ledgerEntryId: string;
  transactionId: string;
  transactionNumber: string;
  accountCode: string;
  accountName: string;
  entryDate: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  reconciledAmount: number;
  residual: number;
  ageDays: number;
  entityType: string | null;
  entityId: string | null;
}

export interface ReconciliationSuggestion {
  debitEntries: UnreconciledItem[];
  creditEntries: UnreconciledItem[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  matchReason: string;
}

export interface LockDateConfig {
  advisorLockDate: string | null;   // Only advisors can post before this date
  hardLockDate: string | null;      // Nobody can post before this date
}

// =============================================================================
// GL RECONCILIATION SERVICE
// =============================================================================

export class GLReconciliationService {

  /**
   * Get all unreconciled items for an account
   * This is the primary view for account follow-up (Odoo's reconciliation widget)
   */
  static async getUnreconciledItems(
    accountCode: string,
    options?: {
      startDate?: string;
      endDate?: string;
      limit?: number;
    },
    dbPool?: pg.Pool
  ): Promise<UnreconciledItem[]> {
    const pool = dbPool || globalPool;
    const params: unknown[] = [accountCode];
    let dateFilter = '';
    let limitClause = '';

    if (options?.startDate) {
      params.push(options.startDate);
      dateFilter += ` AND DATE(lt."TransactionDate") >= $${params.length}`;
    }
    if (options?.endDate) {
      params.push(options.endDate);
      dateFilter += ` AND DATE(lt."TransactionDate") <= $${params.length}`;
    }
    if (options?.limit) {
      params.push(options.limit);
      limitClause = ` LIMIT $${params.length}`;
    }

    const result = await pool.query(
      `SELECT
         le."Id" as entry_id,
         le."TransactionId" as transaction_id,
         lt."TransactionNumber" as transaction_number,
         a."AccountCode" as account_code,
         a."AccountName" as account_name,
         DATE(lt."TransactionDate") as entry_date,
         le."Description" as description,
         le."DebitAmount" as debit_amount,
         le."CreditAmount" as credit_amount,
         COALESCE(le."ReconciledAmount", 0) as reconciled_amount,
         CASE
           WHEN le."DebitAmount" > 0 THEN le."DebitAmount" - COALESCE(le."ReconciledAmount", 0)
           ELSE le."CreditAmount" - COALESCE(le."ReconciledAmount", 0)
         END as residual,
         EXTRACT(DAY FROM (NOW() - lt."TransactionDate"))::int as age_days,
         le."EntityType" as entity_type,
         le."EntityId" as entity_id
       FROM ledger_entries le
       JOIN accounts a ON le."AccountId" = a."Id"
       JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
       WHERE a."AccountCode" = $1
         AND lt."Status" = 'POSTED'
         AND (le."IsReconciled" IS NULL OR le."IsReconciled" = false)
         ${dateFilter}
       ORDER BY lt."TransactionDate" ASC
       ${limitClause}`,
      params
    );

    return result.rows.map(row => ({
      ledgerEntryId: row.entry_id,
      transactionId: row.transaction_id,
      transactionNumber: row.transaction_number,
      accountCode: row.account_code,
      accountName: row.account_name,
      entryDate: row.entry_date ? String(row.entry_date).split('T')[0] : '',
      description: row.description,
      debitAmount: Money.parseDb(row.debit_amount).toNumber(),
      creditAmount: Money.parseDb(row.credit_amount).toNumber(),
      reconciledAmount: Money.parseDb(row.reconciled_amount).toNumber(),
      residual: Money.parseDb(row.residual).abs().toNumber(),
      ageDays: row.age_days || 0,
      entityType: row.entity_type,
      entityId: row.entity_id,
    }));
  }

  /**
   * Reconcile a set of ledger entries against each other.
   *
   * Odoo pattern: select debit entries and credit entries for the same account,
   * match them, and mark as reconciled.
   *
   * @param entryIds - Array of ledger entry IDs to reconcile together
   * @param userId   - Who performed the reconciliation
   * @param writeOffAmount - Optional small difference to write off
   * @param writeOffAccountCode - Account for write-off (e.g. '6900' misc expense)
   */
  static async reconcileEntries(
    entryIds: string[],
    userId: string,
    writeOffAmount?: number,
    writeOffAccountCode?: string,
    dbPool?: pg.Pool
  ): Promise<ReconciliationGroup> {
    const pool = dbPool || globalPool;

    if (entryIds.length < 2) {
      throw new AccountingError(
        'At least 2 entries required for reconciliation.',
        'INSUFFICIENT_ENTRIES'
      );
    }

    return UnitOfWork.run(pool, async (client) => {
      // 1. Fetch all entries
      const placeholders = entryIds.map((_, i) => `$${i + 1}`).join(',');
      const entriesResult = await client.query(
        `SELECT
           le."Id", le."TransactionId", le."AccountId",
           le."DebitAmount", le."CreditAmount",
           le."Description", le."IsReconciled",
           COALESCE(le."ReconciledAmount", 0) as "ReconciledAmount",
           lt."TransactionNumber", DATE(lt."TransactionDate") as "EntryDate",
           a."AccountCode"
         FROM ledger_entries le
         JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
         JOIN accounts a ON le."AccountId" = a."Id"
         WHERE le."Id" IN (${placeholders})
           AND lt."Status" = 'POSTED'
         ORDER BY lt."TransactionDate"`,
        entryIds
      );

      if (entriesResult.rows.length !== entryIds.length) {
        throw new AccountingError(
          `Expected ${entryIds.length} entries but found ${entriesResult.rows.length}. Some entries may not exist or are not POSTED.`,
          'ENTRIES_NOT_FOUND'
        );
      }

      // 2. Validate all entries are for the same account
      const accounts = new Set(entriesResult.rows.map(r => r.AccountCode));
      if (accounts.size > 1) {
        throw new AccountingError(
          `Cannot reconcile entries across different accounts: ${[...accounts].join(', ')}`,
          'CROSS_ACCOUNT_RECONCILIATION'
        );
      }

      // 3. Check none are already fully reconciled
      for (const row of entriesResult.rows) {
        if (row.IsReconciled) {
          throw new AccountingError(
            `Entry ${row.Id} (${row.TransactionNumber}) is already fully reconciled.`,
            'ALREADY_RECONCILED'
          );
        }
      }

      // 4. Calculate totals
      let totalDebit = Money.zero();
      let totalCredit = Money.zero();

      for (const row of entriesResult.rows) {
        const debit = Money.parseDb(row.DebitAmount);
        const credit = Money.parseDb(row.CreditAmount);
        const alreadyReconciled = Money.parseDb(row.ReconciledAmount);

        // Residual = original amount - already reconciled portion
        if (debit.greaterThan(0)) {
          totalDebit = Money.add(totalDebit, Money.subtract(debit, alreadyReconciled));
        } else {
          totalCredit = Money.add(totalCredit, Money.subtract(credit, alreadyReconciled));
        }
      }

      const residual = Money.subtract(totalDebit, totalCredit);
      const absResidual = residual.abs();

      // 5. Handle write-off if there's a small difference
      const writeOffThreshold = new Decimal(0.01);
      const isFullyReconciled = absResidual.lessThanOrEqualTo(writeOffThreshold)
        || (writeOffAmount != null && absResidual.lessThanOrEqualTo(new Decimal(Math.abs(writeOffAmount) + 0.01)));

      // 6. Generate reconciliation number
      const seqResult = await client.query(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(reconcile_number FROM 5) AS INTEGER)), 0) + 1 as next_num
         FROM gl_reconciliations
         WHERE reconcile_number LIKE 'REC-%'`
      );
      const nextNum = parseInt(seqResult.rows[0].next_num || '1');
      const reconcileNumber = `REC-${String(nextNum).padStart(6, '0')}`;
      const reconcileId = uuidv4();

      // 7. Create reconciliation record
      await client.query(
        `INSERT INTO gl_reconciliations (
           id, reconcile_number, account_code, is_full,
           total_debit, total_credit, residual,
           reconciled_by, reconciled_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          reconcileId,
          reconcileNumber,
          entriesResult.rows[0].AccountCode,
          isFullyReconciled,
          totalDebit.toNumber(),
          totalCredit.toNumber(),
          absResidual.toNumber(),
          userId,
        ]
      );

      // 8. Link entries to reconciliation & update reconciled amounts
      const reconciledEntries: ReconciliationEntry[] = [];
      const matchAmount = Decimal.min(totalDebit, totalCredit);

      for (const row of entriesResult.rows) {
        const debit = Money.parseDb(row.DebitAmount);
        const credit = Money.parseDb(row.CreditAmount);
        const original = debit.greaterThan(0) ? debit : credit;
        const alreadyReconciled = Money.parseDb(row.ReconciledAmount);
        const remaining = Money.subtract(original, alreadyReconciled);
        const reconciledNow = Decimal.min(remaining, matchAmount);

        const newReconciledTotal = Money.add(alreadyReconciled, reconciledNow);
        const newResidual = Money.subtract(original, newReconciledTotal);
        const fullyDone = isFullyReconciled && newResidual.lessThanOrEqualTo(writeOffThreshold);

        // Update ledger entry
        await client.query(
          `UPDATE ledger_entries
           SET "ReconciledAmount" = $2,
               "IsReconciled" = $3,
               "ReconcileNumber" = $4
           WHERE "Id" = $1`,
          [row.Id, newReconciledTotal.toNumber(), fullyDone, reconcileNumber]
        );

        // Link to reconciliation
        await client.query(
          `INSERT INTO gl_reconciliation_lines (
             id, reconciliation_id, ledger_entry_id, reconciled_amount
           ) VALUES ($1, $2, $3, $4)`,
          [uuidv4(), reconcileId, row.Id, reconciledNow.toNumber()]
        );

        reconciledEntries.push({
          ledgerEntryId: row.Id,
          transactionNumber: row.TransactionNumber,
          accountCode: row.AccountCode,
          entryDate: row.EntryDate ? String(row.EntryDate).split('T')[0] : '',
          description: row.Description,
          debitAmount: debit.toNumber(),
          creditAmount: credit.toNumber(),
          reconciledAmount: reconciledNow.toNumber(),
          residual: newResidual.toNumber(),
        });
      }

      // 9. If write-off requested, create a journal entry for the difference
      if (writeOffAmount && writeOffAccountCode && absResidual.greaterThan(writeOffThreshold)) {
        const accountCode = entriesResult.rows[0].AccountCode;
        const writeOffLines = [];

        if (residual.greaterThan(0)) {
          // Debit excess → credit it to close, debit write-off account
          writeOffLines.push(
            { accountCode, description: `Write-off reconciliation ${reconcileNumber}`, debitAmount: 0, creditAmount: absResidual.toNumber() },
            { accountCode: writeOffAccountCode, description: `Write-off reconciliation ${reconcileNumber}`, debitAmount: absResidual.toNumber(), creditAmount: 0 },
          );
        } else {
          writeOffLines.push(
            { accountCode, description: `Write-off reconciliation ${reconcileNumber}`, debitAmount: absResidual.toNumber(), creditAmount: 0 },
            { accountCode: writeOffAccountCode, description: `Write-off reconciliation ${reconcileNumber}`, debitAmount: 0, creditAmount: absResidual.toNumber() },
          );
        }

        await AccountingCore.createJournalEntry(
          {
            entryDate: new Date().toISOString().split('T')[0],
            description: `Write-off for reconciliation ${reconcileNumber}`,
            referenceType: 'RECONCILIATION_WRITEOFF',
            referenceId: reconcileId,
            referenceNumber: `WO-${reconcileNumber}`,
            lines: writeOffLines,
            userId,
            idempotencyKey: `writeoff-${reconcileId}`,
          },
          pool,
          client
        );
      }

      logger.info('GL entries reconciled', {
        reconcileNumber,
        entryCount: entryIds.length,
        isFullyReconciled,
        residual: absResidual.toNumber(),
      });

      return {
        reconcileNumber,
        entries: reconciledEntries,
        isFullyReconciled,
        totalDebit: totalDebit.toNumber(),
        totalCredit: totalCredit.toNumber(),
        residual: absResidual.toNumber(),
        reconciledAt: new Date().toISOString(),
        reconciledBy: userId,
      };
    });
  }

  /**
   * Get auto-reconciliation suggestions for an account.
   * Odoo pattern: match by amount, reference number, or entity.
   */
  static async getSuggestions(
    accountCode: string,
    dbPool?: pg.Pool
  ): Promise<ReconciliationSuggestion[]> {
    const pool = dbPool || globalPool;
    const suggestions: ReconciliationSuggestion[] = [];

    // Get all unreconciled items
    const items = await this.getUnreconciledItems(accountCode, { limit: 200 }, pool);

    const debits = items.filter(i => i.debitAmount > 0);
    const credits = items.filter(i => i.creditAmount > 0);

    // Strategy 1: Exact amount match
    for (const debit of debits) {
      for (const credit of credits) {
        if (Math.abs(debit.residual - credit.residual) < 0.01) {
          suggestions.push({
            debitEntries: [debit],
            creditEntries: [credit],
            confidence: 'HIGH',
            matchReason: `Exact amount match: ${debit.residual}`,
          });
        }
      }
    }

    // Strategy 2: Same entity reference
    for (const debit of debits) {
      if (!debit.entityType || !debit.entityId) continue;
      for (const credit of credits) {
        if (credit.entityType === debit.entityType && credit.entityId === debit.entityId) {
          // Don't duplicate if already suggested by amount match
          const alreadySuggested = suggestions.some(
            s => s.debitEntries.some(d => d.ledgerEntryId === debit.ledgerEntryId)
              && s.creditEntries.some(c => c.ledgerEntryId === credit.ledgerEntryId)
          );
          if (!alreadySuggested) {
            suggestions.push({
              debitEntries: [debit],
              creditEntries: [credit],
              confidence: 'MEDIUM',
              matchReason: `Same entity: ${debit.entityType} ${debit.entityId}`,
            });
          }
        }
      }
    }

    return suggestions;
  }

  // =========================================================================
  // LOCK DATE MANAGEMENT (Odoo's Lock Date feature)
  // =========================================================================

  /**
   * Get current lock date configuration
   */
  static async getLockDates(dbPool?: pg.Pool): Promise<LockDateConfig> {
    const pool = dbPool || globalPool;
    const result = await pool.query(
      `SELECT advisor_lock_date, hard_lock_date
       FROM system_settings
       LIMIT 1`
    );

    const config: LockDateConfig = {
      advisorLockDate: null,
      hardLockDate: null,
    };

    if (result.rows.length > 0) {
      const row = result.rows[0];
      config.advisorLockDate = row.advisor_lock_date ? String(row.advisor_lock_date).split('T')[0] : null;
      config.hardLockDate = row.hard_lock_date ? String(row.hard_lock_date).split('T')[0] : null;
    }

    return config;
  }

  /**
   * Set lock dates (Odoo pattern: advisor lock + hard lock)
   */
  static async setLockDates(
    config: Partial<LockDateConfig>,
    userId: string,
    dbPool?: pg.Pool
  ): Promise<void> {
    const pool = dbPool || globalPool;

    return UnitOfWork.run(pool, async (client) => {
      if (config.advisorLockDate !== undefined) {
        await client.query(
          `UPDATE system_settings
           SET advisor_lock_date = $1, lock_dates_updated_by = $2, lock_dates_updated_at = NOW()`,
          [config.advisorLockDate, userId]
        );
      }

      if (config.hardLockDate !== undefined) {
        await client.query(
          `UPDATE system_settings
           SET hard_lock_date = $1, lock_dates_updated_by = $2, lock_dates_updated_at = NOW()`,
          [config.hardLockDate, userId]
        );
      }

      await client.query(
        `INSERT INTO audit_log (id, action, entity_type, entity_id, user_id, action_details)
         VALUES ($1, 'UPDATE', 'SETTINGS', 'lock_dates', $2, $3)`,
        [uuidv4(), userId, JSON.stringify(config)]
      );

      logger.info('Lock dates updated', { config, userId });
    });
  }

  /**
   * Validate that a posting date is allowed given lock dates and user role.
   *
   * Odoo logic:
   * - Hard lock date: nobody can post (not even admin)
   * - Advisor lock date: only users with advisor role can post
   */
  static async validatePostingDate(
    postingDate: string,
    userRole: string,
    dbPool?: pg.Pool
  ): Promise<{ allowed: boolean; reason?: string }> {
    const config = await this.getLockDates(dbPool);

    // Hard lock — blocks everyone
    if (config.hardLockDate && postingDate <= config.hardLockDate) {
      return {
        allowed: false,
        reason: `Posting date ${postingDate} is before the hard lock date (${config.hardLockDate}). No entries allowed.`,
      };
    }

    // Advisor lock — blocks non-advisors
    if (config.advisorLockDate && postingDate <= config.advisorLockDate) {
      const isAdvisor = ['ADMIN', 'ACCOUNTANT', 'ADVISOR'].includes(userRole.toUpperCase());
      if (!isAdvisor) {
        return {
          allowed: false,
          reason: `Posting date ${postingDate} is before the advisor lock date (${config.advisorLockDate}). Only advisors can post.`,
        };
      }
    }

    return { allowed: true };
  }
}

export default GLReconciliationService;
