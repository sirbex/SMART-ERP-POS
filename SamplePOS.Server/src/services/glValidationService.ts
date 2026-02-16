/**
 * GL VALIDATION SERVICE
 * 
 * Validates that GL entries are properly created for transactions.
 * Use this to verify accounting integrity at the API level.
 */

import { pool as globalPool } from '../db/pool.js';
import type pg from 'pg';
import Decimal from 'decimal.js';
import logger from '../utils/logger.js';

interface GLValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

interface ReconciliationResult {
  account: string;
  glBalance: number;
  subledgerBalance: number;
  difference: number;
  isBalanced: boolean;
}

/**
 * Validates that a sale has proper GL entries
 */
export async function validateSaleGLEntries(saleId: string, dbPool?: pg.Pool): Promise<GLValidationResult> {
  const pool = dbPool || globalPool;
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Get the sale
    const saleResult = await pool.query(
      `SELECT id, sale_number, total_amount, payment_method, customer_id 
       FROM sales WHERE id = $1`,
      [saleId]
    );

    if (saleResult.rows.length === 0) {
      return { isValid: false, errors: ['Sale not found'], warnings: [] };
    }

    const sale = saleResult.rows[0];

    // For credit sales, check AR debit exists
    if (sale.payment_method === 'CREDIT') {
      const arEntry = await pool.query(
        `SELECT SUM(jel."DebitAmount") as debit_total
         FROM journal_entries je
         JOIN journal_entry_lines jel ON jel."JournalEntryId" = je."Id"
         JOIN accounts a ON a."Id" = jel."AccountId"
         WHERE je."SourceEntityId" = $1
           AND je."SourceEntityType" = 'Sale'
           AND je."Status" != 'VOIDED'
           AND a."AccountCode" = '1200'`,
        [saleId]
      );

      const expectedAmount = new Decimal(sale.total_amount || 0).toNumber();
      const actualDebit = new Decimal(arEntry.rows[0]?.debit_total || 0).toNumber();

      if (new Decimal(actualDebit).minus(expectedAmount).abs().greaterThan('0.01')) {
        errors.push(
          `AR debit mismatch for ${sale.sale_number}: Expected ${expectedAmount}, Found ${actualDebit}`
        );
      }
    }

    // Check revenue credit exists
    const revenueEntry = await pool.query(
      `SELECT SUM(jel."CreditAmount") as credit_total
       FROM journal_entries je
       JOIN journal_entry_lines jel ON jel."JournalEntryId" = je."Id"
       JOIN accounts a ON a."Id" = jel."AccountId"
       WHERE je."SourceEntityId" = $1
         AND je."SourceEntityType" = 'Sale'
         AND je."Status" != 'VOIDED'
         AND a."AccountCode" = '4100'`,
      [saleId]
    );

    const expectedRevenue = new Decimal(sale.total_amount || 0).toNumber();
    const actualCredit = new Decimal(revenueEntry.rows[0]?.credit_total || 0).toNumber();

    if (new Decimal(actualCredit).minus(expectedRevenue).abs().greaterThan('0.01')) {
      errors.push(
        `Revenue credit mismatch for ${sale.sale_number}: Expected ${expectedRevenue}, Found ${actualCredit}`
      );
    }

    // Check journal entry is balanced
    const balanceCheck = await pool.query(
      `SELECT 
         SUM(jel."DebitAmount") as total_debits,
         SUM(jel."CreditAmount") as total_credits
       FROM journal_entries je
       JOIN journal_entry_lines jel ON jel."JournalEntryId" = je."Id"
       WHERE je."SourceEntityId" = $1
         AND je."SourceEntityType" = 'Sale'
         AND je."Status" != 'VOIDED'`,
      [saleId]
    );

    const debits = new Decimal(balanceCheck.rows[0]?.total_debits || 0).toNumber();
    const credits = new Decimal(balanceCheck.rows[0]?.total_credits || 0).toNumber();

    if (new Decimal(debits).minus(credits).abs().greaterThan('0.01')) {
      errors.push(
        `Journal entry not balanced for ${sale.sale_number}: Debits ${debits}, Credits ${credits}`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  } catch (error) {
    logger.error('GL validation error', { saleId, error });
    return {
      isValid: false,
      errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      warnings: []
    };
  }
}

/**
 * Validates that a customer payment has proper GL entries
 */
export async function validatePaymentGLEntries(paymentId: string, dbPool?: pg.Pool): Promise<GLValidationResult> {
  const pool = dbPool || globalPool;
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const paymentResult = await pool.query(
      `SELECT "Id", "PaymentNumber", "Amount", "PaymentMethod"
       FROM customer_payments WHERE "Id" = $1`,
      [paymentId]
    );

    if (paymentResult.rows.length === 0) {
      return { isValid: false, errors: ['Payment not found'], warnings: [] };
    }

    const payment = paymentResult.rows[0];

    // Check AR credit exists (payment reduces AR)
    const arEntry = await pool.query(
      `SELECT SUM(jel."CreditAmount") as credit_total
       FROM journal_entries je
       JOIN journal_entry_lines jel ON jel."JournalEntryId" = je."Id"
       JOIN accounts a ON a."Id" = jel."AccountId"
       WHERE je."SourceEntityId" = $1
         AND je."SourceEntityType" IN ('CustomerPayment', 'InvoicePayment')
         AND je."Status" != 'VOIDED'
         AND a."AccountCode" = '1200'`,
      [paymentId]
    );

    const expectedAmount = new Decimal(payment.Amount || 0).toNumber();
    const actualCredit = new Decimal(arEntry.rows[0]?.credit_total || 0).toNumber();

    if (new Decimal(actualCredit).minus(expectedAmount).abs().greaterThan('0.01')) {
      errors.push(
        `AR credit mismatch for ${payment.PaymentNumber}: Expected ${expectedAmount}, Found ${actualCredit}`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  } catch (error) {
    logger.error('GL validation error', { paymentId, error });
    return {
      isValid: false,
      errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      warnings: []
    };
  }
}

/**
 * Check AR reconciliation (GL vs Customer Subledger)
 */
export async function checkARReconciliation(dbPool?: pg.Pool): Promise<ReconciliationResult> {
  const pool = dbPool || globalPool;
  const result = await pool.query(`
    SELECT 
      COALESCE(
        (SELECT SUM("DebitAmount") - SUM("CreditAmount")
         FROM ledger_entries le
         JOIN accounts a ON a."Id" = le."AccountId"
         WHERE a."AccountCode" = '1200'), 0
      ) as gl_balance,
      COALESCE(
        (SELECT SUM(balance) FROM customers), 0
      ) as subledger_balance
  `);

  const glBalance = new Decimal(result.rows[0]?.gl_balance || 0).toNumber();
  const subledgerBalance = new Decimal(result.rows[0]?.subledger_balance || 0).toNumber();
  const difference = new Decimal(glBalance).minus(subledgerBalance).toNumber();

  return {
    account: 'AR (1200)',
    glBalance,
    subledgerBalance,
    difference,
    isBalanced: new Decimal(difference).abs().lessThan('0.01')
  };
}

/**
 * Check AP reconciliation (GL vs Supplier Subledger)
 */
export async function checkAPReconciliation(dbPool?: pg.Pool): Promise<ReconciliationResult> {
  const pool = dbPool || globalPool;
  const result = await pool.query(`
    SELECT 
      COALESCE(
        (SELECT SUM("CreditAmount") - SUM("DebitAmount")
         FROM ledger_entries le
         JOIN accounts a ON a."Id" = le."AccountId"
         WHERE a."AccountCode" = '2100'), 0
      ) as gl_balance,
      COALESCE(
        (SELECT SUM("OutstandingBalance") FROM suppliers), 0
      ) as subledger_balance
  `);

  const glBalance = new Decimal(result.rows[0]?.gl_balance || 0).toNumber();
  const subledgerBalance = new Decimal(result.rows[0]?.subledger_balance || 0).toNumber();
  const difference = new Decimal(glBalance).minus(subledgerBalance).toNumber();

  return {
    account: 'AP (2100)',
    glBalance,
    subledgerBalance,
    difference,
    isBalanced: new Decimal(difference).abs().lessThan('0.01')
  };
}

/**
 * Check Inventory reconciliation (GL vs Cost Layers Subledger)
 * 
 * CRITICAL: This check ensures the GL Inventory account (1300) matches
 * the sum of remaining inventory value in cost_layers.
 * 
 * Discrepancies can occur when:
 * - Cost layers are created without GL posting (e.g., direct API calls)
 * - Goods receipts fail to trigger GL posting
 * - Manual adjustments to cost_layers without corresponding GL entries
 */
export async function checkInventoryReconciliation(dbPool?: pg.Pool): Promise<ReconciliationResult> {
  const pool = dbPool || globalPool;
  const result = await pool.query(`
    SELECT 
      COALESCE(
        (SELECT SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE -le."Amount" END)
         FROM ledger_entries le
         JOIN accounts a ON a."Id" = le."AccountId"
         WHERE a."AccountCode" = '1300'), 0
      ) as gl_balance,
      COALESCE(
        (SELECT SUM(remaining_quantity * unit_cost) 
         FROM cost_layers 
         WHERE remaining_quantity > 0), 0
      ) as subledger_balance
  `);

  const glBalance = new Decimal(result.rows[0]?.gl_balance || 0).toNumber();
  const subledgerBalance = new Decimal(result.rows[0]?.subledger_balance || 0).toNumber();
  const difference = new Decimal(glBalance).minus(subledgerBalance).toNumber();

  return {
    account: 'Inventory (1300)',
    glBalance,
    subledgerBalance,
    difference,
    isBalanced: new Decimal(difference).abs().lessThan('0.01')
  };
}

/**
 * Full accounting integrity check
 */
export async function runFullIntegrityCheck(dbPool?: pg.Pool): Promise<{
  passed: boolean;
  results: {
    arReconciliation: ReconciliationResult;
    apReconciliation: ReconciliationResult;
    inventoryReconciliation: ReconciliationResult;
    unbalancedJournalEntries: number;
    creditSalesWithoutGL: number;
    paymentsWithoutGL: number;
  };
}> {
  const pool = dbPool || globalPool;
  const [ar, ap, inventory] = await Promise.all([
    checkARReconciliation(),
    checkAPReconciliation(),
    checkInventoryReconciliation()
  ]);

  // Check for unbalanced journal entries
  const unbalanced = await pool.query(`
    SELECT COUNT(*) as count
    FROM (
      SELECT je."Id"
      FROM journal_entries je
      JOIN journal_entry_lines jel ON jel."JournalEntryId" = je."Id"
      WHERE je."Status" != 'VOIDED'
      GROUP BY je."Id"
      HAVING ABS(SUM(jel."DebitAmount") - SUM(jel."CreditAmount")) > 0.01
    ) sub
  `);

  // Check credit sales without GL
  const salesNoGL = await pool.query(`
    SELECT COUNT(*) as count
    FROM sales s
    WHERE s.payment_method = 'CREDIT'
      AND NOT EXISTS (
        SELECT 1 FROM journal_entries je 
        WHERE je."SourceEntityId" = s.id::text 
          AND je."SourceEntityType" = 'Sale'
          AND je."Status" != 'VOIDED'
      )
  `);

  // Check payments without GL
  const paymentsNoGL = await pool.query(`
    SELECT COUNT(*) as count
    FROM customer_payments cp
    WHERE NOT EXISTS (
      SELECT 1 FROM journal_entries je 
      WHERE je."SourceEntityId" = cp."Id"::text 
        AND je."SourceEntityType" IN ('CustomerPayment', 'InvoicePayment')
        AND je."Status" != 'VOIDED'
    )
  `);

  const results = {
    arReconciliation: ar,
    apReconciliation: ap,
    inventoryReconciliation: inventory,
    unbalancedJournalEntries: parseInt(unbalanced.rows[0]?.count || '0'),
    creditSalesWithoutGL: parseInt(salesNoGL.rows[0]?.count || '0'),
    paymentsWithoutGL: parseInt(paymentsNoGL.rows[0]?.count || '0')
  };

  const passed =
    ar.isBalanced &&
    ap.isBalanced &&
    inventory.isBalanced &&
    results.unbalancedJournalEntries === 0 &&
    results.creditSalesWithoutGL === 0 &&
    results.paymentsWithoutGL === 0;

  return { passed, results };
}

export const glValidationService = {
  validateSaleGLEntries,
  validatePaymentGLEntries,
  checkARReconciliation,
  checkAPReconciliation,
  checkInventoryReconciliation,
  runFullIntegrityCheck
};
