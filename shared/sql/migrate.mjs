#!/usr/bin/env node
/**
 * Database Migration Runner with Tracking
 *
 * Reads all .sql files from shared/sql/, checks schema_migrations table,
 * and only executes files that haven't been applied yet.
 *
 * Usage:
 *   node shared/sql/migrate.mjs
 *   node shared/sql/migrate.mjs --dry-run
 *   DATABASE_URL=postgresql://... node shared/sql/migrate.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import crypto from 'crypto';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve pg from the backend's node_modules (migrate.mjs lives in shared/sql/)
const require = createRequire(
    pathToFileURL(path.resolve(__dirname, '..', '..', 'SamplePOS.Server', 'package.json')).href
);
const pg = require('pg');

const DRY_RUN = process.argv.includes('--dry-run');

const DATABASE_URL =
    process.env.DATABASE_URL ||
    'postgresql://postgres:password@localhost:5432/pos_system';

async function main() {
    const pool = new pg.Pool({ connectionString: DATABASE_URL });

    try {
        // 1. Ensure schema_migrations table exists (bootstrap)
        await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        checksum TEXT
      );
    `);

        // 2. Get already-applied migrations
        const { rows: applied } = await pool.query(
            'SELECT filename FROM schema_migrations ORDER BY filename'
        );
        const appliedSet = new Set(applied.map((r) => r.filename));

        // 3. Discover SQL files (exclude rollbacks and helper scripts)
        const sqlDir = __dirname;
        const allFiles = fs
            .readdirSync(sqlDir)
            .filter((f) => f.endsWith('.sql'))
            .filter((f) => !/^999_rollback|^apply-|^fix_/i.test(f))
            .sort();

        // 4. Filter to pending migrations
        const pending = allFiles.filter((f) => !appliedSet.has(f));

        if (pending.length === 0) {
            console.log('✅ Database is up to date. No pending migrations.');
            return;
        }

        console.log(
            `\n📋 ${pending.length} pending migration(s)${DRY_RUN ? ' (DRY RUN)' : ''}:\n`
        );

        let success = 0;
        let failed = 0;

        for (const filename of pending) {
            const filePath = path.join(sqlDir, filename);
            const sql = fs.readFileSync(filePath, 'utf-8');
            const checksum = crypto.createHash('sha256').update(sql).digest('hex');

            if (DRY_RUN) {
                console.log(`  ⏭  [dry-run] ${filename}`);
                success++;
                continue;
            }

            // Run each migration in its own transaction
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(sql);
                await client.query(
                    'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
                    [filename, checksum]
                );
                await client.query('COMMIT');
                console.log(`  ✅ ${filename}`);
                success++;
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`  ❌ ${filename}: ${err instanceof Error ? err.message : err}`);
                failed++;
                // Stop on first failure to prevent cascading errors
                console.error('\n⛔ Stopping migration due to failure.');
                break;
            } finally {
                client.release();
            }
        }

        console.log(
            `\n${DRY_RUN ? '🔍 Dry run' : '📊 Results'}: ${success} applied, ${failed} failed, ${pending.length - success - failed} skipped\n`
        );

        if (failed > 0) process.exit(1);
    } finally {
        await pool.end();
    }
}

main().catch((err) => {
    console.error('Migration runner error:', err);
    process.exit(1);
});
