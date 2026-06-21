import type { Pool } from 'pg';

/**
 * Migrations that only ALTER constraints / account flags (no CREATE TABLE anchors).
 * Drift = schema_migrations says applied but postcondition SQL checks fail.
 */
export const MIGRATION_POSTCONDITION_FILES = [
    '417_customer_opening_balance.sql',
    '20260616_cutover_accounting.sql',
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

export async function verifyMigrationPostcondition(
    pool: Pool,
    filename: string,
): Promise<boolean> {
    switch (filename) {
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
