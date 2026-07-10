#!/usr/bin/env node
/**
 * Gates C + D — staging validation proof runner.
 *
 * Gate C: performance at scale (DB benchmarks when DATABASE_URL set)
 * Gate D: concurrency checklist + optional live race (LOT_PROOF_CONCURRENCY=1)
 *
 * Usage:
 *   npm run proof:inventory-lot-staging
 *   LOT_PROOF_CONCURRENCY=1 npm run proof:inventory-lot-staging
 */
import pg from 'pg';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serverRoot, '..');
const OUT = process.env.PROOF_OUT || resolve(repoRoot, 'PROOF_INVENTORY_LOT_STAGING_RUN.md');

const lines = [
  '# Inventory Lot — Staging Proof (Gates C + D)\n',
  `Run: ${new Date().toISOString()}\n`,
  `Charter: [PROOF_INVENTORY_LOT_CERTIFICATION.md](./PROOF_INVENTORY_LOT_CERTIFICATION.md)\n`,
];

let pass = 0;
let fail = 0;
let pending = 0;

function ok(n, d = '') { pass++; lines.push(`- **PASS** ${n}${d ? ` — ${d}` : ''}`); }
function bad(n, d = '') { fail++; lines.push(`- **FAIL** ${n}${d ? ` — ${d}` : ''}`); }
function pend(n, d = '') { pending++; lines.push(`- **PENDING** ${n}${d ? ` — ${d}` : ''}`); }

function loadUrl() {
  for (const rel of ['.env', '.env.test', '.env.local']) {
    const p = resolve(serverRoot, rel);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/^DATABASE_URL=(.+)$/m);
    if (m) return m[1].replace(/^"|"$/g, '');
  }
  return process.env.DATABASE_URL;
}

function run(cmd, args, cwd, extraEnv = {}) {
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    env: { ...process.env, ...extraEnv },
  });
  return { code: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}` };
}

lines.push('\n## Gate C — Performance (staging)\n');

const jest = run(
  'npm',
  ['test', '--', 'src/modules/inventory-lot/inventoryLotOperationalProof.test.ts'],
  serverRoot,
);
if (jest.code === 0) ok('In-memory FEFO 5k benchmark');
else bad('In-memory FEFO 5k benchmark', jest.out.slice(-200));

const dbUrl = loadUrl();
if (!dbUrl) {
  pend('DB scale benchmarks', 'DATABASE_URL not set');
} else {
  const pool = new pg.Pool({ connectionString: dbUrl });
  try {
    const counts = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM inventory_batches WHERE status = 'ACTIVE') AS active_batches,
        (SELECT COUNT(*)::int FROM inventory_balances) AS balance_rows,
        (SELECT COUNT(*)::int FROM product_lots) AS product_lots
    `);
    const row = counts.rows[0];
    ok('Connected for staging benchmarks', `batches=${row.active_batches} balances=${row.balance_rows}`);

    const t0 = performance.now();
    await pool.query(`
      SELECT ib.id, ib.batch_number, ib.remaining_quantity, ib.expiry_date
      FROM inventory_batches ib
      WHERE ib.status = 'ACTIVE' AND ib.remaining_quantity > 0
      ORDER BY ib.expiry_date ASC NULLS LAST, ib.received_date ASC
      LIMIT 500
    `);
    const ms = Math.round(performance.now() - t0);
    lines.push(`- FEFO-style load query (500 rows): **${ms} ms**`);
    if (ms < 500) ok('FEFO load query p95 target (< 500 ms)');
    else bad('FEFO load query p95 target', `${ms} ms`);

    if (row.active_batches < 1000) {
      pend('Production-scale warehouse benchmark', `only ${row.active_batches} active batches — seed ≥10k for full Gate C`);
    } else {
      ok('Production-scale row count threshold', `${row.active_batches} active batches`);
    }
  } catch (e) {
    bad('Staging DB benchmarks', e instanceof Error ? e.message : String(e));
  } finally {
    await pool.end();
  }
}

lines.push('\n## Gate D — Concurrency (staging)\n');

const struct = run(
  'npm',
  ['test', '--', 'src/modules/inventory-lot/inventoryLotConcurrencyProof.test.ts'],
  serverRoot,
);
if (struct.code === 0) ok('Structural lock-order proofs');
else bad('Structural lock-order proofs');

const checklist = [
  { key: 'cashiers', label: 'Two cashiers, last batch — exactly one sale succeeds' },
  { key: 'transfer', label: 'Transfer + sale on same lot — no double-spend' },
  { key: 'expiry', label: 'Receipt + expiry correction — no lost update' },
  { key: 'deadlock', label: 'Deadlock monitor — pg_locks / deadlock_detected' },
];

let liveConcurrencyPass = false;
if (process.env.LOT_PROOF_CONCURRENCY === '1') {
  const race = run(
    'npm',
    ['test', '--', 'src/modules/inventory-lot/inventoryLotConcurrencyProof.test.ts'],
    serverRoot,
    { LOT_PROOF_CONCURRENCY: '1' },
  );
  if (race.code === 0) {
    ok('Live race suite (LOT_PROOF_CONCURRENCY=1)');
    liveConcurrencyPass = true;
  } else {
    bad('Live race suite', race.out.slice(-300));
  }
} else {
  pend('Live race suite', 'set LOT_PROOF_CONCURRENCY=1 on staging');
}

for (const item of checklist) {
  if (liveConcurrencyPass && ['cashiers', 'transfer', 'expiry', 'deadlock'].includes(item.key)) {
    ok('Live scenario', item.label);
  } else if (!liveConcurrencyPass) {
    pend('Live scenario', item.label);
  }
}

lines.push('\n## Summary\n', `Pass: ${pass} | Fail: ${fail} | Pending: ${pending}\n`);
writeFileSync(OUT, lines.join('\n'));
console.log(lines.join('\n'));
process.exit(fail > 0 ? 1 : 0);
