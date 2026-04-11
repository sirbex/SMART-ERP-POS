/**
 * Accounting Repository
 *
 * Provides database access for accounting data including:
 * - Chart of Accounts
 * - Journal Entries
 * - General Ledger
 * - Trial Balance calculations
 * - Financial Statement aggregations
 *
 * ACCOUNTING PRINCIPLES:
 * - Double-entry bookkeeping: Every transaction has equal debits and credits
 * - Normal balances: Assets/Expenses = DEBIT, Liabilities/Equity/Revenue = CREDIT
 * - Journal entries are immutable once posted
 */

import { pool as globalPool } from '../db/pool.js';
import type pg from 'pg';
import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';
import logger from '../utils/logger.js';
import { Money } from '../utils/money.js';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface Account {
  id: string;
  accountCode: string;
  accountName: string;
  accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  normalBalance: 'DEBIT' | 'CREDIT';
  parentAccountId: string | null;
  level: number;
  isPostingAccount: boolean;
  isActive: boolean;
  currentBalance?: string | number; // Optional: returned from DB as string for precision
}

export interface JournalEntry {
  id: string;
  transactionId: string;
  description: string;
  entryDate: string;
  createdAt: string;
  status: 'DRAFT' | 'POSTED' | 'VOIDED';
  idempotencyKey: string | null;
  sourceEventType: string | null;
  sourceEntityType: string | null;
  lines: JournalEntryLine[];
}

export interface JournalEntryLine {
  id: string;
  journalEntryId: string;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  entityType: string | null;
  entityId: string | null;
  transactionId: string | null;
}

export interface TrialBalanceAccount {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  debitBalance: number;
  creditBalance: number;
  netBalance: number;
}

export interface LedgerEntry {
  id: string;
  transactionId: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  runningBalance: number;
  entryDate: string;
  reference: string;
  createdAt: string;
}

export interface AccountFilters {
  accountType?: string;
  isActive?: boolean;
  isPostingAccount?: boolean;
  parentAccountId?: string;
  search?: string;
}

export interface LedgerFilters {
  accountId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page: number;
  limit: number;
}

// =============================================================================
// CHART OF ACCOUNTS
// =============================================================================

/**
 * Get all accounts with optional filtering
 */
export async function getAccounts(
  filters: AccountFilters = {},
  dbPool?: pg.Pool
): Promise<Account[]> {
  const pool = dbPool || globalPool;
  try {
    let query = `
      SELECT 
        "Id" as id,
        "AccountCode" as "accountCode",
        "AccountName" as "accountName",
        "AccountType" as "accountType",
        "NormalBalance" as "normalBalance",
        "ParentAccountId" as "parentAccountId",
        "Level" as level,
        "IsPostingAccount" as "isPostingAccount",
        "IsActive" as "isActive",
        "CurrentBalance" as "currentBalance"
      FROM accounts
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.accountType) {
      query += ` AND "AccountType" = $${paramIndex++}`;
      params.push(filters.accountType);
    }

    if (filters.isActive !== undefined) {
      query += ` AND "IsActive" = $${paramIndex++}`;
      params.push(filters.isActive);
    }

    if (filters.isPostingAccount !== undefined) {
      query += ` AND "IsPostingAccount" = $${paramIndex++}`;
      params.push(filters.isPostingAccount);
    }

    if (filters.parentAccountId) {
      query += ` AND "ParentAccountId" = $${paramIndex++}`;
      params.push(filters.parentAccountId);
    }

    if (filters.search) {
      query += ` AND ("AccountName" ILIKE $${paramIndex} OR "AccountCode" ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    query += ` ORDER BY "AccountCode"`;

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    logger.error('Error fetching accounts', { error, filters });
    throw error;
  }
}

/**
 * Get account by ID
 */
export async function getAccountById(id: string, dbPool?: pg.Pool): Promise<Account | null> {
  const pool = dbPool || globalPool;
  try {
    const result = await pool.query(
      `
      SELECT 
        "Id" as id,
        "AccountCode" as "accountCode",
        "AccountName" as "accountName",
        "AccountType" as "accountType",
        "NormalBalance" as "normalBalance",
        "ParentAccountId" as "parentAccountId",
        "Level" as level,
        "IsPostingAccount" as "isPostingAccount",
        "IsActive" as "isActive"
      FROM accounts
      WHERE "Id" = $1
    `,
      [id]
    );

    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error fetching account by ID', { error, id });
    throw error;
  }
}

/**
 * Get account by code
 */
export async function getAccountByCode(code: string, dbPool?: pg.Pool): Promise<Account | null> {
  const pool = dbPool || globalPool;
  try {
    const result = await pool.query(
      `
      SELECT 
        "Id" as id,
        "AccountCode" as "accountCode",
        "AccountName" as "accountName",
        "AccountType" as "accountType",
        "NormalBalance" as "normalBalance",
        "ParentAccountId" as "parentAccountId",
        "Level" as level,
        "IsPostingAccount" as "isPostingAccount",
        "IsActive" as "isActive"
      FROM accounts
      WHERE "AccountCode" = $1
    `,
      [code]
    );

    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error fetching account by code', { error, code });
    throw error;
  }
}

/**
 * Create a new account
 */
export async function createAccount(data: Omit<Account, 'id'>, dbPool?: pg.Pool): Promise<Account> {
  const pool = dbPool || globalPool;
  try {
    const id = uuidv4();
    const result = await pool.query(
      `
      INSERT INTO accounts (
        "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
        "ParentAccountId", "Level", "IsPostingAccount", "IsActive"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING 
        "Id" as id,
        "AccountCode" as "accountCode",
        "AccountName" as "accountName",
        "AccountType" as "accountType",
        "NormalBalance" as "normalBalance",
        "ParentAccountId" as "parentAccountId",
        "Level" as level,
        "IsPostingAccount" as "isPostingAccount",
        "IsActive" as "isActive"
    `,
      [
        id,
        data.accountCode,
        data.accountName,
        data.accountType,
        data.normalBalance,
        data.parentAccountId,
        data.level,
        data.isPostingAccount,
        data.isActive,
      ]
    );

    return result.rows[0];
  } catch (error) {
    logger.error('Error creating account', { error, data });
    throw error;
  }
}

/**
 * Update an existing account
 */
export async function updateAccount(
  id: string,
  data: Partial<
    Pick<
      Account,
      | 'accountCode'
      | 'accountName'
      | 'accountType'
      | 'normalBalance'
      | 'parentAccountId'
      | 'isPostingAccount'
      | 'isActive'
    >
  >,
  dbPool?: pg.Pool
): Promise<Account | null> {
  const pool = dbPool || globalPool;
  try {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (data.accountCode !== undefined) {
      setClauses.push(`"AccountCode" = $${paramIndex++}`);
      params.push(data.accountCode);
    }
    if (data.accountName !== undefined) {
      setClauses.push(`"AccountName" = $${paramIndex++}`);
      params.push(data.accountName);
    }
    if (data.accountType !== undefined) {
      setClauses.push(`"AccountType" = $${paramIndex++}`);
      params.push(data.accountType);
    }
    if (data.normalBalance !== undefined) {
      setClauses.push(`"NormalBalance" = $${paramIndex++}`);
      params.push(data.normalBalance);
    }
    if (data.parentAccountId !== undefined) {
      setClauses.push(`"ParentAccountId" = $${paramIndex++}`);
      params.push(data.parentAccountId);
    }
    if (data.isPostingAccount !== undefined) {
      setClauses.push(`"IsPostingAccount" = $${paramIndex++}`);
      params.push(data.isPostingAccount);
    }
    if (data.isActive !== undefined) {
      setClauses.push(`"IsActive" = $${paramIndex++}`);
      params.push(data.isActive);
    }

    if (setClauses.length === 0) {
      return getAccountById(id, pool);
    }

    params.push(id);
    const result = await pool.query(
      `
      UPDATE accounts
      SET ${setClauses.join(', ')}
      WHERE "Id" = $${paramIndex}
      RETURNING
        "Id" as id,
        "AccountCode" as "accountCode",
        "AccountName" as "accountName",
        "AccountType" as "accountType",
        "NormalBalance" as "normalBalance",
        "ParentAccountId" as "parentAccountId",
        "Level" as level,
        "IsPostingAccount" as "isPostingAccount",
        "IsActive" as "isActive"
    `,
      params
    );

    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error updating account', { error, id, data });
    throw error;
  }
}

/**
 * Delete an account (soft-delete by deactivating, or hard-delete if no GL entries)
 */
export async function deleteAccount(id: string, dbPool?: pg.Pool): Promise<boolean> {
  const pool = dbPool || globalPool;
  try {
    // Check if account has journal entry lines
    const usageCheck = await pool.query(
      `
      SELECT COUNT(*) as count FROM journal_entry_lines WHERE "AccountId" = $1
    `,
      [id]
    );

    const hasEntries = parseInt(usageCheck.rows[0].count, 10) > 0;

    if (hasEntries) {
      // Soft delete - deactivate instead
      const result = await pool.query(
        `
        UPDATE accounts SET "IsActive" = false WHERE "Id" = $1
      `,
        [id]
      );
      return (result.rowCount ?? 0) > 0;
    }

    // Hard delete - no journal entries reference this account
    const result = await pool.query(
      `
      DELETE FROM accounts WHERE "Id" = $1
    `,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    logger.error('Error deleting account', { error, id });
    throw error;
  }
}



// REMOVED: createLedgerTransaction and createJournalEntry — dead code.
// ALL GL writes must go through AccountingCore.createJournalEntry() via glEntryService.
// See ACCOUNTING_SINGLE_SOURCE_OF_TRUTH.md

/**
 * Get journal entry by ID with all lines
 */
export async function getJournalEntryById(
  id: string,
  dbPool?: pg.Pool
): Promise<JournalEntry | null> {
  const pool = dbPool || globalPool;
  try {
    const entryResult = await pool.query(
      `
      SELECT 
        "Id" as id,
        "TransactionId" as "transactionId",
        "Description" as description,
        "EntryDate"::text as "entryDate",
        "CreatedAt"::text as "createdAt",
        "Status" as status,
        "IdempotencyKey" as "idempotencyKey",
        "SourceEventType" as "sourceEventType",
        "SourceEntityType" as "sourceEntityType"
      FROM journal_entries
      WHERE "Id" = $1
    `,
      [id]
    );

    if (entryResult.rows.length === 0) {
      return null;
    }

    const entry = entryResult.rows[0];

    // Get lines with account details
    const linesResult = await pool.query(
      `
      SELECT 
        jel."Id" as id,
        jel."JournalEntryId" as "journalEntryId",
        jel."AccountId" as "accountId",
        a."AccountCode" as "accountCode",
        a."AccountName" as "accountName",
        jel."Description" as description,
        jel."DebitAmount" as "debitAmount",
        jel."CreditAmount" as "creditAmount",
        jel."EntityType" as "entityType",
        jel."EntityId" as "entityId"
      FROM journal_entry_lines jel
      JOIN accounts a ON jel."AccountId" = a."Id"
      WHERE jel."JournalEntryId" = $1
      ORDER BY jel."DebitAmount" DESC, jel."CreditAmount" DESC
    `,
      [id]
    );

    entry.lines = linesResult.rows;
    return entry;
  } catch (error) {
    logger.error('Error fetching journal entry', { error, id });
    throw error;
  }
}

// =============================================================================
// GENERAL LEDGER
// =============================================================================

/**
 * Get ledger entries with filtering and running balance calculation
 * Uses ledger_entries and ledger_transactions tables (C# API generated)
 */
export async function getLedgerEntries(
  filters: LedgerFilters,
  dbPool?: pg.Pool
): Promise<{
  entries: LedgerEntry[];
  total: number;
}> {
  const pool = dbPool || globalPool;
  try {
    let whereClause = '';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters.accountId) {
      whereClause += ` AND le."AccountId" = $${paramIndex++}`;
      params.push(filters.accountId);
    }

    if (filters.dateFrom) {
      whereClause += ` AND lt."TransactionDate" >= $${paramIndex++}`;
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      whereClause += ` AND lt."TransactionDate" <= $${paramIndex++}`;
      params.push(filters.dateTo);
    }

    if (filters.search) {
      whereClause += ` AND (
        le."Description" ILIKE $${paramIndex} 
        OR lt."TransactionNumber" ILIKE $${paramIndex}
        OR lt."ReferenceNumber" ILIKE $${paramIndex}
        OR a."AccountName" ILIKE $${paramIndex}
      )`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    // Count total
    const countQuery = `
      SELECT COUNT(DISTINCT le."Id") as count
      FROM ledger_entries le
      JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE 1=1 ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Get entries with pagination
    const offset = (filters.page - 1) * filters.limit;
    const entriesQuery = `
      SELECT 
        le."Id" as id,
        lt."Id" as "transactionId",
        le."AccountId" as "accountId",
        a."AccountCode" as "accountCode",
        a."AccountName" as "accountName",
        a."AccountType" as "accountType",
        COALESCE(le."Description", lt."Description") as description,
        COALESCE(CAST(le."DebitAmount" AS FLOAT), 0) as "debitAmount",
        COALESCE(CAST(le."CreditAmount" AS FLOAT), 0) as "creditAmount",
        lt."TransactionDate"::text as "entryDate",
        COALESCE(lt."ReferenceNumber", lt."TransactionNumber") as reference,
        le."CreatedAt"::text as "createdAt"
      FROM ledger_entries le
      JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE 1=1 ${whereClause}
      ORDER BY lt."TransactionDate" DESC, le."CreatedAt" DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const entriesResult = await pool.query(entriesQuery, [...params, filters.limit, offset]);

    // Calculate running balances for each account
    const entries = entriesResult.rows.map((entry: LedgerEntry) => {
      // For now, we'll calculate a simple running balance
      // In production, this would be more sophisticated with proper ordering
      const balance = new Decimal(entry.debitAmount || 0).minus(entry.creditAmount || 0).toNumber();
      return {
        ...entry,
        runningBalance: balance,
      };
    });

    return { entries, total };
  } catch (error) {
    logger.error('Error fetching ledger entries', { error, filters });
    throw error;
  }
}

/**
 * Get ledger transaction by ID with all entries
 * Queries ledger_transactions and ledger_entries tables
 */
export async function getLedgerTransactionById(
  id: string,
  dbPool?: pg.Pool
): Promise<{
  id: string;
  transactionNumber: string;
  transactionDate: string;
  referenceType: string;
  referenceId: string;
  referenceNumber: string;
  description: string;
  totalDebitAmount: number;
  totalCreditAmount: number;
  status: string;
  createdAt: string;
  createdBy: string;
  entries: Array<{
    id: string;
    accountId: string;
    accountCode: string;
    accountName: string;
    debitAmount: number;
    creditAmount: number;
    description: string;
  }>;
} | null> {
  const pool = dbPool || globalPool;
  try {
    // Get the transaction
    const txnResult = await pool.query(
      `
      SELECT 
        "Id" as id,
        "TransactionNumber" as "transactionNumber",
        "TransactionDate"::text as "transactionDate",
        "ReferenceType" as "referenceType",
        "ReferenceId" as "referenceId",
        COALESCE("ReferenceNumber", '') as "referenceNumber",
        "Description" as description,
        CAST("TotalDebitAmount" AS FLOAT) as "totalDebitAmount",
        CAST("TotalCreditAmount" AS FLOAT) as "totalCreditAmount",
        COALESCE("Status", 'POSTED') as status,
        "CreatedAt"::text as "createdAt",
        "CreatedById"::text as "createdBy"
      FROM ledger_transactions
      WHERE "Id" = $1
    `,
      [id]
    );

    if (txnResult.rows.length === 0) {
      return null;
    }

    const txn = txnResult.rows[0];

    // Get entries with account details
    const entriesResult = await pool.query(
      `
      SELECT 
        le."Id" as id,
        le."AccountId" as "accountId",
        a."AccountCode" as "accountCode",
        a."AccountName" as "accountName",
        COALESCE(le."Description", '') as description,
        COALESCE(CAST(le."DebitAmount" AS FLOAT), 0) as "debitAmount",
        COALESCE(CAST(le."CreditAmount" AS FLOAT), 0) as "creditAmount"
      FROM ledger_entries le
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE le."TransactionId" = $1
      ORDER BY le."DebitAmount" DESC, le."CreditAmount" DESC
    `,
      [id]
    );

    return {
      ...txn,
      entries: entriesResult.rows,
    };
  } catch (error) {
    logger.error('Error fetching ledger transaction', { error, id });
    throw error;
  }
}

// =============================================================================
// TRIAL BALANCE
// =============================================================================

/**
 * Calculate trial balance as of a given date
 * Returns account balances ensuring debits = credits
 */
export async function getTrialBalance(
  asOfDate: string,
  includeZeroBalances: boolean = false,
  dbPool?: pg.Pool
): Promise<{
  asOfDate: string;
  generatedAt: string;
  accounts: TrialBalanceAccount[];
  totals: {
    totalDebits: number;
    totalCredits: number;
    isBalanced: boolean;
  };
}> {
  const pool = dbPool || globalPool;
  try {
    // SAP FAGLFLEXT pattern: read from pre-aggregated gl_period_balances
    const year = parseInt(asOfDate.substring(0, 4), 10);
    const month = parseInt(asOfDate.substring(5, 7), 10);

    const query = `
      SELECT 
        a."Id"             as "accountId",
        a."AccountCode"    as "accountCode",
        a."AccountName"    as "accountName",
        a."AccountType"    as "accountType",
        a."NormalBalance"  as "normalBalance",
        COALESCE(SUM(gpb.debit_total),  0) as "debitBalance",
        COALESCE(SUM(gpb.credit_total), 0) as "creditBalance",
        CASE 
          WHEN a."NormalBalance" = 'DEBIT'
            THEN COALESCE(SUM(gpb.debit_total),  0) - COALESCE(SUM(gpb.credit_total), 0)
            ELSE COALESCE(SUM(gpb.credit_total), 0) - COALESCE(SUM(gpb.debit_total),  0)
        END as "netBalance"
      FROM accounts a
      LEFT JOIN gl_period_balances gpb
        ON gpb.account_id = a."Id"
       AND (gpb.fiscal_year < $1 OR (gpb.fiscal_year = $1 AND gpb.fiscal_period <= $2))
      WHERE a."IsActive" = true
      GROUP BY a."Id", a."AccountCode", a."AccountName", a."AccountType", a."NormalBalance"
      ${includeZeroBalances ? '' : 'HAVING COALESCE(SUM(gpb.debit_total), 0) != 0 OR COALESCE(SUM(gpb.credit_total), 0) != 0'}
      ORDER BY "accountCode"
    `;

    const result = await pool.query(query, [year, month]);
    const accounts = result.rows.map((row) => ({
      ...row,
      debitBalance: Money.parseDb(row.debitBalance).toNumber(),
      creditBalance: Money.parseDb(row.creditBalance).toNumber(),
      netBalance: Money.parseDb(row.netBalance).toNumber(),
    }));

    // Calculate totals using Money for decimal-safe arithmetic
    let totalDebits = Money.zero();
    let totalCredits = Money.zero();
    for (const acc of accounts) {
      totalDebits = Money.add(totalDebits, acc.debitBalance);
      totalCredits = Money.add(totalCredits, acc.creditBalance);
    }

    const totalDebitsNum = totalDebits.toNumber();
    const totalCreditsNum = totalCredits.toNumber();
    const difference = Money.abs(Money.subtract(totalDebits, totalCredits));

    return {
      asOfDate,
      generatedAt: new Date().toISOString(),
      accounts,
      totals: {
        totalDebits: totalDebitsNum,
        totalCredits: totalCreditsNum,
        isBalanced: difference.lessThan(0.01),
      },
    };
  } catch (error) {
    logger.error('Error calculating trial balance', { error, asOfDate });
    throw error;
  }
}

// =============================================================================
// FINANCIAL STATEMENTS
// =============================================================================

/**
 * Generate Balance Sheet from actual account balances
 * Balance Sheet: Assets = Liabilities + Equity
 *
 * SAP/Odoo-style account classification:
 *   1000–1499  Current Assets  (Cash, AR, Inventory, Prepaid)
 *   1500–1999  Non-Current Assets (Fixed Assets, Accumulated Depreciation)
 *   2000–2999  Current Liabilities (AP, Customer Deposits, Tax Payable)
 *   3000–3999  Equity (Owner's Equity, Opening Balance Equity, Retained Earnings)
 *   4000–4999  Revenue  → flows into Retained Earnings
 *   5000–6999  Expenses → flows into Retained Earnings
 */
export async function getBalanceSheet(
  asOfDate: string,
  dbPool?: pg.Pool
): Promise<{
  companyName: string;
  reportDate: string;
  generatedAt: string;
  assets: {
    currentAssets: { accountCode: string; accountName: string; amount: number }[];
    fixedAssets: { accountCode: string; accountName: string; amount: number }[];
    totalCurrentAssets: number;
    totalFixedAssets: number;
    totalOtherAssets: number;
    totalAssets: number;
  };
  liabilities: {
    currentLiabilities: { accountCode: string; accountName: string; amount: number }[];
    longTermLiabilities: { accountCode: string; accountName: string; amount: number }[];
    totalCurrentLiabilities: number;
    totalLongTermLiabilities: number;
    totalLiabilities: number;
  };
  equity: {
    items: { accountCode: string; accountName: string; amount: number }[];
    retainedEarnings: number;
    totalEquity: number;
  };
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
}> {
  const pool = dbPool || globalPool;
  try {
    // Parse asOfDate to fiscal year/month for gl_period_balances lookup
    const [yearStr, monthStr] = asOfDate.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    // Get account balances from gl_period_balances (SAP totals table)
    // Use uniform debit-perspective raw balance: SUM(debits) - SUM(credits)
    // Then apply sign convention per AccountType in code to handle contra accounts
    // correctly (e.g., Accumulated Depreciation is ASSET type with CREDIT normal
    // balance — raw balance is negative, which correctly reduces total assets).
    const query = `
      SELECT 
        a."AccountCode" as "accountCode",
        a."AccountName" as "accountName",
        a."AccountType" as "accountType",
        a."NormalBalance" as "normalBalance",
        COALESCE(SUM(gpb.debit_total), 0) as total_debits,
        COALESCE(SUM(gpb.credit_total), 0) as total_credits,
        COALESCE(SUM(gpb.debit_total), 0)
          - COALESCE(SUM(gpb.credit_total), 0) as raw_balance
      FROM accounts a
      LEFT JOIN gl_period_balances gpb 
        ON gpb.account_id = a."Id"
        AND (gpb.fiscal_year < $1 OR (gpb.fiscal_year = $1 AND gpb.fiscal_period <= $2))
      WHERE a."IsActive" = true 
        AND a."IsPostingAccount" = true
      GROUP BY a."AccountCode", a."AccountName", a."AccountType", a."NormalBalance"
      HAVING COALESCE(SUM(gpb.debit_total), 0) != 0 
          OR COALESCE(SUM(gpb.credit_total), 0) != 0
      ORDER BY a."AccountType", a."AccountCode"
    `;

    const result = await pool.query(query, [year, month]);

    // SAP/Odoo account classification by code range
    const currentAssets: { accountCode: string; accountName: string; amount: number }[] = [];
    const fixedAssets: { accountCode: string; accountName: string; amount: number }[] = [];
    const currentLiabilities: { accountCode: string; accountName: string; amount: number }[] = [];
    const longTermLiabilities: { accountCode: string; accountName: string; amount: number }[] = [];
    const equityItems: { accountCode: string; accountName: string; amount: number }[] = [];
    let retainedEarnings = new Decimal(0);

    // Categorize accounts using code-range classification
    // Sign convention (SAP/Odoo standard):
    //   ASSET, EXPENSE   → use raw_balance directly (debit-normal = positive)
    //                       contra-assets (e.g. Accum Depreciation) naturally negative
    //   LIABILITY, EQUITY, REVENUE → negate raw_balance (credit-normal = positive)
    for (const row of result.rows) {
      const rawBalance = new Decimal(row.raw_balance || 0);
      const code = parseInt(row.accountCode, 10);

      if (row.accountType === 'ASSET') {
        // raw_balance used directly: normal assets positive, contra-assets negative
        const item = {
          accountCode: row.accountCode as string,
          accountName: row.accountName as string,
          amount: rawBalance.toNumber(),
        };
        // 1000–1499 = Current Assets, 1500+ = Fixed/Non-Current
        if (code < 1500) {
          currentAssets.push(item);
        } else {
          fixedAssets.push(item);
        }
      } else if (row.accountType === 'LIABILITY') {
        // Negate: credit-normal liabilities show as positive
        const item = {
          accountCode: row.accountCode as string,
          accountName: row.accountName as string,
          amount: rawBalance.times(-1).toNumber(),
        };
        // 2000–2499 = Current Liabilities, 2500+ = Long-term
        if (code < 2500) {
          currentLiabilities.push(item);
        } else {
          longTermLiabilities.push(item);
        }
      } else if (row.accountType === 'EQUITY') {
        // Negate: credit-normal equity shows as positive
        equityItems.push({
          accountCode: row.accountCode as string,
          accountName: row.accountName as string,
          amount: rawBalance.times(-1).toNumber(),
        });
      } else if (row.accountType === 'REVENUE') {
        // Revenue: negate raw_balance → positive when credits > debits
        retainedEarnings = retainedEarnings.plus(rawBalance.times(-1));
      } else if (row.accountType === 'EXPENSE') {
        // Expenses: raw_balance is positive when debits > credits → reduces retained earnings
        retainedEarnings = retainedEarnings.minus(rawBalance);
      }
    }

    // Calculate totals using Decimal for precision
    const totalCurrentAssets = currentAssets.reduce((sum, a) => sum.plus(a.amount), new Decimal(0));
    const totalFixedAssets = fixedAssets.reduce((sum, a) => sum.plus(a.amount), new Decimal(0));
    const totalAssets = totalCurrentAssets.plus(totalFixedAssets);

    const totalCurrentLiabilities = currentLiabilities.reduce((sum, l) => sum.plus(l.amount), new Decimal(0));
    const totalLongTermLiabilities = longTermLiabilities.reduce((sum, l) => sum.plus(l.amount), new Decimal(0));
    const totalLiabilities = totalCurrentLiabilities.plus(totalLongTermLiabilities);

    const equitySubtotal = equityItems.reduce((sum, e) => sum.plus(e.amount), new Decimal(0));
    const totalEquity = equitySubtotal.plus(retainedEarnings);
    const totalLiabilitiesAndEquity = totalLiabilities.plus(totalEquity);

    // Accounting equation check: Assets = Liabilities + Equity
    const isBalanced = totalAssets.minus(totalLiabilitiesAndEquity).abs().lessThan(0.01);

    return {
      companyName: 'SMART ERP',
      reportDate: asOfDate,
      generatedAt: new Date().toISOString(),
      assets: {
        currentAssets,
        fixedAssets,
        totalCurrentAssets: totalCurrentAssets.toNumber(),
        totalFixedAssets: totalFixedAssets.toNumber(),
        totalOtherAssets: 0,
        totalAssets: totalAssets.toNumber(),
      },
      liabilities: {
        currentLiabilities,
        longTermLiabilities,
        totalCurrentLiabilities: totalCurrentLiabilities.toNumber(),
        totalLongTermLiabilities: totalLongTermLiabilities.toNumber(),
        totalLiabilities: totalLiabilities.toNumber(),
      },
      equity: {
        items: equityItems,
        retainedEarnings: retainedEarnings.toNumber(),
        totalEquity: totalEquity.toNumber(),
      },
      totalLiabilitiesAndEquity: totalLiabilitiesAndEquity.toNumber(),
      isBalanced,
    };
  } catch (error) {
    logger.error('Error generating balance sheet', { error, asOfDate });
    throw error;
  }
}

/**
 * Generate Income Statement from actual revenue/expense account balances
 */
export async function getIncomeStatement(
  startDate: string,
  endDate: string,
  dbPool?: pg.Pool
): Promise<{
  companyName: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  revenue: {
    items: { accountCode: string; accountName: string; amount: number }[];
    totalRevenue: number;
  };
  costOfGoodsSold: {
    items: { accountCode: string; accountName: string; amount: number }[];
    totalCOGS: number;
  };
  grossProfit: number;
  operatingExpenses: {
    items: { accountCode: string; accountName: string; amount: number }[];
    totalOperatingExpenses: number;
  };
  operatingIncome: number;
  otherExpenses: {
    items: { accountCode: string; accountName: string; amount: number }[];
    totalOtherExpenses: number;
  };
  netIncome: number;
  grossProfitMargin: number;
  operatingMargin: number;
  netProfitMargin: number;
}> {
  const pool = dbPool || globalPool;
  try {
    // Parse date range to fiscal year/month for gl_period_balances lookup
    const [startYearStr, startMonthStr] = startDate.split('-');
    const [endYearStr, endMonthStr] = endDate.split('-');
    const startYear = parseInt(startYearStr, 10);
    const startMonth = parseInt(startMonthStr, 10);
    const endYear = parseInt(endYearStr, 10);
    const endMonth = parseInt(endMonthStr, 10);

    // Get revenue and expense account balances for the period from gl_period_balances
    const query = `
      SELECT 
        a."AccountCode" as "accountCode",
        a."AccountName" as "accountName",
        a."AccountType" as "accountType",
        a."NormalBalance" as "normalBalance",
        CASE 
          WHEN a."NormalBalance" = 'CREDIT' 
            THEN COALESCE(SUM(gpb.credit_total), 0) - COALESCE(SUM(gpb.debit_total), 0)
          ELSE 
            COALESCE(SUM(gpb.debit_total), 0) - COALESCE(SUM(gpb.credit_total), 0)
        END as balance
      FROM accounts a
      LEFT JOIN gl_period_balances gpb 
        ON gpb.account_id = a."Id"
        AND (gpb.fiscal_year > $1 OR (gpb.fiscal_year = $1 AND gpb.fiscal_period >= $2))
        AND (gpb.fiscal_year < $3 OR (gpb.fiscal_year = $3 AND gpb.fiscal_period <= $4))
        AND gpb.fiscal_period > 0
      WHERE a."IsActive" = true 
        AND a."IsPostingAccount" = true
        AND a."AccountType" IN ('REVENUE', 'EXPENSE')
      GROUP BY a."AccountCode", a."AccountName", a."AccountType", a."NormalBalance"
      HAVING COALESCE(SUM(gpb.debit_total), 0) != 0 
          OR COALESCE(SUM(gpb.credit_total), 0) != 0
      ORDER BY a."AccountCode"
    `;

    const result = await pool.query(query, [startYear, startMonth, endYear, endMonth]);

    const revenue: { accountCode: string; accountName: string; amount: number }[] = [];
    const cogs: { accountCode: string; accountName: string; amount: number }[] = [];
    const operatingExpenses: { accountCode: string; accountName: string; amount: number }[] = [];
    const otherExpenses: { accountCode: string; accountName: string; amount: number }[] = [];

    for (const row of result.rows) {
      const balance = new Decimal(row.balance || 0).toNumber();
      const item = {
        accountCode: row.accountCode as string,
        accountName: row.accountName as string,
        amount: balance,
      };

      if (row.accountType === 'REVENUE') {
        revenue.push(item);
      } else if (row.accountType === 'EXPENSE') {
        // Categorize expenses (simplified logic based on account codes)
        if (row.accountCode.startsWith('5')) {
          cogs.push(item);
        } else if (row.accountCode.startsWith('6')) {
          operatingExpenses.push(item);
        } else {
          otherExpenses.push(item);
        }
      }
    }

    const totalRevenueD = revenue.reduce((sum, r) => sum.plus(r.amount), new Decimal(0));
    const totalCOGSD = cogs.reduce((sum, c) => sum.plus(c.amount), new Decimal(0));
    const totalOperatingExpensesD = operatingExpenses.reduce(
      (sum, e) => sum.plus(e.amount),
      new Decimal(0)
    );
    const totalOtherExpensesD = otherExpenses.reduce(
      (sum, e) => sum.plus(e.amount),
      new Decimal(0)
    );

    const grossProfitD = totalRevenueD.minus(totalCOGSD);
    const operatingIncomeD = grossProfitD.minus(totalOperatingExpensesD);
    const netIncomeD = operatingIncomeD.minus(totalOtherExpensesD);

    // Convert to numbers for the return value
    const totalRevenue = totalRevenueD.toNumber();
    const totalCOGS = totalCOGSD.toNumber();
    const totalOperatingExpenses = totalOperatingExpensesD.toNumber();
    const totalOtherExpenses = totalOtherExpensesD.toNumber();
    const grossProfit = grossProfitD.toNumber();
    const operatingIncome = operatingIncomeD.toNumber();
    const netIncome = netIncomeD.toNumber();

    // Calculate margins
    const grossProfitMargin = totalRevenueD.greaterThan(0)
      ? grossProfitD.dividedBy(totalRevenueD).times(100).toDecimalPlaces(2).toNumber()
      : 0;
    const operatingMargin = totalRevenueD.greaterThan(0)
      ? operatingIncomeD.dividedBy(totalRevenueD).times(100).toDecimalPlaces(2).toNumber()
      : 0;
    const netProfitMargin = totalRevenueD.greaterThan(0)
      ? netIncomeD.dividedBy(totalRevenueD).times(100).toDecimalPlaces(2).toNumber()
      : 0;

    return {
      companyName: 'SMART ERP',
      periodStart: startDate,
      periodEnd: endDate,
      generatedAt: new Date().toISOString(),
      revenue: {
        items: revenue,
        totalRevenue,
      },
      costOfGoodsSold: {
        items: cogs,
        totalCOGS,
      },
      grossProfit,
      operatingExpenses: {
        items: operatingExpenses,
        totalOperatingExpenses,
      },
      operatingIncome,
      otherExpenses: {
        items: otherExpenses,
        totalOtherExpenses,
      },
      netIncome,
      grossProfitMargin,
      operatingMargin,
      netProfitMargin,
    };
  } catch (error) {
    logger.error('Error generating income statement', { error, startDate, endDate });
    throw error;
  }
}

export default {
  // Chart of Accounts
  getAccounts,
  getAccountById,
  getAccountByCode,
  createAccount,
  updateAccount,
  deleteAccount,
  // Journal Entries
  getJournalEntryById,
  // General Ledger
  getLedgerEntries,
  getLedgerTransactionById,
  // Financial Reports
  getTrialBalance,
  getBalanceSheet,
  getIncomeStatement,
};
