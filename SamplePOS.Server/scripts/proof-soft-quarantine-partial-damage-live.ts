#!/usr/bin/env npx tsx
/**
 * LIVE FUNCTIONAL PROOF — Soft quarantine partial damage (SAP/Odoo-style)
 *
 * Executes real service calls against DATABASE_URL and asserts measured SQL:
 *   1) Seed isolated product + ACTIVE batch (qty 100)
 *   2) applySoftQuarantine({ reason:DAMAGE, quantity:12 }) → lot split + soft quarantine
 *   3) Assert parent ACTIVE remaining=88; child QUARANTINED remaining=12; no loss GL
 *   4) disposeFromQuarantine(child, qty 12) → remaining 0 + expense 5120 journal
 *   5) Full-batch soft quarantine on second fixture (qty=5) — no split
 *
 * Usage:
 *   cd SamplePOS.Server && npx tsx scripts/proof-soft-quarantine-partial-damage-live.ts
 *   npm run proof:soft-quarantine-partial-damage:live
 *
 * Env:
 *   DATABASE_URL from SamplePOS.Server/.env (preferred)
 *   SQ_PROOF_CLEANUP=1 — deactivate proof products after run (default: leave for audit)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { randomUUID } from 'crypto';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(serverRoot, '..');

function loadEnv(): void {
  for (const rel of ['.env', '.env.local']) {
    const p = path.join(serverRoot, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (m[1] === 'DATABASE_URL' || process.env[m[1]] === undefined) {
        process.env[m[1]] = v;
      }
    }
  }
}

loadEnv();

const rawUrl = (process.env.DATABASE_URL || process.env.TENANT_DATABASE_URL || '').trim();
if (!rawUrl) {
  console.error('DATABASE_URL missing — set SamplePOS.Server/.env');
  process.exit(2);
}
process.env.DATABASE_URL = rawUrl; // ensure default pool / services see same URL
const connectionString = rawUrl.split('?')[0];

type Gate = { id: string; ok: boolean; detail: string; measured?: Record<string, unknown> };
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string, measured?: Record<string, unknown>): void {
  gates.push({ id, ok, detail, ...(measured ? { measured } : {}) });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}: ${detail}`);
}

function near(a: number, b: number, tol = 0.0001): boolean {
  return Math.abs(Number(a) - Number(b)) <= tol;
}

const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const SKU = `SQPD-${stamp}`;
const PARENT_QTY = 100;
const PARTIAL_QTY = 12;
const FULL_QTY = 5;
const EXPIRED_QTY = 20;

const pool = new pg.Pool({ connectionString, max: 8 });

async function columnExists(table: string, column: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
    [table, column],
  );
  return r.rows.length > 0;
}

async function ensureMigration609(): Promise<void> {
  if (await columnExists('inventory_batches', 'parent_lot_id')) {
    gate('MIG_609', true, 'inventory_batches.parent_lot_id present');
    return;
  }
  const mig = path.join(repoRoot, 'shared/sql/609_lot_split_parent.sql');
  if (!fs.existsSync(mig)) {
    gate('MIG_609', false, 'shared/sql/609_lot_split_parent.sql missing');
    return;
  }
  await pool.query(fs.readFileSync(mig, 'utf8'));
  gate(
    'MIG_609',
    await columnExists('inventory_batches', 'parent_lot_id'),
    'applied 609_lot_split_parent.sql',
  );
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  console.log('═'.repeat(60));
  console.log(' LIVE proof: soft quarantine partial damage');
  console.log(` stamp: ${stamp}`);
  console.log('═'.repeat(60));

  await ensureMigration609();

  const ms = await pool.query<{ ms: boolean }>(
    `SELECT COALESCE(is_multistore_enabled, false) AS ms FROM system_settings LIMIT 1`,
  );
  const multistore = Boolean(ms.rows[0]?.ms);
  gate(
    'MODE_SINGLE_STORE',
    !multistore,
    multistore
      ? 'FAIL: tenant is multistore — soft partial path is single-store only'
      : 'is_multistore_enabled=false (soft quarantine mode)',
  );
  if (multistore) {
    throw new Error('Cannot run soft partial LIVE proof while multistore is enabled');
  }

  const userRes = await pool.query<{ id: string }>(
    `SELECT id::text AS id FROM users
     WHERE id::text <> '00000000-0000-0000-0000-000000000000'
     ORDER BY created_at NULLS LAST
     LIMIT 1`,
  );
  const userId = userRes.rows[0]?.id;
  gate('USER', Boolean(userId), userId ? `userId=${userId}` : 'no usable user');
  if (!userId) throw new Error('No user');

  const accounts = await pool.query<{ code: string }>(
    `SELECT "AccountCode" AS code FROM accounts
     WHERE "AccountCode" IN ('1300','5120') AND "IsActive" = true`,
  );
  const codes = new Set(accounts.rows.map((r) => r.code));
  gate(
    'GL_ACCOUNTS',
    codes.has('1300') && codes.has('5120'),
    `accounts present: ${[...codes].join(',')}`,
  );

  // ── Seed isolated product + two ACTIVE batches ───────────────────────
  const productId = randomUUID();
  const parentBatchId = randomUUID();
  const fullBatchId = randomUUID();
  const expiredBatchId = randomUUID();
  const cost = 1000;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const expiryPast = yesterday.toISOString().slice(0, 10);

  await pool.query(
    `INSERT INTO products (id, name, sku, barcode, cost_price, selling_price, quantity_on_hand, is_active, track_expiry)
     VALUES ($1, $2, $3, $3, $4, $5, $6, true, false)`,
    [productId, `SoftQ Partial Proof ${stamp}`, SKU, cost, cost * 1.5, PARENT_QTY + FULL_QTY + EXPIRED_QTY],
  );

  const prodCheck = await pool.query(`SELECT id::text FROM products WHERE id = $1`, [productId]);
  gate(
    'SEED_PRODUCT',
    prodCheck.rows.length === 1,
    `productId=${productId} sku=${SKU}`,
  );

  await pool.query(
    `INSERT INTO inventory_batches (
       id, product_id, batch_number, quantity, remaining_quantity,
       cost_price, received_date, expiry_date, status, source_type
     ) VALUES
       ($1, $4, $5, $6, $6, $9, CURRENT_DATE, NULL, 'ACTIVE', 'ADJUSTMENT'),
       ($2, $4, $7, $8, $8, $9, CURRENT_DATE, NULL, 'ACTIVE', 'ADJUSTMENT'),
       ($3, $4, $10, $11, $11, $9, CURRENT_DATE, $12, 'ACTIVE', 'ADJUSTMENT')`,
    [
      parentBatchId,
      fullBatchId,
      expiredBatchId,
      productId,
      `${SKU}-P`,
      PARENT_QTY,
      `${SKU}-F`,
      FULL_QTY,
      cost,
      `${SKU}-E`,
      EXPIRED_QTY,
      expiryPast,
    ],
  );

  const seedRows = await pool.query<{
    id: string;
    batch_number: string;
    remaining_quantity: string;
    status: string;
    expiry_date: string | null;
  }>(
    `SELECT id::text, batch_number, remaining_quantity::text, COALESCE(status::text,'ACTIVE') AS status, expiry_date::text
     FROM inventory_batches WHERE id = ANY($1::uuid[])`,
    [[parentBatchId, fullBatchId, expiredBatchId]],
  );
  gate(
    'SEED_BATCHES',
    seedRows.rows.length === 3,
    `seeded parent=${PARENT_QTY} full=${FULL_QTY} expired=${EXPIRED_QTY} expiry=${expiryPast}`,
    {
      rows: seedRows.rows,
      productId,
      parentBatchId,
      fullBatchId,
      expiredBatchId,
    },
  );

  // Dynamic import AFTER DATABASE_URL is set so services share the same DB
  const { applySoftQuarantine } = await import(
    '../src/modules/loss-quarantine/softQuarantineService.js'
  );
  const { disposeFromQuarantine } = await import(
    '../src/modules/loss-quarantine/lossDisposalService.js'
  );

  // ── STEP A: Partial soft quarantine (12 of 100) ──────────────────────
  const beforeParent = await pool.query<{ remaining: string; status: string }>(
    `SELECT remaining_quantity::text AS remaining, COALESCE(status::text,'ACTIVE') AS status
     FROM inventory_batches WHERE id = $1`,
    [parentBatchId],
  );

  const soft = await applySoftQuarantine(pool, {
    inventoryBatchId: parentBatchId,
    reason: 'DAMAGE',
    userId,
    memo: `LIVE proof partial damage ${stamp}`,
    referenceType: 'SOFT_Q_LIVE_PROOF',
    referenceId: parentBatchId,
    quantity: PARTIAL_QTY,
  });

  gate(
    'SVC_PARTIAL_SPLIT',
    Boolean(soft.splitFromBatchId) && soft.inventoryBatchId !== parentBatchId,
    `splitFrom=${soft.splitFromBatchId} child=${soft.inventoryBatchId} held=${soft.quantityHeld}`,
    { soft },
  );
  gate(
    'SVC_QTY_HELD',
    near(soft.quantityHeld, PARTIAL_QTY),
    `quantityHeld=${soft.quantityHeld} expected=${PARTIAL_QTY}`,
  );
  gate(
    'SVC_NO_GL_FLAG',
    soft.quarantineMode === 'SOFT' && soft.statusApplied === 'QUARANTINED',
    `mode=${soft.quarantineMode} status=${soft.statusApplied}`,
  );

  const parentAfter = await pool.query<{
    remaining: string;
    status: string;
    batch_number: string;
  }>(
    `SELECT remaining_quantity::text AS remaining, COALESCE(status::text,'ACTIVE') AS status, batch_number
     FROM inventory_batches WHERE id = $1`,
    [parentBatchId],
  );
  const childAfter = await pool.query<{
    remaining: string;
    status: string;
    batch_number: string;
    parent_lot_id: string | null;
    source_type: string | null;
  }>(
    `SELECT remaining_quantity::text AS remaining,
            COALESCE(status::text,'ACTIVE') AS status,
            batch_number,
            parent_lot_id::text AS parent_lot_id,
            source_type::text AS source_type
     FROM inventory_batches WHERE id = $1`,
    [soft.inventoryBatchId],
  );

  const parentRem = Number(parentAfter.rows[0]?.remaining);
  const childRem = Number(childAfter.rows[0]?.remaining);
  const parentStatus = parentAfter.rows[0]?.status;
  const childStatus = childAfter.rows[0]?.status;

  gate(
    'PARENT_ACTIVE_SELLABLE',
    parentStatus === 'ACTIVE' && near(parentRem, PARENT_QTY - PARTIAL_QTY),
    `parent status=${parentStatus} remaining=${parentRem} (expected ${PARENT_QTY - PARTIAL_QTY})`,
    { before: beforeParent.rows[0], after: parentAfter.rows[0] },
  );
  gate(
    'CHILD_QUARANTINED',
    childStatus === 'QUARANTINED' && near(childRem, PARTIAL_QTY),
    `child status=${childStatus} remaining=${childRem} lot=${childAfter.rows[0]?.batch_number}`,
    { child: childAfter.rows[0] },
  );
  gate(
    'CONSERVATION',
    near(parentRem + childRem, PARENT_QTY),
    `parent+child remaining ${parentRem}+${childRem}=${parentRem + childRem} (was ${PARENT_QTY})`,
  );
  gate(
    'GENEALOGY',
    childAfter.rows[0]?.parent_lot_id === parentBatchId &&
      String(childAfter.rows[0]?.source_type || '').toUpperCase() === 'SPLIT',
    `parent_lot_id=${childAfter.rows[0]?.parent_lot_id} source_type=${childAfter.rows[0]?.source_type}`,
  );

  const mov = await pool.query<{
    movement_type: string;
    reference_type: string;
    economic_event: string | null;
    posts_gl: boolean | null;
    quantity: string;
    batch_id: string;
  }>(
    `SELECT movement_type, reference_type, economic_event, posts_gl, quantity::text, batch_id::text
     FROM stock_movements
     WHERE batch_id = ANY($1::uuid[])
       AND created_at > NOW() - INTERVAL '10 minutes'
     ORDER BY created_at ASC`,
    [[parentBatchId, soft.inventoryBatchId]],
  );

  const splitMoves = mov.rows.filter((r) => String(r.reference_type).toUpperCase() === 'LOT_SPLIT');
  const qMoves = mov.rows.filter(
    (r) =>
      r.economic_event === 'QUARANTINE_TRANSFER' ||
      String(r.reference_type).toUpperCase() === 'SOFT_Q_LIVE_PROOF',
  );
  gate(
    'MOV_SPLIT_NO_GL',
    splitMoves.length >= 2 && splitMoves.every((r) => r.posts_gl === false),
    `LOT_SPLIT movements=${splitMoves.length} all posts_gl=false types=${splitMoves.map((r) => r.movement_type).join(',')}`,
    { splitMoves },
  );
  gate(
    'MOV_QUARANTINE_NO_GL',
    qMoves.some((r) => r.economic_event === 'QUARANTINE_TRANSFER' && r.posts_gl === false),
    `quarantine QUARANTINE_TRANSFER+posts_gl=false count=${qMoves.filter((r) => r.economic_event === 'QUARANTINE_TRANSFER').length}`,
    { qMoves },
  );

  const glBeforeDispose = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
     FROM ledger_transactions lt
     WHERE lt."ReferenceType" = 'STOCK_MOVEMENT'
       AND lt."ReferenceId" = ANY(
         SELECT id FROM stock_movements WHERE batch_id = ANY($1::uuid[])
       )`,
    [[parentBatchId, soft.inventoryBatchId]],
  );
  gate(
    'NO_GL_AFTER_QUARANTINE',
    Number(glBeforeDispose.rows[0]?.n ?? 0) === 0,
    `ledger rows linked to proof movements before dispose=${glBeforeDispose.rows[0]?.n}`,
  );

  // FEFO/sale eligibility: parent ACTIVE still selectable; child not
  const selectable = await pool.query<{ id: string; status: string }>(
    `SELECT id::text, COALESCE(status::text,'ACTIVE') AS status
     FROM inventory_batches
     WHERE id = ANY($1::uuid[]) AND COALESCE(status::text,'ACTIVE') = 'ACTIVE'
       AND remaining_quantity > 0`,
    [[parentBatchId, soft.inventoryBatchId]],
  );
  gate(
    'FEFO_PARENT_ONLY',
    selectable.rows.length === 1 && selectable.rows[0].id === parentBatchId,
    `ACTIVE selectable lots among pair=${selectable.rows.map((r) => r.id).join(',')}`,
    { selectable: selectable.rows },
  );

  // ── STEP B: Dispose child → P&L 5120 ─────────────────────────────────
  const dispose = await disposeFromQuarantine(pool, {
    productId,
    inventoryBatchId: soft.inventoryBatchId,
    productLotId: soft.productLotId,
    quantity: PARTIAL_QTY,
    reason: 'DAMAGE',
    memo: `LIVE proof dispose ${stamp}`,
    userId,
    quarantineMode: 'SOFT',
  });

  gate(
    'DISPOSE_5120',
    dispose.expenseAccountCode === '5120',
    `dispose doc=${dispose.documentNumber} expense=${dispose.expenseAccountCode} qty=${dispose.quantity}`,
    { dispose },
  );

  const childDisposed = await pool.query<{ remaining: string; status: string }>(
    `SELECT remaining_quantity::text AS remaining, COALESCE(status::text,'') AS status
     FROM inventory_batches WHERE id = $1`,
    [soft.inventoryBatchId],
  );
  gate(
    'CHILD_CONSUMED',
    near(Number(childDisposed.rows[0]?.remaining ?? -1), 0),
    `child remaining after dispose=${childDisposed.rows[0]?.remaining}`,
    { childDisposed: childDisposed.rows[0] },
  );

  const parentStill = await pool.query<{ remaining: string; status: string }>(
    `SELECT remaining_quantity::text AS remaining, COALESCE(status::text,'') AS status
     FROM inventory_batches WHERE id = $1`,
    [parentBatchId],
  );
  gate(
    'PARENT_UNTOUCHED_BY_DISPOSE',
    parentStill.rows[0]?.status === 'ACTIVE' &&
      near(Number(parentStill.rows[0]?.remaining), PARENT_QTY - PARTIAL_QTY),
    `parent still ACTIVE remaining=${parentStill.rows[0]?.remaining}`,
  );

  const glDispose = await pool.query<{
    txn: string;
    account: string;
    debit: string;
    credit: string;
    ref_type: string;
  }>(
    `SELECT lt."TransactionNumber" AS txn,
            a."AccountCode" AS account,
            COALESCE(le."DebitAmount", 0)::text AS debit,
            COALESCE(le."CreditAmount", 0)::text AS credit,
            lt."ReferenceType" AS ref_type
     FROM ledger_transactions lt
     JOIN ledger_entries le ON le."TransactionId" = lt."Id"
     JOIN accounts a ON a."Id" = le."AccountId"
     WHERE (
       (lt."ReferenceType" = 'STOCK_MOVEMENT' AND lt."ReferenceId" = $1)
       OR (lt."ReferenceType" = 'LOSS_DISPOSAL' AND lt."ReferenceId" = $2)
       OR lt."Id" = (
         SELECT journal_entry_id FROM loss_disposal_documents WHERE id = $2
       )
     )
     ORDER BY a."AccountCode", le."LineNumber" NULLS LAST`,
    [dispose.movementId, dispose.documentId],
  );

  const has5120 = glDispose.rows.some(
    (r) => r.account === '5120' && Number(r.debit) > 0,
  );
  const has1300 = glDispose.rows.some(
    (r) => r.account === '1300' && Number(r.credit) > 0,
  );
  const expectedValue = PARTIAL_QTY * cost;
  const debit5120 = glDispose.rows
    .filter((r) => r.account === '5120')
    .reduce((s, r) => s + Number(r.debit), 0);

  gate(
    'GL_DISPOSE_SHAPE',
    has5120 && has1300 && near(debit5120, expectedValue, 0.02),
    `DR5120=${debit5120} expected=${expectedValue}; lines=${glDispose.rows.length}; refs=${[...new Set(glDispose.rows.map((r) => r.ref_type))].join(',')}`,
    { glDispose: glDispose.rows },
  );

  // ── STEP C: Full-batch soft quarantine (no split) ────────────────────
  const softFull = await applySoftQuarantine(pool, {
    inventoryBatchId: fullBatchId,
    reason: 'DAMAGE',
    userId,
    memo: `LIVE proof full-batch damage ${stamp}`,
    referenceType: 'SOFT_Q_LIVE_PROOF',
    referenceId: fullBatchId,
    quantity: FULL_QTY,
  });

  gate(
    'FULL_NO_SPLIT',
    !softFull.splitFromBatchId && softFull.inventoryBatchId === fullBatchId,
    `full path child=parent id=${softFull.inventoryBatchId} splitFrom=${softFull.splitFromBatchId ?? 'null'}`,
  );

  const fullAfter = await pool.query<{ remaining: string; status: string }>(
    `SELECT remaining_quantity::text AS remaining, COALESCE(status::text,'') AS status
     FROM inventory_batches WHERE id = $1`,
    [fullBatchId],
  );
  gate(
    'FULL_STATUS_QTY',
    fullAfter.rows[0]?.status === 'QUARANTINED' &&
      near(Number(fullAfter.rows[0]?.remaining), FULL_QTY),
    `full batch status=${fullAfter.rows[0]?.status} remaining=${fullAfter.rows[0]?.remaining} (unchanged qty)`,
  );

  // ── STEP D: Calendar-expired EXPIRED quarantine → dispose (5130) ───────
  const softExpired = await applySoftQuarantine(pool, {
    inventoryBatchId: expiredBatchId,
    reason: 'EXPIRED',
    userId,
    memo: `LIVE proof calendar expired ${stamp}`,
    referenceType: 'SOFT_Q_LIVE_PROOF',
    referenceId: expiredBatchId,
  });

  gate(
    'EXPIRED_SOFT',
    softExpired.statusApplied === 'EXPIRED' && near(softExpired.quantityHeld, EXPIRED_QTY),
    `EXPIRED soft qty=${softExpired.quantityHeld}`,
  );

  const disposeExpired = await disposeFromQuarantine(pool, {
    productId,
    inventoryBatchId: expiredBatchId,
    // Simulate stale sibling productLotId (parent/other lot) — dispose must prefer batch id.
    productLotId: soft.productLotId,
    quantity: EXPIRED_QTY,
    reason: 'EXPIRY',
    memo: `LIVE proof expired dispose ${stamp}`,
    userId,
    quarantineMode: 'SOFT',
  });

  gate(
    'EXPIRED_DISPOSE_5130',
    disposeExpired.expenseAccountCode === '5130',
    `expired dispose doc=${disposeExpired.documentNumber} expense=${disposeExpired.expenseAccountCode}`,
    { disposeExpired },
  );

  gate(
    'EXPIRED_STALE_LOT_IGNORED',
    disposeExpired.batchId === expiredBatchId,
    `dispose consumed batch=${disposeExpired.batchId} (stale productLotId was ${soft.productLotId})`,
  );

  const expiredAfter = await pool.query<{ remaining: string }>(
    `SELECT remaining_quantity::text AS remaining FROM inventory_batches WHERE id = $1`,
    [expiredBatchId],
  );
  gate(
    'EXPIRED_CONSUMED',
    near(Number(expiredAfter.rows[0]?.remaining ?? -1), 0),
    `expired batch remaining=${expiredAfter.rows[0]?.remaining}`,
  );

  if (process.env.SQ_PROOF_CLEANUP === '1') {
    await pool.query(`UPDATE products SET is_active = false WHERE id = $1`, [productId]);
    gate('CLEANUP', true, `deactivated product ${SKU}`);
  } else {
    gate('CLEANUP', true, `left fixtures for audit sku=${SKU} productId=${productId}`);
  }

  const failed = gates.filter((g) => !g.ok);
  const evidence = {
    feature: 'SOFT_QUARANTINE_PARTIAL_DAMAGE_LIVE',
    provenAt: new Date().toISOString(),
    startedAt,
    stamp,
    sku: SKU,
    database: connectionString.replace(/:[^:@/]+@/, ':****@'),
    contract:
      'Functional LIVE: partial soft quarantine splits lot; parent stays sellable; child quarantined without GL; dispose posts 5120; calendar-expired EXPIRED dispose posts 5130; full-batch path still status-only',
    fixture: {
      productId,
      parentBatchId,
      childBatchId: soft.inventoryBatchId,
      fullBatchId,
      expiredBatchId,
      parentQty: PARENT_QTY,
      partialQty: PARTIAL_QTY,
      fullQty: FULL_QTY,
      expiredQty: EXPIRED_QTY,
      expiryPast,
      unitCost: cost,
    },
    gates,
    summary: {
      total: gates.length,
      passed: gates.filter((g) => g.ok).length,
      failed: failed.length,
      verdict: failed.length === 0 ? 'PASS' : 'FAIL',
    },
  };

  const jsonPath = path.join(repoRoot, 'PROOF_SOFT_QUARANTINE_PARTIAL_DAMAGE_LIVE.json');
  const mdPath = path.join(repoRoot, 'PROOF_SOFT_QUARANTINE_PARTIAL_DAMAGE_LIVE.md');
  fs.writeFileSync(jsonPath, JSON.stringify(evidence, null, 2));
  fs.writeFileSync(
    mdPath,
    [
      '# PROOF — Soft quarantine partial damage (LIVE functional)',
      '',
      `**Verdict:** ${evidence.summary.verdict}`,
      `**Proven at:** ${evidence.provenAt}`,
      `**Stamp / SKU:** ${stamp} / ${SKU}`,
      '',
      `**Contract:** ${evidence.contract}`,
      '',
      '## Fixture',
      '',
      '```json',
      JSON.stringify(evidence.fixture, null, 2),
      '```',
      '',
      '## Gates (measured)',
      '',
      ...gates.map(
        (g) =>
          `- ${g.ok ? 'PASS' : 'FAIL'} \`${g.id}\`: ${g.detail}` +
          (g.measured ? `\n  - measured: \`${JSON.stringify(g.measured).slice(0, 240)}\`` : ''),
      ),
      '',
      '## Reproduce',
      '',
      '```bash',
      'cd SamplePOS.Server && npx tsx scripts/proof-soft-quarantine-partial-damage-live.ts',
      'npm run proof:soft-quarantine-partial-damage:live',
      '```',
      '',
      'Requires: `DATABASE_URL`, single-store mode, accounts 1300/5120, migration 609.',
      '',
    ].join('\n'),
  );

  console.log('═'.repeat(60));
  console.log(` verdict: ${evidence.summary.verdict}`);
  console.log(` passed: ${evidence.summary.passed}/${evidence.summary.total}`);
  console.log(` wrote: ${path.basename(jsonPath)}`);
  console.log('═'.repeat(60));

  await pool.end();
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('LIVE proof crashed:', err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
