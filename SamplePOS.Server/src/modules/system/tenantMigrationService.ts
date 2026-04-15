import type { Pool } from 'pg';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { schemaVersionRepository } from './schemaVersionRepository.js';
import { CURRENT_SCHEMA_VERSION } from '../../constants/schemaVersion.js';
import logger from '../../utils/logger.js';

const { Pool: PgPool } = pg;

// ============================================================================
// SQL directory resolution
// ============================================================================
// In Docker production:  /app/shared/sql/
// In local development:  ../../shared/sql/ (relative to SamplePOS.Server/)
//
// We try the Docker path first, then fall back to local development path.
function resolveSqlDir(): string {
    const candidates = [
        '/app/shared/sql',                                               // Docker production (if mounted)
        '/shared/sql',                                                   // Docker production (Dockerfile COPY ../shared/sql)
        path.resolve(process.cwd(), '..', 'shared', 'sql'),             // Local (cwd = SamplePOS.Server)
        path.resolve(process.cwd(), 'shared', 'sql'),                   // Local (cwd = repo root)
    ];
    for (const dir of candidates) {
        if (fs.existsSync(dir)) return dir;
    }
    throw new Error(`Cannot find shared/sql directory. Tried: ${candidates.join(', ')}`);
}

// ============================================================================
// Per-tenant migration lock (in-memory)
// ============================================================================
// Prevents concurrent migration attempts for the same tenant DB when
// multiple requests arrive simultaneously for an outdated tenant.
const migrationLocks = new Map<string, Promise<void>>();

// ============================================================================
// Up-to-date cache (in-memory)
// ============================================================================
// Once a tenant has been verified/migrated during this process lifetime,
// skip the DB check on subsequent requests. Cleared on process restart.
const verifiedTenants = new Set<string>();

// ============================================================================
// Service
// ============================================================================

export const tenantMigrationService = {
    /**
     * Ensure a tenant database is at CURRENT_SCHEMA_VERSION.
     *
     * Called from tenantMiddleware on every request.
     * Fast path: in-memory set lookup (~1 µs) after first verification.
     * Slow path: one DB query (MAX(version)) on first request per tenant per process.
     *
     * If the tenant is behind, pending migrations are applied atomically.
     * If any migration fails, the error propagates and the request is rejected.
     */
    async ensureTenantUpToDate(tenantPool: Pool, tenantSlug: string): Promise<void> {
        // Fast path: already verified this process lifetime
        if (verifiedTenants.has(tenantSlug)) return;

        // Serialise per-tenant: if another request is already migrating this
        // tenant, wait for that to finish rather than running in parallel.
        const existing = migrationLocks.get(tenantSlug);
        if (existing) {
            await existing;
            return; // The other caller either succeeded (added to verifiedTenants) or threw.
        }

        const task = this._doEnsure(tenantPool, tenantSlug);
        migrationLocks.set(tenantSlug, task);
        try {
            await task;
        } finally {
            migrationLocks.delete(tenantSlug);
        }
    },

    async _doEnsure(tenantPool: Pool, tenantSlug: string): Promise<void> {
        const tenantVersion = await schemaVersionRepository.getSchemaVersion(tenantPool);

        if (tenantVersion >= CURRENT_SCHEMA_VERSION) {
            verifiedTenants.add(tenantSlug);
            return;
        }

        logger.warn(`Tenant "${tenantSlug}" schema v${tenantVersion} detected. Upgrading to v${CURRENT_SCHEMA_VERSION}...`);

        await this._runPendingMigrations(tenantPool, tenantSlug);

        // Verify version is now current
        const newVersion = await schemaVersionRepository.getSchemaVersion(tenantPool);
        if (newVersion < CURRENT_SCHEMA_VERSION) {
            throw new Error(
                `Tenant "${tenantSlug}" migration incomplete: expected v${CURRENT_SCHEMA_VERSION}, got v${newVersion}`
            );
        }

        verifiedTenants.add(tenantSlug);
        logger.info(`Tenant "${tenantSlug}" migration complete. Now at v${newVersion}.`);
    },

    /**
     * Run pending migrations against a tenant pool.
     * Replicates the logic from shared/sql/migrate.mjs but runs in-process.
     */
    async _runPendingMigrations(tenantPool: Pool, tenantSlug: string): Promise<void> {
        const sqlDir = resolveSqlDir();

        // 1. Bootstrap schema_migrations table (idempotent)
        await tenantPool.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id SERIAL PRIMARY KEY,
                filename TEXT UNIQUE NOT NULL,
                executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                checksum TEXT
            );
        `);

        // 2. Get already-applied migrations
        const { rows: applied } = await tenantPool.query(
            'SELECT filename FROM schema_migrations ORDER BY filename'
        );
        const appliedSet = new Set(applied.map((r: { filename: string }) => r.filename));

        // 3. Discover SQL files (same filter as migrate.mjs)
        const allFiles = fs
            .readdirSync(sqlDir)
            .filter((f: string) => f.endsWith('.sql'))
            .filter((f: string) => !/^999_rollback|^apply-|^fix_|^backfill_/i.test(f))
            .sort();

        // 4. Filter to pending
        const pending = allFiles.filter((f: string) => !appliedSet.has(f));

        if (pending.length === 0) {
            logger.info(`Tenant "${tenantSlug}": no pending migrations.`);
            return;
        }

        logger.info(`Tenant "${tenantSlug}": applying ${pending.length} pending migration(s)...`);

        // 5. Execute each migration in its own transaction
        for (const filename of pending) {
            const filePath = path.join(sqlDir, filename);
            const sql = fs.readFileSync(filePath, 'utf-8');
            const checksum = crypto.createHash('sha256').update(sql).digest('hex');

            const client = await tenantPool.connect();
            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query(
                    'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
                    [filename, checksum]
                );
                await client.query('COMMIT');
                logger.info(`Tenant "${tenantSlug}": ✅ ${filename}`);
            } catch (err) {
                await client.query('ROLLBACK').catch(() => { /* ignore rollback error */ });
                const msg = err instanceof Error ? err.message : String(err);
                logger.error(`Tenant "${tenantSlug}": ❌ ${filename}: ${msg}`);
                throw new Error(
                    `Tenant "${tenantSlug}" migration failed on ${filename}: ${msg}`
                );
            } finally {
                client.release();
            }
        }
    },

    /**
     * Clear the in-memory verified set. Useful for testing.
     */
    clearCache(): void {
        verifiedTenants.clear();
        migrationLocks.clear();
    },

    // ========================================================================
    // Startup: sync ALL tenants to master schema version
    // ========================================================================

    /**
     * Required tables that every tenant DB must have for core features.
     * If any are missing after migration, a CRITICAL error is logged.
     */
    REQUIRED_TABLES: [
        'products', 'product_inventory', 'product_valuation',
        'customers', 'suppliers', 'sales', 'sale_items',
        'invoices', 'invoice_line_items',
        'purchase_orders', 'purchase_order_items',
        'inventory_batches', 'stock_movements',
        'users', 'schema_migrations', 'schema_version',
        'accounts', 'ledger_transactions', 'ledger_entries',
        'product_categories', 'uoms', 'product_uoms',
    ] as readonly string[],

    /**
     * Sync ALL active tenants to current schema version.
     * Called at application startup and by the CLI `migrate:tenants` command.
     *
     * Returns a summary of what happened per tenant.
     */
    async syncAllTenants(masterPool: Pool): Promise<{
        total: number;
        upgraded: number;
        upToDate: number;
        failed: string[];
    }> {
        const result = { total: 0, upgraded: 0, upToDate: 0, failed: [] as string[] };

        // 1. Read all active tenants from master registry
        const { rows: tenants } = await masterPool.query<{
            slug: string;
            database_name: string;
            database_host: string;
            database_port: number;
        }>(
            `SELECT slug, database_name, database_host, database_port
             FROM tenants WHERE status = 'ACTIVE'`
        );
        result.total = tenants.length;

        if (tenants.length === 0) {
            logger.info('No active tenants found — nothing to sync.');
            return result;
        }

        logger.info(`Starting tenant schema sync for ${tenants.length} active tenant(s)...`);

        // 2. For each tenant, connect and run pending migrations
        const dbUser = process.env.DB_USER || 'postgres';
        const dbPassword = process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD || 'password';

        for (const tenant of tenants) {
            let tenantPool: pg.Pool | null = null;
            try {
                tenantPool = new PgPool({
                    host: tenant.database_host,
                    port: tenant.database_port,
                    database: tenant.database_name,
                    user: dbUser,
                    password: dbPassword,
                    max: 3, // small pool for migration work
                    idleTimeoutMillis: 5000,
                    connectionTimeoutMillis: 10000,
                });

                // Set UTC timezone on every connection
                tenantPool.on('connect', (client: pg.PoolClient) => {
                    client.query('SET timezone = "UTC"');
                });

                const versionBefore = await schemaVersionRepository.getSchemaVersion(tenantPool);

                if (versionBefore >= CURRENT_SCHEMA_VERSION) {
                    verifiedTenants.add(tenant.slug);
                    result.upToDate++;
                    continue;
                }

                logger.warn(
                    `Tenant "${tenant.slug}" schema v${versionBefore} is behind master v${CURRENT_SCHEMA_VERSION}. Upgrading...`
                );

                await this._runPendingMigrations(tenantPool, tenant.slug);

                const versionAfter = await schemaVersionRepository.getSchemaVersion(tenantPool);
                verifiedTenants.add(tenant.slug);
                result.upgraded++;
                logger.info(
                    `Tenant "${tenant.slug}" upgraded from v${versionBefore} to v${versionAfter}`
                );
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                result.failed.push(tenant.slug);
                logger.error(`Tenant "${tenant.slug}" migration FAILED: ${msg}`);
            } finally {
                if (tenantPool) {
                    await tenantPool.end().catch(() => { /* ignore */ });
                }
            }
        }

        // 3. Summary
        logger.info(
            `Tenant schema sync complete: ${result.total} total, ${result.upgraded} upgraded, ${result.upToDate} up-to-date, ${result.failed.length} failed`
        );
        if (result.failed.length > 0) {
            logger.error(`FAILED tenants: ${result.failed.join(', ')}`);
        }

        return result;
    },

    /**
     * Startup health check: verify all active tenants have required tables.
     * Logs CRITICAL for any missing tables. Non-blocking — does not prevent startup.
     */
    async healthCheckAllTenants(masterPool: Pool): Promise<void> {
        const { rows: tenants } = await masterPool.query<{
            slug: string;
            database_name: string;
            database_host: string;
            database_port: number;
        }>(
            `SELECT slug, database_name, database_host, database_port
             FROM tenants WHERE status = 'ACTIVE'`
        );

        if (tenants.length === 0) return;

        const dbUser = process.env.DB_USER || 'postgres';
        const dbPassword = process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD || 'password';

        for (const tenant of tenants) {
            let tenantPool: pg.Pool | null = null;
            try {
                tenantPool = new PgPool({
                    host: tenant.database_host,
                    port: tenant.database_port,
                    database: tenant.database_name,
                    user: dbUser,
                    password: dbPassword,
                    max: 2,
                    idleTimeoutMillis: 5000,
                    connectionTimeoutMillis: 10000,
                });

                const { rows } = await tenantPool.query<{ tablename: string }>(
                    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
                );
                const existingTables = new Set(rows.map(r => r.tablename));

                const missing = this.REQUIRED_TABLES.filter(t => !existingTables.has(t));

                if (missing.length > 0) {
                    logger.error(
                        `CRITICAL: Tenant "${tenant.slug}" missing ${missing.length} required table(s): ${missing.join(', ')}`
                    );
                } else {
                    logger.info(`Tenant "${tenant.slug}" health check OK — all ${this.REQUIRED_TABLES.length} required tables present`);
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                logger.error(`CRITICAL: Tenant "${tenant.slug}" health check FAILED: ${msg}`);
            } finally {
                if (tenantPool) {
                    await tenantPool.end().catch(() => { /* ignore */ });
                }
            }
        }
    },
};
