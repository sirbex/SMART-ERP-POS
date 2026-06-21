#!/usr/bin/env node
/**
 * Tenant Schema Migration Runner (CLI)
 *
 * Force-syncs ALL active tenant databases to the master schema.
 * Uses the same migration files as the master DB runner (shared/sql/*.sql).
 *
 * Usage:
 *   npm run migrate:tenants
 *   npm run migrate:tenants -- --dry-run
 *   DATABASE_URL=postgresql://... node shared/sql/migrate-tenants.mjs
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';
import { createRequire } from 'module';
import {
  buildMigrationTableAnchors,
  findDriftedMigrationFiles,
  relationSatisfiesAnchor,
  NUMBERED_MIGRATION,
  MIGRATION_FILE_EXCLUDE,
} from '../../scripts/lib/migrationTableAnchors.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve pg from the backend's node_modules
const require = createRequire(
    pathToFileURL(path.resolve(__dirname, '..', '..', 'SamplePOS.Server', 'package.json')).href
);
const pg = require('pg');

const DRY_RUN = process.argv.includes('--dry-run');

const DATABASE_URL =
    process.env.DATABASE_URL ||
    'postgresql://postgres:password@localhost:5432/pos_system';

// DB credentials for connecting to tenant databases
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || process.env.DATABASE_PASSWORD || 'password';

// Numbered migrations only — manual scripts (rebuild_*, repair_*, fix_*, etc.) never auto-run
const PLATFORM_MIGRATION_FILES = new Set(['400_multi_tenant.sql']);

async function applyMigrationFile(tenantPool, tenantSlug, filename, sqlDir) {
    const filePath = path.join(sqlDir, filename);
    const sql = fs.readFileSync(filePath, 'utf-8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    const client = await tenantPool.connect();
    try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
            `INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)
             ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum, executed_at = now()`,
            [filename, checksum]
        );
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK').catch(() => { });
        throw err;
    } finally {
        client.release();
    }
}

async function repairMigrationDrift(tenantPool, tenantSlug, sqlDir, anchors) {
    const { rows } = await tenantPool.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
    );
    const { rows: viewRows } = await tenantPool.query(
        `SELECT viewname FROM pg_views WHERE schemaname = 'public'`
    );
    const existing = new Set(rows.map((r) => r.tablename));
    const views = new Set(viewRows.map((r) => r.viewname));
    const drifted = findDriftedMigrationFiles(existing, anchors, views);
    for (const filename of drifted) {
        console.log(`     🔧 ${tenantSlug}: drift repair ${filename}`);
        await applyMigrationFile(tenantPool, tenantSlug, filename, sqlDir);
        for (const t of anchors[filename]) existing.add(t);
    }
    return drifted.length;
}

async function main() {
    const masterPool = new pg.Pool({ connectionString: DATABASE_URL });

    try {
        // 1. Get all active tenants from master registry
        const { rows: tenants } = await masterPool.query(
            `SELECT slug, database_name, database_host, database_port
             FROM tenants WHERE status = 'ACTIVE' ORDER BY slug`
        );

        if (tenants.length === 0) {
            console.log('No active tenants found. Nothing to do.');
            return;
        }

        console.log(`\n📋 Found ${tenants.length} active tenant(s):\n`);
        for (const t of tenants) {
            console.log(`   - ${t.slug} (${t.database_name})`);
        }
        console.log('');

        // 2. Discover migration files
        const sqlDir = __dirname;
        const anchors = buildMigrationTableAnchors(sqlDir);
        const allFiles = fs
            .readdirSync(sqlDir)
            .filter((f) => f.endsWith('.sql'))
            .filter((f) => NUMBERED_MIGRATION.test(f))
            .filter((f) => !MIGRATION_FILE_EXCLUDE.test(f))
            .filter((f) => !PLATFORM_MIGRATION_FILES.has(f))
            .sort();

        let totalUpgraded = 0;
        let totalUpToDate = 0;
        let totalFailed = 0;
        const failedTenants = [];

        // 3. Process each tenant
        for (const tenant of tenants) {
            let tenantPool = null;
            try {
                tenantPool = new pg.Pool({
                    host: tenant.database_host,
                    port: tenant.database_port,
                    database: tenant.database_name,
                    user: DB_USER,
                    password: DB_PASSWORD,
                    max: 3,
                    idleTimeoutMillis: 5000,
                    connectionTimeoutMillis: 10000,
                });

                // Bootstrap schema_migrations table
                await tenantPool.query(`
                    CREATE TABLE IF NOT EXISTS schema_migrations (
                        id SERIAL PRIMARY KEY,
                        filename TEXT UNIQUE NOT NULL,
                        executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        checksum TEXT
                    );
                `);

                // Get applied migrations
                let { rows: applied } = await tenantPool.query(
                    'SELECT filename FROM schema_migrations ORDER BY filename'
                );
                let appliedSet = new Set(applied.map((r) => r.filename));

                if (!DRY_RUN) {
                    const repaired = await repairMigrationDrift(tenantPool, tenant.slug, sqlDir, anchors);
                    if (repaired > 0) {
                        console.log(`  🔧 ${tenant.slug}: repaired ${repaired} drifted migration(s)`);
                        ({ rows: applied } = await tenantPool.query(
                            'SELECT filename FROM schema_migrations ORDER BY filename'
                        ));
                        appliedSet = new Set(applied.map((r) => r.filename));
                    }
                }

                const pending = allFiles.filter((f) => !appliedSet.has(f));

                if (pending.length === 0) {
                    console.log(`  ✅ ${tenant.slug}: up to date (${appliedSet.size} migrations applied)`);
                    totalUpToDate++;
                    continue;
                }

                // Get version before
                let versionBefore = 0;
                try {
                    const { rows: vRows } = await tenantPool.query(
                        'SELECT COALESCE(MAX(version), 0) AS version FROM schema_version'
                    );
                    versionBefore = vRows[0]?.version ?? 0;
                } catch { /* table might not exist yet */ }

                console.log(
                    `  🔄 ${tenant.slug}: ${pending.length} pending migration(s)${DRY_RUN ? ' (DRY RUN)' : ''}...`
                );

                if (DRY_RUN) {
                    for (const f of pending) {
                        console.log(`     ⏭  [dry-run] ${f}`);
                    }
                    totalUpgraded++;
                    continue;
                }

                // Execute pending migrations
                let applied_count = 0;
                for (const filename of pending) {
                    await applyMigrationFile(tenantPool, tenant.slug, filename, sqlDir);
                    applied_count++;
                }

                // Get version after
                let versionAfter = 0;
                try {
                    const { rows: vRows } = await tenantPool.query(
                        'SELECT COALESCE(MAX(version), 0) AS version FROM schema_version'
                    );
                    versionAfter = vRows[0]?.version ?? 0;
                } catch { /* ignore */ }

                console.log(
                    `  ✅ ${tenant.slug}: upgraded from v${versionBefore} to v${versionAfter} (${applied_count} migrations applied)`
                );
                totalUpgraded++;
            } catch (err) {
                totalFailed++;
                failedTenants.push(tenant.slug);
                // Error already logged above for individual migration failure
            } finally {
                if (tenantPool) {
                    await tenantPool.end().catch(() => { });
                }
            }
        }

        // 4. Summary
        console.log(`\n${'━'.repeat(50)}`);
        console.log(
            `📊 Results: ${totalUpgraded} upgraded, ${totalUpToDate} up-to-date, ${totalFailed} failed`
        );
        if (failedTenants.length > 0) {
            console.log(`⚠️  Failed tenants: ${failedTenants.join(', ')}`);
        }
        console.log('');

        if (totalFailed > 0) process.exit(1);
    } finally {
        await masterPool.end();
    }
}

main().catch((err) => {
    console.error('Tenant migration runner error:', err);
    process.exit(1);
});
