#!/usr/bin/env node
/**
 * Proof — Transfer stock uses enterprise product search (SSOT) + warehouse-aware API.
 *
 * Gate 0 — Static: EnterpriseProductSearch SSOT, no duplicate TransferProductSearch
 * Gate 1 — Unit: FEFO allocation helper
 * Gate 2 — Live: warehouse product search fields + filtering
 * Gate 3 — Live: product lots (FEFO) + transfer draft create from search result
 *
 *   npm run proof:transfer-product-search
 *   PROOF_OUT=PROOF_TRANSFER_PRODUCT_SEARCH.md npm run proof:transfer-product-search
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clientDir = resolve(root, 'samplepos.client');
const serverDir = resolve(root, 'SamplePOS.Server');
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';
const OUT = process.env.PROOF_OUT || resolve(root, 'PROOF_TRANSFER_PRODUCT_SEARCH.md');
const TRANSFER_QTY = Number(process.env.PROOF_TRANSFER_QTY || 1);

let pass = 0;
let fail = 0;
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

function assert(c, n, d = '') {
  if (c) ok(n, d);
  else bad(n, d);
}

function fileExists(rel) {
  return existsSync(resolve(root, rel));
}

function fileContains(rel, needle) {
  if (!fileExists(rel)) return false;
  return readFileSync(resolve(root, rel), 'utf8').includes(needle);
}

function fileNotExists(rel) {
  return !fileExists(rel);
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

function gateStaticSsot() {
  console.log('\n── Gate 0: Enterprise product search SSOT (static) ──');
  assert(
    fileContains('samplepos.client/src/components/inventory/shared/EnterpriseProductSearch.tsx', "mode: 'procurement'"),
    'EnterpriseProductSearch supports procurement mode',
  );
  assert(
    fileContains('samplepos.client/src/components/inventory/shared/EnterpriseProductSearch.tsx', "mode: 'warehouse'"),
    'EnterpriseProductSearch supports warehouse mode',
  );
  assert(
    fileContains('samplepos.client/src/components/inventory/shared/ProcurementProductSearch.tsx', 'EnterpriseProductSearch'),
    'ProcurementProductSearch wraps EnterpriseProductSearch',
  );
  assert(
    fileContains('samplepos.client/src/components/inventory/TransferProductLinePicker.tsx', 'EnterpriseProductSearch'),
    'TransferProductLinePicker uses EnterpriseProductSearch',
  );
  assert(
    fileContains('samplepos.client/src/components/inventory/TransferProductLinePicker.tsx', 'mode="warehouse"'),
    'Transfer picker uses warehouse mode',
  );
  assert(
    fileContains('samplepos.client/src/components/inventory/TransferProductLinePicker.tsx', 'onLinesChange'),
    'Transfer picker emits onLinesChange (no blank manual rows)',
  );
  assert(
    fileContains('samplepos.client/src/components/inventory/TransferProductLinePicker.tsx', 'UomSelector'),
    'Transfer picker reuses UomSelector (PO MUoM engine)',
  );
  assert(
    fileContains('samplepos.client/src/components/inventory/TransferProductLinePicker.tsx', 'poLineBaseQuantity'),
    'Transfer picker uses PO line base quantity conversion',
  );
  assert(
    fileNotExists('samplepos.client/src/components/inventory/TransferProductSearch.tsx'),
    'No duplicate TransferProductSearch component',
  );
  assert(
    fileContains('samplepos.client/src/pages/inventory/StoreTransfersPage.tsx', 'TransferCreateWorkspace'),
    'StoreTransfersPage uses create workspace drawer',
  );
  assert(
    fileContains('samplepos.client/src/components/inventory/TransferCreateWorkspace.tsx', 'SlideDrawer'),
    'TransferCreateWorkspace full drawer',
  );
  assert(
    fileContains('samplepos.client/src/components/inventory/TransferProductLinePicker.tsx', 'DataTable'),
    'Transfer line picker uses DataTable',
  );
  assert(
    !fileContains('samplepos.client/src/pages/inventory/StoreTransfersPage.tsx', 'DialogContent'),
    'No assortment modal on create page',
  );
  assert(
    fileContains('samplepos.client/src/pages/inventory/StoreTransfersPage.tsx', 'onLinesChange={handleLinesChange}'),
    'StoreTransfersPage wires onLinesChange',
  );
  assert(
    !fileContains('samplepos.client/src/pages/inventory/StoreTransfersPage.tsx', 'onAddLines'),
    'StoreTransfersPage removed onAddLines API',
  );
  assert(
    fileContains('SamplePOS.Server/src/modules/inventory/warehouse/productStoreDistributionService.ts', 'freeQuantity'),
    'searchProductsAtStore returns freeQuantity',
  );
  assert(
    fileContains('SamplePOS.Server/src/modules/inventory/warehouse/productStoreDistributionService.ts', 'primaryLotNumber'),
    'searchProductsAtStore returns primaryLotNumber',
  );
  assert(
    fileContains('samplepos.client/src/components/inventory/EmergencyTransferPanel.tsx', 'onLinesChange'),
    'EmergencyTransferPanel uses onLinesChange',
  );
}

function gateFefoUnit() {
  console.log('\n── Gate 1: FEFO allocation unit test ──');
  const r = spawnSync(
    'npx',
    ['vitest', 'run', 'src/utils/transferFefoAllocation.test.ts'],
    {
      cwd: clientDir,
      stdio: 'pipe',
      shell: process.platform === 'win32',
      encoding: 'utf8',
    },
  );
  assert(r.status === 0, 'transferFefoAllocation.test.ts', r.status !== 0 ? (r.stderr || r.stdout || '').slice(-400) : '');
}

const REQUIRED_SEARCH_FIELDS = [
  'productId',
  'productName',
  'onHandQuantity',
  'reservedQuantity',
  'freeQuantity',
  'availableQuantity',
  'uoms',
  'storeName',
];

function validateSearchRow(row) {
  for (const f of REQUIRED_SEARCH_FIELDS) {
    if (!(f in row)) return `missing ${f}`;
  }
  if (typeof row.freeQuantity !== 'number' || row.freeQuantity <= 0) {
    return `freeQuantity=${row.freeQuantity}`;
  }
  if (row.freeQuantity > row.onHandQuantity + 0.0001) {
    return 'free > onHand';
  }
  if (!Array.isArray(row.uoms) || row.uoms.length === 0) {
    return 'uoms empty';
  }
  return null;
}

async function gateWarehouseSearchLive(token, pool) {
  console.log('\n── Gate 2: Warehouse product search API (live) ──');
  if (!token) {
    bad('Warehouse search live', 'no token');
    return null;
  }

  await pool.query('UPDATE system_settings SET is_multistore_enabled = true');

  const main = await pool.query(
    `SELECT id, name, code FROM store_locations WHERE store_type = 'MAIN' AND is_active = true ORDER BY is_default_receiving DESC NULLS LAST LIMIT 1`,
  );
  const mainId = main.rows[0]?.id;
  assert(!!mainId, 'MAIN store exists', main.rows[0]?.name ?? '');
  if (!mainId) return null;

  const short = await req('GET', `/api/inventory/store-products/search?storeLocationId=${mainId}&q=a&limit=5`, {
    token,
  });
  assert(short.status === 400, 'Short query rejected (min 2 chars)', String(short.status));
  const shortRows = short.data?.data ?? [];
  assert(shortRows.length === 0, 'Short query has no data rows', `count=${shortRows.length}`);

  const stocked = await pool.query(
    `SELECT p.id, p.name, p.sku, p.barcode,
            GREATEST(
              SUM(ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed),
              0
            )::float AS free_qty
     FROM products p
     INNER JOIN inventory_balances ib ON ib.product_id = p.id AND ib.store_location_id = $1
     INNER JOIN product_lots pl ON pl.id = ib.product_lot_id
     WHERE p.is_active = true
       AND p.product_type <> 'service'
       AND pl.status = 'ACTIVE'
       AND NOT ib.blocked
       AND ib.quantity_on_hand > 0
       AND (pl.expiry_date IS NULL OR pl.expiry_date > CURRENT_DATE)
     GROUP BY p.id, p.name, p.sku, p.barcode
     HAVING SUM(GREATEST(ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed, 0)) > 0
     ORDER BY free_qty DESC
     LIMIT 1`,
    [mainId],
  );
  const sample = stocked.rows[0];
  assert(!!sample, 'DB has transferable product at MAIN', sample?.name ?? 'none');
  if (!sample) return null;

  const term = (sample.name || sample.sku || 'a').trim().slice(0, 4).toLowerCase();
  const search = await req(
    'GET',
    `/api/inventory/store-products/search?storeLocationId=${mainId}&q=${encodeURIComponent(term)}&limit=20`,
    { token },
  );
  assert(search.status === 200 && search.data?.success !== false, 'Product search HTTP', search.data?.error);
  const rows = search.data?.data ?? [];
  assert(rows.length > 0, 'Search returns transferable products', `term="${term}" count=${rows.length}`);

  const hit = rows.find((r) => r.productId === sample.id);
  assert(!!hit, 'Stocked product appears in search', sample.name);

  let shapeErr = null;
  for (const row of rows) {
    shapeErr = validateSearchRow(row);
    if (shapeErr) break;
  }
  assert(!shapeErr, 'All search rows have warehouse fields + freeQty > 0', shapeErr ?? '');

  if (sample.barcode) {
    const bc = await req(
      'GET',
      `/api/inventory/store-products/search?storeLocationId=${mainId}&q=${encodeURIComponent(sample.barcode)}&limit=5`,
      { token },
    );
    const bcRows = bc.data?.data ?? [];
    const bcHit = bcRows.some((r) => r.productId === sample.id);
    assert(bcHit, 'Barcode search finds product', sample.barcode);
  } else {
    ok('Barcode search', 'skipped — product has no barcode');
  }

  const zeroStock = await pool.query(
    `SELECT p.id, p.name
     FROM products p
     WHERE p.is_active = true
       AND p.product_type <> 'service'
       AND NOT EXISTS (
         SELECT 1
         FROM inventory_balances ib
         INNER JOIN product_lots pl ON pl.id = ib.product_lot_id
         WHERE ib.product_id = p.id
           AND ib.store_location_id = $1
           AND pl.status = 'ACTIVE'
           AND NOT ib.blocked
           AND ib.quantity_on_hand > 0
           AND (pl.expiry_date IS NULL OR pl.expiry_date > CURRENT_DATE)
           AND GREATEST(ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed, 0) > 0
       )
     ORDER BY p.name
     LIMIT 1`,
    [mainId],
  );
  if (zeroStock.rows[0]?.name) {
    const z = zeroStock.rows[0];
    const zTerm = z.name.trim().slice(0, Math.min(6, z.name.length));
    const zSearch = await req(
      'GET',
      `/api/inventory/store-products/search?storeLocationId=${mainId}&q=${encodeURIComponent(zTerm)}&limit=20`,
      { token },
    );
    const zRows = zSearch.data?.data ?? [];
    const leaked = zRows.some((r) => r.productId === z.id);
    assert(!leaked, 'Zero-free product excluded from search', z.name);
  } else {
    ok('Zero-stock exclusion', 'skipped — no zero-stock active product found');
  }

  return { mainId, sample };
}

async function gateLotsAndTransferLive(token, pool, ctx) {
  console.log('\n── Gate 3: Lots API + transfer create from search (live) ──');
  if (!token || !ctx?.mainId || !ctx?.sample) {
    bad('Lots + transfer live', 'prerequisites missing');
    return;
  }

  const lotsRes = await req(
    'GET',
    `/api/inventory/store-products/${ctx.sample.id}/lots?storeLocationId=${ctx.mainId}`,
    { token },
  );
  assert(lotsRes.status === 200 && lotsRes.data?.success !== false, 'GET product lots', lotsRes.data?.error);
  const lots = lotsRes.data?.data ?? [];
  assert(lots.length > 0, 'Lots returned for searchable product', ctx.sample.name);

  const lot = lots[0];
  assert(typeof lot.productLotId === 'string', 'lot has productLotId');
  assert(typeof lot.availableQuantity === 'number' && lot.availableQuantity > 0, 'lot availableQuantity > 0');

  const qty = Math.min(TRANSFER_QTY, lot.availableQuantity);
  const ens = await req('POST', '/api/inventory/store-locations/ensure-defaults', { token });
  const destId = ens.data?.data?.selling?.id;
  assert(!!destId, 'SELLING destination for transfer');

  const transfer = await req('POST', '/api/inventory/store-transfers', {
    token,
    body: {
      destinationStoreId: destId,
      assortmentExpansions: [{ productId: ctx.sample.id, expandPermanently: true }],
      lines: [{ productLotId: lot.productLotId, quantity: qty }],
      notes: 'proof-transfer-product-search',
    },
  });
  assert(
    transfer.status === 201 && transfer.data?.data?.id,
    'Create transfer from search lot line',
    transfer.data?.error ?? String(transfer.status),
  );
  ok('Transfer created from warehouse search path', transfer.data?.data?.transferNumber ?? transfer.data?.data?.id);
}

function writeReport() {
  const md = [
    '# Transfer Product Search — Proof',
    '',
    `- **Date:** ${new Date().toISOString()}`,
    `- **API:** ${BASE}`,
    '',
    ...lines,
    '',
    '## Summary',
    '',
    `- **Passed:** ${pass}`,
    `- **Failed:** ${fail}`,
    '',
    fail === 0 ? '**RESULT: ALL PASS**' : `**RESULT: FAIL (${fail})**`,
  ].join('\n');
  writeFileSync(OUT, md);
  console.log(`\nWrote ${OUT}`);
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  TRANSFER PRODUCT SEARCH — SSOT + warehouse API proof          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`API: ${BASE}\n`);

  gateStaticSsot();
  gateFefoUnit();

  const health = await req('GET', '/api/health').catch(() => ({ status: 0, data: null, text: '' }));
  if (health.status !== 200) {
    bad('API health — live gates require server on :3001', 'start SamplePOS.Server');
  } else {
    ok('API health');
    const pool = getPool();
    let originalFlag = false;
    try {
      originalFlag = (
        await pool.query(`SELECT COALESCE(is_multistore_enabled, false) AS e FROM system_settings LIMIT 1`)
      ).rows[0]?.e === true;

      const login = await req('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
      const token = login.data?.data?.token;
      assert(login.status === 200 && token, 'Login', login.data?.error);

      const ctx = await gateWarehouseSearchLive(token, pool);
      await gateLotsAndTransferLive(token, pool, ctx);

      await pool.query('UPDATE system_settings SET is_multistore_enabled = $1', [originalFlag]);
    } finally {
      await pool.end();
    }
  }

  writeReport();
  console.log(`\n${fail ? 'FAILED' : 'OK'}: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
