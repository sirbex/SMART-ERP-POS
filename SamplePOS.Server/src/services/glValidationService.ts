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
import * as glEntryService from './glEntryService.js';

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
export async function validateSaleGLEntries(
  saleId: string,
  dbPool?: pg.Pool
): Promise<GLValidationResult> {
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
      warnings,
    };
  } catch (error) {
    logger.error('GL validation error', { saleId, error });
    return {
      isValid: false,
      errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      warnings: [],
    };
  }
}

/**
 * Validates that a customer payment has proper GL entries
 */
export async function validatePaymentGLEntries(
  paymentId: string,
  dbPool?: pg.Pool
): Promise<GLValidationResult> {
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
      warnings,
    };
  } catch (error) {
    logger.error('GL validation error', { paymentId, error });
    return {
      isValid: false,
      errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      warnings: [],
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
    isBalanced: new Decimal(difference).abs().lessThan('0.01'),
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
    isBalanced: new Decimal(difference).abs().lessThan('0.01'),
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
export async function checkInventoryReconciliation(
  dbPool?: pg.Pool
): Promise<ReconciliationResult> {
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
    isBalanced: new Decimal(difference).abs().lessThan('0.01'),
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
    checkARReconciliation(pool),
    checkAPReconciliation(pool),
    checkInventoryReconciliation(pool),
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
    paymentsWithoutGL: parseInt(paymentsNoGL.rows[0]?.count || '0'),
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

/**
 * Find and repost missing GL entries for completed transactions.
 * Only reposts transactions that have NO existing GL entry (safe idempotency).
 */
export async function repostMissingGL(dbPool?: pg.Pool): Promise<{
  goodsReceipts: { found: number; reposted: number; errors: string[] };
  supplierPayments: { found: number; reposted: number; errors: string[] };
  sales: { found: number; reposted: number; errors: string[] };
  summary: string;
}> {
  const pool = dbPool || globalPool;

  const grResult = { found: 0, reposted: 0, errors: [] as string[] };
  const spResult = { found: 0, reposted: 0, errors: [] as string[] };
  const saleResult = { found: 0, reposted: 0, errors: [] as string[] };

  // 1. Repost missing Goods Receipt GL entries
  const missingGRs = await pool.query(`
    SELECT gr.id, gr.receipt_number, gr.received_date,
           po.supplier_id,
           s."CompanyName" AS supplier_name,
           COALESCE(SUM(
             CASE WHEN gri.is_bonus THEN 0
                  ELSE COALESCE(gri.received_quantity, 0) * COALESCE(gri.cost_price, 0)
             END
           ), 0) AS total_value
    FROM goods_receipts gr
    LEFT JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
    LEFT JOIN purchase_orders po ON po.id = gr.purchase_order_id
    LEFT JOIN suppliers s ON s."Id" = po.supplier_id
    WHERE gr.status = 'COMPLETED'
      AND NOT EXISTS (
        SELECT 1 FROM ledger_transactions lt
        WHERE lt."ReferenceType" = 'GOODS_RECEIPT'
          AND lt."ReferenceId" = gr.id
      )
    GROUP BY gr.id, gr.receipt_number, gr.received_date, po.supplier_id, s."CompanyName"
    HAVING COALESCE(SUM(
      CASE WHEN gri.is_bonus THEN 0
           ELSE COALESCE(gri.received_quantity, 0) * COALESCE(gri.cost_price, 0)
      END
    ), 0) > 0
  `);

  grResult.found = missingGRs.rows.length;

  for (const gr of missingGRs.rows) {
    try {
      await glEntryService.recordGoodsReceiptToGL({
        grId: gr.id,
        grNumber: gr.receipt_number || gr.id,
        grDate: gr.received_date || new Date().toLocaleDateString('en-CA'),
        totalAmount: parseFloat(gr.total_value),
        supplierId: gr.supplier_id || '',
        supplierName: gr.supplier_name || 'Unknown Supplier',
      }, pool);
      grResult.reposted++;
      logger.info('Reposted missing GR GL entry', { grId: gr.id, grNumber: gr.receipt_number });
    } catch (err) {
      const msg = `GR ${gr.receipt_number}: ${err instanceof Error ? err.message : String(err)}`;
      grResult.errors.push(msg);
      logger.error('Failed to repost GR GL entry', { grId: gr.id, error: msg });
    }
  }

  // 2. Repost missing Supplier Payment GL entries
  const missingSPs = await pool.query(`
    SELECT sp."Id", sp."PaymentNumber", sp."PaymentDate", sp."Amount",
           sp."PaymentMethod", sp."SupplierId",
           s."CompanyName" AS supplier_name
    FROM supplier_payments sp
    LEFT JOIN suppliers s ON s."Id" = sp."SupplierId"
    WHERE sp."Status" = 'COMPLETED'
      AND sp.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM ledger_transactions lt
        WHERE lt."ReferenceType" = 'SUPPLIER_PAYMENT'
          AND lt."ReferenceId" = sp."Id"
      )
  `);

  spResult.found = missingSPs.rows.length;

  for (const sp of missingSPs.rows) {
    try {
      await glEntryService.recordSupplierPaymentToGL({
        paymentId: sp.Id,
        paymentNumber: sp.PaymentNumber || sp.Id,
        paymentDate: sp.PaymentDate || new Date().toLocaleDateString('en-CA'),
        amount: parseFloat(sp.Amount),
        paymentMethod: (sp.PaymentMethod as 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CHECK') || 'CASH',
        supplierId: sp.SupplierId || '',
        supplierName: sp.supplier_name || 'Unknown Supplier',
      }, pool);
      spResult.reposted++;
      logger.info('Reposted missing SP GL entry', { spId: sp.Id, spNumber: sp.PaymentNumber });
    } catch (err) {
      const msg = `SP ${sp.PaymentNumber}: ${err instanceof Error ? err.message : String(err)}`;
      spResult.errors.push(msg);
      logger.error('Failed to repost SP GL entry', { spId: sp.Id, error: msg });
    }
  }

  // 3. Repost missing Sale GL entries
  const missingSales = await pool.query(`
    SELECT s.id, s.sale_number, s.sale_date, s.total_amount, s.total_cost,
           s.payment_method, s.amount_paid, s.tax_amount, s.customer_id
    FROM sales s
    WHERE s.status = 'COMPLETED'
      AND COALESCE(s.total_amount, 0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM ledger_transactions lt
        WHERE lt."ReferenceType" = 'SALE'
          AND lt."ReferenceId" = s.id
      )
    ORDER BY s.sale_date
  `);

  saleResult.found = missingSales.rows.length;

  for (const sale of missingSales.rows) {
    try {
      // Fetch sale items for proper revenue/cost classification
      const itemsResult = await pool.query(`
        SELECT product_type, is_service, total_price, unit_cost, quantity
        FROM sale_items WHERE sale_id = $1
      `, [sale.id]);

      const saleItems = itemsResult.rows.map((item: { product_type: string; is_service: boolean; total_price: string; unit_cost: string; quantity: string }) => ({
        productType: (item.is_service ? 'service' : 'inventory') as 'inventory' | 'service',
        totalPrice: parseFloat(item.total_price) || 0,
        unitCost: parseFloat(item.unit_cost) || 0,
        quantity: parseFloat(item.quantity) || 0,
      }));

      await glEntryService.recordSaleToGL({
        saleId: sale.id,
        saleNumber: sale.sale_number,
        saleDate: sale.sale_date || new Date().toLocaleDateString('en-CA'),
        totalAmount: parseFloat(sale.total_amount) || 0,
        costAmount: parseFloat(sale.total_cost) || 0,
        paymentMethod: (sale.payment_method as 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'CREDIT' | 'DEPOSIT') || 'CASH',
        amountPaid: sale.amount_paid != null ? parseFloat(sale.amount_paid) : undefined,
        taxAmount: sale.tax_amount != null ? parseFloat(sale.tax_amount) : undefined,
        customerId: sale.customer_id || undefined,
        saleItems,
      }, pool);
      saleResult.reposted++;
      logger.info('Reposted missing Sale GL entry', { saleId: sale.id, saleNumber: sale.sale_number });
    } catch (err) {
      const msg = `Sale ${sale.sale_number}: ${err instanceof Error ? err.message : String(err)}`;
      saleResult.errors.push(msg);
      logger.error('Failed to repost Sale GL entry', { saleId: sale.id, error: msg });
    }
  }

  const totalErrors = grResult.errors.length + spResult.errors.length + saleResult.errors.length;
  const summary = `Goods Receipts: ${grResult.reposted}/${grResult.found} reposted. ` +
    `Supplier Payments: ${spResult.reposted}/${spResult.found} reposted. ` +
    `Sales: ${saleResult.reposted}/${saleResult.found} reposted.` +
    (totalErrors > 0 ? ` Errors: ${totalErrors}` : '');

  logger.info('Repost missing GL completed', { summary, grResult, spResult, saleResult });

  return { goodsReceipts: grResult, supplierPayments: spResult, sales: saleResult, summary };
}

export const glValidationService = {
  validateSaleGLEntries,
  validatePaymentGLEntries,
  checkARReconciliation,
  checkAPReconciliation,
  checkInventoryReconciliation,
  runFullIntegrityCheck,
  repostMissingGL,
};
