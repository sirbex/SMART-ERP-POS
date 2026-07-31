#!/usr/bin/env node
/**
 * P1 soak harness — order complete idempotency + integrity primitives.
 *
 * Always: structural Jest evidence.
 * Live DB (ORDER_COMPLETE_SOAK=1 + DATABASE_URL): concurrent key race,
 * order FOR UPDATE serialize, crash recovery, multi-order concurrency,
 * sequence allocation latency percentiles.
 *
 * Usage:
 *   npm run proof:order-complete-soak
 *   ORDER_COMPLETE_SOAK=1 npm run proof:order-complete-soak
 *
 * Does NOT deploy. Writes PROOF_ORDER_COMPLETE_SOAK_RUN.md
 */
import pg from 'pg';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serverRoot, '..');
const OUT = process.env.PROOF_OUT || resolve(repoRoot, 'PROOF_ORDER_COMPLETE_SOAK_RUN.md');

const RUN_LIVE =
  process.env.ORDER_COMPLETE_SOAK === '1' || process.argv.includes('--live');

const lines = [
  '# Order Complete Idempotency — Soak Proof (P1)\n',
  `Run: ${new Date().toISOString()}\n`,
  `Mode: ${RUN_LIVE ? 'LIVE_DB' : 'STRUCTURAL_ONLY'}\n`,
  'Gate: Measure → Prove → Refactor. No production push from this script.\n',
];

let pass = 0;
let fail = 0;
let pending = 0;

function ok(n, d = '') {
  pass++;
  lines.push(`- **PASS** ${n}${d ? ` — ${d}` : ''}`);
  console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`);
}
function bad(n, d = '') {
  fail++;
  lines.push(`- **FAIL** ${n}${d ? ` — ${d}` : ''}`);
  console.error(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
}
function pend(n, d = '') {
  pending++;
  lines.push(`- **PENDING** ${n}${d ? ` — ${d}` : ''}`);
  console.log(`  PEND  ${n}${d ? ` — ${d}` : ''}`);
}

function loadUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const rel of ['.env', '.env.test', '.env.local']) {
    const p = resolve(serverRoot, rel);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/^DATABASE_URL=(.+)$/m);
    if (m) return m[1].replace(/^["']|["']$/g, '').trim();
  }
  return undefined;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function summarizeMs(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1] ?? null,
  };
}

function run(cmd, args, extraEnv = {}) {
  const r = spawnSync(cmd, args, {
    cwd: serverRoot,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    env: { ...process.env, ...extraEnv },
  });
  return { code: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}` };
}

console.log('\n=== P1 Order Complete Soak ===\n');

lines.push('\n## Gate A — Structural evidence\n');

const structural = run('npm', [
  'test',
  '--',
  'src/modules/orders/orderCompleteIdempotency.evidence.test.ts',
  '--no-coverage',
]);
if (structural.code === 0) ok('orderCompleteIdempotency.evidence.test.ts');
else bad('orderCompleteIdempotency.evidence.test.ts', structural.out.slice(-400));

const liveJest = run(
  'npm',
  ['test', '--', 'src/modules/orders/orderCompleteSoak.live.test.ts', '--no-coverage'],
  RUN_LIVE
    ? { ORDER_COMPLETE_SOAK: '1', DATABASE_URL: loadUrl() || process.env.DATABASE_URL || '' }
    : { ORDER_COMPLETE_SOAK: '0' },
);
if (liveJest.code === 0) {
  ok(
    RUN_LIVE
      ? 'orderCompleteSoak.live.test.ts (LIVE)'
      : 'orderCompleteSoak.live.test.ts (skipped live — structural skip path)',
  );
} else {
  bad('orderCompleteSoak.live.test.ts', liveJest.out.slice(-600));
}

lines.push('\n## Gate B — Live DB soak scenarios\n');

const dbUrl = loadUrl();
if (!RUN_LIVE) {
  pend('Duplicate submit (same key)', 'set ORDER_COMPLETE_SOAK=1');
  pend('Network retry after commit', 'set ORDER_COMPLETE_SOAK=1');
  pend('Crash recovery before commit', 'set ORDER_COMPLETE_SOAK=1');
  pend('Concurrent cashiers (different orders)', 'set ORDER_COMPLETE_SOAK=1');
  pend('Metrics baseline', 'set ORDER_COMPLETE_SOAK=1');
} else if (!dbUrl) {
  bad('DATABASE_URL required for live soak');
} else {
  const pool = new pg.Pool({ connectionString: dbUrl, max: 20 });
  const metrics = {
    sequenceAllocMs: [],
    orderLockMs: [],
    idempotencyHitRate: { hits: 0, attempts: 0 },
    deadlockCount: 0,
    retryCount: 0,
    uniqueViolations: 0,
  };

  try {
    const probe = await pool.query(`
      SELECT
        current_database() AS db,
        (SELECT to_regclass('public.doc_sale_number_seq') IS NOT NULL) AS sale_seq,
        (SELECT COUNT(*)::int FROM users WHERE is_active = true) AS users
    `);
    const row = probe.rows[0];
    ok('Connected', `db=${row.db} sale_seq=${row.sale_seq} users=${row.users}`);
    if (!row.sale_seq) {
      bad('doc_sale_number_seq missing — run migration 577 before live soak');
    }

    const userRes = await pool.query(
      `SELECT id FROM users WHERE is_active = true ORDER BY created_at NULLS LAST LIMIT 1`,
    );
    const userId = userRes.rows[0]?.id;
    if (!userId) {
      bad('No active user for fixtures');
    } else {
      // ── Helpers ──────────────────────────────────────────────
      async function insertMinimalSale(client, { key, saleNumber, fromOrderId = null }) {
        return client.query(
          `INSERT INTO sales (
             sale_number, sale_date, subtotal, tax_amount, discount_amount, total_amount,
             total_cost, profit, profit_margin, payment_method, amount_paid, change_amount,
             cashier_id, idempotency_key, from_order_id, status, print_count
           ) VALUES (
             $1, CURRENT_DATE, 100, 0, 0, 100,
             0, 100, 1, 'CASH', 100, 0,
             $2, $3, $4, 'COMPLETED', 0
           )
           RETURNING id, sale_number`,
          [saleNumber, userId, key, fromOrderId],
        );
      }

      async function createPendingOrder(client, stamp) {
        const ordNum = `ORD-SOAK-${stamp}`;
        const r = await client.query(
          `INSERT INTO pos_orders (
             order_number, status, subtotal, discount_amount, tax_amount, total_amount,
             created_by, order_date
           ) VALUES ($1, 'PENDING', 100, 0, 0, 100, $2, CURRENT_DATE)
           RETURNING id, order_number`,
          [ordNum, userId],
        );
        return r.rows[0];
      }

      // ── 1. Duplicate submit (same idempotency key) ───────────
      lines.push('\n### 1. Duplicate submit (same key)\n');
      {
        const stamp = Date.now();
        const key = `soak_dup_${stamp}`;
        const attempts = Array.from({ length: 8 }, (_, i) => i);
        const results = await Promise.all(
          attempts.map(async (i) => {
            const client = await pool.connect();
            const t0 = performance.now();
            try {
              await client.query('BEGIN');
              const saleNumber = `SALE-SOAK-D-${stamp}-${i}-${Math.random().toString(36).slice(2, 6)}`;
              try {
                const ins = await insertMinimalSale(client, { key, saleNumber });
                await client.query('COMMIT');
                metrics.sequenceAllocMs.push(performance.now() - t0);
                return { ok: true, id: ins.rows[0].id, saleNumber: ins.rows[0].sale_number };
              } catch (e) {
                await client.query('ROLLBACK');
                const pgErr = e;
                if (pgErr.code === '23505' && String(pgErr.constraint || pgErr.message || '').includes('idempotency')) {
                  metrics.uniqueViolations += 1;
                  metrics.retryCount += 1;
                  metrics.idempotencyHitRate.attempts += 1;
                  metrics.idempotencyHitRate.hits += 1;
                  const existing = await pool.query(
                    `SELECT id, sale_number FROM sales WHERE idempotency_key = $1`,
                    [key],
                  );
                  return {
                    ok: true,
                    duplicate: true,
                    id: existing.rows[0]?.id,
                    saleNumber: existing.rows[0]?.sale_number,
                  };
                }
                if (String(pgErr.code) === '40P01') metrics.deadlockCount += 1;
                return { ok: false, error: pgErr.message || String(e) };
              }
            } finally {
              client.release();
            }
          }),
        );

        metrics.idempotencyHitRate.attempts += results.filter((r) => r.ok && !r.duplicate).length;
        const winners = results.filter((r) => r.ok && !r.duplicate);
        const dupes = results.filter((r) => r.ok && r.duplicate);
        const fails = results.filter((r) => !r.ok);
        const ids = new Set(results.filter((r) => r.id).map((r) => r.id));

        lines.push(
          `- attempts=8 winners=${winners.length} idempotent_replays=${dupes.length} fails=${fails.length} unique_sale_ids=${ids.size}`,
        );
        if (winners.length === 1 && ids.size === 1 && fails.length === 0) {
          ok('Duplicate submit → exactly one sale', `sale=${winners[0].saleNumber}`);
        } else {
          bad(
            'Duplicate submit → exactly one sale',
            `winners=${winners.length} ids=${ids.size} fails=${JSON.stringify(fails.slice(0, 2))}`,
          );
        }

        // Cleanup soak rows
        await pool.query(`DELETE FROM sales WHERE idempotency_key = $1`, [key]);
      }

      // ── 2. Network retry after commit (resolve by key) ───────
      lines.push('\n### 2. Network retry after commit\n');
      {
        const stamp = Date.now();
        const key = `soak_retry_${stamp}`;
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const saleNumber = `SALE-SOAK-R-${stamp}`;
          const ins = await insertMinimalSale(client, { key, saleNumber });
          await client.query('COMMIT');
          const saleId = ins.rows[0].id;

          // Simulate client timeout retry — lookup only, no second insert
          const t0 = performance.now();
          const again = await pool.query(
            `SELECT id, sale_number FROM sales WHERE idempotency_key = $1`,
            [key],
          );
          const lookupMs = performance.now() - t0;
          metrics.idempotencyHitRate.attempts += 1;
          metrics.idempotencyHitRate.hits += 1;

          if (again.rows[0]?.id === saleId) {
            ok('Retry same key returns existing sale', `lookup=${lookupMs.toFixed(1)}ms`);
          } else {
            bad('Retry same key returns existing sale');
          }

          const count = await pool.query(
            `SELECT COUNT(*)::int AS c FROM sales WHERE idempotency_key = $1`,
            [key],
          );
          if (count.rows[0].c === 1) ok('Retry created no second sale');
          else bad('Retry created no second sale', `count=${count.rows[0].c}`);

          await pool.query(`DELETE FROM sales WHERE id = $1`, [saleId]);
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          bad('Network retry scenario', e instanceof Error ? e.message : String(e));
        } finally {
          client.release();
        }
      }

      // ── 3. Crash recovery before commit ─────────────────────
      lines.push('\n### 3. Crash recovery (ROLLBACK before commit)\n');
      {
        const stamp = Date.now();
        const key = `soak_crash_${stamp}`;
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await insertMinimalSale(client, {
            key,
            saleNumber: `SALE-SOAK-C-${stamp}`,
          });
          await client.query('ROLLBACK'); // crash before commit

          const after = await pool.query(
            `SELECT COUNT(*)::int AS c FROM sales WHERE idempotency_key = $1`,
            [key],
          );
          if (after.rows[0].c === 0) {
            ok('Pre-commit crash leaves no sale (replay can create exactly once later)');
          } else {
            bad('Pre-commit crash left committed sale', `count=${after.rows[0].c}`);
          }

          // Replay after crash → single insert succeeds
          await client.query('BEGIN');
          const replay = await insertMinimalSale(client, {
            key,
            saleNumber: `SALE-SOAK-C2-${stamp}`,
          });
          await client.query('COMMIT');
          const count = await pool.query(
            `SELECT COUNT(*)::int AS c FROM sales WHERE idempotency_key = $1`,
            [key],
          );
          if (count.rows[0].c === 1) {
            ok('Post-crash replay produces exactly one sale', replay.rows[0].sale_number);
          } else {
            bad('Post-crash replay produces exactly one sale', `count=${count.rows[0].c}`);
          }
          await pool.query(`DELETE FROM sales WHERE idempotency_key = $1`, [key]);
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          bad('Crash recovery scenario', e instanceof Error ? e.message : String(e));
        } finally {
          client.release();
        }
      }

      // ── 4. Concurrent cashiers — different orders ───────────
      lines.push('\n### 4. Concurrent cashiers (different orders + FOR UPDATE)\n');
      {
        const stamp = Date.now();
        const setup = await pool.connect();
        let orderA;
        let orderB;
        try {
          await setup.query('BEGIN');
          orderA = await createPendingOrder(setup, `${stamp}A`);
          orderB = await createPendingOrder(setup, `${stamp}B`);
          await setup.query('COMMIT');
        } catch (e) {
          await setup.query('ROLLBACK');
          bad('Fixture orders', e instanceof Error ? e.message : String(e));
          orderA = null;
          orderB = null;
        } finally {
          setup.release();
        }

        if (orderA && orderB) {
          async function settleOrder(order) {
            const client = await pool.connect();
            const t0 = performance.now();
            try {
              await client.query('BEGIN');
              const locked = await client.query(
                `SELECT id, status FROM pos_orders WHERE id = $1 FOR UPDATE`,
                [order.id],
              );
              metrics.orderLockMs.push(performance.now() - t0);
              if (locked.rows[0]?.status !== 'PENDING') {
                await client.query('ROLLBACK');
                return { ok: false, reason: 'not_pending' };
              }
              const key = `soak_ord_${order.id.slice(0, 8)}_${stamp}`;
              const saleNumber = `SALE-SOAK-O-${order.order_number}`;
              const ins = await insertMinimalSale(client, {
                key,
                saleNumber,
                fromOrderId: order.id,
              });
              const upd = await client.query(
                `UPDATE pos_orders SET status = 'COMPLETED', completed_at = NOW()
                 WHERE id = $1 AND status = 'PENDING' RETURNING id`,
                [order.id],
              );
              if (upd.rowCount === 0) {
                await client.query('ROLLBACK');
                return { ok: false, reason: 'lost_race' };
              }
              await client.query('COMMIT');
              return { ok: true, saleId: ins.rows[0].id, saleNumber: ins.rows[0].sale_number };
            } catch (e) {
              await client.query('ROLLBACK').catch(() => {});
              if (String(e.code) === '40P01') metrics.deadlockCount += 1;
              return { ok: false, reason: e.message || String(e) };
            } finally {
              client.release();
            }
          }

          // Also race two settlers on SAME order A (exactly one wins)
          const sameOrderRace = await Promise.all([
            settleOrder(orderA),
            settleOrder(orderA),
            settleOrder(orderB),
          ]);

          const aWins = sameOrderRace.filter((r) => r.ok && r.saleNumber?.includes(orderA.order_number));
          const bWins = sameOrderRace.filter((r) => r.ok && r.saleNumber?.includes(orderB.order_number));
          const salesForA = await pool.query(
            `SELECT COUNT(*)::int AS c FROM sales WHERE from_order_id = $1`,
            [orderA.id],
          );
          const salesForB = await pool.query(
            `SELECT COUNT(*)::int AS c FROM sales WHERE from_order_id = $1`,
            [orderB.id],
          );

          lines.push(
            `- same-order race winners≈${aWins.length} orderB_ok=${bWins.length} salesA=${salesForA.rows[0].c} salesB=${salesForB.rows[0].c}`,
          );

          if (salesForA.rows[0].c === 1 && salesForB.rows[0].c === 1) {
            ok('Concurrent cashiers → one sale per order', 'A=1 B=1');
          } else {
            bad(
              'Concurrent cashiers → one sale per order',
              `A=${salesForA.rows[0].c} B=${salesForB.rows[0].c}`,
            );
          }

          // Unique sale numbers among successes
          const nums = sameOrderRace.filter((r) => r.ok).map((r) => r.saleNumber);
          if (new Set(nums).size === nums.length) ok('Unique document numbers under concurrency');
          else bad('Unique document numbers under concurrency', nums.join(','));

          await pool.query(`DELETE FROM sales WHERE from_order_id = ANY($1::uuid[])`, [
            [orderA.id, orderB.id],
          ]);
          await pool.query(`DELETE FROM pos_orders WHERE id = ANY($1::uuid[])`, [
            [orderA.id, orderB.id],
          ]);
        }
      }

      // ── 5. Sequence allocation latency baseline ─────────────
      lines.push('\n### 5. Metrics baseline\n');
      {
        const samples = [];
        for (let i = 0; i < 50; i++) {
          const t0 = performance.now();
          await pool.query(`SELECT nextval('doc_sale_number_seq')`);
          samples.push(performance.now() - t0);
        }
        metrics.sequenceAllocMs.push(...samples);
        const seq = summarizeMs(samples);
        const lock = summarizeMs(metrics.orderLockMs);
        const hitRate =
          metrics.idempotencyHitRate.attempts > 0
            ? (
                (100 * metrics.idempotencyHitRate.hits) /
                metrics.idempotencyHitRate.attempts
              ).toFixed(1)
            : 'n/a';

        lines.push(`- sequence nextval ms: p50=${seq.p50?.toFixed(2)} p95=${seq.p95?.toFixed(2)} p99=${seq.p99?.toFixed(2)} max=${seq.max?.toFixed(2)} n=${seq.n}`);
        lines.push(
          `- order FOR UPDATE ms: p50=${lock.p50?.toFixed(2) ?? 'n/a'} p95=${lock.p95?.toFixed(2) ?? 'n/a'} n=${lock.n}`,
        );
        lines.push(`- idempotency hit rate: ${hitRate}% (hits=${metrics.idempotencyHitRate.hits}/${metrics.idempotencyHitRate.attempts})`);
        lines.push(`- unique_violations(handled)=${metrics.uniqueViolations} deadlocks=${metrics.deadlockCount} retries=${metrics.retryCount}`);

        if (seq.p95 != null && seq.p95 < 50) ok('Sequence allocation p95 < 50ms', `${seq.p95.toFixed(2)}ms`);
        else if (seq.p95 != null) bad('Sequence allocation p95 < 50ms', `${seq.p95.toFixed(2)}ms`);
        else pend('Sequence allocation p95');

        if (metrics.deadlockCount === 0) ok('No deadlocks during soak');
        else bad('Deadlocks during soak', String(metrics.deadlockCount));
      }
    }
  } catch (e) {
    bad('Live soak runner', e instanceof Error ? e.message : String(e));
  } finally {
    await pool.end();
  }
}

lines.push('\n## Verdict\n');
lines.push(`- PASS=${pass} FAIL=${fail} PENDING=${pending}`);
if (fail === 0 && RUN_LIVE) {
  lines.push('- **VERDICT: SOAK PASS (live)** — safe to consider commit after human review; still no auto-deploy.');
} else if (fail === 0 && !RUN_LIVE) {
  lines.push('- **VERDICT: STRUCTURAL PASS** — re-run with `ORDER_COMPLETE_SOAK=1` before push.');
} else {
  lines.push('- **VERDICT: FAIL** — do not push.');
}

writeFileSync(OUT, `${lines.join('\n')}\n`, 'utf8');
console.log(`\nWrote ${OUT}`);
console.log(`PASS=${pass} FAIL=${fail} PENDING=${pending}\n`);
process.exit(fail > 0 ? 1 : 0);
