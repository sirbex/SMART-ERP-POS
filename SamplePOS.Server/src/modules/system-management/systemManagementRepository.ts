import { Pool, PoolClient } from 'pg';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import Decimal from 'decimal.js';
import logger from '../../utils/logger.js';

const execAsync = promisify(exec);

// ============================================================================
// INTERFACES
// ============================================================================

export interface BackupRecord {
    id: string;
    backupNumber: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    checksum: string | null;
    backupType: 'FULL' | 'INCREMENTAL' | 'MASTER_DATA_ONLY';
    status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'VERIFIED';
    reason: string | null;
    createdBy: string | null;
    createdByName: string | null;
    createdAt: Date;
    isVerified: boolean;
    statsSnapshot: Record<string, unknown> | null;
}

interface BackupRecordDbRow {
    id: string;
    backup_number: string;
    file_name: string;
    file_path: string;
    file_size: string;
    checksum: string | null;
    backup_type: string;
    status: string;
    reason: string | null;
    created_by: string | null;
    created_by_name: string | null;
    created_at: string;
    is_verified: boolean;
    stats_snapshot: Record<string, unknown> | null;
}

export interface ResetResult {
    success: boolean;
    resetNumber: string;
    backupNumber: string;
    tablesCleared: Record<string, number>;
    totalRecordsDeleted: number;
    balancesReset: {
        customers: number;
        suppliers: number;
        inventory: number;
        accounts: number;
    };
    duration: number;
}

export interface RestoreResult {
    success: boolean;
    backupNumber: string;
    restoredAt: Date;
    tablesRestored: number;
    integrityCheck: {
        valid: boolean;
        issues: string[];
    };
}

export interface DatabaseStats {
    masterData: Record<string, number>;
    transactionalData: Record<string, number>;
    accountingData: Record<string, number>;
    databaseSize: string;
    lastBackup: BackupRecord | null;
    lastReset: Date | null;
}

// ============================================================================
// SYSTEM MANAGEMENT REPOSITORY
// ============================================================================

export const systemManagementRepository = {
    // ==========================================================================
    // MAINTENANCE MODE
    // ==========================================================================

    async enableMaintenanceMode(
        pool: Pool,
        reason: string,
        operationType: string,
        userId: string
    ): Promise<void> {
        await pool.query(`
      UPDATE system_maintenance_mode
      SET is_active = TRUE,
          reason = $1,
          operation_type = $2,
          started_at = NOW(),
          started_by = $3,
          ended_at = NULL,
          ended_by = NULL
      WHERE id = '00000000-0000-0000-0000-000000000001'
    `, [reason, operationType, userId]);

        logger.warn('Maintenance mode ENABLED', { reason, operationType, userId });
    },

    async disableMaintenanceMode(pool: Pool, userId: string): Promise<void> {
        await pool.query(`
      UPDATE system_maintenance_mode
      SET is_active = FALSE,
          ended_at = NOW(),
          ended_by = $1
      WHERE id = '00000000-0000-0000-0000-000000000001'
    `, [userId]);

        logger.info('Maintenance mode DISABLED', { userId });
    },

    async isMaintenanceMode(pool: Pool): Promise<boolean> {
        const result = await pool.query(`
      SELECT is_active FROM system_maintenance_mode
      WHERE id = '00000000-0000-0000-0000-000000000001'
    `);
        return result.rows[0]?.is_active || false;
    },

    // ==========================================================================
    // BACKUP OPERATIONS
    // ==========================================================================

    async createBackupRecord(
        pool: Pool,
        data: {
            fileName: string;
            filePath: string;
            fileSize: number;
            checksum: string | null;
            backupType: string;
            reason: string;
            userId: string;
            userName: string;
            statsSnapshot: Record<string, unknown>;
        }
    ): Promise<BackupRecord> {
        const result = await pool.query(`
      INSERT INTO system_backups (
        backup_number, file_name, file_path, file_size, checksum,
        backup_type, status, reason, created_by, created_by_name,
        stats_snapshot
      )
      VALUES (
        generate_backup_number(), $1, $2, $3, $4,
        $5, 'COMPLETED', $6, $7, $8,
        $9
      )
      RETURNING *
    `, [
            data.fileName,
            data.filePath,
            data.fileSize,
            data.checksum,
            data.backupType,
            data.reason,
            data.userId,
            data.userName,
            JSON.stringify(data.statsSnapshot)
        ]);

        return this.mapBackupRow(result.rows[0]);
    },

    async getBackupById(pool: Pool, id: string): Promise<BackupRecord | null> {
        // Use parameterized query without prepared statement name
        const result = await pool.query(
            'SELECT * FROM system_backups WHERE id = $1::uuid AND is_deleted = FALSE',
            [id]
        );

        return result.rows[0] ? this.mapBackupRow(result.rows[0]) : null;
    },

    async getBackupByNumber(pool: Pool, backupNumber: string): Promise<BackupRecord | null> {
        const result = await pool.query(
            'SELECT * FROM system_backups WHERE backup_number = $1::text AND is_deleted = FALSE',
            [backupNumber]
        );

        return result.rows[0] ? this.mapBackupRow(result.rows[0]) : null;
    },

    async listBackups(pool: Pool, limit: number = 50): Promise<BackupRecord[]> {
        const result = await pool.query(`
      SELECT * FROM system_backups
      WHERE is_deleted = FALSE
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

        return result.rows.map(row => this.mapBackupRow(row));
    },

    async updateBackupStatus(
        pool: Pool,
        id: string,
        status: string,
        checksum?: string
    ): Promise<void> {
        await pool.query(`
      UPDATE system_backups
      SET status = $1::varchar,
          checksum = COALESCE($2::varchar, checksum),
          verified_at = CASE WHEN $1::varchar = 'VERIFIED' THEN NOW() ELSE verified_at END,
          is_verified = CASE WHEN $1::varchar = 'VERIFIED' THEN TRUE ELSE is_verified END
      WHERE id = $3::uuid
    `, [status, checksum || null, id]);
    },

    async incrementRestoreCount(pool: Pool, id: string, userId: string): Promise<void> {
        await pool.query(`
      UPDATE system_backups
      SET restore_count = restore_count + 1,
          last_restored_at = NOW(),
          last_restored_by = $1::uuid
      WHERE id = $2::uuid
    `, [userId, id]);
    },

    async softDeleteBackup(pool: Pool, id: string, userId: string): Promise<void> {
        await pool.query(`
      UPDATE system_backups
      SET is_deleted = TRUE,
          deleted_at = NOW(),
          deleted_by = $1::uuid
      WHERE id = $2::uuid
    `, [userId, id]);
    },

    mapBackupRow(row: BackupRecordDbRow): BackupRecord {
        return {
            id: row.id,
            backupNumber: row.backup_number,
            fileName: row.file_name,
            filePath: row.file_path,
            fileSize: parseInt(row.file_size) || 0,
            checksum: row.checksum,
            backupType: row.backup_type as BackupRecord['backupType'],
            status: row.status as BackupRecord['status'],
            reason: row.reason,
            createdBy: row.created_by,
            createdByName: row.created_by_name,
            createdAt: new Date(row.created_at),
            isVerified: row.is_verified,
            statsSnapshot: row.stats_snapshot
        };
    },

    // ==========================================================================
    // RESET LOG OPERATIONS
    // ==========================================================================

    async createResetLog(
        pool: Pool,
        data: {
            resetType: string;
            backupId: string;
            backupNumber: string;
            userId: string;
            userName: string;
            confirmationPhrase: string;
            reason: string;
            ipAddress?: string;
            userAgent?: string;
        }
    ): Promise<string> {
        const result = await pool.query(`
      INSERT INTO system_reset_log (
        reset_number, reset_type, backup_id, backup_number,
        authorized_by, authorized_by_name, confirmation_phrase,
        reason, ip_address, user_agent, status
      )
      VALUES (
        generate_reset_number(), $1, $2, $3,
        $4, $5, $6,
        $7, $8, $9, 'IN_PROGRESS'
      )
      RETURNING id, reset_number
    `, [
            data.resetType,
            data.backupId,
            data.backupNumber,
            data.userId,
            data.userName,
            data.confirmationPhrase,
            data.reason,
            data.ipAddress,
            data.userAgent
        ]);

        return result.rows[0].reset_number;
    },

    async completeResetLog(
        pool: Pool,
        resetNumber: string,
        tablesCleared: Record<string, number>,
        balancesReset: Record<string, number>
    ): Promise<void> {
        const recordsDeleted = Object.values(tablesCleared).reduce((a, b) => a + b, 0);

        await pool.query(`
      UPDATE system_reset_log
      SET status = 'COMPLETED',
          completed_at = NOW(),
          tables_cleared = $1,
          records_deleted = $2,
          balances_reset = $3
      WHERE reset_number = $4
    `, [
            JSON.stringify(tablesCleared),
            recordsDeleted,
            JSON.stringify(balancesReset),
            resetNumber
        ]);
    },

    async failResetLog(
        pool: Pool,
        resetNumber: string,
        errorMessage: string,
        rollbackReason?: string
    ): Promise<void> {
        await pool.query(`
      UPDATE system_reset_log
      SET status = $1,
          completed_at = NOW(),
          error_message = $2,
          rollback_reason = $3
      WHERE reset_number = $4
    `, [
            rollbackReason ? 'ROLLED_BACK' : 'FAILED',
            errorMessage,
            rollbackReason,
            resetNumber
        ]);
    },

    // ==========================================================================
    // DATABASE STATISTICS
    // ==========================================================================

    async getDatabaseStats(pool: Pool): Promise<DatabaseStats> {
        const masterData: Record<string, number> = {};
        const transactionalData: Record<string, number> = {};
        const accountingData: Record<string, number> = {};

        // Master data tables (NEVER cleared)
        const masterTables = [
            'customers', 'suppliers', 'products', 'users',
            'uoms', 'product_uoms', 'customer_groups', 'accounts',
            'expense_categories', 'bank_accounts',
            // Banking master data (configuration - kept on reset)
            'bank_categories', 'bank_patterns', 'bank_recurring_rules', 'bank_templates',
            // Cash register configuration (kept on reset - only sessions/movements cleared)
            'cash_registers'
        ];

        for (const table of masterTables) {
            try {
                const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
                masterData[table] = parseInt(result.rows[0].count);
            } catch {
                masterData[table] = 0;
            }
        }

        // Transactional data tables (can be cleared)
        const txnTables = [
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
            // New banking module tables (transactional data)
            'bank_transactions', 'bank_statement_lines', 'bank_statements',
            'bank_alerts', 'bank_transaction_patterns',

            // Accounting
            'financial_periods',

            // Logs & Sessions
            'report_runs', 'processed_events', 'failed_transactions', 'user_sessions',

            // Cash Register (sessions and movements are transactional)
            'cash_register_sessions', 'cash_movements'
        ];

        for (const table of txnTables) {
            try {
                const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
                transactionalData[table] = parseInt(result.rows[0].count);
            } catch {
                transactionalData[table] = 0;
            }
        }

        // Accounting data tables
        const acctTables = [
            'ledger_transactions', 'ledger_entries',
            'journal_entries', 'journal_entry_lines',
            'manual_journal_entries', 'manual_journal_entry_lines',
            'payment_allocations', 'payment_lines',
            'accounting_periods', 'accounting_period_history'
        ];

        // Also count master data config tables (KEPT but shown separately)
        const configTables = [
            'discount_rules', 'discounts', 'pricing_tiers', 'approval_limits',
            'invoice_settings', 'system_settings'
        ];

        for (const table of acctTables) {
            try {
                const result = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
                accountingData[table] = parseInt(result.rows[0].count);
            } catch {
                accountingData[table] = 0;
            }
        }

        // Database size
        const sizeResult = await pool.query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size
    `);

        // Last backup - include both COMPLETED and VERIFIED status
        const lastBackupResult = await pool.query(`
      SELECT * FROM system_backups
      WHERE is_deleted = FALSE AND status IN ('COMPLETED', 'VERIFIED')
      ORDER BY created_at DESC LIMIT 1
    `);

        // Last reset
        const lastResetResult = await pool.query(`
      SELECT started_at FROM system_reset_log
      WHERE status = 'COMPLETED'
      ORDER BY started_at DESC LIMIT 1
    `);

        return {
            masterData,
            transactionalData,
            accountingData,
            databaseSize: sizeResult.rows[0]?.size || 'Unknown',
            lastBackup: lastBackupResult.rows[0]
                ? this.mapBackupRow(lastBackupResult.rows[0])
                : null,
            lastReset: lastResetResult.rows[0]?.started_at
                ? new Date(lastResetResult.rows[0].started_at)
                : null
        };
    },

    // ==========================================================================
    // TRANSACTIONAL DATA CLEARING (ERP RESET)
    // ==========================================================================

    async clearAllTransactionalData(
        client: PoolClient
    ): Promise<{ tablesCleared: Record<string, number>; balancesReset: Record<string, number> }> {
        const tablesCleared: Record<string, number> = {};
        const balancesReset: Record<string, number> = {};

        // Helper function for safe deletion with savepoint
        const safeDelete = async (tableName: string, stepNum: number): Promise<number> => {
            try {
                await client.query(`SAVEPOINT sp_delete_${stepNum}`);
                const result = await client.query(`DELETE FROM ${tableName}`);
                await client.query(`RELEASE SAVEPOINT sp_delete_${stepNum}`);
                return result.rowCount || 0;
            } catch (error: unknown) {
                await client.query(`ROLLBACK TO SAVEPOINT sp_delete_${stepNum}`);
                logger.warn(`Table ${tableName} skip: ${(error instanceof Error ? error.message : String(error))}`);
                return 0;
            }
        };

        // Helper function for safe truncate (faster for large tables)
        const safeTruncate = async (tableName: string, stepNum: number): Promise<number> => {
            try {
                await client.query(`SAVEPOINT sp_trunc_${stepNum}`);
                // Get count first
                const countResult = await client.query(`SELECT COUNT(*) as count FROM ${tableName}`);
                const count = parseInt(countResult.rows[0].count) || 0;
                // Truncate with cascade
                await client.query(`TRUNCATE TABLE ${tableName} CASCADE`);
                await client.query(`RELEASE SAVEPOINT sp_trunc_${stepNum}`);
                return count;
            } catch (error: unknown) {
                await client.query(`ROLLBACK TO SAVEPOINT sp_trunc_${stepNum}`);
                logger.warn(`Table ${tableName} truncate skip: ${(error instanceof Error ? error.message : String(error))}`);
                return 0;
            }
        };

        let step = 1;

        // =========================================================================
        // PRE-PHASE: Clear FK references that would block accounting reset
        // Several tables have FK to ledger_transactions, must clear before Phase 0
        // =========================================================================
        logger.info('Pre-Phase: Clearing cross-module FK references to ledger_transactions...');

        // Clear bank_transactions GL references
        try {
            await client.query(`SAVEPOINT sp_clear_bank_gl_refs`);
            const bankGlClearResult = await client.query(`
                UPDATE bank_transactions 
                SET gl_transaction_id = NULL
                WHERE gl_transaction_id IS NOT NULL
            `);
            tablesCleared['bank_transactions_gl_refs_cleared'] = bankGlClearResult.rowCount || 0;
            await client.query(`RELEASE SAVEPOINT sp_clear_bank_gl_refs`);
            logger.info(`Cleared ${tablesCleared['bank_transactions_gl_refs_cleared']} GL refs from bank_transactions`);
        } catch (error: unknown) {
            await client.query(`ROLLBACK TO SAVEPOINT sp_clear_bank_gl_refs`);
            logger.warn(`Clear bank_transactions GL refs skipped: ${(error instanceof Error ? error.message : String(error))}`);
            tablesCleared['bank_transactions_gl_refs_cleared'] = 0;
        }

        // Clear customer_credits LedgerTransactionId references
        try {
            await client.query(`SAVEPOINT sp_clear_credits_gl_refs`);
            const creditsClearResult = await client.query(`
                UPDATE customer_credits 
                SET "LedgerTransactionId" = NULL
                WHERE "LedgerTransactionId" IS NOT NULL
            `);
            tablesCleared['customer_credits_gl_refs_cleared'] = creditsClearResult.rowCount || 0;
            await client.query(`RELEASE SAVEPOINT sp_clear_credits_gl_refs`);
        } catch (error: unknown) {
            await client.query(`ROLLBACK TO SAVEPOINT sp_clear_credits_gl_refs`);
            tablesCleared['customer_credits_gl_refs_cleared'] = 0;
        }

        // Clear customer_deposits LedgerTransactionId references
        try {
            await client.query(`SAVEPOINT sp_clear_deposits_gl_refs`);
            const depositsClearResult = await client.query(`
                UPDATE customer_deposits 
                SET "LedgerTransactionId" = NULL
                WHERE "LedgerTransactionId" IS NOT NULL
            `);
            tablesCleared['customer_deposits_gl_refs_cleared'] = depositsClearResult.rowCount || 0;
            await client.query(`RELEASE SAVEPOINT sp_clear_deposits_gl_refs`);
        } catch (error: unknown) {
            await client.query(`ROLLBACK TO SAVEPOINT sp_clear_deposits_gl_refs`);
            tablesCleared['customer_deposits_gl_refs_cleared'] = 0;
        }

        // Clear credit_applications LedgerTransactionId references
        try {
            await client.query(`SAVEPOINT sp_clear_credit_apps_gl_refs`);
            const creditAppsClearResult = await client.query(`
                UPDATE credit_applications 
                SET "LedgerTransactionId" = NULL
                WHERE "LedgerTransactionId" IS NOT NULL
            `);
            tablesCleared['credit_applications_gl_refs_cleared'] = creditAppsClearResult.rowCount || 0;
            await client.query(`RELEASE SAVEPOINT sp_clear_credit_apps_gl_refs`);
        } catch (error: unknown) {
            await client.query(`ROLLBACK TO SAVEPOINT sp_clear_credit_apps_gl_refs`);
            tablesCleared['credit_applications_gl_refs_cleared'] = 0;
        }

        // Clear deposit_applications LedgerTransactionId references
        try {
            await client.query(`SAVEPOINT sp_clear_deposit_apps_gl_refs`);
            const depositAppsClearResult = await client.query(`
                UPDATE deposit_applications 
                SET "LedgerTransactionId" = NULL
                WHERE "LedgerTransactionId" IS NOT NULL
            `);
            tablesCleared['deposit_applications_gl_refs_cleared'] = depositAppsClearResult.rowCount || 0;
            await client.query(`RELEASE SAVEPOINT sp_clear_deposit_apps_gl_refs`);
        } catch (error: unknown) {
            await client.query(`ROLLBACK TO SAVEPOINT sp_clear_deposit_apps_gl_refs`);
            tablesCleared['deposit_applications_gl_refs_cleared'] = 0;
        }

        logger.info('Pre-Phase complete: All GL references cleared');

        // =========================================================================
        // PHASE 0: COMPLETE ACCOUNTING RESET FIRST
        // This uses the dedicated fn_reset_accounting_complete() function which
        // ensures ALL ledger entries, transactions, and account balances are
        // properly cleared and reset to 0 BEFORE any other operations
        // =========================================================================
        logger.info('Phase 0: Complete accounting system reset...');

        try {
            await client.query(`SAVEPOINT sp_accounting_reset`);
            const accountingResetResult = await client.query(`
                SELECT step_name, records_affected, status 
                FROM fn_reset_accounting_complete()
            `);
            await client.query(`RELEASE SAVEPOINT sp_accounting_reset`);

            for (const row of accountingResetResult.rows) {
                if (row.step_name === 'accounts_balance_reset') {
                    balancesReset['accounts_complete_reset'] = row.records_affected;
                }
                logger.info(`Accounting reset: ${row.step_name} - ${row.records_affected} records - ${row.status}`);
            }
            tablesCleared['accounting_complete_reset'] = accountingResetResult.rowCount || 0;
        } catch (error: unknown) {
            await client.query(`ROLLBACK TO SAVEPOINT sp_accounting_reset`);
            logger.warn(`Complete accounting reset function failed: ${(error instanceof Error ? error.message : String(error))}, falling back to manual reset`);

            // Fallback: Manual accounting reset
            try {
                await client.query(`DELETE FROM ledger_entries`);
                await client.query(`DELETE FROM ledger_transactions`);
                await client.query(`UPDATE accounts SET "CurrentBalance" = 0`);
                tablesCleared['accounting_manual_reset'] = 1;
                logger.info('Fallback accounting reset completed');
            } catch (fallbackError: unknown) {
                logger.error(`Fallback accounting reset also failed: ${(fallbackError instanceof Error ? fallbackError.message : String(fallbackError))}`);
            }
        }

        // =========================================================================
        // PHASE 1: REMAINING ACCOUNTING/GL DATA (use safeDelete for remaining tables)
        // =========================================================================
        logger.info('Phase 1: Clearing remaining accounting data...');

        // ledger_entries, ledger_transactions, and account balances already cleared in Phase 0
        tablesCleared['journal_entry_lines'] = await safeDelete('journal_entry_lines', step++);
        tablesCleared['journal_entries'] = await safeDelete('journal_entries', step++);

        // Manual journal entries (clear self-referential FK first)
        try {
            await client.query(`SAVEPOINT sp_clear_manual_journal_refs`);
            await client.query(`
                UPDATE manual_journal_entries 
                SET reversed_by_entry_id = NULL
                WHERE reversed_by_entry_id IS NOT NULL
            `);
            await client.query(`RELEASE SAVEPOINT sp_clear_manual_journal_refs`);
        } catch (error: unknown) {
            await client.query(`ROLLBACK TO SAVEPOINT sp_clear_manual_journal_refs`);
            logger.warn(`Clear manual_journal_entries self-refs skipped: ${(error instanceof Error ? error.message : String(error))}`);
        }
        tablesCleared['manual_journal_entry_lines'] = await safeDelete('manual_journal_entry_lines', step++);
        tablesCleared['manual_journal_entries'] = await safeDelete('manual_journal_entries', step++);

        tablesCleared['payment_allocations'] = await safeDelete('payment_allocations', step++);
        tablesCleared['payment_lines'] = await safeDelete('payment_lines', step++);
        tablesCleared['payment_transactions'] = await safeDelete('payment_transactions', step++);
        tablesCleared['financial_periods'] = await safeDelete('financial_periods', step++);

        // Accounting periods (fiscal period tracking)
        tablesCleared['accounting_period_history'] = await safeDelete('accounting_period_history', step++);
        tablesCleared['accounting_periods'] = await safeDelete('accounting_periods', step++);

        // =========================================================================
        // PHASE 2: SALES & CUSTOMER DATA
        // =========================================================================
        logger.info('Phase 2: Clearing sales and customer transactions...');

        // Customer payments and deposits
        tablesCleared['credit_applications'] = await safeDelete('credit_applications', step++);
        tablesCleared['deposit_applications'] = await safeDelete('deposit_applications', step++);
        tablesCleared['pos_deposit_applications'] = await safeDelete('pos_deposit_applications', step++);
        tablesCleared['customer_deposits'] = await safeDelete('customer_deposits', step++);
        tablesCleared['pos_customer_deposits'] = await safeDelete('pos_customer_deposits', step++);
        tablesCleared['customer_payments'] = await safeDelete('customer_payments', step++);
        tablesCleared['customer_credits'] = await safeDelete('customer_credits', step++);
        tablesCleared['customer_balance_adjustments'] = await safeDelete('customer_balance_adjustments', step++);
        tablesCleared['customer_accounts'] = await safeDelete('customer_accounts', step++);

        // Invoices
        tablesCleared['invoice_payments'] = await safeDelete('invoice_payments', step++);
        tablesCleared['invoice_line_items'] = await safeDelete('invoice_line_items', step++);
        tablesCleared['invoices'] = await safeDelete('invoices', step++);

        // Discounts
        tablesCleared['discount_authorizations'] = await safeDelete('discount_authorizations', step++);

        // Sales
        tablesCleared['sale_discounts'] = await safeDelete('sale_discounts', step++);
        tablesCleared['sale_items'] = await safeDelete('sale_items', step++);
        tablesCleared['sales'] = await safeDelete('sales', step++);

        // Held orders
        tablesCleared['pos_held_order_items'] = await safeDelete('pos_held_order_items', step++);
        tablesCleared['pos_held_orders'] = await safeDelete('pos_held_orders', step++);

        // =========================================================================
        // PHASE 3: SUPPLIER & PURCHASE DATA (Use TRUNCATE CASCADE for reliability)
        // =========================================================================
        logger.info('Phase 3: Clearing supplier and purchase transactions...');

        tablesCleared['supplier_payment_allocations'] = await safeTruncate('supplier_payment_allocations', step++);
        tablesCleared['supplier_payments'] = await safeTruncate('supplier_payments', step++);
        tablesCleared['supplier_invoice_line_items'] = await safeTruncate('supplier_invoice_line_items', step++);
        tablesCleared['supplier_invoices'] = await safeTruncate('supplier_invoices', step++);

        // Goods receipts - Use TRUNCATE CASCADE
        tablesCleared['goods_receipt_items'] = await safeTruncate('goods_receipt_items', step++);
        tablesCleared['goods_receipts'] = await safeTruncate('goods_receipts', step++);

        // Purchase orders - Use TRUNCATE CASCADE
        tablesCleared['purchase_order_items'] = await safeTruncate('purchase_order_items', step++);
        tablesCleared['purchase_orders'] = await safeTruncate('purchase_orders', step++);

        // =========================================================================
        // PHASE 4: INVENTORY DATA (Use TRUNCATE CASCADE for reliable cleanup)
        // =========================================================================
        logger.info('Phase 4: Clearing inventory data...');

        // Use TRUNCATE CASCADE to handle FK dependencies automatically
        tablesCleared['stock_movements'] = await safeTruncate('stock_movements', step++);
        tablesCleared['stock_count_lines'] = await safeTruncate('stock_count_lines', step++);
        tablesCleared['stock_counts'] = await safeTruncate('stock_counts', step++);
        tablesCleared['inventory_batches'] = await safeTruncate('inventory_batches', step++);
        tablesCleared['cost_layers'] = await safeTruncate('cost_layers', step++);
        tablesCleared['inventory_snapshots'] = await safeDelete('inventory_snapshots', step++);

        // =========================================================================
        // PHASE 5: DELIVERY & QUOTATIONS
        // =========================================================================
        logger.info('Phase 5: Clearing delivery and quotation data...');

        tablesCleared['delivery_proof'] = await safeDelete('delivery_proof', step++);
        tablesCleared['delivery_status_history'] = await safeDelete('delivery_status_history', step++);
        tablesCleared['delivery_items'] = await safeDelete('delivery_items', step++);
        tablesCleared['route_deliveries'] = await safeDelete('route_deliveries', step++);
        tablesCleared['delivery_orders'] = await safeDelete('delivery_orders', step++);
        tablesCleared['delivery_routes'] = await safeDelete('delivery_routes', step++);

        tablesCleared['quotation_emails'] = await safeDelete('quotation_emails', step++);
        tablesCleared['quotation_attachments'] = await safeDelete('quotation_attachments', step++);
        tablesCleared['quotation_status_history'] = await safeDelete('quotation_status_history', step++);
        tablesCleared['quotation_items'] = await safeDelete('quotation_items', step++);
        tablesCleared['quotations'] = await safeDelete('quotations', step++);

        // =========================================================================
        // PHASE 6: EXPENSES & BANKING
        // =========================================================================
        logger.info('Phase 6: Clearing expenses and banking data...');

        tablesCleared['expense_approvals'] = await safeDelete('expense_approvals', step++);
        tablesCleared['expense_documents'] = await safeDelete('expense_documents', step++);
        tablesCleared['expenses'] = await safeDelete('expenses', step++);

        tablesCleared['bank_reconciliation_items'] = await safeDelete('bank_reconciliation_items', step++);
        tablesCleared['bank_reconciliations'] = await safeDelete('bank_reconciliations', step++);
        tablesCleared['cash_bank_transfers'] = await safeDelete('cash_bank_transfers', step++);
        tablesCleared['cash_book_entries'] = await safeDelete('cash_book_entries', step++);

        // New banking module tables (transactional data - cleared on reset)
        // Note: bank_accounts, bank_categories, bank_patterns, bank_recurring_rules, 
        // bank_templates are MASTER DATA and should NOT be cleared
        // Order is critical due to FK relationships:
        // 1. bank_alerts → FK to bank_transactions, bank_statement_lines
        // 2. bank_statement_lines → FK to bank_statements, bank_transactions
        // 3. bank_statements → FK to bank_accounts (master)
        // 4. bank_transactions → self-referential FKs (transfer_pair_id, reversal_transaction_id)
        tablesCleared['bank_transaction_patterns'] = await safeDelete('bank_transaction_patterns', step++);
        tablesCleared['bank_alerts'] = await safeDelete('bank_alerts', step++);
        tablesCleared['bank_statement_lines'] = await safeDelete('bank_statement_lines', step++);
        tablesCleared['bank_statements'] = await safeDelete('bank_statements', step++);

        // Clear self-referential FKs on bank_transactions before deleting
        try {
            await client.query(`SAVEPOINT sp_clear_bank_txn_fks`);
            await client.query(`
                UPDATE bank_transactions 
                SET transfer_pair_id = NULL, reversal_transaction_id = NULL
                WHERE transfer_pair_id IS NOT NULL OR reversal_transaction_id IS NOT NULL
            `);
            await client.query(`RELEASE SAVEPOINT sp_clear_bank_txn_fks`);
        } catch (error: unknown) {
            await client.query(`ROLLBACK TO SAVEPOINT sp_clear_bank_txn_fks`);
            logger.warn(`Clear bank_transactions self-refs skipped: ${(error instanceof Error ? error.message : String(error))}`);
        }
        tablesCleared['bank_transactions'] = await safeDelete('bank_transactions', step++);

        // Reset bank account balances (keep accounts but reset current_balance to opening_balance)
        try {
            await client.query(`SAVEPOINT sp_reset_bank_balances`);
            const bankResetResult = await client.query(`
                UPDATE bank_accounts 
                SET current_balance = COALESCE(opening_balance, 0),
                    updated_at = NOW()
                WHERE current_balance != COALESCE(opening_balance, 0)
            `);
            tablesCleared['bank_account_balances_reset'] = bankResetResult.rowCount || 0;
            await client.query(`RELEASE SAVEPOINT sp_reset_bank_balances`);
            logger.info(`Reset ${tablesCleared['bank_account_balances_reset']} bank account balances to opening balance`);
        } catch (error: unknown) {
            await client.query(`ROLLBACK TO SAVEPOINT sp_reset_bank_balances`);
            logger.warn(`Bank account balance reset skipped: ${(error instanceof Error ? error.message : String(error))}`);
            tablesCleared['bank_account_balances_reset'] = 0;
        }

        // =========================================================================
        // PHASE 7: LOGS & SESSIONS
        // =========================================================================
        logger.info('Phase 7: Clearing transaction logs and sessions...');

        tablesCleared['report_runs'] = await safeDelete('report_runs', step++);
        tablesCleared['processed_events'] = await safeDelete('processed_events', step++);
        tablesCleared['failed_transactions'] = await safeDelete('failed_transactions', step++);
        tablesCleared['user_sessions'] = await safeDelete('user_sessions', step++);
        // Note: audit_log, data_integrity_log, system_backups, system_reset_log are kept for compliance

        // =========================================================================
        // PHASE 7B: CASH REGISTER DATA (sessions and movements are transactional)
        // =========================================================================
        logger.info('Phase 7B: Clearing cash register sessions and movements...');

        // Cash movements must be deleted first (FK references sessions)
        tablesCleared['cash_movements'] = await safeDelete('cash_movements', step++);
        // Cash register sessions (transactional data)
        tablesCleared['cash_register_sessions'] = await safeDelete('cash_register_sessions', step++);
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
        logger.info('Phase 8: Recalculating all balances using database functions...');

        // Recalculate customer balances (derives from sales + customer_payments)
        try {
            await client.query(`SAVEPOINT sp_recalc_customers`);
            const custResult = await client.query(`
                SELECT COUNT(*) FILTER (WHERE status = 'UPDATED') as updated_count
                FROM fn_recalculate_all_customer_balances()
            `);
            balancesReset['customers'] = parseInt(custResult.rows[0]?.updated_count || '0');
            await client.query(`RELEASE SAVEPOINT sp_recalc_customers`);
            logger.info(`Recalculated ${balancesReset['customers']} customer balances`);
        } catch (error: unknown) {
            await client.query(`ROLLBACK TO SAVEPOINT sp_recalc_customers`);
            logger.warn(`Customer balance recalculation skipped: ${(error instanceof Error ? error.message : String(error))}`);
            // Fallback: Direct reset if function doesn't exist
            try {
                await client.query(`SAVEPOINT sp_reset_customers_fallback`);
                const fallbackResult = await client.query(`
                    UPDATE customers SET balance = 0, updated_at = NOW() WHERE balance != 0
                `);
                balancesReset['customers'] = fallbackResult.rowCount || 0;
                await client.query(`RELEASE SAVEPOINT sp_reset_customers_fallback`);
                logger.warn('Used fallback direct reset for customer balances');
            } catch {
                balancesReset['customers'] = 0;
            }
        }

        // Recalculate supplier balances (derives from goods_receipts + supplier_payments)
        try {
            await client.query(`SAVEPOINT sp_recalc_suppliers`);
            const suppResult = await client.query(`
                SELECT COUNT(*) FILTER (WHERE status = 'UPDATED') as updated_count
                FROM fn_recalculate_all_supplier_balances()
            `);
            balancesReset['suppliers'] = parseInt(suppResult.rows[0]?.updated_count || '0');
            await client.query(`RELEASE SAVEPOINT sp_recalc_suppliers`);
            logger.info(`Recalculated ${balancesReset['suppliers']} supplier balances`);
        } catch (error: unknown) {
            await client.query(`ROLLBACK TO SAVEPOINT sp_recalc_suppliers`);
            logger.warn(`Supplier balance recalculation skipped: ${(error instanceof Error ? error.message : String(error))}`);
            // Fallback: Direct reset if function doesn't exist
            try {
                await client.query(`SAVEPOINT sp_reset_suppliers_fallback`);
                const fallbackResult = await client.query(`
                    UPDATE suppliers SET "OutstandingBalance" = 0, "UpdatedAt" = NOW() 
                    WHERE "OutstandingBalance" != 0
                `);
                balancesReset['suppliers'] = fallbackResult.rowCount || 0;
                await client.query(`RELEASE SAVEPOINT sp_reset_suppliers_fallback`);
                logger.warn('Used fallback direct reset for supplier balances');
            } catch {
                balancesReset['suppliers'] = 0;
            }
        }

        // Recalculate product stock quantities (derives from inventory_batches)
        try {
            await client.query(`SAVEPOINT sp_recalc_inventory`);
            const invResult = await client.query(`
                SELECT COUNT(*) FILTER (WHERE status = 'UPDATED') as updated_count
                FROM fn_recalculate_all_product_stock()
            `);
            balancesReset['inventory'] = parseInt(invResult.rows[0]?.updated_count || '0');
            await client.query(`RELEASE SAVEPOINT sp_recalc_inventory`);
            logger.info(`Recalculated ${balancesReset['inventory']} product quantities`);
        } catch (error: unknown) {
            await client.query(`ROLLBACK TO SAVEPOINT sp_recalc_inventory`);
            logger.warn(`Product stock recalculation skipped: ${(error instanceof Error ? error.message : String(error))}`);
            // Fallback: Direct reset if function doesn't exist
            try {
                await client.query(`SAVEPOINT sp_reset_inventory_fallback`);
                const fallbackResult = await client.query(`
                    UPDATE products SET quantity_on_hand = 0, updated_at = NOW() 
                    WHERE quantity_on_hand != 0
                `);
                balancesReset['inventory'] = fallbackResult.rowCount || 0;
                await client.query(`RELEASE SAVEPOINT sp_reset_inventory_fallback`);
                logger.warn('Used fallback direct reset for product quantities');
            } catch {
                balancesReset['inventory'] = 0;
            }
        }

        // GL account balances already reset in Phase 0 via fn_reset_accounting_complete()
        // This is just a verification step to ensure balances are 0 after all ledger entries cleared
        try {
            await client.query(`SAVEPOINT sp_verify_accounts`);
            const verifyResult = await client.query(`
                SELECT COUNT(*) as non_zero_count 
                FROM accounts 
                WHERE "CurrentBalance" != 0
            `);
            const nonZeroCount = parseInt(verifyResult.rows[0]?.non_zero_count || '0');
            await client.query(`RELEASE SAVEPOINT sp_verify_accounts`);

            if (nonZeroCount > 0) {
                // Force reset any remaining non-zero balances
                logger.warn(`Found ${nonZeroCount} accounts with non-zero balance after reset, forcing to zero`);
                await client.query(`UPDATE accounts SET "CurrentBalance" = 0 WHERE "CurrentBalance" != 0`);
                balancesReset['accounts_forced'] = nonZeroCount;
            }
            balancesReset['accounts_verified'] = 1;
            logger.info('Account balances verified at zero');
        } catch (error: unknown) {
            await client.query(`ROLLBACK TO SAVEPOINT sp_verify_accounts`);
            logger.warn(`Account verification skipped: ${(error instanceof Error ? error.message : String(error))}`);
            // Force reset all account balances to 0 as final fallback
            try {
                await client.query(`UPDATE accounts SET "CurrentBalance" = 0`);
                balancesReset['accounts_fallback'] = 1;
                logger.info('Forced all account balances to zero (fallback)');
            } catch {
                logger.error('Failed to reset account balances');
            }
        }

        // =========================================================================
        // PHASE 9: VERIFY POST-RESET INTEGRITY
        // =========================================================================
        logger.info('Phase 9: Verifying post-reset data integrity...');
        try {
            await client.query(`SAVEPOINT sp_verify_integrity`);
            const verifyResult = await client.query(`
                SELECT check_name, status, details
                FROM fn_verify_post_reset_integrity()
                WHERE status = 'FAIL'
            `);
            await client.query(`RELEASE SAVEPOINT sp_verify_integrity`);

            if (verifyResult.rows.length > 0) {
                const failures = verifyResult.rows.map(r => `${r.check_name}: ${r.details}`).join('; ');
                logger.warn(`Post-reset integrity issues detected: ${failures}`);
            } else {
                logger.info('Post-reset integrity verification passed');
            }
        } catch (error: unknown) {
            await client.query(`ROLLBACK TO SAVEPOINT sp_verify_integrity`);
            logger.warn(`Post-reset verification skipped: ${(error instanceof Error ? error.message : String(error))}`);
        }

        return { tablesCleared, balancesReset };
    },

    // ==========================================================================
    // INTEGRITY VALIDATION
    // ==========================================================================

    async validateDatabaseIntegrity(pool: Pool): Promise<{ valid: boolean; issues: string[] }> {
        const issues: string[] = [];

        // Check for orphaned records
        const orphanChecks = [
            { child: 'sale_items', parent: 'sales', fk: 'sale_id' },
            { child: 'invoice_line_items', parent: 'invoices', fk: 'invoice_id' },
            { child: 'purchase_order_items', parent: 'purchase_orders', fk: 'purchase_order_id' },
            { child: 'goods_receipt_items', parent: 'goods_receipts', fk: 'goods_receipt_id' },
        ];

        for (const check of orphanChecks) {
            try {
                const result = await pool.query(`
          SELECT COUNT(*) as count FROM ${check.child} c
          LEFT JOIN ${check.parent} p ON p.id = c.${check.fk}
          WHERE p.id IS NULL
        `);
                const count = parseInt(result.rows[0].count);
                if (count > 0) {
                    issues.push(`Found ${count} orphaned records in ${check.child}`);
                }
            } catch (error) {
                logger.debug('Integrity check skipped', { check: 'orphaned records', error: (error as Error).message });
            }
        }

        // Check for negative inventory
        try {
            const negInv = await pool.query(`
        SELECT COUNT(*) as count FROM products WHERE quantity_on_hand < 0
      `);
            if (parseInt(negInv.rows[0].count) > 0) {
                issues.push(`Found ${negInv.rows[0].count} products with negative inventory`);
            }
        } catch (error) {
            logger.debug('Integrity check skipped', { check: 'negative inventory', error: (error as Error).message });
        }

        // Check GL balance
        try {
            const glBalance = await pool.query(`
        SELECT 
          SUM("DebitAmount") as debits,
          SUM("CreditAmount") as credits
        FROM ledger_entries le
        JOIN ledger_transactions lt ON le."LedgerTransactionId" = lt."Id"
        WHERE lt."Status" = 'POSTED'
      `);
            const debits = new Decimal(glBalance.rows[0]?.debits || '0');
            const credits = new Decimal(glBalance.rows[0]?.credits || '0');
            if (debits.minus(credits).abs().greaterThan('0.01')) {
                issues.push(`GL imbalance: Debits=${debits.toFixed(2)}, Credits=${credits.toFixed(2)}, Diff=${debits.minus(credits).toFixed(2)}`);
            }
        } catch (error) {
            logger.debug('Integrity check skipped', { check: 'GL balance', error: (error as Error).message });
        }

        return {
            valid: issues.length === 0,
            issues
        };
    }
};

export default systemManagementRepository;
