#!/usr/bin/env node
/**
 * P4 — Checkout profile (Measure → Prove → Refactor).
 *
 * End-to-end HTTP load against POST /api/orders/:id/complete with real createSale
 * (FEFO + inventory + GL + payments). Records:
 *   - HTTP latency p50/p95/p99
 *   - In-TX phase rankings (via X-Checkout-Profile: 1)
 *   - pg_stat_activity waits / connection count
 *   - Inventory delta correctness
 *   - GL journal balance for created sales
 *
 * Prerequisites:
 *   - API at BASE_URL (default http://localhost:3001)
 *   - Admin credentials
 *   - Optional DATABASE_URL for integrity + lock metrics
 *
 * Usage:
 *   npm run proof:checkout-profile
 *   CONCURRENCY=4 ITERATIONS=12 npm run proof:checkout-profile
 *
 * Does NOT deploy. Writes PROOF_CHECKOUT_PROFILE_RUN.md
 */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverRoot = resolve(repoRoot, 'SamplePOS.Server');
const require = createRequire(resolve(serverRoot, 'package.json'));
const pg = require('pg');
const OUT = process.env.PROOF_OUT || resolve(repoRoot, 'PROOF_CHECKOUT_PROFILE_RUN.md');

const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || 4));
const ITERATIONS = Math.max(1, Number(process.env.ITERATIONS || 12));
const QTY = Math.max(1, Number(process.env.SALE_QTY || 1));

const lines = [
  '# Checkout Profile — Measure Run (P4/P5)\n',
  `Run: ${new Date().toISOString()}\n`,
  `BASE_URL=${BASE} CONCURRENCY=${CONCURRENCY} ITERATIONS=${ITERATIONS} QTY=${QTY}\n`,
  'Rule: Measure → Prove → Refactor. Stock+GL stay in TX. Compare to PROOF_CHECKOUT_P5_RUN.md.\n',
];

let pass = 0;
let fail = 0;
const ok = (n, d = '') => {
  pass++;
  lines.push(`- **PASS** ${n}${d ? ` — ${d}` : ''}`);
  console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`);
};
const bad = (n, d = '') => {
  fail++;
  lines.push(`- **FAIL** ${n}${d ? ` — ${d}` : ''}`);
  console.error(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
};

function loadDbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const rel of ['.env', '.env.test', '.env.local']) {
    const p = resolve(serverRoot, rel);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/^DATABASE_URL=(.+)$/m);
    if (m) return m[1].replace(/^["']|["']$/g, '').trim();
  }
  return undefined;
}

function pct(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: pct(sorted, 50),
    p95: pct(sorted, 95),
    p99: pct(sorted, 99),
    max: sorted.at(-1) ?? null,
    mean: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null,
  };
}

async function req(method, path, { token, body, headers: extra } = {}) {
  const headers = { 'Content-Type': 'application/json', ...(extra || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text?.slice(0, 800) };
  }
  return { status: res.status, data, text };
}

console.log('\n=== P4 Checkout Profile ===\n');

// ── Health ──────────────────────────────────────────────────────────
{
  const h = await req('GET', '/api/health').catch((e) => ({ status: 0, data: { error: String(e) } }));
  if (h.status === 200) ok('API health', BASE);
  else {
    bad('API health', `${h.status} — start server (tsx watch) before profiling`);
    writeFileSync(OUT, `${lines.join('\n')}\n`);
    process.exit(1);
  }
}

// ── Login ───────────────────────────────────────────────────────────
const login = await req('POST', '/api/auth/login', {
  body: { email: EMAIL, password: PASSWORD },
});
const token = login.data?.data?.token || login.data?.token;
if (!token) {
  bad('Login', JSON.stringify(login.data).slice(0, 200));
  writeFileSync(OUT, `${lines.join('\n')}\n`);
  process.exit(1);
}
ok('Login');

// ── Cash session (optional) ─────────────────────────────────────────
let sessionId = null;
{
  const cur = await req('GET', '/api/cash-registers/sessions/current', { token });
  sessionId = cur.data?.data?.id ?? null;
  if (!sessionId) {
    const regs = await req('GET', '/api/cash-registers', { token });
    const registerId = regs.data?.data?.[0]?.id;
    if (registerId) {
      const open = await req('POST', '/api/cash-registers/sessions/open', {
        token,
        body: { registerId, openingFloat: 0, notes: 'proof-checkout-profile' },
      });
      sessionId = open.data?.data?.id ?? null;
    }
  }
  lines.push(`- cashRegisterSessionId=${sessionId ?? 'none'}`);
}

const dbUrl = loadDbUrl();
let pool = null;
if (dbUrl) {
  pool = new pg.Pool({ connectionString: dbUrl, max: 10 });
}

// ── Pick inventory product with stock ───────────────────────────────
let product = null;
// Prefer DB stock when available (stock-levels "total_stock" can under-report for profiling).
if (pool && !process.env.PRODUCT_ID) {
  try {
    const need = ITERATIONS * QTY + 2;
    const selling = await pool.query(
      `SELECT id FROM store_locations WHERE store_type::text = 'SELLING' AND is_active = true LIMIT 1`,
    );
    const sellingStoreId = selling.rows[0]?.id ?? null;
    lines.push(`- sellingStoreId=${sellingStoreId ?? 'none'}`);

    if (sellingStoreId) {
      // Prefer a product already sellable at SELLING with coupled layers (bal ≈ batch).
      const ready = await pool.query(
        `
        SELECT p.id, p.name, p.selling_price::float8 AS selling_price,
               sell_q.q::float8 AS qoh
        FROM products p
        JOIN LATERAL (
          SELECT COALESCE(SUM(bal.quantity_on_hand), 0) AS q
          FROM inventory_balances bal
          WHERE bal.product_id = p.id
            AND bal.store_location_id = $1
            AND bal.quantity_on_hand > 0
        ) sell_q ON true
        JOIN LATERAL (
          SELECT COALESCE(SUM(bal.quantity_on_hand), 0) AS q
          FROM inventory_balances bal
          WHERE bal.product_id = p.id
        ) all_bal ON true
        JOIN LATERAL (
          SELECT COALESCE(SUM(ib.remaining_quantity), 0) AS q
          FROM inventory_batches ib
          WHERE ib.product_id = p.id AND ib.status = 'ACTIVE'
        ) batch ON true
        WHERE p.is_active = true
          AND COALESCE(p.product_type::text, 'inventory') <> 'service'
          AND COALESCE(p.selling_price, 0) > 0
          AND sell_q.q >= $2
          AND ABS(all_bal.q - batch.q) < 0.02
        ORDER BY sell_q.q DESC
        LIMIT 1
        `,
        [sellingStoreId, need],
      );
      if (ready.rows[0]) {
        product = {
          id: ready.rows[0].id,
          name: ready.rows[0].name,
          sellingPrice: ready.rows[0].selling_price,
          _available: ready.rows[0].qoh,
        };
        lines.push(`- using existing coupled SELLING stock for ${product.name}`);
      }
    }

    if (!product?.id && sellingStoreId) {
      // Move sellable OH MAIN → SELLING (same lot). Only from coupled donors.
      const moved = await pool.query(
        `
        WITH donor AS (
          SELECT bal.id AS bal_id, bal.product_id, bal.product_lot_id, bal.quantity_on_hand
          FROM inventory_balances bal
          JOIN store_locations s ON s.id = bal.store_location_id
          JOIN products p ON p.id = bal.product_id
          JOIN LATERAL (
            SELECT COALESCE(SUM(b2.quantity_on_hand), 0) AS q
            FROM inventory_balances b2 WHERE b2.product_id = p.id
          ) all_bal ON true
          JOIN LATERAL (
            SELECT COALESCE(SUM(ib.remaining_quantity), 0) AS q
            FROM inventory_batches ib
            WHERE ib.product_id = p.id AND ib.status = 'ACTIVE'
          ) batch ON true
          WHERE s.store_type::text = 'MAIN'
            AND bal.quantity_on_hand >= $2
            AND p.is_active = true
            AND COALESCE(p.product_type::text, 'inventory') <> 'service'
            AND COALESCE(p.selling_price, 0) > 0
            AND ABS(all_bal.q - batch.q) < 0.02
          ORDER BY bal.quantity_on_hand DESC
          LIMIT 1
          FOR UPDATE OF bal
        ),
        dec AS (
          UPDATE inventory_balances b
          SET quantity_on_hand = b.quantity_on_hand - $2
          FROM donor d
          WHERE b.id = d.bal_id
          RETURNING d.product_id, d.product_lot_id
        ),
        upsert AS (
          INSERT INTO inventory_balances (
            store_location_id, product_id, product_lot_id, quantity_on_hand
          )
          SELECT $1, dec.product_id, dec.product_lot_id, $2
          FROM dec
          ON CONFLICT (store_location_id, product_lot_id)
          DO UPDATE SET quantity_on_hand = inventory_balances.quantity_on_hand + EXCLUDED.quantity_on_hand
          RETURNING product_id, quantity_on_hand
        )
        SELECT p.id, p.name, p.selling_price::float8 AS selling_price,
               u.quantity_on_hand::float8 AS qoh
        FROM upsert u
        JOIN products p ON p.id = u.product_id
        `,
        [sellingStoreId, need],
      );
      if (moved.rows[0]) {
        product = {
          id: moved.rows[0].id,
          name: moved.rows[0].name,
          sellingPrice: moved.rows[0].selling_price,
          _available: moved.rows[0].qoh,
        };
        lines.push(
          `- **FIXTURE** moved ${need} OH MAIN→SELLING for ${product.name} (coupling-preserving)`,
        );
      }
    }

    if (!product?.id) {
    const pick = await pool.query(
      `
      SELECT p.id, p.name, p.selling_price::float8 AS selling_price,
             COALESCE(store_qty.q, batch_qty.q, 0)::float8 AS qoh
      FROM products p
      JOIN LATERAL (
        SELECT COALESCE(SUM(ib.remaining_quantity), 0) AS q
        FROM inventory_batches ib
        WHERE ib.product_id = p.id
          AND ib.status = 'ACTIVE'
          AND ib.remaining_quantity > 0
      ) batch_qty ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(bal.quantity_on_hand), 0) AS q
        FROM inventory_balances bal
        JOIN store_locations s ON s.id = bal.store_location_id
        WHERE bal.product_id = p.id
          AND bal.quantity_on_hand > 0
          AND s.store_type::text = 'SELLING'
      ) store_qty ON true
      WHERE p.is_active = true
        AND COALESCE(p.product_type::text, 'inventory') <> 'service'
        AND COALESCE(p.selling_price, 0) > 0
        AND COALESCE(store_qty.q, batch_qty.q) >= $1
      ORDER BY COALESCE(store_qty.q, 0) DESC, batch_qty.q DESC
      LIMIT 1
      `,
      [need],
    );
    if (pick.rows[0]) {
      product = {
        id: pick.rows[0].id,
        name: pick.rows[0].name,
        sellingPrice: pick.rows[0].selling_price,
        _available: pick.rows[0].qoh,
      };
    } else {
      const any = await pool.query(
        `
        SELECT p.id, p.name, p.selling_price::float8 AS selling_price,
               COALESCE(batch_qty.q, 0)::float8 AS qoh
        FROM products p
        JOIN LATERAL (
          SELECT COALESCE(SUM(ib.remaining_quantity), 0) AS q
          FROM inventory_batches ib
          WHERE ib.product_id = p.id
            AND ib.status = 'ACTIVE'
            AND ib.remaining_quantity > 0
        ) batch_qty ON true
        WHERE p.is_active = true
          AND COALESCE(p.product_type::text, 'inventory') <> 'service'
          AND COALESCE(p.selling_price, 0) > 0
          AND batch_qty.q >= $1
        ORDER BY batch_qty.q DESC
        LIMIT 1
        `,
        [QTY],
      );
      if (any.rows[0]) {
        product = {
          id: any.rows[0].id,
          name: any.rows[0].name,
          sellingPrice: any.rows[0].selling_price,
          _available: any.rows[0].qoh,
        };
      }
    }
    } // end if (!product?.id) fallback pick
  } catch (e) {
    lines.push(`- DB product pick fallback: ${e instanceof Error ? e.message : String(e)}`);
  }
}

if (!product?.id) {
  if (process.env.PRODUCT_ID) {
    const p = await req('GET', `/api/products/${process.env.PRODUCT_ID}`, { token });
    product = p.data?.data;
  } else {
    const stock = await req('GET', '/api/inventory/stock-levels', { token });
    const levels = stock.data?.data || [];
    const need = ITERATIONS * QTY + 2;
    const ranked = levels
      .map((r) => ({
        productId: r.product_id || r.productId || r.id,
        name: r.product_name || r.productName || r.name,
        available: Number(
          r.total_stock ?? r.availableQuantity ?? r.quantity ?? r.onHand ?? r.quantityOnHand ?? 0,
        ),
        sellingPrice: Number(r.selling_price ?? r.sellingPrice ?? r.unitPrice ?? r.price ?? 0),
        productType: r.product_type || r.productType || 'inventory',
      }))
      .filter((r) => r.productId && r.productType !== 'service' && r.sellingPrice > 0)
      .sort((a, b) => b.available - a.available);
    const row = ranked.find((r) => r.available >= need) || ranked[0];
    if (row?.productId) {
      const p = await req('GET', `/api/products/${row.productId}`, { token });
      product = p.data?.data || {
        id: row.productId,
        name: row.name,
        sellingPrice: row.sellingPrice,
      };
      product.id = product.id || row.productId;
      product.name = product.name || row.name;
      product.sellingPrice = product.sellingPrice ?? product.selling_price ?? row.sellingPrice;
      product._available = row.available;
    }
  }
}
if (!product?.id) {
  bad('Inventory product with sufficient stock', `need ≥ ${ITERATIONS * QTY}`);
  writeFileSync(OUT, `${lines.join('\n')}\n`);
  process.exit(1);
}
const available = Number(product._available ?? 0);
const maxIters = available > 0 ? Math.max(1, Math.floor((available - 1) / QTY)) : ITERATIONS;
const effectiveIterations = Math.min(ITERATIONS, maxIters);
if (effectiveIterations < ITERATIONS) {
  lines.push(
    `- **NOTE** reduced ITERATIONS ${ITERATIONS} → ${effectiveIterations} (stock available=${available})`,
  );
}
const unitPrice = Number(
  product.sellingPrice ?? product.selling_price ?? product.unitPrice ?? product.price ?? 0,
);
if (!(unitPrice > 0)) {
  bad('Product selling price > 0', String(unitPrice));
  writeFileSync(OUT, `${lines.join('\n')}\n`);
  process.exit(1);
}
ok(
  'Product selected',
  `${product.name || product.id} price=${unitPrice} avail≈${available} iters=${effectiveIterations}`,
);

let qtyBefore = null;
if (pool) {
  try {
    const q = await pool.query(
      `SELECT COALESCE(quantity_on_hand, 0)::float8 AS q FROM products WHERE id = $1`,
      [product.id],
    );
    qtyBefore = Number(q.rows[0]?.q ?? 0);
    ok('DB connected for integrity', `qty_on_hand_before=${qtyBefore}`);
  } catch (e) {
    bad('DB connect', e instanceof Error ? e.message : String(e));
  }
} else {
  lines.push('- **PENDING** DATABASE_URL — inventory/GL/lock probes skipped');
}

// ── Create pending orders ───────────────────────────────────────────
const lineTotal = unitPrice * QTY;
const orders = [];
for (let i = 0; i < effectiveIterations; i++) {
  const created = await req('POST', '/api/orders', {
    token,
    body: {
      items: [
        {
          productId: product.id,
          productName: product.name || 'profile-product',
          quantity: QTY,
          unitPrice,
        },
      ],
      subtotal: lineTotal,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: lineTotal,
      notes: `checkout-profile-${Date.now()}-${i}`,
    },
  });
  const order = created.data?.data;
  if (created.status >= 200 && created.status < 300 && order?.id) {
    orders.push(order);
  } else {
    bad(`Create order #${i}`, JSON.stringify(created.data).slice(0, 180));
  }
}
if (orders.length !== effectiveIterations) {
  bad('All pending orders created', `${orders.length}/${effectiveIterations}`);
} else {
  ok('Pending orders created', String(orders.length));
}

// ── Concurrent complete ─────────────────────────────────────────────
lines.push('\n## HTTP complete load\n');

const latencies = [];
const profiles = [];
const saleIds = [];
const saleNumbers = [];
const errors = [];

async function completeOne(order, idx) {
  const key = `chkprof_${order.id.replace(/-/g, '').slice(0, 24)}_${idx}`;
  const t0 = performance.now();
  const res = await req('POST', `/api/orders/${order.id}/complete`, {
    token,
    headers: { 'X-Checkout-Profile': '1', 'X-Idempotency-Key': key },
    body: {
      paymentMethod: 'CASH',
      paymentReceived: lineTotal,
      paymentLines: [{ paymentMethod: 'CASH', amount: lineTotal }],
      idempotencyKey: key,
      ...(sessionId ? { cashRegisterSessionId: sessionId } : {}),
    },
  });
  const ms = performance.now() - t0;
  latencies.push(ms);
  const sale = res.data?.data?.sale;
  const profile = res.data?.data?.checkoutProfile;
  if (res.status >= 200 && res.status < 300 && sale?.id) {
    saleIds.push(sale.id);
    if (sale.saleNumber) saleNumbers.push(sale.saleNumber);
    if (profile) profiles.push(profile);
    return { ok: true, ms, saleNumber: sale.saleNumber, profile };
  }
  errors.push({ idx, status: res.status, body: JSON.stringify(res.data).slice(0, 240) });
  return { ok: false, ms };
}

// Warmup single complete if we have spare — use first of batch in waves
const queue = [...orders.entries()];
const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
  while (queue.length) {
    const next = queue.shift();
    if (!next) break;
    const [idx, order] = next;
    await completeOne(order, idx);
  }
});
await Promise.all(workers);

const http = summarize(latencies);
lines.push(
  `- completes_ok=${saleIds.length}/${effectiveIterations} errors=${errors.length}`,
);
lines.push(
  `- HTTP latency ms: p50=${http.p50?.toFixed(1)} p95=${http.p95?.toFixed(1)} p99=${http.p99?.toFixed(1)} max=${http.max?.toFixed(1)} mean=${http.mean?.toFixed(1)} n=${http.n}`,
);
if (errors.length) {
  lines.push(`- sample errors: \`${errors[0].body}\``);
}
if (saleIds.length === effectiveIterations && effectiveIterations > 0) ok('All completes succeeded');
else bad('All completes succeeded', `${saleIds.length}/${effectiveIterations}`);

if (http.p95 != null && http.p95 < 30000) ok('HTTP p95 under prior 30s timeout', `${http.p95.toFixed(1)}ms`);
else if (http.p95 != null) bad('HTTP p95 under prior 30s timeout', `${http.p95.toFixed(1)}ms`);

// ── Phase ranking ───────────────────────────────────────────────────
lines.push('\n## In-TX phase ranking (X-Checkout-Profile)\n');
if (profiles.length === 0) {
  bad(
    'Phase profiles returned',
    'restart API after P4 instrumentation; send X-Checkout-Profile: 1',
  );
} else {
  ok('Phase profiles collected', `${profiles.length} samples`);
  const byPhase = new Map();
  for (const snap of profiles) {
    for (const p of snap.phases || []) {
      const arr = byPhase.get(p.phase) ?? [];
      arr.push(p.ms);
      byPhase.set(p.phase, arr);
    }
  }
  const ranked = [...byPhase.entries()]
    .map(([phase, samples]) => {
      const s = summarize(samples);
      return { phase, ...s };
    })
    .sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0));

  lines.push('| Phase | p50 | p95 | p99 | max | mean |');
  lines.push('|-------|-----|-----|-----|-----|------|');
  for (const r of ranked) {
    lines.push(
      `| ${r.phase} | ${r.p50?.toFixed(1)} | ${r.p95?.toFixed(1)} | ${r.p99?.toFixed(1)} | ${r.max?.toFixed(1)} | ${r.mean?.toFixed(1)} |`,
    );
  }
  const hottest = ranked.slice(0, 5).map((r) => `${r.phase}(p95=${r.p95?.toFixed(1)}ms)`);
  lines.push(`\n- **Hottest phases:** ${hottest.join(', ')}`);
  ok('Hotspot ranking produced', hottest[0] || 'n/a');
}

// ── DB locks / pool / integrity ─────────────────────────────────────
lines.push('\n## Database locks, pool, integrity\n');
if (pool) {
  try {
    const waits = await pool.query(`
      SELECT COALESCE(wait_event_type, 'none') AS wait_event_type,
             COALESCE(wait_event, 'none') AS wait_event,
             COUNT(*)::int AS n
      FROM pg_stat_activity
      WHERE datname = current_database()
      GROUP BY 1, 2
      ORDER BY n DESC
      LIMIT 12
    `);
    lines.push('- pg_stat_activity waits:');
    for (const w of waits.rows) {
      lines.push(`  - ${w.wait_event_type}/${w.wait_event}: ${w.n}`);
    }

    const conns = await pool.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE state = 'active')::int AS active,
             COUNT(*) FILTER (WHERE state = 'idle')::int AS idle,
             COUNT(*) FILTER (WHERE wait_event_type = 'Lock')::int AS lock_waiters
      FROM pg_stat_activity
      WHERE datname = current_database()
    `);
    const c = conns.rows[0];
    lines.push(
      `- connections: total=${c.total} active=${c.active} idle=${c.idle} lock_waiters=${c.lock_waiters}`,
    );
    ok('Collected connection/wait snapshot');

    const qtyAfterRes = await pool.query(
      `SELECT COALESCE(quantity_on_hand, 0)::float8 AS q FROM products WHERE id = $1`,
      [product.id],
    );
    const qtyAfter = Number(qtyAfterRes.rows[0]?.q ?? 0);
    const expectedDrop = saleIds.length * QTY;
    const actualDrop = qtyBefore != null ? qtyBefore - qtyAfter : null;
    lines.push(
      `- inventory: before=${qtyBefore} after=${qtyAfter} expected_drop=${expectedDrop} actual_drop=${actualDrop}`,
    );
    if (actualDrop != null && Math.abs(actualDrop - expectedDrop) < 0.001) {
      ok('Inventory drop matches completes');
    } else if (qtyBefore != null) {
      bad('Inventory drop matches completes', `expected ${expectedDrop} got ${actualDrop}`);
    }

    if (saleNumbers.length) {
      const gl2 = await pool.query(
        `
        SELECT
          COUNT(DISTINCT t."Id")::int AS journals,
          COALESCE(SUM(l."DebitAmount"), 0)::float8 AS debit,
          COALESCE(SUM(l."CreditAmount"), 0)::float8 AS credit
        FROM ledger_transactions t
        JOIN ledger_entries l ON l."TransactionId" = t."Id"
        WHERE t."IdempotencyKey" = ANY(
          ARRAY(
            SELECT 'SALE-' || n FROM unnest($1::text[]) AS n
            UNION ALL
            SELECT 'SALE-COGS-' || n FROM unnest($1::text[]) AS n
          )
        )
        `,
        [saleNumbers],
      );
      const g = gl2.rows[0];
      const drift = Math.abs(Number(g.debit) - Number(g.credit));
      lines.push(
        `- GL for profile sales: journals=${g.journals} debit=${g.debit} credit=${g.credit} |debit-credit|=${drift.toFixed(4)}`,
      );
      if (g.journals > 0 && drift < 0.02) ok('GL balanced for profiled sales');
      else if (g.journals === 0) bad('GL journals found for profiled sales', '0 journals');
      else bad('GL balanced for profiled sales', `drift=${drift}`);
    }

    const dupOrders = await pool.query(
      `
      SELECT from_order_id, COUNT(*)::int AS c
      FROM sales
      WHERE from_order_id = ANY($1::uuid[])
      GROUP BY from_order_id
      HAVING COUNT(*) > 1
      `,
      [orders.map((o) => o.id)],
    );
    if (dupOrders.rows.length === 0) ok('No duplicate sales per order');
    else bad('No duplicate sales per order', JSON.stringify(dupOrders.rows));
  } catch (e) {
    bad('DB integrity/lock probes', e instanceof Error ? e.message : String(e));
  } finally {
    await pool.end();
  }
}

lines.push('\n## Verdict\n');
lines.push(`- PASS=${pass} FAIL=${fail}`);
lines.push(
  fail === 0
    ? '- **VERDICT: PROFILE PASS** — use hottest phases to guide P5 only if SLO still missed.'
    : '- **VERDICT: FAIL** — fix before considering deploy.',
);
lines.push(
  '- **Deploy gate:** still WAIT — this is measurement evidence; HTTP FEFO+GL load baseline captured.',
);

writeFileSync(OUT, `${lines.join('\n')}\n`, 'utf8');
console.log(`\nWrote ${OUT}`);
console.log(`PASS=${pass} FAIL=${fail}\n`);
process.exit(fail > 0 ? 1 : 0);
