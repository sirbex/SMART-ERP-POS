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

import { pool } from '../db/pool.js';
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
  currentBalance?: string | number;  // Optional: returned from DB as string for precision
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

export interface CreateJournalEntryData {
  description: string;
  entryDate: string;
  sourceEventType: string;
  sourceEntityType: string;
  idempotencyKey: string;
  lines: {
    accountCode: string;
    description: string;
    debitAmount: number;
    creditAmount: number;
    entityType?: string;
    entityId?: string;
  }[];
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
export async function getAccounts(filters: AccountFilters = {}): Promise<Account[]> {
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
    const params: any[] = [];
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
export async function getAccountById(id: string): Promise<Account | null> {
  try {
    const result = await pool.query(`
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
    `, [id]);

    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error fetching account by ID', { error, id });
    throw error;
  }
}

/**
 * Get account by code
 */
export async function getAccountByCode(code: string): Promise<Account | null> {
  try {
    const result = await pool.query(`
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
    `, [code]);

    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error fetching account by code', { error, code });
    throw error;
  }
}

/**
 * Create a new account
 */
export async function createAccount(data: Omit<Account, 'id'>): Promise<Account> {
  try {
    const id = uuidv4();
    const result = await pool.query(`
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
    `, [
      id,
      data.accountCode,
      data.accountName,
      data.accountType,
      data.normalBalance,
      data.parentAccountId,
      data.level,
      data.isPostingAccount,
      data.isActive
    ]);

    return result.rows[0];
  } catch (error) {
    logger.error('Error creating account', { error, data });
    throw error;
  }
}

// =============================================================================
// LEDGER TRANSACTIONS - Write to GL tables that the General Ledger reads from
// =============================================================================

export interface CreateLedgerTransactionData {
  referenceType: string;  // 'SALE', 'PURCHASE', 'EXPENSE', 'ADJUSTMENT'
  referenceId: string;    // The source entity UUID
  referenceNumber: string; // Human-readable reference like SALE-2025-0001
  description: string;
  transactionDate: string;
  lines: {
    accountCode: string;
    description: string;
    debitAmount: number;
    creditAmount: number;
  }[];
}

/**
 * Create a ledger transaction with entries
 * This writes to ledger_transactions and ledger_entries tables
 * which are read by the General Ledger page
 */
export async function createLedgerTransaction(data: CreateLedgerTransactionData): Promise<{ transactionId: string; transactionNumber: string }> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Validate double-entry: total debits must equal total credits
    const totalDebits = data.lines.reduce((sum, line) =>
      new Decimal(sum).plus(line.debitAmount).toNumber(), 0);
    const totalCredits = data.lines.reduce((sum, line) =>
      new Decimal(sum).plus(line.creditAmount).toNumber(), 0);

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new Error(`Ledger transaction is not balanced. Debits: ${totalDebits}, Credits: ${totalCredits}`);
    }

    // Generate transaction number (auto-increment style)
    const countResult = await client.query(`SELECT COUNT(*) + 1 as next_num FROM ledger_transactions`);
    const nextNum = parseInt(countResult.rows[0].next_num);
    const transactionNumber = `TXN-${String(nextNum).padStart(6, '0')}`;
    const transactionId = uuidv4();

    // Create ledger transaction header
    await client.query(`
      INSERT INTO ledger_transactions (
        "Id", "TransactionNumber", "TransactionDate", "ReferenceType",
        "ReferenceId", "ReferenceNumber", "Description",
        "TotalDebitAmount", "TotalCreditAmount", "Status"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'POSTED')
    `, [
      transactionId,
      transactionNumber,
      data.transactionDate,
      data.referenceType,
      data.referenceId,
      data.referenceNumber,
      data.description,
      totalDebits,
      totalCredits
    ]);

    // Create ledger entries
    let lineNumber = 1;
    for (const line of data.lines) {
      // Get account by code
      const accountResult = await client.query(`
        SELECT "Id" FROM accounts WHERE "AccountCode" = $1
      `, [line.accountCode]);

      if (accountResult.rows.length === 0) {
        throw new Error(`Account not found: ${line.accountCode}`);
      }

      const accountId = accountResult.rows[0].Id;
      const entryId = uuidv4();
      const entryType = line.debitAmount > 0 ? 'DEBIT' : 'CREDIT';
      const amount = line.debitAmount > 0 ? line.debitAmount : line.creditAmount;

      await client.query(`
        INSERT INTO ledger_entries (
          "Id", "TransactionId", "AccountId", "EntryType", "Amount",
          "DebitAmount", "CreditAmount", "Description", "LineNumber", "CreatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      `, [
        entryId,
        transactionId,
        accountId,
        entryType,
        amount,
        line.debitAmount,
        line.creditAmount,
        line.description,
        lineNumber++
      ]);
    }

    await client.query('COMMIT');

    logger.info('Created ledger transaction', {
      transactionId,
      transactionNumber,
      referenceNumber: data.referenceNumber,
      totalDebits,
      totalCredits
    });

    return { transactionId, transactionNumber };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating ledger transaction', { error, data });
    throw error;
  } finally {
    client.release();
  }
}

// =============================================================================
// JOURNAL ENTRIES - Core Double-Entry Bookkeeping
// =============================================================================

/**
 * Create a journal entry with lines
 * Validates that debits = credits (double-entry principle)
 */
export async function createJournalEntry(data: CreateJournalEntryData): Promise<JournalEntry> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check for idempotency - prevent duplicate entries
    if (data.idempotencyKey) {
      const existing = await client.query(`
        SELECT "Id" FROM journal_entries WHERE "IdempotencyKey" = $1
      `, [data.idempotencyKey]);

      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        throw new Error(`Journal entry already exists for idempotency key: ${data.idempotencyKey}`);
      }
    }

    // Validate double-entry: total debits must equal total credits
    const totalDebits = data.lines.reduce((sum, line) =>
      new Decimal(sum).plus(line.debitAmount).toNumber(), 0);
    const totalCredits = data.lines.reduce((sum, line) =>
      new Decimal(sum).plus(line.creditAmount).toNumber(), 0);

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new Error(`Journal entry is not balanced. Debits: ${totalDebits}, Credits: ${totalCredits}`);
    }

    // Create journal entry header
    const entryId = uuidv4();
    const transactionId = `JE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const entryResult = await client.query(`
      INSERT INTO journal_entries (
        "Id", "TransactionId", "Description", "EntryDate", "CreatedAt",
        "Status", "IdempotencyKey", "SourceEventType", "SourceEntityType"
      ) VALUES ($1, $2, $3, $4, NOW(), 'POSTED', $5, $6, $7)
      RETURNING 
        "Id" as id,
        "TransactionId" as "transactionId",
        "Description" as description,
        "EntryDate"::text as "entryDate",
        "CreatedAt"::text as "createdAt",
        "Status" as status,
        "IdempotencyKey" as "idempotencyKey",
        "SourceEventType" as "sourceEventType",
        "SourceEntityType" as "sourceEntityType"
    `, [
      entryId,
      transactionId,
      data.description,
      data.entryDate,
      data.idempotencyKey,
      data.sourceEventType,
      data.sourceEntityType
    ]);

    const journalEntry = entryResult.rows[0];
    journalEntry.lines = [];

    // Create journal entry lines
    for (const line of data.lines) {
      // Get account by code
      const accountResult = await client.query(`
        SELECT "Id" FROM accounts WHERE "AccountCode" = $1
      `, [line.accountCode]);

      if (accountResult.rows.length === 0) {
        throw new Error(`Account not found: ${line.accountCode}`);
      }

      const accountId = accountResult.rows[0].Id;
      const lineId = uuidv4();

      const lineResult = await client.query(`
        INSERT INTO journal_entry_lines (
          "Id", "JournalEntryId", "AccountId", "Description",
          "DebitAmount", "CreditAmount", "EntityType", "EntityId", "TransactionId"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING 
          "Id" as id,
          "JournalEntryId" as "journalEntryId",
          "AccountId" as "accountId",
          "Description" as description,
          "DebitAmount" as "debitAmount",
          "CreditAmount" as "creditAmount",
          "EntityType" as "entityType",
          "EntityId" as "entityId"
      `, [
        lineId,
        entryId,
        accountId,
        line.description,
        line.debitAmount,
        line.creditAmount,
        line.entityType || null,
        line.entityId || null,
        transactionId
      ]);

      journalEntry.lines.push(lineResult.rows[0]);
    }

    await client.query('COMMIT');

    logger.info('Created journal entry', {
      entryId,
      transactionId,
      description: data.description,
      totalDebits,
      totalCredits
    });

    return journalEntry;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating journal entry', { error, data });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get journal entry by ID with all lines
 */
export async function getJournalEntryById(id: string): Promise<JournalEntry | null> {
  try {
    const entryResult = await pool.query(`
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
    `, [id]);

    if (entryResult.rows.length === 0) {
      return null;
    }

    const entry = entryResult.rows[0];

    // Get lines with account details
    const linesResult = await pool.query(`
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
    `, [id]);

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
export async function getLedgerEntries(filters: LedgerFilters): Promise<{
  entries: LedgerEntry[];
  total: number;
}> {
  try {
    let whereClause = '';
    const params: any[] = [];
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
        runningBalance: balance
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
export async function getLedgerTransactionById(id: string): Promise<{
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
  try {
    // Get the transaction
    const txnResult = await pool.query(`
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
    `, [id]);

    if (txnResult.rows.length === 0) {
      return null;
    }

    const txn = txnResult.rows[0];

    // Get entries with account details
    const entriesResult = await pool.query(`
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
    `, [id]);

    return {
      ...txn,
      entries: entriesResult.rows
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
export async function getTrialBalance(asOfDate: string, includeZeroBalances: boolean = false): Promise<{
  asOfDate: string;
  generatedAt: string;
  accounts: TrialBalanceAccount[];
  totals: {
    totalDebits: number;
    totalCredits: number;
    isBalanced: boolean;
  };
}> {
  try {
    // Get all account balances calculated from ledger entries up to asOfDate
    // netBalance is calculated from debits and credits, respecting normalBalance type
    const query = `
      WITH account_activity AS (
        SELECT 
          a."Id" as "accountId",
          a."AccountCode" as "accountCode",
          a."AccountName" as "accountName",
          a."AccountType" as "accountType",
          a."NormalBalance" as "normalBalance",
          COALESCE((
            SELECT SUM(le."DebitAmount")
            FROM ledger_entries le
            JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
            WHERE le."AccountId" = a."Id"
              AND lt."Status" = 'POSTED'
              AND DATE(lt."TransactionDate") <= $1
          ), 0) as "debitBalance",
          COALESCE((
            SELECT SUM(le."CreditAmount")
            FROM ledger_entries le
            JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
            WHERE le."AccountId" = a."Id"
              AND lt."Status" = 'POSTED'
              AND DATE(lt."TransactionDate") <= $1
          ), 0) as "creditBalance"
        FROM accounts a
        WHERE a."IsActive" = true
      )
      SELECT 
        "accountId",
        "accountCode",
        "accountName",
        "accountType",
        "normalBalance",
        "debitBalance",
        "creditBalance",
        -- Calculate net balance based on normal balance type
        -- DEBIT-normal (Asset, Expense): Debits - Credits
        -- CREDIT-normal (Liability, Equity, Revenue): Credits - Debits
        CASE 
          WHEN "normalBalance" = 'DEBIT' THEN "debitBalance" - "creditBalance"
          ELSE "creditBalance" - "debitBalance"
        END as "netBalance"
      FROM account_activity
      ${includeZeroBalances ? '' : 'WHERE ("debitBalance" != 0 OR "creditBalance" != 0)'}
      ORDER BY "accountCode"
    `;

    const result = await pool.query(query, [asOfDate]);
    const accounts = result.rows.map(row => ({
      ...row,
      debitBalance: Money.parseDb(row.debitBalance).toNumber(),
      creditBalance: Money.parseDb(row.creditBalance).toNumber(),
      netBalance: Money.parseDb(row.netBalance).toNumber()
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
        isBalanced: difference.lessThan(0.01)
      }
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
 */
export async function getBalanceSheet(asOfDate: string): Promise<{
  companyName: string;
  reportDate: string;
  generatedAt: string;
  assets: {
    currentAssets: { accountCode: string; accountName: string; amount: number }[];
    fixedAssets: { accountCode: string; accountName: string; amount: number }[];
    totalCurrentAssets: number;
    totalFixedAssets: number;
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
}> {
  try {
    // Get account balances from ledger_entries (database-driven)
    const query = `
      WITH account_balances AS (
        SELECT 
          a."AccountCode" as account_code,
          a."AccountName" as account_name,
          a."AccountType" as account_type,
          a."NormalBalance" as normal_balance,
          COALESCE(SUM(le."DebitAmount"), 0) as total_debits,
          COALESCE(SUM(le."CreditAmount"), 0) as total_credits
        FROM accounts a
        LEFT JOIN ledger_entries le ON a."Id" = le."AccountId"
        LEFT JOIN ledger_transactions lt ON le."TransactionId" = lt."Id" 
          AND lt."Status" = 'POSTED'
          AND DATE(lt."TransactionDate") <= $1
        WHERE a."IsActive" = true 
          AND a."IsPostingAccount" = true
        GROUP BY a."AccountCode", a."AccountName", a."AccountType", a."NormalBalance"
      )
      SELECT 
        account_code as "accountCode",
        account_name as "accountName",
        account_type as "accountType",
        CASE 
          WHEN normal_balance = 'DEBIT' THEN total_debits - total_credits
          ELSE total_credits - total_debits
        END as balance
      FROM account_balances
      WHERE total_debits != 0 OR total_credits != 0
      ORDER BY account_type, account_code
    `;

    const result = await pool.query(query, [asOfDate]);

    const assets: { accountCode: string; accountName: string; amount: number }[] = [];
    const liabilities: { accountCode: string; accountName: string; amount: number }[] = [];
    const equityItems: { accountCode: string; accountName: string; amount: number }[] = [];
    let retainedEarnings = 0;

    // Categorize accounts
    for (const row of result.rows) {
      const balance = parseFloat(row.balance) || 0;
      const item = {
        accountCode: row.accountCode,
        accountName: row.accountName,
        amount: balance
      };

      if (row.accountType === 'ASSET') {
        assets.push(item);
      } else if (row.accountType === 'LIABILITY') {
        liabilities.push(item);
      } else if (row.accountType === 'EQUITY') {
        equityItems.push(item);
      } else if (row.accountType === 'REVENUE') {
        // Revenue increases retained earnings
        retainedEarnings = new Decimal(retainedEarnings).plus(balance).toNumber();
      } else if (row.accountType === 'EXPENSE') {
        // Expenses decrease retained earnings
        retainedEarnings = new Decimal(retainedEarnings).minus(balance).toNumber();
      }
    }

    // Calculate totals (simplified - in real world would separate current/non-current)
    const totalAssets = assets.reduce((sum, a) =>
      new Decimal(sum).plus(a.amount).toNumber(), 0);
    const totalLiabilities = liabilities.reduce((sum, l) =>
      new Decimal(sum).plus(l.amount).toNumber(), 0);
    const equityTotal = equityItems.reduce((sum, e) =>
      new Decimal(sum).plus(e.amount).toNumber(), 0);
    const totalEquity = new Decimal(equityTotal).plus(retainedEarnings).toNumber();

    return {
      companyName: 'SamplePOS Company',
      reportDate: asOfDate,
      generatedAt: new Date().toISOString(),
      assets: {
        currentAssets: assets.filter(a => a.accountCode.startsWith('1')),
        fixedAssets: assets.filter(a => !a.accountCode.startsWith('1')),
        totalCurrentAssets: assets.filter(a => a.accountCode.startsWith('1'))
          .reduce((sum, a) => new Decimal(sum).plus(a.amount).toNumber(), 0),
        totalFixedAssets: assets.filter(a => !a.accountCode.startsWith('1'))
          .reduce((sum, a) => new Decimal(sum).plus(a.amount).toNumber(), 0),
        totalAssets
      },
      liabilities: {
        currentLiabilities: liabilities.filter(l => l.accountCode.startsWith('2')),
        longTermLiabilities: liabilities.filter(l => !l.accountCode.startsWith('2')),
        totalCurrentLiabilities: liabilities.filter(l => l.accountCode.startsWith('2'))
          .reduce((sum, l) => new Decimal(sum).plus(l.amount).toNumber(), 0),
        totalLongTermLiabilities: liabilities.filter(l => !l.accountCode.startsWith('2'))
          .reduce((sum, l) => new Decimal(sum).plus(l.amount).toNumber(), 0),
        totalLiabilities
      },
      equity: {
        items: equityItems,
        retainedEarnings,
        totalEquity
      },
      totalLiabilitiesAndEquity: new Decimal(totalLiabilities).plus(totalEquity).toNumber()
    };
  } catch (error) {
    logger.error('Error generating balance sheet', { error, asOfDate });
    throw error;
  }
}

/**
 * Generate Income Statement from actual revenue/expense account balances
 */
export async function getIncomeStatement(startDate: string, endDate: string): Promise<{
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
  try {
    // Get revenue and expense account balances for the period from ledger_entries
    const query = `
      WITH period_balances AS (
        SELECT 
          a."AccountCode" as account_code,
          a."AccountName" as account_name,
          a."AccountType" as account_type,
          a."NormalBalance" as normal_balance,
          COALESCE(SUM(le."DebitAmount"), 0) as total_debits,
          COALESCE(SUM(le."CreditAmount"), 0) as total_credits
        FROM accounts a
        LEFT JOIN ledger_entries le ON a."Id" = le."AccountId"
        LEFT JOIN ledger_transactions lt ON le."TransactionId" = lt."Id" 
          AND lt."Status" = 'POSTED'
          AND DATE(lt."TransactionDate") >= $1
          AND DATE(lt."TransactionDate") <= $2
        WHERE a."IsActive" = true 
          AND a."IsPostingAccount" = true
          AND a."AccountType" IN ('REVENUE', 'EXPENSE')
        GROUP BY a."AccountCode", a."AccountName", a."AccountType", a."NormalBalance"
      )
      SELECT 
        account_code as "accountCode",
        account_name as "accountName",
        account_type as "accountType",
        CASE 
          WHEN normal_balance = 'CREDIT' THEN total_credits - total_debits
          ELSE total_debits - total_credits
        END as balance
      FROM period_balances
      WHERE total_debits != 0 OR total_credits != 0
      ORDER BY account_code
    `;

    const result = await pool.query(query, [startDate, endDate]);

    const revenue: { accountCode: string; accountName: string; amount: number }[] = [];
    const cogs: { accountCode: string; accountName: string; amount: number }[] = [];
    const operatingExpenses: { accountCode: string; accountName: string; amount: number }[] = [];
    const otherExpenses: { accountCode: string; accountName: string; amount: number }[] = [];

    for (const row of result.rows) {
      const balance = parseFloat(row.balance) || 0;
      const item = {
        accountCode: row.accountCode,
        accountName: row.accountName,
        amount: balance
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

    const totalRevenue = revenue.reduce((sum, r) =>
      new Decimal(sum).plus(r.amount).toNumber(), 0);
    const totalCOGS = cogs.reduce((sum, c) =>
      new Decimal(sum).plus(c.amount).toNumber(), 0);
    const totalOperatingExpenses = operatingExpenses.reduce((sum, e) =>
      new Decimal(sum).plus(e.amount).toNumber(), 0);
    const totalOtherExpenses = otherExpenses.reduce((sum, e) =>
      new Decimal(sum).plus(e.amount).toNumber(), 0);

    const grossProfit = new Decimal(totalRevenue).minus(totalCOGS).toNumber();
    const operatingIncome = new Decimal(grossProfit).minus(totalOperatingExpenses).toNumber();
    const netIncome = new Decimal(operatingIncome).minus(totalOtherExpenses).toNumber();

    // Calculate margins
    const grossProfitMargin = totalRevenue > 0
      ? new Decimal(grossProfit).dividedBy(totalRevenue).times(100).toDecimalPlaces(2).toNumber()
      : 0;
    const operatingMargin = totalRevenue > 0
      ? new Decimal(operatingIncome).dividedBy(totalRevenue).times(100).toDecimalPlaces(2).toNumber()
      : 0;
    const netProfitMargin = totalRevenue > 0
      ? new Decimal(netIncome).dividedBy(totalRevenue).times(100).toDecimalPlaces(2).toNumber()
      : 0;

    return {
      companyName: 'SamplePOS Company',
      periodStart: startDate,
      periodEnd: endDate,
      generatedAt: new Date().toISOString(),
      revenue: {
        items: revenue,
        totalRevenue
      },
      costOfGoodsSold: {
        items: cogs,
        totalCOGS
      },
      grossProfit,
      operatingExpenses: {
        items: operatingExpenses,
        totalOperatingExpenses
      },
      operatingIncome,
      otherExpenses: {
        items: otherExpenses,
        totalOtherExpenses
      },
      netIncome,
      grossProfitMargin,
      operatingMargin,
      netProfitMargin
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
  // Journal Entries
  createJournalEntry,
  getJournalEntryById,
  // General Ledger
  getLedgerEntries,
  getLedgerTransactionById,
  // Financial Reports
  getTrialBalance,
  getBalanceSheet,
  getIncomeStatement
};
