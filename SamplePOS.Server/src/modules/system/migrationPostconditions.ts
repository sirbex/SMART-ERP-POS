import type { Pool } from 'pg';
import { legacyTriggersAbsentForMigration } from './legacyTriggerPostconditions.js';

/**
 * Migrations that only ALTER constraints / account flags (no CREATE TABLE anchors).
 * Drift = schema_migrations says applied but postcondition SQL checks fail.
 */
export const MIGRATION_POSTCONDITION_FILES = [
    '061_drop_disabled_triggers.sql',
    '063_drop_number_generator_and_balance_sync_triggers.sql',
    '064_drop_protection_and_validation_triggers.sql',
    '065_drop_period_audit_autopopulate_triggers.sql',
    '417_customer_opening_balance.sql',
    '20251118_create_stock_counts.sql',
    '20260616_cutover_accounting.sql',
    '524_relax_ledger_entries_constraints.sql',
    '554_sales_liquidity_allowed_sources.sql',
    '555_quotation_content_hash_terminal_statuses.sql',
] as const;

export type MigrationPostconditionFile = (typeof MIGRATION_POSTCONDITION_FILES)[number];

async function constraintDefIncludes(
    pool: Pool,
    tableName: string,
    constraintName: string,
    needle: string,
): Promise<boolean> {
    const { rows } = await pool.query<{ ok: boolean }>(
        `SELECT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid AND t.relname = $1
            WHERE c.conname = $2
              AND pg_get_constraintdef(c.oid) ILIKE $3
        ) AS ok`,
        [tableName, constraintName, `%${needle}%`],
    );
    return rows[0]?.ok === true;
}

async function accountAllowsSource(
    pool: Pool,
    accountCode: string,
    source: string,
): Promise<boolean> {
    const { rows } = await pool.query<{ ok: boolean }>(
        `SELECT EXISTS (
            SELECT 1 FROM accounts
            WHERE "AccountCode" = $1
              AND $2 = ANY(COALESCE("AllowedSources", '{}'::text[]))
        ) AS ok`,
        [accountCode, source],
    );
    return rows[0]?.ok === true;
}

async function tableExists(pool: Pool, tableName: string): Promise<boolean> {
    const { rows } = await pool.query<{ ok: boolean }>(
        `SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
        ) AS ok`,
        [tableName],
    );
    return rows[0]?.ok === true;
}

async function columnIsNullable(pool: Pool, tableName: string, columnName: string): Promise<boolean> {
    const { rows } = await pool.query<{ ok: boolean }>(
        `SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = $1
              AND column_name = $2
              AND is_nullable = 'YES'
        ) AS ok`,
        [tableName, columnName],
    );
    return rows[0]?.ok === true;
}

export async function verifyMigrationPostcondition(
    pool: Pool,
    filename: string,
): Promise<boolean> {
    switch (filename) {
        case '061_drop_disabled_triggers.sql':
        case '063_drop_number_generator_and_balance_sync_triggers.sql':
        case '064_drop_protection_and_validation_triggers.sql':
        case '065_drop_period_audit_autopopulate_triggers.sql':
            return legacyTriggersAbsentForMigration(pool, filename);
        case '20251118_create_stock_counts.sql': {
            const [counts, lines] = await Promise.all([
                tableExists(pool, 'stock_counts'),
                tableExists(pool, 'stock_count_lines'),
            ]);
            return counts && lines;
        }
        case '417_customer_opening_balance.sql': {
            const [docOk, arOk] = await Promise.all([
                constraintDefIncludes(
                    pool,
                    'invoices',
                    'chk_invoices_document_type',
                    'OPENING_BALANCE',
                ),
                accountAllowsSource(pool, '1200', 'CUTOVER_OB'),
            ]);
            return docOk && arOk;
        }
        case '20260616_cutover_accounting.sql': {
            const { rows: tableExists } = await pool.query<{ ok: boolean }>(
                `SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'supplier_invoices'
                ) AS ok`,
            );
            if (!tableExists[0]?.ok) return true;

            const [docOk, apOk, equityOk] = await Promise.all([
                constraintDefIncludes(
                    pool,
                    'supplier_invoices',
                    'chk_supplier_invoices_document_type',
                    'OPENING_BALANCE',
                ),
                accountAllowsSource(pool, '2100', 'CUTOVER_OB'),
                accountAllowsSource(pool, '3050', 'CUTOVER_OB'),
            ]);
            return docOk && apOk && equityOk;
        }
        case '524_relax_ledger_entries_constraints.sql':
            return columnIsNullable(pool, 'ledger_entries', 'LedgerTransactionId');
        case '554_sales_liquidity_allowed_sources.sql': {
            const [cash, momo, bank, card] = await Promise.all([
                accountAllowsSource(pool, '1010', 'SALES_INVOICE'),
                accountAllowsSource(pool, '1040', 'SALES_INVOICE'),
                accountAllowsSource(pool, '1030', 'SALES_INVOICE'),
                accountAllowsSource(pool, '1020', 'SALES_INVOICE'),
            ]);
            return cash && momo && bank && card;
        }
        case '555_quotation_content_hash_terminal_statuses.sql': {
            const { rows } = await pool.query<{ ok: boolean }>(
                `SELECT EXISTS (
                    SELECT 1
                    FROM pg_indexes
                    WHERE schemaname = 'public'
                      AND indexname = 'idx_quotations_content_hash_open'
                      AND indexdef ILIKE '%EXPIRED%'
                      AND indexdef ILIKE '%REJECTED%'
                ) AS ok`,
            );
            return rows[0]?.ok === true;
        }
        default:
            return true;
    }
}

export async function findPostconditionDriftedMigrationFiles(pool: Pool): Promise<string[]> {
    const drifted: string[] = [];
    for (const filename of MIGRATION_POSTCONDITION_FILES) {
        if (!(await verifyMigrationPostcondition(pool, filename))) {
            drifted.push(filename);
        }
    }
    return drifted;
}
