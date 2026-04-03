import { Pool, PoolClient } from 'pg';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import Decimal from 'decimal.js';
import logger from '../../utils/logger.js';

/** Validates that a table name is a safe PostgreSQL identifier (defense-in-depth) */
const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
function assertSafeTableName(name: string): void {
    if (!SAFE_IDENTIFIER.test(name)) {
        throw new Error(`Unsafe table name rejected: ${name}`);
    }
}

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
        await pool.query(
            `
      UPDATE system_maintenance_mode
      SET is_active = TRUE,
          reason = $1,
          operation_type = $2,
          started_at = NOW(),
          started_by = $3,
          ended_at = NULL,
          ended_by = NULL
      WHERE id = '00000000-0000-0000-0000-000000000001'
    `,
            [reason, operationType, userId]
        );

        logger.warn('Maintenance mode ENABLED', { reason, operationType, userId });
    },

    async disableMaintenanceMode(pool: Pool, userId: string): Promise<void> {
        await pool.query(
            `
      UPDATE system_maintenance_mode
      SET is_active = FALSE,
          ended_at = NOW(),
          ended_by = $1
      WHERE id = '00000000-0000-0000-0000-000000000001'
    `,
            [userId]
        );

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
        // Generate backup number with retry on conflict (race-safe)
        const year = new Date().getFullYear();
        const maxRetries = 5;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const seqResult = await pool.query(
                `SELECT COALESCE(MAX(CAST(SUBSTRING(backup_number FROM $2::int) AS INTEGER)), 0) + 1 AS next_num
                 FROM system_backups WHERE backup_number LIKE $1`,
                [`BACKUP-${year}-%`, `BACKUP-${year}-`.length + 1]
            );
            const backupNumber = `BACKUP-${year}-${String(seqResult.rows[0].next_num).padStart(4, '0')}`;

            try {
                const result = await pool.query(
                    `
          INSERT INTO system_backups (
            backup_number, file_name, file_path, file_size, checksum,
            backup_type, status, reason, created_by, created_by_name,
            stats_snapshot
          )
          VALUES (
            $1, $2, $3, $4, $5,
            $6, 'COMPLETED', $7, $8, $9,
            $10
          )
          RETURNING *
        `,
                    [
                        backupNumber,
                        data.fileName,
                        data.filePath,
                        data.fileSize,
                        data.checksum,
                        data.backupType,
                        data.reason,
                        data.userId,
                        data.userName,
                        JSON.stringify(data.statsSnapshot),
                    ]
                );

                return this.mapBackupRow(result.rows[0]);
            } catch (err: unknown) {
                const isUniqueViolation = err instanceof Error && err.message.includes('duplicate key');
                if (!isUniqueViolation || attempt === maxRetries - 1) throw err;
                // Retry with next number
            }
        }

        throw new Error('Failed to generate unique backup number after retries');
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
        const result = await pool.query(
            `
      SELECT * FROM system_backups
      WHERE is_deleted = FALSE
      ORDER BY created_at DESC
      LIMIT $1
    `,
            [limit]
        );

        return result.rows.map((row) => this.mapBackupRow(row));
    },

    async updateBackupStatus(
        pool: Pool,
        id: string,
        status: string,
        checksum?: string
    ): Promise<void> {
        await pool.query(
            `
      UPDATE system_backups
      SET status = $1::varchar,
          checksum = COALESCE($2::varchar, checksum),
          verified_at = CASE WHEN $1::varchar = 'VERIFIED' THEN NOW() ELSE verified_at END,
          is_verified = CASE WHEN $1::varchar = 'VERIFIED' THEN TRUE ELSE is_verified END
      WHERE id = $3::uuid
    `,
            [status, checksum || null, id]
        );
    },

    async incrementRestoreCount(pool: Pool, id: string, userId: string): Promise<void> {
        await pool.query(
            `
      UPDATE system_backups
      SET restore_count = restore_count + 1,
          last_restored_at = NOW(),
          last_restored_by = $1::uuid
      WHERE id = $2::uuid
    `,
            [userId, id]
        );
    },

    async softDeleteBackup(pool: Pool, id: string, userId: string): Promise<void> {
        await pool.query(
            `
      UPDATE system_backups
      SET is_deleted = TRUE,
          deleted_at = NOW(),
          deleted_by = $1::uuid
      WHERE id = $2::uuid
    `,
            [userId, id]
        );
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
            statsSnapshot: row.stats_snapshot,
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
        // Generate reset number with retry on conflict (race-safe)
        const year = new Date().getFullYear();
        const maxRetries = 5;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const seqResult = await pool.query(
                `SELECT COALESCE(MAX(CAST(SUBSTRING(reset_number FROM $2::int) AS INTEGER)), 0) + 1 AS next_num
                 FROM system_reset_log WHERE reset_number LIKE $1`,
                [`RESET-${year}-%`, `RESET-${year}-`.length + 1]
            );
            const resetNumber = `RESET-${year}-${String(seqResult.rows[0].next_num).padStart(4, '0')}`;

            try {
                const result = await pool.query(
                    `
          INSERT INTO system_reset_log (
            reset_number, reset_type, backup_id, backup_number,
            authorized_by, authorized_by_name, confirmation_phrase,
            reason, ip_address, user_agent, status
          )
          VALUES (
            $1, $2, $3, $4,
            $5, $6, $7,
            $8, $9, $10, 'IN_PROGRESS'
          )
          RETURNING id, reset_number
        `,
                    [
                        resetNumber,
                        data.resetType,
                        data.backupId,
                        data.backupNumber,
                        data.userId,
                        data.userName,
                        data.confirmationPhrase,
                        data.reason,
                        data.ipAddress,
                        data.userAgent,
                    ]
                );

                return result.rows[0].reset_number;
            } catch (err: unknown) {
                const isUniqueViolation = err instanceof Error && err.message.includes('duplicate key');
                if (!isUniqueViolation || attempt === maxRetries - 1) throw err;
                // Retry with next number
            }
        }

        throw new Error('Failed to generate unique reset number after retries');
    },

    async completeResetLog(
        pool: Pool,
        resetNumber: string,
        tablesCleared: Record<string, number>,
        balancesReset: Record<string, number>
    ): Promise<void> {
        const recordsDeleted = Object.values(tablesCleared).reduce((a, b) => a + b, 0);

        await pool.query(
            `
      UPDATE system_reset_log
      SET status = 'COMPLETED',
          completed_at = NOW(),
          tables_cleared = $1,
          records_deleted = $2,
          balances_reset = $3
      WHERE reset_number = $4
    `,
            [JSON.stringify(tablesCleared), recordsDeleted, JSON.stringify(balancesReset), resetNumber]
        );
    },

    async failResetLog(
        pool: Pool,
        resetNumber: string,
        errorMessage: string,
        rollbackReason?: string
    ): Promise<void> {
        await pool.query(
            `
      UPDATE system_reset_log
      SET status = $1,
          completed_at = NOW(),
          error_message = $2,
          rollback_reason = $3
      WHERE reset_number = $4
    `,
            [rollbackReason ? 'ROLLED_BACK' : 'FAILED', errorMessage, rollbackReason, resetNumber]
        );
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
            'customers',
            'suppliers',
            'products',
            'users',
            'uoms',
            'product_uoms',
            'customer_groups',
            'accounts',
            'expense_categories',
            'bank_accounts',
            'bank_categories',
            'bank_patterns',
            'bank_recurring_rules',
            'bank_templates',
            'cash_registers',
            'employees',
            'departments',
            'positions',
            'discount_rules',
            'discounts',
            'pricing_tiers',
            'invoice_settings',
            'supplier_product_prices',
        ];

        // Transactional data tables (can be cleared)
        const txnTables = [
            'sales',
            'sale_items',
            'sale_discounts',
            'pos_held_orders',
            'pos_held_order_items',
            'pos_customer_deposits',
            'pos_deposit_applications',
            'discount_authorizations',
            'invoices',
            'invoice_line_items',
            'invoice_payments',
            'customer_payments',
            'customer_deposits',
            'deposit_applications',
            'credit_applications',
            'customer_credits',
            'customer_balance_adjustments',
            'customer_accounts',
            'payment_transactions',
            'purchase_orders',
            'purchase_order_items',
            'goods_receipts',
            'goods_receipt_items',
            'inventory_batches',
            'inventory_snapshots',
            'stock_movements',
            'cost_layers',
            'stock_counts',
            'stock_count_lines',
            'supplier_invoices',
            'supplier_invoice_line_items',
            'supplier_payments',
            'supplier_payment_allocations',
            'quotations',
            'quotation_items',
            'quotation_attachments',
            'quotation_emails',
            'quotation_status_history',
            'delivery_orders',
            'delivery_items',
            'delivery_routes',
            'delivery_proof',
            'delivery_status_history',
            'route_deliveries',
            'expenses',
            'expense_approvals',
            'expense_documents',
            'bank_reconciliations',
            'bank_reconciliation_items',
            'cash_bank_transfers',
            'cash_book_entries',
            'bank_transactions',
            'bank_statement_lines',
            'bank_statements',
            'bank_alerts',
            'bank_transaction_patterns',
            'financial_periods',
            'report_runs',
            'processed_events',
            'failed_transactions',
            'user_sessions',
            'cash_register_sessions',
            'cash_movements',
            'cash_register_reconciliations',
            'z_reports',
            'customer_balance_audit',
            'customer_ledger',
            'supplier_ledger',
            'product_valuation',
            'product_inventory',
            'import_jobs',
            'import_job_errors',
            'refresh_tokens',
            'billing_events',
            'sync_ledger',
            'payroll_entries',
            'payroll_periods',
            'leads',
            'opportunities',
            'opportunity_items',
            'opportunity_documents',
            'activities',
            'stock_adjustments',
            'delivery_notes',
            'delivery_note_lines',
        ];

        // Accounting data tables
        const acctTables = [
            'ledger_transactions',
            'ledger_entries',
            'journal_entries',
            'journal_entry_lines',
            'manual_journal_entries',
            'manual_journal_entry_lines',
            'payment_allocations',
            'payment_lines',
            'accounting_periods',
            'accounting_period_history',
        ];

        // Fetch all table counts in a single query using pg_stat_user_tables
        const allTables = [...masterTables, ...txnTables, ...acctTables];
        const countsResult = await pool.query(
            `
            SELECT relname AS table_name, n_live_tup AS count
            FROM pg_stat_user_tables
            WHERE relname = ANY($1)
        `,
            [allTables]
        );

        const countMap = new Map<string, number>();
        for (const row of countsResult.rows) {
            countMap.set(row.table_name, parseInt(row.count));
        }

        for (const t of masterTables) {
            masterData[t] = countMap.get(t) ?? 0;
        }
        for (const t of txnTables) {
            transactionalData[t] = countMap.get(t) ?? 0;
        }
        for (const t of acctTables) {
            accountingData[t] = countMap.get(t) ?? 0;
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
            lastBackup: lastBackupResult.rows[0] ? this.mapBackupRow(lastBackupResult.rows[0]) : null,
            lastReset: lastResetResult.rows[0]?.started_at
                ? new Date(lastResetResult.rows[0].started_at)
                : null,
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
            assertSafeTableName(tableName);
            try {
                await client.query(`SAVEPOINT sp_delete_${stepNum}`);
                const result = await client.query(`DELETE FROM ${tableName}`);
                await client.query(`RELEASE SAVEPOINT sp_delete_${stepNum}`);
                return result.rowCount || 0;
            } catch (error: unknown) {
                await client.query(`ROLLBACK TO SAVEPOINT sp_delete_${stepNum}`);
                logger.warn(
                    `Table ${tableName} skip: ${error instanceof Error ? error.message : String(error)}`
                );
                return 0;
            }
        };

        // Helper function for safe truncate (faster for large tables)
        const safeTruncate = async (tableName: string, stepNum: number): Promise<number> => {
            assertSafeTableName(tableName);
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
                logger.warn(
                    `Table ${tableName} truncate skip: ${error instanceof Error ? error.message : String(error)}`
                );
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
            logger.info(
                `Cleared ${tablesCleared['bank_transactions_gl_refs_cleared']} GL refs from bank_transactions`
            );
        } catch (error: unknown) {
            await client.query(`ROLLBACK TO SAVEPOINT sp_clear_bank_gl_refs`);
            logger.warn(
                `Clear bank_transactions GL refs skipped: ${error instanceof Error ? error.message : String(error)}`
            );
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
        // PHASE 0: COMPLETE ACCOUNTING RESET FIRST (Service-layer — no DB functions)
        // =========================================================================
        logger.info('Phase 0: Complete accounting system reset...');

        try {
            await client.query(`DELETE FROM ledger_entries`);
            await client.query(`DELETE FROM ledger_transactions`);
            await client.query(`UPDATE accounts SET "CurrentBalance" = 0`);
            tablesCleared['accounting_reset'] = 1;
            logger.info('Accounting reset completed');
        } catch (error: unknown) {
            logger.error(
                `Accounting reset failed: ${error instanceof Error ? error.message : String(error)}`
            );
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
            logger.warn(
                `Clear manual_journal_entries self-refs skipped: ${error instanceof Error ? error.message : String(error)}`
            );
        }
        tablesCleared['manual_journal_entry_lines'] = await safeDelete(
            'manual_journal_entry_lines',
            step++
        );
        tablesCleared['manual_journal_entries'] = await safeDelete('manual_journal_entries', step++);

        tablesCleared['payment_allocations'] = await safeDelete('payment_allocations', step++);
        tablesCleared['payment_lines'] = await safeDelete('payment_lines', step++);
        tablesCleared['payment_transactions'] = await safeDelete('payment_transactions', step++);
        tablesCleared['financial_periods'] = await safeDelete('financial_periods', step++);

        // Accounting periods (fiscal period tracking)
        tablesCleared['accounting_period_history'] = await safeDelete(
            'accounting_period_history',
            step++
        );
        tablesCleared['accounting_periods'] = await safeDelete('accounting_periods', step++);

        // =========================================================================
        // PHASE 2: SALES & CUSTOMER DATA
        // =========================================================================
        logger.info('Phase 2: Clearing sales and customer transactions...');

        // Customer payments and deposits
        tablesCleared['credit_applications'] = await safeDelete('credit_applications', step++);
        tablesCleared['deposit_applications'] = await safeDelete('deposit_applications', step++);
        tablesCleared['pos_deposit_applications'] = await safeDelete(
            'pos_deposit_applications',
            step++
        );
        tablesCleared['customer_deposits'] = await safeDelete('customer_deposits', step++);
        tablesCleared['pos_customer_deposits'] = await safeDelete('pos_customer_deposits', step++);
        tablesCleared['customer_payments'] = await safeDelete('customer_payments', step++);
        tablesCleared['customer_credits'] = await safeDelete('customer_credits', step++);
        tablesCleared['customer_balance_adjustments'] = await safeDelete(
            'customer_balance_adjustments',
            step++
        );
        tablesCleared['customer_accounts'] = await safeDelete('customer_accounts', step++);
        tablesCleared['customer_ledger'] = await safeDelete('customer_ledger', step++);
        tablesCleared['customer_balance_audit'] = await safeDelete('customer_balance_audit', step++);

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

        tablesCleared['supplier_payment_allocations'] = await safeTruncate(
            'supplier_payment_allocations',
            step++
        );
        tablesCleared['supplier_payments'] = await safeTruncate('supplier_payments', step++);
        tablesCleared['supplier_invoice_line_items'] = await safeTruncate(
            'supplier_invoice_line_items',
            step++
        );
        tablesCleared['supplier_invoices'] = await safeTruncate('supplier_invoices', step++);
        tablesCleared['supplier_ledger'] = await safeDelete('supplier_ledger', step++);

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
        tablesCleared['stock_adjustments'] = await safeDelete('stock_adjustments', step++);
        tablesCleared['stock_count_lines'] = await safeTruncate('stock_count_lines', step++);
        tablesCleared['stock_counts'] = await safeTruncate('stock_counts', step++);
        tablesCleared['inventory_batches'] = await safeTruncate('inventory_batches', step++);
        tablesCleared['cost_layers'] = await safeTruncate('cost_layers', step++);
        tablesCleared['inventory_snapshots'] = await safeDelete('inventory_snapshots', step++);
        tablesCleared['product_valuation'] = await safeDelete('product_valuation', step++);
        tablesCleared['product_inventory'] = await safeDelete('product_inventory', step++);

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

        // Delivery Notes (SAP-style wholesale delivery notes)
        tablesCleared['delivery_note_lines'] = await safeDelete('delivery_note_lines', step++);
        tablesCleared['delivery_notes'] = await safeDelete('delivery_notes', step++);

        tablesCleared['quotation_emails'] = await safeDelete('quotation_emails', step++);
        tablesCleared['quotation_attachments'] = await safeDelete('quotation_attachments', step++);
        tablesCleared['quotation_status_history'] = await safeDelete(
            'quotation_status_history',
            step++
        );
        tablesCleared['quotation_items'] = await safeDelete('quotation_items', step++);
        tablesCleared['quotations'] = await safeDelete('quotations', step++);

        // =========================================================================
        // PHASE 6: EXPENSES & BANKING
        // =========================================================================
        logger.info('Phase 6: Clearing expenses and banking data...');

        tablesCleared['expense_approvals'] = await safeDelete('expense_approvals', step++);
        tablesCleared['expense_documents'] = await safeDelete('expense_documents', step++);
        tablesCleared['expenses'] = await safeDelete('expenses', step++);

        tablesCleared['bank_reconciliation_items'] = await safeDelete(
            'bank_reconciliation_items',
            step++
        );
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
        tablesCleared['bank_transaction_patterns'] = await safeDelete(
            'bank_transaction_patterns',
            step++
        );
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
            logger.warn(
                `Clear bank_transactions self-refs skipped: ${error instanceof Error ? error.message : String(error)}`
            );
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
            logger.info(
                `Reset ${tablesCleared['bank_account_balances_reset']} bank account balances to opening balance`
            );
        } catch (error: unknown) {
            await client.query(`ROLLBACK TO SAVEPOINT sp_reset_bank_balances`);
            logger.warn(
                `Bank account balance reset skipped: ${error instanceof Error ? error.message : String(error)}`
            );
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

        // Demand forecast data (derived/computed data - stale after reset)
        tablesCleared['product_demand_stats'] = await safeDelete('product_demand_stats', step++);
        tablesCleared['product_seasonality'] = await safeDelete('product_seasonality', step++);
        tablesCleared['demand_forecast_runs'] = await safeDelete('demand_forecast_runs', step++);

        // Session tokens (stale after reset)
        tablesCleared['refresh_tokens'] = await safeDelete('refresh_tokens', step++);

        // Import data (job history - stale after reset)
        tablesCleared['import_job_errors'] = await safeDelete('import_job_errors', step++);
        tablesCleared['import_jobs'] = await safeDelete('import_jobs', step++);

        // Multi-tenant/billing data
        tablesCleared['billing_events'] = await safeDelete('billing_events', step++);
        tablesCleared['sync_ledger'] = await safeDelete('sync_ledger', step++);

        // =========================================================================
        // PHASE 7B: CASH REGISTER DATA (sessions and movements are transactional)
        // =========================================================================
        logger.info('Phase 7B: Clearing cash register sessions and movements...');

        // Cash movements must be deleted first (FK references sessions)
        tablesCleared['cash_movements'] = await safeDelete('cash_movements', step++);
        // Cash register reconciliations (FK to sessions)
        tablesCleared['cash_register_reconciliations'] = await safeDelete('cash_register_reconciliations', step++);
        // Z-reports (FK to sessions)
        tablesCleared['z_reports'] = await safeDelete('z_reports', step++);
        // Cash register sessions (transactional data)
        tablesCleared['cash_register_sessions'] = await safeDelete('cash_register_sessions', step++);
        // Note: cash_registers table is preserved (physical register configuration)

        // =========================================================================
        // PHASE 7C: HR & PAYROLL DATA (transactional payroll data, preserve master)
        // =========================================================================
        logger.info('Phase 7C: Clearing HR & Payroll transactional data...');

        // Payroll entries reference payroll_periods and employees
        tablesCleared['payroll_entries'] = await safeDelete('payroll_entries', step++);
        tablesCleared['payroll_periods'] = await safeDelete('payroll_periods', step++);
        // Note: employees, departments, positions are MASTER DATA - preserved

        // =========================================================================
        // PHASE 7D: CRM DATA (transactional CRM data, preserve contacts)
        // =========================================================================
        logger.info('Phase 7D: Clearing CRM transactional data...');

        // CRM child tables first (FK ordering)
        tablesCleared['opportunity_documents'] = await safeDelete('opportunity_documents', step++);
        tablesCleared['opportunity_items'] = await safeDelete('opportunity_items', step++);
        tablesCleared['activities'] = await safeDelete('activities', step++);
        tablesCleared['opportunities'] = await safeDelete('opportunities', step++);
        tablesCleared['leads'] = await safeDelete('leads', step++);

        // =========================================================================
        // PHASE 8: RESET ALL BALANCES (Service-layer — no DB functions)
        // =========================================================================
        // After deleting all transactions, all balances must be zero.
        // =========================================================================
        logger.info('Phase 8: Resetting all balances to zero...');

        // Reset customer balances to zero
        try {
            await client.query(`SAVEPOINT sp_reset_customers`);
            const custResult = await client.query(`
                UPDATE customers SET balance = 0, updated_at = NOW() WHERE balance != 0
            `);
            balancesReset['customers'] = custResult.rowCount || 0;
            await client.query(`RELEASE SAVEPOINT sp_reset_customers`);
            logger.info(`Reset ${balancesReset['customers']} customer balances to zero`);
        } catch {
            balancesReset['customers'] = 0;
        }

        // Reset supplier balances to zero
        try {
            await client.query(`SAVEPOINT sp_reset_suppliers`);
            const suppResult = await client.query(`
                UPDATE suppliers SET "OutstandingBalance" = 0, "UpdatedAt" = NOW() 
                WHERE "OutstandingBalance" != 0
            `);
            balancesReset['suppliers'] = suppResult.rowCount || 0;
            await client.query(`RELEASE SAVEPOINT sp_reset_suppliers`);
            logger.info(`Reset ${balancesReset['suppliers']} supplier balances to zero`);
        } catch {
            balancesReset['suppliers'] = 0;
        }

        // Reset product stock quantities to zero
        try {
            await client.query(`SAVEPOINT sp_reset_inventory`);
            const invResult = await client.query(`
                UPDATE product_inventory SET quantity_on_hand = 0, updated_at = NOW() 
                WHERE quantity_on_hand != 0
            `);
            await client.query(`
                UPDATE products SET quantity_on_hand = 0, updated_at = NOW()
                WHERE quantity_on_hand != 0
            `);
            balancesReset['inventory'] = invResult.rowCount || 0;
            await client.query(`RELEASE SAVEPOINT sp_reset_inventory`);
            logger.info(`Reset ${balancesReset['inventory']} product quantities to zero`);
        } catch {
            balancesReset['inventory'] = 0;
        }

        // Verify GL account balances are zero
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
                logger.warn(
                    `Found ${nonZeroCount} accounts with non-zero balance after reset, forcing to zero`
                );
                await client.query(`UPDATE accounts SET "CurrentBalance" = 0 WHERE "CurrentBalance" != 0`);
                balancesReset['accounts_forced'] = nonZeroCount;
            }
            balancesReset['accounts_verified'] = 1;
            logger.info('Account balances verified at zero');
        } catch (error: unknown) {
            await client.query(`ROLLBACK TO SAVEPOINT sp_verify_accounts`);
            logger.warn(
                `Account verification skipped: ${error instanceof Error ? error.message : String(error)}`
            );
            try {
                await client.query(`UPDATE accounts SET "CurrentBalance" = 0`);
                balancesReset['accounts_fallback'] = 1;
                logger.info('Forced all account balances to zero (fallback)');
            } catch {
                logger.error('Failed to reset account balances');
            }
        }

        // =========================================================================
        // PHASE 9: VERIFY POST-RESET INTEGRITY (inline checks)
        // =========================================================================
        logger.info('Phase 9: Verifying post-reset data integrity...');
        try {
            await client.query(`SAVEPOINT sp_verify_integrity`);
            const checks = await client.query(`
                SELECT 'non_zero_customer_balances' AS check_name,
                  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
                  json_build_object('count', COUNT(*))::text AS details
                FROM customers WHERE balance != 0
                UNION ALL
                SELECT 'non_zero_supplier_balances',
                  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
                  json_build_object('count', COUNT(*))::text
                FROM suppliers WHERE "OutstandingBalance" != 0
                UNION ALL
                SELECT 'non_zero_account_balances',
                  CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
                  json_build_object('count', COUNT(*))::text
                FROM accounts WHERE "CurrentBalance" != 0
            `);
            await client.query(`RELEASE SAVEPOINT sp_verify_integrity`);

            const failures = checks.rows.filter((r: { status: string }) => r.status === 'FAIL');
            if (failures.length > 0) {
                const failStr = failures.map((r: { check_name: string; details: string }) => `${r.check_name}: ${r.details}`).join('; ');
                logger.warn(`Post-reset integrity issues detected: ${failStr}`);
            } else {
                logger.info('Post-reset integrity verification passed');
            }
        } catch (error: unknown) {
            await client.query(`ROLLBACK TO SAVEPOINT sp_verify_integrity`);
            logger.warn(
                `Post-reset verification skipped: ${error instanceof Error ? error.message : String(error)}`
            );
        }

        return { tablesCleared, balancesReset };
    },

    // ==========================================================================
    // INTEGRITY VALIDATION
    // ==========================================================================

    async validateDatabaseIntegrity(pool: Pool): Promise<{ valid: boolean; issues: string[] }> {
        const issues: string[] = [];

        // Check for orphaned records (single batched query)
        try {
            const orphanResult = await pool.query(`
                SELECT 'sale_items' AS child, COUNT(*) AS count
                  FROM sale_items c LEFT JOIN sales p ON p.id = c.sale_id WHERE p.id IS NULL
                UNION ALL
                SELECT 'invoice_line_items', COUNT(*)
                  FROM invoice_line_items c LEFT JOIN invoices p ON p.id = c.invoice_id WHERE p.id IS NULL
                UNION ALL
                SELECT 'purchase_order_items', COUNT(*)
                  FROM purchase_order_items c LEFT JOIN purchase_orders p ON p.id = c.purchase_order_id WHERE p.id IS NULL
                UNION ALL
                SELECT 'goods_receipt_items', COUNT(*)
                  FROM goods_receipt_items c LEFT JOIN goods_receipts p ON p.id = c.goods_receipt_id WHERE p.id IS NULL
            `);
            for (const row of orphanResult.rows) {
                const count = parseInt(row.count);
                if (count > 0) {
                    issues.push(`Found ${count} orphaned records in ${row.child}`);
                }
            }
        } catch (error) {
            logger.debug('Integrity check skipped', {
                check: 'orphaned records',
                error: (error as Error).message,
            });
        }

        // Check for negative inventory
        try {
            const negInv = await pool.query(`
        SELECT COUNT(*) as count FROM product_inventory WHERE quantity_on_hand < 0
      `);
            if (parseInt(negInv.rows[0].count) > 0) {
                issues.push(`Found ${negInv.rows[0].count} products with negative inventory`);
            }
        } catch (error) {
            logger.debug('Integrity check skipped', {
                check: 'negative inventory',
                error: (error as Error).message,
            });
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
                issues.push(
                    `GL imbalance: Debits=${debits.toFixed(2)}, Credits=${credits.toFixed(2)}, Diff=${debits.minus(credits).toFixed(2)}`
                );
            }
        } catch (error) {
            logger.debug('Integrity check skipped', {
                check: 'GL balance',
                error: (error as Error).message,
            });
        }

        return {
            valid: issues.length === 0,
            issues,
        };
    },
};

export default systemManagementRepository;
