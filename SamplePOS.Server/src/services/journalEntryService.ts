/**
 * Journal Entry Service
 *
 * ERP-grade manual journal entry creation with Clean Core principles:
 *   ✔ Balanced entries only (DR = CR)
 *   ✔ Valid accounts only
 *   ✔ Period must be open
 *   ✔ Immutable - no edits, only reversals
 *   ✔ Full audit trail
 *
 * Uses AccountingCore as the single source of truth for GL postings.
 */

import { Pool, PoolClient } from 'pg';
import Decimal from 'decimal.js';
import { BusinessError } from '../middleware/errorHandler.js';
import { v4 as uuidv4 } from 'uuid';
import { AccountingCore } from './accountingCore.js';
import { UnitOfWork } from '../db/unitOfWork.js';
import logger from '../utils/logger.js';
import { SYSTEM_USER_ID, getValidUserId } from '../utils/constants.js';

// Configure Decimal.js for financial precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Alias for getValidUserId from constants - for backwards compatibility
 */
const resolveUserId = getValidUserId;

// =============================================================================
// TYPES
// =============================================================================

export interface JournalEntryLine {
  accountId: string;
  accountCode?: string;
  accountName?: string;
  debitAmount: number | string;
  creditAmount: number | string;
  description?: string;
  entityId?: string;
  entityType?: 'CUSTOMER' | 'SUPPLIER' | 'PRODUCT' | 'EMPLOYEE';
}

export interface CreateJournalEntryRequest {
  entryDate: string; // YYYY-MM-DD format
  reference?: string;
  narration: string;
  lines: JournalEntryLine[];
  createdBy?: string;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  entryDate: string;
  reference: string | null;
  narration: string;
  totalDebit: number;
  totalCredit: number;
  status: 'POSTED' | 'REVERSED';
  createdBy: string | null;
  createdAt: string;
  lines: JournalEntryLineRecord[];
}

export interface JournalEntryLineRecord extends JournalEntryLine {
  id: string;
  journalEntryId: string;
  lineNumber: number;
}

export interface ReversalRequest {
  journalEntryId: string;
  reversalDate: string;
  reason: string;
  reversedBy?: string;
}

// =============================================================================
// JOURNAL ENTRY SERVICE
// =============================================================================

export class JournalEntryService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Create a manual journal entry
   *
   * Rules enforced:
   * 1. Entry must be balanced (total debits = total credits)
   * 2. All accounts must exist and be active
   * 3. Period must be open
   * 4. At least 2 lines required
   * 5. Each line must have either debit OR credit, not both
   */
  async createJournalEntry(request: CreateJournalEntryRequest): Promise<JournalEntry> {
    return UnitOfWork.run(this.pool, async (client) => {
      // =================================================================
      // VALIDATION 1: Check period is open
      // =================================================================
      const periodCheck = await client.query(
        `
                SELECT fn_is_period_open($1::DATE) as is_open
            `,
        [request.entryDate]
      );

      if (!periodCheck.rows[0]?.is_open) {
        throw new BusinessError(
          `Cannot post to closed period. Entry date: ${request.entryDate}`,
          'ERR_JOURNAL_001',
          { entryDate: request.entryDate }
        );
      }

      // =================================================================
      // VALIDATION 2: Check minimum lines
      // =================================================================
      if (!request.lines || request.lines.length < 2) {
        throw new BusinessError('Journal entry must have at least 2 lines', 'ERR_JOURNAL_002', {
          lineCount: request.lines?.length ?? 0,
          minimumRequired: 2,
        });
      }

      // =================================================================
      // VALIDATION 3: Validate and calculate totals
      // =================================================================
      let totalDebit = new Decimal(0);
      let totalCredit = new Decimal(0);
      const validatedLines: Array<
        JournalEntryLine & { accountId: string; accountCode: string; accountName: string }
      > = [];

      for (let i = 0; i < request.lines.length; i++) {
        const line = request.lines[i];
        const debit = new Decimal(line.debitAmount || 0);
        const credit = new Decimal(line.creditAmount || 0);

        // Each line must have either debit OR credit, not both
        if (debit.gt(0) && credit.gt(0)) {
          throw new BusinessError(
            `Line ${i + 1}: Cannot have both debit and credit amounts`,
            'ERR_JOURNAL_003',
            { line: i + 1, debit: debit.toNumber(), credit: credit.toNumber() }
          );
        }

        // Must have at least one amount
        if (debit.lte(0) && credit.lte(0)) {
          throw new BusinessError(
            `Line ${i + 1}: Must have either debit or credit amount greater than zero`,
            'ERR_JOURNAL_004',
            { line: i + 1, debit: debit.toNumber(), credit: credit.toNumber() }
          );
        }

        // Validate account exists and is active
        // Support both UUID (Id) and account code lookup
        const isUuid =
          /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
            line.accountId
          );
        const accountResult = await client.query(
          `
                    SELECT "Id", "AccountCode", "AccountName", "IsActive", "IsPostingAccount"
                    FROM accounts
                    WHERE ${isUuid ? '"Id" = $1::UUID' : '"AccountCode" = $1'}
                `,
          [line.accountId]
        );

        if (accountResult.rows.length === 0) {
          throw new BusinessError(
            `Line ${i + 1}: Account not found: ${line.accountId}`,
            'ERR_JOURNAL_005',
            { line: i + 1, accountId: line.accountId }
          );
        }

        const account = accountResult.rows[0];

        if (!account.IsActive) {
          throw new BusinessError(
            `Line ${i + 1}: Account ${account.AccountCode} is inactive`,
            'ERR_JOURNAL_006',
            { line: i + 1, accountCode: account.AccountCode }
          );
        }

        if (account.IsPostingAccount === false) {
          throw new BusinessError(
            `Line ${i + 1}: Account ${account.AccountCode} is a header account and cannot be posted to`,
            'ERR_JOURNAL_007',
            { line: i + 1, accountCode: account.AccountCode }
          );
        }

        totalDebit = totalDebit.plus(debit);
        totalCredit = totalCredit.plus(credit);

        validatedLines.push({
          ...line,
          accountId: account.Id,
          accountCode: account.AccountCode,
          accountName: account.AccountName,
          debitAmount: debit.toNumber(),
          creditAmount: credit.toNumber(),
        });
      }

      // =================================================================
      // VALIDATION 4: Entry must be balanced
      // =================================================================
      if (!totalDebit.equals(totalCredit)) {
        throw new BusinessError(
          `Journal entry is not balanced. ` +
            `Debits: ${totalDebit.toFixed(2)}, Credits: ${totalCredit.toFixed(2)}, ` +
            `Difference: ${totalDebit.minus(totalCredit).toFixed(2)}`,
          'ERR_JOURNAL_008',
          {
            totalDebit: parseFloat(totalDebit.toFixed(2)),
            totalCredit: parseFloat(totalCredit.toFixed(2)),
            difference: parseFloat(totalDebit.minus(totalCredit).toFixed(2)),
          }
        );
      }

      // =================================================================
      // CREATE JOURNAL ENTRY
      // =================================================================
      const entryId = uuidv4();
      const entryNumber = await this.generateEntryNumber(client);

      // Insert journal entry header
      await client.query(
        `
                INSERT INTO manual_journal_entries (
                    id, entry_number, entry_date, reference, narration,
                    total_debit, total_credit, status, created_by, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'POSTED', $8, NOW())
            `,
        [
          entryId,
          entryNumber,
          request.entryDate,
          request.reference || null,
          request.narration,
          totalDebit.toFixed(6),
          totalCredit.toFixed(6),
          request.createdBy || null,
        ]
      );

      // Insert journal entry lines
      for (let i = 0; i < validatedLines.length; i++) {
        const line = validatedLines[i];
        await client.query(
          `
                    INSERT INTO manual_journal_entry_lines (
                        id, journal_entry_id, line_number, account_id,
                        debit_amount, credit_amount, description,
                        entity_id, entity_type
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `,
          [
            uuidv4(),
            entryId,
            i + 1,
            line.accountId,
            new Decimal(line.debitAmount).toFixed(6),
            new Decimal(line.creditAmount).toFixed(6),
            line.description || request.narration,
            line.entityId || null,
            line.entityType || null,
          ]
        );
      }

      // =================================================================
      // POST TO GENERAL LEDGER via AccountingCore
      // Manual journal entries must be reflected in the GL for
      // proper financial reporting (Trial Balance, P&L, etc.)
      // =================================================================
      const glLines = validatedLines.map((line) => ({
        accountCode: line.accountCode,
        description: line.description || request.narration,
        debitAmount: new Decimal(line.debitAmount).toNumber(),
        creditAmount: new Decimal(line.creditAmount).toNumber(),
        entityId: line.entityId,
        entityType: line.entityType,
      }));

      await AccountingCore.createJournalEntry({
        entryDate: request.entryDate,
        description: `Journal Entry: ${request.narration}`,
        referenceType: 'JOURNAL_ENTRY',
        referenceId: entryId,
        referenceNumber: entryNumber,
        lines: glLines,
        userId: resolveUserId(request.createdBy),
        idempotencyKey: `JE-${entryId}`,
      });

      logger.info('Manual journal entry posted to GL', {
        entryId,
        entryNumber,
        narration: request.narration,
        totalDebit: totalDebit.toNumber(),
      });

      logger.info(`Journal entry created: ${entryNumber}`, {
        entryId,
        totalDebit: totalDebit.toNumber(),
        lineCount: validatedLines.length,
      });

      // Return the created entry
      return {
        id: entryId,
        entryNumber,
        entryDate: request.entryDate,
        reference: request.reference || null,
        narration: request.narration,
        totalDebit: totalDebit.toNumber(),
        totalCredit: totalCredit.toNumber(),
        status: 'POSTED',
        createdBy: request.createdBy || null,
        createdAt: new Date().toISOString(),
        lines: validatedLines.map((line, index) => ({
          ...line,
          id: '', // Not needed for response
          journalEntryId: entryId,
          lineNumber: index + 1,
        })),
      };
    });
  }

  /**
   * Reverse a journal entry
   *
   * Creates a new journal entry with opposite debits/credits
   * Original entry is marked as REVERSED
   * Reversal must be in an open period
   */
  async reverseJournalEntry(request: ReversalRequest): Promise<JournalEntry> {
    // Step 1: Mark original as reversed (atomic)
    const original = await UnitOfWork.run(this.pool, async (client) => {
      // Get original entry
      const originalResult = await client.query(
        `
                SELECT je.*, 
                    json_agg(json_build_object(
                        'id', jel.id,
                        'accountId', jel.account_id,
                        'debitAmount', jel.debit_amount,
                        'creditAmount', jel.credit_amount,
                        'description', jel.description,
                        'entityId', jel.entity_id,
                        'entityType', jel.entity_type
                    ) ORDER BY jel.line_number) as lines
                FROM manual_journal_entries je
                JOIN manual_journal_entry_lines jel ON jel.journal_entry_id = je.id
                WHERE je.id = $1
                GROUP BY je.id
            `,
        [request.journalEntryId]
      );

      if (originalResult.rows.length === 0) {
        throw new BusinessError(
          `Journal entry not found: ${request.journalEntryId}`,
          'ERR_JOURNAL_009',
          { journalEntryId: request.journalEntryId }
        );
      }

      const entry = originalResult.rows[0];

      if (entry.status === 'REVERSED') {
        throw new BusinessError('Journal entry has already been reversed', 'ERR_JOURNAL_010', {
          journalEntryId: request.journalEntryId,
          status: entry.status,
        });
      }

      // Check reversal period is open
      const periodCheck = await client.query(
        `
                SELECT fn_is_period_open($1::DATE) as is_open
            `,
        [request.reversalDate]
      );

      if (!periodCheck.rows[0]?.is_open) {
        throw new BusinessError(
          `Cannot post reversal to closed period. Reversal date: ${request.reversalDate}`,
          'ERR_JOURNAL_001',
          { reversalDate: request.reversalDate }
        );
      }

      // Mark original as reversed
      await client.query(
        `
                UPDATE manual_journal_entries 
                SET status = 'REVERSED', 
                    updated_at = NOW(),
                    reversal_notes = $2
                WHERE id = $1
            `,
        [request.journalEntryId, request.reason]
      );

      return entry;
    });

    // Step 2: Create reversal entry (swap debits and credits) — separate transaction
    const reversalLines = original.lines.map((line: Record<string, unknown>) => ({
      accountId: line.accountId,
      debitAmount: line.creditAmount, // Swap
      creditAmount: line.debitAmount, // Swap
      description: `Reversal: ${line.description}`,
      entityId: line.entityId,
      entityType: line.entityType,
    }));

    const reversalEntry = await this.createJournalEntry({
      entryDate: request.reversalDate,
      reference: `REV-${original.entry_number}`,
      narration: `Reversal of ${original.entry_number}: ${request.reason}`,
      lines: reversalLines,
      createdBy: request.reversedBy,
    });

    logger.info(
      `Journal entry reversed: ${original.entry_number} -> ${reversalEntry.entryNumber}`,
      {
        originalId: request.journalEntryId,
        reversalId: reversalEntry.id,
        reason: request.reason,
      }
    );

    return reversalEntry;
  }

  /**
   * Get journal entry by ID
   */
  async getJournalEntry(entryId: string): Promise<JournalEntry | null> {
    const result = await this.pool.query(
      `
            SELECT 
                je.id,
                je.entry_number,
                je.entry_date::TEXT,
                je.reference,
                je.narration,
                je.total_debit,
                je.total_credit,
                je.status,
                je.created_by,
                je.created_at,
                json_agg(json_build_object(
                    'id', jel.id,
                    'journalEntryId', jel.journal_entry_id,
                    'lineNumber', jel.line_number,
                    'accountId', jel.account_id,
                    'accountCode', a."AccountCode",
                    'accountName', a."AccountName",
                    'debitAmount', jel.debit_amount,
                    'creditAmount', jel.credit_amount,
                    'description', jel.description,
                    'entityId', jel.entity_id,
                    'entityType', jel.entity_type
                ) ORDER BY jel.line_number) as lines
            FROM manual_journal_entries je
            JOIN manual_journal_entry_lines jel ON jel.journal_entry_id = je.id
            JOIN accounts a ON a."Id" = jel.account_id
            WHERE je.id = $1
            GROUP BY je.id
        `,
      [entryId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      entryNumber: row.entry_number,
      entryDate: row.entry_date,
      reference: row.reference,
      narration: row.narration,
      totalDebit: parseFloat(row.total_debit),
      totalCredit: parseFloat(row.total_credit),
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
      lines: row.lines,
    };
  }

  /**
   * List journal entries with filtering
   */
  async listJournalEntries(params: {
    dateFrom?: string;
    dateTo?: string;
    status?: 'POSTED' | 'REVERSED';
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ entries: JournalEntry[]; total: number }> {
    const { dateFrom, dateTo, status, search, page = 1, limit = 50 } = params;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const queryParams: unknown[] = [];
    let paramIndex = 1;

    if (dateFrom) {
      whereClause += ` AND je.entry_date >= $${paramIndex}`;
      queryParams.push(dateFrom);
      paramIndex++;
    }

    if (dateTo) {
      whereClause += ` AND je.entry_date <= $${paramIndex}`;
      queryParams.push(dateTo);
      paramIndex++;
    }

    if (status) {
      whereClause += ` AND je.status = $${paramIndex}`;
      queryParams.push(status);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (je.entry_number ILIKE $${paramIndex} OR je.narration ILIKE $${paramIndex} OR je.reference ILIKE $${paramIndex})`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    // Get total count
    const countResult = await this.pool.query(
      `
            SELECT COUNT(*) as total
            FROM manual_journal_entries je
            WHERE ${whereClause}
        `,
      queryParams
    );

    // Get entries with lines
    const result = await this.pool.query(
      `
            SELECT 
                je.id,
                je.entry_number,
                je.entry_date::TEXT,
                je.reference,
                je.narration,
                je.total_debit,
                je.total_credit,
                je.status,
                je.created_by,
                je.created_at,
                json_agg(json_build_object(
                    'id', jel.id,
                    'journalEntryId', jel.journal_entry_id,
                    'lineNumber', jel.line_number,
                    'accountId', jel.account_id,
                    'accountCode', a."AccountCode",
                    'accountName', a."AccountName",
                    'debitAmount', jel.debit_amount,
                    'creditAmount', jel.credit_amount,
                    'description', jel.description
                ) ORDER BY jel.line_number) as lines
            FROM manual_journal_entries je
            JOIN manual_journal_entry_lines jel ON jel.journal_entry_id = je.id
            JOIN accounts a ON a."Id" = jel.account_id
            WHERE ${whereClause}
            GROUP BY je.id
            ORDER BY je.entry_date DESC, je.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `,
      [...queryParams, limit, offset]
    );

    const entries = result.rows.map((row) => ({
      id: row.id,
      entryNumber: row.entry_number,
      entryDate: row.entry_date,
      reference: row.reference,
      narration: row.narration,
      totalDebit: parseFloat(row.total_debit),
      totalCredit: parseFloat(row.total_credit),
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
      lines: row.lines,
    }));

    return {
      entries,
      total: parseInt(countResult.rows[0].total),
    };
  }

  /**
   * Generate unique journal entry number
   */
  private async generateEntryNumber(client: PoolClient): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `JE-${year}-`;

    const result = await client.query(
      `
            SELECT entry_number 
            FROM manual_journal_entries 
            WHERE entry_number LIKE $1
            ORDER BY entry_number DESC
            LIMIT 1
        `,
      [`${prefix}%`]
    );

    let nextNum = 1;
    if (result.rows.length > 0) {
      const lastNum = parseInt(result.rows[0].entry_number.split('-').pop() || '0');
      nextNum = lastNum + 1;
    }

    return `${prefix}${nextNum.toString().padStart(4, '0')}`;
  }
}

// Export singleton factory
let journalEntryServiceInstance: JournalEntryService | null = null;

export function getJournalEntryService(pool: Pool): JournalEntryService {
  if (!journalEntryServiceInstance) {
    journalEntryServiceInstance = new JournalEntryService(pool);
  }
  return journalEntryServiceInstance;
}
