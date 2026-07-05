#!/usr/bin/env node
/**
 * Prove migration idempotency: run migrate.mjs twice; pass 2 must apply zero files.
 *
 * Usage:
 *   node shared/sql/migrate-verify-idempotent.mjs
 *   DATABASE_URL=postgresql://... node shared/sql/migrate-verify-idempotent.mjs
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrateScript = path.join(__dirname, 'migrate.mjs');

function runMigratePass(label) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(` ${label}`);
    console.log(`${'═'.repeat(60)}\n`);

    const result = spawnSync(process.execPath, [migrateScript], {
        cwd: __dirname,
        encoding: 'utf8',
        env: process.env,
    });

    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    process.stdout.write(output);

    return {
        status: result.status ?? 1,
        output,
    };
}

const pass1 = runMigratePass('Pass 1 — apply pending migrations');
if (pass1.status !== 0) {
    console.error('\n⛔ Pass 1 failed.');
    process.exit(1);
}

const pass2 = runMigratePass('Pass 2 — idempotency (expect zero pending)');
if (pass2.status !== 0) {
    console.error('\n⛔ Pass 2 failed.');
    process.exit(1);
}

const upToDate =
    pass2.output.includes('No pending migrations') ||
    pass2.output.includes('up to date');

if (!upToDate) {
    console.error('\n⛔ Idempotency check failed: pass 2 still had pending migrations.');
    process.exit(1);
}

console.log('\n✅ Migration idempotency verified (pass 2 applied zero changes).\n');
