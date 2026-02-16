import { Pool } from 'pg';
import Decimal from 'decimal.js';
import logger from '../../utils/logger.js';

/**
 * Admin Repository - Database maintenance operations
 * CRITICAL: This handles backup, restore, and transaction clearing
 */

export const adminRepository = {
  /**
   * Clear all transactional data while preserving master data
   * SAFE: Uses transaction with FK-aware deletion order
   */
  async clearAllTransactions(pool: Pool): Promise<{
    deletedRecords: Record<string, number>;
    resetInventory: number;
    resetSequences: string[];
  }> {
    const client = await pool.connect();
    const deletedRecords: Record<string, number> = {};
    const resetSequences: string[] = [];

    try {
      await client.query('BEGIN');

      logger.warn('Starting transaction data clearing - DESTRUCTIVE OPERATION');

      // ========== DELETE TRANSACTIONAL DATA (FK-safe order) ==========
      // Using SAVEPOINT for each deletion to handle missing tables gracefully

      const safeDelete = async (tableName: string, step: number) => {
        try {
          await client.query(`SAVEPOINT sp_${step}`);
          const result = await client.query(
            `DELETE FROM ${tableName} WHERE id IS NOT NULL RETURNING id`
          );
          await client.query(`RELEASE SAVEPOINT sp_${step}`);
          return result.rowCount || 0;
        } catch (error: any) {
          await client.query(`ROLLBACK TO SAVEPOINT sp_${step}`);
          logger.warn(`Table ${tableName} not found or error: ${error.message}`);
          return 0;
        }
      };

      // Helper for TRUNCATE CASCADE (faster for large tables)
      const safeTruncate = async (tableName: string, step: number) => {
        try {
          await client.query(`SAVEPOINT sp_trunc_${step}`);
          const countResult = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`);
          const count = parseInt(countResult.rows[0].count) || 0;
          await client.query(`TRUNCATE TABLE ${tableName} CASCADE`);
          await client.query(`RELEASE SAVEPOINT sp_trunc_${step}`);
          return count;
        } catch (error: any) {
          await client.query(`ROLLBACK TO SAVEPOINT sp_trunc_${step}`);
          logger.warn(`Table ${tableName} truncate skip: ${error.message}`);
          return 0;
        }
      };

      let step = 1;

      // =========================================================================
      // PHASE 0: COMPLETE ACCOUNTING RESET FIRST
      // =========================================================================
      logger.info('Phase 0: Complete accounting system reset...');

      try {
        await client.query(`SAVEPOINT sp_accounting_reset`);
        const accountingResetResult = await client.query(`
          SELECT step_name, records_affected, status 
          FROM fn_reset_accounting_complete()
        `);
        await client.query(`RELEASE SAVEPOINT sp_accounting_reset`);
        deletedRecords.accounting_complete_reset = accountingResetResult.rowCount || 0;
        logger.info('Accounting reset via fn_reset_accounting_complete() completed');
      } catch (error: any) {
        await client.query(`ROLLBACK TO SAVEPOINT sp_accounting_reset`);
        logger.warn(`fn_reset_accounting_complete() failed: ${error.message}, using manual reset`);

        // Fallback: Manual accounting reset
        deletedRecords.ledger_entries = await safeDelete('ledger_entries', step++);
        deletedRecords.ledger_transactions = await safeDelete('ledger_transactions', step++);

        try {
          await client.query('SAVEPOINT sp_reset_account_balances');
          const accountReset = await client.query(`
            UPDATE accounts SET "CurrentBalance" = 0, updated_at = NOW() WHERE id IS NOT NULL
          `);
          deletedRecords.accounts_balance_reset = accountReset.rowCount || 0;
          await client.query('RELEASE SAVEPOINT sp_reset_account_balances');
        } catch {
          deletedRecords.accounts_balance_reset = 0;
        }
      }

      // =========================================================================
      // PHASE 1: REMAINING ACCOUNTING/GL DATA
      // =========================================================================
      logger.info('Phase 1: Clearing remaining accounting data...');

      deletedRecords.journal_entry_lines = await safeDelete('journal_entry_lines', step++);
      deletedRecords.journal_entries = await safeDelete('journal_entries', step++);
      deletedRecords.payment_allocations = await safeDelete('payment_allocations', step++);
      deletedRecords.payment_lines = await safeDelete('payment_lines', step++);
      deletedRecords.payment_transactions = await safeDelete('payment_transactions', step++);
      deletedRecords.financial_periods = await safeDelete('financial_periods', step++);

      // Accounting periods (fiscal period tracking)
      deletedRecords.accounting_period_history = await safeDelete('accounting_period_history', step++);
      deletedRecords.accounting_periods = await safeDelete('accounting_periods', step++);

      // =========================================================================
      // PHASE 2: SALES & CUSTOMER DATA
      // =========================================================================
      logger.info('Phase 2: Clearing sales and customer transactions...');

      // Customer payments and deposits
      deletedRecords.credit_applications = await safeDelete('credit_applications', step++);
      deletedRecords.deposit_applications = await safeDelete('deposit_applications', step++);
      deletedRecords.pos_deposit_applications = await safeDelete('pos_deposit_applications', step++);
      deletedRecords.customer_deposits = await safeDelete('customer_deposits', step++);
      deletedRecords.pos_customer_deposits = await safeDelete('pos_customer_deposits', step++);
      deletedRecords.customer_payments = await safeDelete('customer_payments', step++);
      deletedRecords.customer_credits = await safeDelete('customer_credits', step++);
      deletedRecords.customer_balance_adjustments = await safeDelete('customer_balance_adjustments', step++);
      deletedRecords.customer_accounts = await safeDelete('customer_accounts', step++);
      deletedRecords.customer_ledger = await safeDelete('customer_ledger', step++);

      // Invoices
      deletedRecords.invoice_payments = await safeDelete('invoice_payments', step++);
      deletedRecords.invoice_line_items = await safeDelete('invoice_line_items', step++);
      deletedRecords.invoice_items = await safeDelete('invoice_items', step++);
      deletedRecords.invoices = await safeDelete('invoices', step++);

      // Discounts
      deletedRecords.discount_authorizations = await safeDelete('discount_authorizations', step++);
      deletedRecords.sale_discounts = await safeDelete('sale_discounts', step++);

      // Sales
      deletedRecords.sale_items = await safeDelete('sale_items', step++);
      deletedRecords.sales = await safeDelete('sales', step++);

      // Held orders
      deletedRecords.pos_held_order_items = await safeDelete('pos_held_order_items', step++);
      deletedRecords.pos_held_orders = await safeDelete('pos_held_orders', step++);

      // =========================================================================
      // PHASE 3: SUPPLIER & PURCHASE DATA
      // =========================================================================
      logger.info('Phase 3: Clearing supplier and purchase transactions...');

      deletedRecords.supplier_payment_allocations = await safeTruncate('supplier_payment_allocations', step++);
      deletedRecords.supplier_payments = await safeTruncate('supplier_payments', step++);
      deletedRecords.supplier_invoice_line_items = await safeTruncate('supplier_invoice_line_items', step++);
      deletedRecords.supplier_invoices = await safeTruncate('supplier_invoices', step++);
      deletedRecords.supplier_ledger = await safeDelete('supplier_ledger', step++);

      // Goods receipts
      deletedRecords.goods_receipt_items = await safeTruncate('goods_receipt_items', step++);
      deletedRecords.goods_receipts = await safeTruncate('goods_receipts', step++);

      // Purchase orders
      deletedRecords.purchase_order_items = await safeTruncate('purchase_order_items', step++);
      deletedRecords.purchase_orders = await safeTruncate('purchase_orders', step++);

      // =========================================================================
      // PHASE 4: INVENTORY DATA
      // =========================================================================
      logger.info('Phase 4: Clearing inventory data...');

      deletedRecords.stock_movements = await safeTruncate('stock_movements', step++);
      deletedRecords.stock_adjustments = await safeDelete('stock_adjustments', step++);
      deletedRecords.stock_count_lines = await safeTruncate('stock_count_lines', step++);
      deletedRecords.stock_counts = await safeTruncate('stock_counts', step++);
      deletedRecords.inventory_batches = await safeTruncate('inventory_batches', step++);
      deletedRecords.cost_layers = await safeTruncate('cost_layers', step++);
      deletedRecords.inventory_snapshots = await safeDelete('inventory_snapshots', step++);

      // =========================================================================
      // PHASE 5: DELIVERY & QUOTATIONS
      // =========================================================================
      logger.info('Phase 5: Clearing delivery and quotation data...');

      deletedRecords.delivery_proof = await safeDelete('delivery_proof', step++);
      deletedRecords.delivery_status_history = await safeDelete('delivery_status_history', step++);
      deletedRecords.delivery_items = await safeDelete('delivery_items', step++);
      deletedRecords.route_deliveries = await safeDelete('route_deliveries', step++);
      deletedRecords.delivery_orders = await safeDelete('delivery_orders', step++);
      deletedRecords.delivery_routes = await safeDelete('delivery_routes', step++);

      deletedRecords.quotation_emails = await safeDelete('quotation_emails', step++);
      deletedRecords.quotation_attachments = await safeDelete('quotation_attachments', step++);
      deletedRecords.quotation_status_history = await safeDelete('quotation_status_history', step++);
      deletedRecords.quotation_items = await safeDelete('quotation_items', step++);
      deletedRecords.quotations = await safeDelete('quotations', step++);

      // =========================================================================
      // PHASE 6: EXPENSES & BANKING
      // =========================================================================
      logger.info('Phase 6: Clearing expenses and banking data...');

      deletedRecords.expense_approvals = await safeDelete('expense_approvals', step++);
      deletedRecords.expense_documents = await safeDelete('expense_documents', step++);
      deletedRecords.expenses = await safeDelete('expenses', step++);

      deletedRecords.bank_reconciliation_items = await safeDelete('bank_reconciliation_items', step++);
      deletedRecords.bank_reconciliations = await safeDelete('bank_reconciliations', step++);
      deletedRecords.cash_bank_transfers = await safeDelete('cash_bank_transfers', step++);
      deletedRecords.cash_book_entries = await safeDelete('cash_book_entries', step++);

      // =========================================================================
      // PHASE 7: LOGS & SESSIONS (not audit logs - those are kept for compliance)
      // =========================================================================
      logger.info('Phase 7: Clearing transaction logs and sessions...');

      deletedRecords.report_runs = await safeDelete('report_runs', step++);
      deletedRecords.processed_events = await safeDelete('processed_events', step++);
      deletedRecords.failed_transactions = await safeDelete('failed_transactions', step++);
      deletedRecords.user_sessions = await safeDelete('user_sessions', step++);

      // =========================================================================
      // PHASE 7B: CASH REGISTER DATA (sessions are transactional, registers preserved)
      // =========================================================================
      logger.info('Phase 7B: Clearing cash register sessions and movements...');

      // Cash movements must be deleted first (FK references sessions)
      deletedRecords.cash_movements = await safeDelete('cash_movements', step++);
      // Cash register sessions (transactional data - clear them)
      deletedRecords.cash_register_sessions = await safeDelete('cash_register_sessions', step++);
      // Note: cash_registers table is preserved (physical register configuration)

      // =========================================================================
      // PHASE 8: RECALCULATE ALL BALANCES (Using Database Functions)
      // =========================================================================
      // ARCHITECTURE: Balances are NEVER set directly. Instead, we call the
      // database recalculation functions which derive correct values from the
      // source data (transactions, batches, ledger entries).
      // After deleting all transactions, these functions will calculate 0.
      // This ensures consistency with the single source of truth pattern.
      // =========================================================================

      let resetInventory = 0;

      // Recalculate product stock quantities (derives from inventory_batches)
      try {
        await client.query('SAVEPOINT sp_recalc_inventory');
        const invResult = await client.query(`
          SELECT COUNT(*) FILTER (WHERE status = 'UPDATED') as updated_count
          FROM fn_recalculate_all_product_stock()
        `);
        resetInventory = parseInt(invResult.rows[0]?.updated_count || '0');
        await client.query('RELEASE SAVEPOINT sp_recalc_inventory');
        logger.info(`Recalculated ${resetInventory} product quantities`);
      } catch (error: any) {
        await client.query('ROLLBACK TO SAVEPOINT sp_recalc_inventory');
        logger.warn(`Product stock recalculation skipped: ${error.message}`);
        // Fallback: Direct reset if function doesn't exist
        try {
          await client.query('SAVEPOINT sp_reset_inventory_fallback');
          const inventoryReset = await client.query(`
            UPDATE products 
            SET quantity_on_hand = 0,
                updated_at = NOW()
            WHERE id IS NOT NULL
          `);
          resetInventory = inventoryReset.rowCount || 0;
          await client.query('RELEASE SAVEPOINT sp_reset_inventory_fallback');
          logger.warn('Used fallback direct reset for product quantities');
        } catch {
          resetInventory = 0;
        }
      }

      // Recalculate customer balances (derives from sales + customer_payments)
      try {
        await client.query('SAVEPOINT sp_recalc_customers');
        const custResult = await client.query(`
          SELECT COUNT(*) FILTER (WHERE status = 'UPDATED') as updated_count
          FROM fn_recalculate_all_customer_balances()
        `);
        const customerCount = parseInt(custResult.rows[0]?.updated_count || '0');
        await client.query('RELEASE SAVEPOINT sp_recalc_customers');
        logger.info(`Recalculated ${customerCount} customer balances`);
      } catch (error: any) {
        await client.query('ROLLBACK TO SAVEPOINT sp_recalc_customers');
        logger.warn(`Customer balance recalculation skipped: ${error.message}`);
        // Fallback: Direct reset if function doesn't exist
        try {
          await client.query('SAVEPOINT sp_reset_customers_fallback');
          await client.query(`
            UPDATE customers 
            SET balance = 0, updated_at = NOW()
            WHERE id IS NOT NULL
          `);
          await client.query('RELEASE SAVEPOINT sp_reset_customers_fallback');
          logger.warn('Used fallback direct reset for customer balances');
        } catch (error) {
          logger.warn('Balance reset fallback failed', { error: (error as Error).message });
        }
      }

      // Recalculate supplier balances (derives from goods_receipts + supplier_payments)
      try {
        await client.query('SAVEPOINT sp_recalc_suppliers');
        const suppResult = await client.query(`
          SELECT COUNT(*) FILTER (WHERE status = 'UPDATED') as updated_count
          FROM fn_recalculate_all_supplier_balances()
        `);
        const supplierCount = parseInt(suppResult.rows[0]?.updated_count || '0');
        await client.query('RELEASE SAVEPOINT sp_recalc_suppliers');
        logger.info(`Recalculated ${supplierCount} supplier balances`);
      } catch (error: any) {
        await client.query('ROLLBACK TO SAVEPOINT sp_recalc_suppliers');
        logger.warn(`Supplier balance recalculation skipped: ${error.message}`);
        // Fallback: Direct reset if function doesn't exist (correct column name)
        try {
          await client.query('SAVEPOINT sp_reset_suppliers_fallback');
          await client.query(`
            UPDATE suppliers 
            SET "OutstandingBalance" = 0, "UpdatedAt" = NOW()
            WHERE "Id" IS NOT NULL
          `);
          await client.query('RELEASE SAVEPOINT sp_reset_suppliers_fallback');
          logger.warn('Used fallback direct reset for supplier balances');
        } catch (error) {
          logger.warn('Balance reset fallback failed', { error: (error as Error).message });
        }
      }

      // ========== VERIFY POST-RESET INTEGRITY ==========
      try {
        await client.query('SAVEPOINT sp_verify_integrity');
        const verifyResult = await client.query(`
          SELECT check_name, status, details
          FROM fn_verify_post_reset_integrity()
          WHERE status = 'FAIL'
        `);
        await client.query('RELEASE SAVEPOINT sp_verify_integrity');

        if (verifyResult.rows.length > 0) {
          const failures = verifyResult.rows.map((r: { check_name: string; details: string }) =>
            `${r.check_name}: ${r.details}`
          ).join('; ');
          logger.warn(`Post-reset integrity issues detected: ${failures}`);
        } else {
          logger.info('Post-reset integrity verification passed');
        }
      } catch (error: any) {
        await client.query('ROLLBACK TO SAVEPOINT sp_verify_integrity');
        logger.warn(`Post-reset verification skipped: ${error.message}`);
      }

      // ========== RESET SEQUENCES ==========
      // Reset auto-increment sequences to start from 1

      // Sales sequences (no sequences - using UUID, skip)
      // But if you have numeric sequences, add them here:

      // Example for numeric IDs (uncomment if your schema uses these):
      /*
      await client.query('ALTER SEQUENCE sales_id_seq RESTART WITH 1');
      resetSequences.push('sales_id_seq');
      
      await client.query('ALTER SEQUENCE invoices_id_seq RESTART WITH 1');
      resetSequences.push('invoices_id_seq');
      
      await client.query('ALTER SEQUENCE purchase_orders_id_seq RESTART WITH 1');
      resetSequences.push('purchase_orders_id_seq');
      */

      await client.query('COMMIT');

      logger.warn('Transaction data cleared successfully', {
        deletedRecords,
        resetInventory,
        resetSequences,
      });

      return {
        deletedRecords,
        resetInventory,
        resetSequences,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to clear transaction data', { error });
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Get database statistics for backup/restore operations
   */
  async getDatabaseStats(pool: Pool): Promise<{
    masterData: Record<string, number>;
    transactionalData: Record<string, number>;
    accountingData: Record<string, number>;
    databaseSize: string;
  }> {
    const masterData: Record<string, number> = {};
    const transactionalData: Record<string, number> = {};
    const accountingData: Record<string, number> = {};

    // Master data counts (NEVER cleared)
    const masterTables = [
      'customers',
      'suppliers',
      'products',
      'product_categories',
      'uoms',
      'product_uoms',
      'customer_groups',
      'users',
      'accounts',
      'expense_categories',
      'bank_accounts',
      // Cash register configuration (kept on reset)
      'cash_registers',
    ];

    for (const table of masterTables) {
      try {
        const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        masterData[table] = parseInt(result.rows[0].count);
      } catch (error) {
        masterData[table] = 0;
      }
    }

    // Transactional data counts (can be cleared)
    const transactionalTables = [
      // Sales & POS
      'sales', 'sale_items', 'sale_discounts',
      'pos_held_orders', 'pos_held_order_items',
      'pos_customer_deposits', 'pos_deposit_applications',
      'discount_authorizations',

      // Invoices & Payments
      'invoices', 'invoice_line_items', 'invoice_payments',
      'customer_payments', 'customer_deposits', 'deposit_applications',
      'credit_applications', 'customer_credits', 'customer_balance_adjustments',
      'customer_accounts', 'payment_transactions',

      // Purchase Orders & Receiving
      'purchase_orders', 'purchase_order_items',
      'goods_receipts', 'goods_receipt_items',

      // Inventory
      'inventory_batches', 'inventory_snapshots', 'stock_movements', 'cost_layers',
      'stock_counts', 'stock_count_lines',

      // Suppliers
      'supplier_invoices', 'supplier_invoice_line_items',
      'supplier_payments', 'supplier_payment_allocations',

      // Quotations
      'quotations', 'quotation_items', 'quotation_attachments',
      'quotation_emails', 'quotation_status_history',

      // Delivery
      'delivery_orders', 'delivery_items', 'delivery_routes',
      'delivery_proof', 'delivery_status_history', 'route_deliveries',

      // Expenses & Banking
      'expenses', 'expense_approvals', 'expense_documents',
      'bank_reconciliations', 'bank_reconciliation_items',
      'cash_bank_transfers', 'cash_book_entries',

      // Financial periods
      'financial_periods',

      // Logs & Sessions
      'report_runs', 'processed_events', 'failed_transactions', 'user_sessions',

      // Cash Register (sessions and movements are transactional)
      'cash_register_sessions', 'cash_movements',
    ];

    for (const table of transactionalTables) {
      try {
        const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        transactionalData[table] = parseInt(result.rows[0].count);
      } catch (error) {
        transactionalData[table] = 0;
      }
    }

    // Accounting data counts
    const accountingTables = [
      'ledger_entries',
      'ledger_transactions',
      'journal_entries',
      'journal_entry_lines',
      'payment_allocations',
      'payment_lines',
      'accounting_periods',
      'accounting_period_history',
    ];

    for (const table of accountingTables) {
      try {
        const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        accountingData[table] = parseInt(result.rows[0].count);
      } catch (error) {
        accountingData[table] = 0;
      }
    }

    // Get database size
    const sizeResult = await pool.query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size
    `);
    const databaseSize = sizeResult.rows[0]?.size || 'Unknown';

    return {
      masterData,
      transactionalData,
      accountingData,
      databaseSize,
    };
  },

  /**
   * Export master data to JSON (for portable backups)
   */
  async exportMasterDataToJSON(pool: Pool): Promise<{
    customers: any[];
    suppliers: any[];
    products: any[];
    categories: any[];
    uoms: any[];
  }> {
    const customers = await pool.query('SELECT * FROM customers ORDER BY id');
    const suppliers = await pool.query('SELECT * FROM suppliers ORDER BY id');
    const products = await pool.query('SELECT * FROM products ORDER BY id');
    const categories = await pool.query(
      'SELECT * FROM product_categories ORDER BY id'
    ).catch(() => ({ rows: [] }));
    const uoms = await pool.query('SELECT * FROM uoms ORDER BY id');

    return {
      customers: customers.rows,
      suppliers: suppliers.rows,
      products: products.rows,
      categories: categories.rows,
      uoms: uoms.rows,
    };
  },

  /**
   * Validate database integrity after operations
   */
  async validateDatabaseIntegrity(pool: Pool): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      // Check for orphaned sale_items
      const orphanedSaleItems = await pool.query(`
        SELECT COUNT(*) as count 
        FROM sale_items si 
        LEFT JOIN sales s ON s.id = si.sale_id 
        WHERE s.id IS NULL
      `);
      if (parseInt(orphanedSaleItems.rows[0].count) > 0) {
        issues.push(
          `Found ${orphanedSaleItems.rows[0].count} orphaned sale_items`
        );
      }

      // Check for negative inventory
      const negativeInventory = await pool.query(`
        SELECT COUNT(*) as count 
        FROM products 
        WHERE quantity_on_hand < 0
      `);
      if (parseInt(negativeInventory.rows[0].count) > 0) {
        issues.push(
          `Found ${negativeInventory.rows[0].count} products with negative inventory`
        );
      }

      // Check for orphaned cost layers
      const orphanedCostLayers = await pool.query(`
        SELECT COUNT(*) as count 
        FROM cost_layers cl 
        LEFT JOIN products p ON p.id = cl.product_id 
        WHERE p.id IS NULL
      `);
      if (parseInt(orphanedCostLayers.rows[0].count) > 0) {
        issues.push(
          `Found ${orphanedCostLayers.rows[0].count} orphaned cost_layers`
        );
      }

      return {
        valid: issues.length === 0,
        issues,
      };
    } catch (error) {
      logger.error('Database integrity check failed', { error });
      return {
        valid: false,
        issues: ['Database integrity check failed: ' + (error as Error).message],
      };
    }
  },
};
