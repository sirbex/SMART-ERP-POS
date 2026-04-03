import type { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { schemaVersionRepository } from './schemaVersionRepository.js';
import { CURRENT_SCHEMA_VERSION } from '../../constants/schemaVersion.js';
import logger from '../../utils/logger.js';

// ============================================================================
// SQL directory resolution
// ============================================================================
// In Docker production:  /app/shared/sql/
// In local development:  ../../shared/sql/ (relative to SamplePOS.Server/)
//
// We try the Docker path first, then fall back to local development path.
function resolveSqlDir(): string {
    const candidates = [
        '/app/shared/sql',                                               // Docker production
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
            .filter((f: string) => !/^999_rollback|^apply-|^fix_/i.test(f))
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
};
