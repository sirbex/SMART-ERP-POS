#!/usr/bin/env node
/**
 * Proof — Inventory parity: single-store OFF vs multistore ON.
 *
 * Ensures adjust-batch, layer coupling, and visibility gates work in both modes.
 *
 *   npm run proof:inventory-modes-parity
 *   PROOF_OUT=PROOF_INVENTORY_MODES_PARITY.md npm run proof:inventory-modes-parity
 *   SKIP_DELEGATED=1 npm run proof:inventory-modes-parity
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = resolve(root, 'SamplePOS.Server');
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';
const OUT = process.env.PROOF_OUT || resolve(root, 'PROOF_INVENTORY_MODES_PARITY.md');
const TAG = `IMP-${Date.now().toString(36)}`;
const SKIP_DELEGATED = process.env.SKIP_DELEGATED === '1';

const ADJ_QTY = Number(process.env.PROOF_ADJ_QTY || 3);
const GR_QTY = Number(process.env.PROOF_GR_QTY || 20);
const GR_COST = Number(process.env.PROOF_GR_COST || 1000);

let pass = 0;
let fail = 0;
let skip = 0;
const lines = [];

function ok(n, d = '') {
  pass++;
  console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`);
  lines.push(`- **PASS** ${n}${d ? ` — ${d}` : ''}`);
}
function bad(n, d = '') {
  fail++;
  console.error(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
  lines.push(`- **FAIL** ${n}${d ? ` — ${d}` : ''}`);
}
function skipGate(n, d = '') {
  skip++;
  console.log(`  SKIP  ${n}${d ? ` — ${d}` : ''}`);
  lines.push(`- **SKIP** ${n}${d ? ` — ${d}` : ''}`);
}
function assert(c, n, d = '') {
  if (c) ok(n, d);
  else bad(n, d);
}

function fileContains(rel, needle) {
  if (!existsSync(resolve(root, rel))) return false;
  return readFileSync(resolve(root, rel), 'utf8').includes(needle);
}

function loadEnv() {
  const envPath = resolve(serverDir, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/pos_system';
  }
}

function getPool() {
  loadEnv();
  const require = createRequire(resolve(serverDir, 'package.json'));
  const pg = require('pg');
  return new pg.Pool({ connectionString: process.env.DATABASE_URL });
}

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
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

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function futureYmd(days = 365) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function setMultistore(pool, enabled) {
  await pool.query('UPDATE system_settings SET is_multistore_enabled = $1', [enabled]);
}

async function layerMismatchCount(pool, productId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM (
       SELECT pl.id
       FROM product_lots pl
       LEFT JOIN inventory_balances ib ON ib.product_lot_id = pl.id
       LEFT JOIN inventory_batches b ON b.id = pl.inventory_batch_id
       WHERE pl.product_id = $1 AND pl.inventory_batch_id IS NOT NULL
       GROUP BY pl.id, b.remaining_quantity
       HAVING ABS(COALESCE(SUM(ib.quantity_on_hand), 0) - COALESCE(b.remaining_quantity, 0)) > 0.001
     ) x`,
    [productId],
  );
  return Number(r.rows[0]?.c ?? 0);
}

async function createProduct(token, sku, name) {
  const res = await req('POST', '/api/products', {
    token,
    body: {
      name,
      sku,
      costPrice: GR_COST,
      sellingPrice: 2500,
      unitOfMeasure: 'PCS',
      quantityOnHand: 0,
      trackExpiry: false,
      reorderLevel: 0,
    },
  });
  return res.data?.data?.id ?? res.data?.id;
}

async function createGr(token, pool, userId, productId, batchTag, multistoreOn) {
  await setMultistore(pool, multistoreOn);
  const suppliers = await req('GET', '/api/suppliers?limit=1', { token });
  const supplierId = (suppliers.data?.data?.data ?? suppliers.data?.data ?? [])[0]?.id;
  if (!supplierId) throw new Error('no supplier');

  const grCreate = await req('POST', '/api/goods-receipts', {
    token,
    body: {
      supplierId,
      receiptDate: todayYmd(),
      receivedBy: userId,
      notes: `modes-parity ${batchTag}`,
      items: [
        {
          productId,
          productName: batchTag,
          orderedQuantity: GR_QTY,
          receivedQuantity: GR_QTY,
          unitCost: GR_COST,
          batchNumber: `BATCH-${batchTag}`,
          expiryDate: futureYmd(365),
        },
      ],
    },
  });
  const grId = grCreate.data?.data?.gr?.id ?? grCreate.data?.data?.id;
  if (!grId) throw new Error(grCreate.data?.error || 'GR create failed');
  const fin = await req('POST', `/api/goods-receipts/${grId}/finalize`, { token });
  if (!(fin.status === 200 && (fin.data?.success || fin.data?.data?.gr?.status === 'COMPLETED'))) {
    throw new Error(fin.data?.error || 'GR finalize failed');
  }
  return grId;
}

async function getMainStoreId(token) {
  const ens = await req('POST', '/api/inventory/store-locations/ensure-defaults', { token });
  return ens.data?.data?.main?.id ?? ens.data?.data?.receiving?.id;
}

async function getPosSellingStoreId(pool, token) {
  const list = await req('GET', '/api/inventory/store-locations', { token });
  const rows = list.data?.data ?? [];
  const pos = rows.find((s) => s.isPosSelling === true || s.is_pos_selling === true);
  if (pos?.id) return pos.id;
  return (
    (
      await pool.query(
        `SELECT id FROM store_locations WHERE is_pos_selling = true AND is_active = true LIMIT 1`,
      )
    ).rows[0]?.id ?? null
  );
}

function gateStatic() {
  console.log('\n── Gate 0: Static mode parity ──');
  assert(
    fileContains('SamplePOS.Server/src/services/warehouseInventoryCoupling.ts', 'alignBatchSubledgerToStoreBalances'),
    'Layer heal: alignBatchSubledgerToStoreBalances',
  );
  assert(
    fileContains('SamplePOS.Server/src/modules/inventory/warehouse/warehouseAdjustmentService.ts', 'resolveProductLotForAdjustment'),
    'Multistore adjust resolves lot from batchId',
  );
  assert(
    fileContains('SamplePOS.Server/src/modules/inventory/inventoryService.ts', 'isMultistoreEnabled'),
    'adjustBatch branches on multistore flag',
  );
  assert(
    fileContains('SamplePOS.Server/src/services/warehouseInventoryCoupling.ts', 'if (!(await isMultistoreEnabled(client)))'),
    'Layer coupling skipped when multistore OFF',
  );
  assert(
    !fileContains(
      'samplepos.client/src/pages/inventory/InventoryAdjustmentsPage.tsx',
      'isMultistoreEnabled && selectedBatch.id !== selectedBatch.product_id',
    ),
    'Client does not send batch UUID as productLotId',
  );
}

function gateUnit() {
  console.log('\n── Gate 1: Unit tests ──');
  const r = spawnSync(
    'node',
    [
      '--experimental-vm-modules',
      './node_modules/jest/bin/jest.js',
      'src/services/warehouseInventoryCoupling.test.ts',
      '--runInBand',
      '--no-coverage',
    ],
    {
      cwd: serverDir,
      stdio: 'pipe',
      encoding: 'utf8',
    },
  );
  assert(r.status === 0, 'warehouseInventoryCoupling.test.ts', r.status !== 0 ? (r.stderr || r.stdout || '').slice(-300) : '');
}

async function gateSingleStoreOff(token, pool, userId) {
  console.log('\n── Gate 2: Single-store OFF (legacy adjust-batch) ──');
  await setMultistore(pool, false);

  const vis = await req('GET', '/api/inventory/stock-visibility', { token });
  assert(
    vis.status === 200 && vis.data?.data?.multistore === false,
    'Stock visibility reports multistore: false',
    `multistore=${vis.data?.data?.multistore}`,
  );

  const productId = await createProduct(token, `IMP-OFF-${TAG}`, `IMP Single ${TAG}`);
  assert(!!productId, 'Create test product (OFF mode)');

  await createGr(token, pool, userId, productId, `${TAG}-OFF`, false);

  const compositeRows = Number(
    (await pool.query(`SELECT COUNT(*)::int AS c FROM inventory_balances WHERE product_id = $1`, [productId]))
      .rows[0]?.c ?? 0,
  );
  assert(compositeRows === 0, 'No inventory_balances rows when multistore OFF', `rows=${compositeRows}`);

  const batchBefore = Number(
    (
      await pool.query(
        `SELECT COALESCE(SUM(remaining_quantity), 0)::float AS q
         FROM inventory_batches WHERE product_id = $1 AND status = 'ACTIVE'`,
        [productId],
      )
    ).rows[0]?.q ?? 0,
  );
  assert(batchBefore >= GR_QTY, 'GR stocked legacy batches when OFF', `qty=${batchBefore}`);

  const adjIn = await req('POST', '/api/inventory/adjust-batch', {
    token,
    body: {
      productId,
      quantity: ADJ_QTY,
      direction: 'IN',
      reason: 'ADJUSTMENT',
      notes: `OFF mode IN ${TAG}`,
      userId,
    },
  });
  assert(
    adjIn.status === 200 && adjIn.data?.success !== false,
    'OFF: adjust-batch IN succeeds',
    adjIn.data?.error_code ?? adjIn.data?.error,
  );
  assert(
    adjIn.data?.error_code !== 'ERR_WAREHOUSE_LAYER_COUPLING',
    'OFF: no layer coupling error on IN',
  );

  const adjOut = await req('POST', '/api/inventory/adjust-batch', {
    token,
    body: {
      productId,
      quantity: ADJ_QTY,
      direction: 'OUT',
      reason: 'ADJUSTMENT',
      notes: `OFF mode OUT ${TAG}`,
      userId,
    },
  });
  assert(
    adjOut.status === 200 && adjOut.data?.success !== false,
    'OFF: adjust-batch OUT succeeds',
    adjOut.data?.error_code ?? adjOut.data?.error,
  );

  const batchAfter = Number(
    (
      await pool.query(
        `SELECT COALESCE(SUM(remaining_quantity), 0)::float AS q
         FROM inventory_batches WHERE product_id = $1 AND status = 'ACTIVE'`,
        [productId],
      )
    ).rows[0]?.q ?? 0,
  );
  assert(
    Math.abs(batchAfter - batchBefore) < 0.02,
    'OFF: net batch qty unchanged after +IN then -OUT',
    `before=${batchBefore} after=${batchAfter}`,
  );

  return productId;
}

async function gateMultistoreOn(token, pool, userId) {
  console.log('\n── Gate 3: Multistore ON (store-scoped adjust-batch) ──');
  await setMultistore(pool, true);
  await req('POST', '/api/inventory/store-locations/ensure-defaults', { token });

  const vis = await req('GET', '/api/inventory/stock-visibility', { token });
  assert(
    vis.status === 200 && vis.data?.data?.multistore === true,
    'Stock visibility reports multistore: true',
  );

  const productId = await createProduct(token, `IMP-ON-${TAG}`, `IMP Multi ${TAG}`);
  assert(!!productId, 'Create test product (ON mode)');

  await createGr(token, pool, userId, productId, `${TAG}-ON`, true);

  const mainStoreId = await getMainStoreId(token);
  assert(!!mainStoreId, 'MAIN store available');

  const batchRow = (
    await pool.query(
      `SELECT id, batch_number, remaining_quantity::float AS qty
       FROM inventory_batches WHERE product_id = $1 AND status = 'ACTIVE'
       ORDER BY received_date ASC NULLS LAST LIMIT 1`,
      [productId],
    )
  ).rows[0];
  assert(!!batchRow?.id, 'Active batch exists after GR (ON)', batchRow?.batch_number);

  const mismatchesBefore = await layerMismatchCount(pool, productId);
  assert(mismatchesBefore === 0, 'ON: no layer drift after GR', `mismatches=${mismatchesBefore}`);

  // Simulate legacy drift (batch >> balances) — adjust must auto-heal then succeed
  await pool.query(
    `UPDATE inventory_batches SET remaining_quantity = remaining_quantity + 50 WHERE id = $1`,
    [batchRow.id],
  );
  const drifted = await layerMismatchCount(pool, productId);
  assert(drifted >= 1, 'Synthetic drift injected for heal test', `mismatches=${drifted}`);

  const adjHeal = await req('POST', '/api/inventory/adjust-batch', {
    token,
    body: {
      productId,
      batchId: batchRow.id,
      storeLocationId: mainStoreId,
      quantity: 1,
      direction: 'OUT',
      reason: 'ADJUSTMENT',
      notes: `ON heal+OUT batchId-only ${TAG}`,
      userId,
    },
  });
  assert(
    adjHeal.status === 200 && adjHeal.data?.success !== false,
    'ON: adjust-batch with batchId-only heals drift and succeeds',
    adjHeal.data?.error_code ?? adjHeal.data?.error,
  );
  assert(
    adjHeal.data?.error_code !== 'ERR_WAREHOUSE_LAYER_COUPLING',
    'ON: no ERR_WAREHOUSE_LAYER_COUPLING after heal path',
  );

  const mismatchesAfterHeal = await layerMismatchCount(pool, productId);
  assert(
    mismatchesAfterHeal === 0,
    'ON: layer coupling clean after adjust',
    `mismatches=${mismatchesAfterHeal}`,
  );

  const adjIn = await req('POST', '/api/inventory/adjust-batch', {
    token,
    body: {
      productId,
      batchId: batchRow.id,
      storeLocationId: mainStoreId,
      quantity: ADJ_QTY,
      direction: 'IN',
      reason: 'ADJUSTMENT',
      notes: `ON mode IN ${TAG}`,
      userId,
    },
  });
  assert(adjIn.status === 200 && adjIn.data?.success !== false, 'ON: adjust-batch IN', adjIn.data?.error);

  const adjOut = await req('POST', '/api/inventory/adjust-batch', {
    token,
    body: {
      productId,
      batchId: batchRow.id,
      storeLocationId: mainStoreId,
      quantity: ADJ_QTY,
      direction: 'OUT',
      reason: 'ADJUSTMENT',
      notes: `ON mode OUT ${TAG}`,
      userId,
    },
  });
  assert(adjOut.status === 200 && adjOut.data?.success !== false, 'ON: adjust-batch OUT', adjOut.data?.error);

  const mismatchesFinal = await layerMismatchCount(pool, productId);
  assert(mismatchesFinal === 0, 'ON: layer coupling after IN/OUT cycle', `mismatches=${mismatchesFinal}`);

  // DAMAGE quarantine path — move stock MAIN → SELLING then damage at SELLING
  const sellingId = await getPosSellingStoreId(pool, token);
  const mainLot = (
    await pool.query(
      `SELECT ib.product_lot_id, ib.quantity_on_hand::float AS qty
       FROM inventory_balances ib
       WHERE ib.store_location_id = $1 AND ib.product_id = $2 AND ib.quantity_on_hand > 0
       ORDER BY ib.quantity_on_hand DESC LIMIT 1`,
      [mainStoreId, productId],
    )
  ).rows[0];
  if (sellingId && mainLot?.product_lot_id && Number(mainLot.qty) >= 5) {
    const xfer = await req('POST', '/api/inventory/store-transfers', {
      token,
      body: {
        destinationStoreId: sellingId,
        lines: [{ productLotId: mainLot.product_lot_id, quantity: 5 }],
      },
    });
    const xferId = xfer.data?.data?.id;
    const xferStatus = xfer.data?.data?.status;
    if (xferId) {
      try {
        if (xferStatus === 'DRAFT') {
          await req('POST', `/api/inventory/store-transfers/${xferId}/approve`, { token });
        }
        await req('POST', `/api/inventory/store-transfers/${xferId}/dispatch`, { token });
        await req('POST', `/api/inventory/store-transfers/${xferId}/receive`, { token });
      } catch {
        /* workflow may auto-complete */
      }
      const lot = (
        await pool.query(
          `SELECT ib.product_lot_id, ib.quantity_on_hand::float AS qty
           FROM inventory_balances ib
           WHERE ib.store_location_id = $1 AND ib.product_id = $2 AND ib.quantity_on_hand > 0
           LIMIT 1`,
          [sellingId, productId],
        )
      ).rows[0];
      if (lot?.product_lot_id && Number(lot.qty) >= 1) {
        const dmg = await req('POST', '/api/inventory/adjust-batch', {
          token,
          body: {
            productId,
            productLotId: lot.product_lot_id,
            storeLocationId: sellingId,
            quantity: 1,
            direction: 'OUT',
            reason: 'DAMAGE',
            notes: `ON DAMAGE ${TAG}`,
            userId,
          },
        });
        assert(
          dmg.status === 200 && dmg.data?.success !== false,
          'ON: DAMAGE adjust-batch (quarantine)',
          dmg.data?.error_code ?? dmg.data?.error,
        );
        const mismatchesDmg = await layerMismatchCount(pool, productId);
        assert(mismatchesDmg === 0, 'ON: layer coupling after DAMAGE', `mismatches=${mismatchesDmg}`);
      } else {
        skipGate('ON: DAMAGE adjust-batch', 'no sellable lot at SELLING');
      }
    } else {
      skipGate('ON: DAMAGE adjust-batch', 'transfer create failed');
    }
  } else {
    skipGate('ON: DAMAGE adjust-batch', 'no SELLING store or insufficient MAIN lot');
  }

  return productId;
}

async function gateToggleBack(token, pool, originalFlag) {
  console.log('\n── Gate 4: Mode toggle restore ──');
  await setMultistore(pool, originalFlag);
  const r = await pool.query(`SELECT is_multistore_enabled FROM system_settings LIMIT 1`);
  assert(r.rows[0]?.is_multistore_enabled === originalFlag, 'Multistore flag restored', String(r.rows[0]?.is_multistore_enabled));

  const vis = await req('GET', '/api/inventory/stock-visibility', { token });
  const expectedMultistore = originalFlag === true;
  assert(
    vis.data?.data?.multistore === expectedMultistore,
    'Visibility matches restored flag',
    `expected=${expectedMultistore} got=${vis.data?.data?.multistore}`,
  );
}

function runDelegated(name, scriptRel) {
  console.log(`\n── Delegated: ${name} ──`);
  const childEnv = { ...process.env };
  delete childEnv.PHASES;
  const r = spawnSync('node', [resolve(root, scriptRel)], {
    cwd: root,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    encoding: 'utf8',
    env: childEnv,
  });
  const tail = (r.stderr || r.stdout || '').trim().split('\n').slice(-2).join(' | ');
  if (r.status === 0) ok(name, tail || 'exit 0');
  else bad(name, tail || `exit ${r.status}`);
}

function writeReport(originalFlag) {
  const md = [
    '# Inventory Modes Parity Proof',
    '',
    `- **Date:** ${new Date().toISOString()}`,
    `- **API:** ${BASE}`,
    `- **Tag:** ${TAG}`,
    `- **Restored multistore flag:** ${originalFlag}`,
    '',
    ...lines,
    '',
    '## Summary',
    '',
    `- **Passed:** ${pass}`,
    `- **Failed:** ${fail}`,
    `- **Skipped:** ${skip}`,
    '',
    fail === 0 ? '**RESULT: PASS**' : `**RESULT: FAIL (${fail})**`,
    '',
    '## Modes covered',
    '',
    '| Mode | adjust-batch | Layer coupling | Stock visibility |',
    '|------|--------------|----------------|------------------|',
    '| Single-store OFF | Legacy path, no composite rows | Skipped | multistore: false |',
    '| Multistore ON | Store-scoped + batchId heal | Enforced + auto-heal | multistore: true |',
  ].join('\n');
  writeFileSync(OUT, md);
  console.log(`\nWrote ${OUT}`);
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  INVENTORY MODES PARITY — single-store OFF vs multistore ON    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`API: ${BASE}\n`);

  gateStatic();
  gateUnit();

  const health = await req('GET', '/api/health').catch(() => ({ status: 0 }));
  if (health.status !== 200) {
    bad('API health', 'start server on :3001');
    writeReport(null);
    process.exit(1);
  }

  const pool = getPool();
  let originalFlag = false;
  try {
    originalFlag =
      (await pool.query(`SELECT COALESCE(is_multistore_enabled, false) AS e FROM system_settings LIMIT 1`))
        .rows[0]?.e === true;

    const login = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
    const token = login.data?.data?.token;
    const userId = login.data?.data?.user?.id ?? login.data?.data?.id;
    assert(!!token && !!userId, 'Login', login.data?.error);

    if (token && userId) {
      await gateSingleStoreOff(token, pool, userId);
      await gateMultistoreOn(token, pool, userId);
      await gateToggleBack(token, pool, originalFlag);
    }
  } finally {
    await setMultistore(pool, originalFlag).catch(() => {});
    await pool.end();
  }

  if (!SKIP_DELEGATED) {
    runDelegated('proof-warehouse-layer-coupling', 'SamplePOS.Server/scripts/proof-warehouse-layer-coupling.mjs');
    runDelegated('proof-warehouse-network-phases', 'scripts/proof-warehouse-network-phases.mjs');
    runDelegated('proof-warehouse-network-matrix', 'scripts/proof-warehouse-network-matrix.mjs');
    runDelegated('proof-warehouse-12-steps', 'scripts/proof-warehouse-12-steps.mjs');
  } else {
    skipGate('Delegated proof suites', 'SKIP_DELEGATED=1');
  }

  writeReport(originalFlag);
  console.log(`\n${fail ? 'FAILED' : 'OK'}: ${pass} passed, ${fail} failed, ${skip} skipped\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
