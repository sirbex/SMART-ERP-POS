#!/usr/bin/env node
/**
 * Staging certification — identical GRN + Sale with multistore OFF vs ON.
 *
 * Requires API (default http://localhost:3001) + DATABASE_URL.
 *
 *   npm run proof:multistore:financial-parity
 *   BASE_URL=http://localhost:3001 DATABASE_URL=... node scripts/proof-multistore-financial-parity.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = resolve(root, 'SamplePOS.Server');
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const OUT = process.env.PROOF_OUT || resolve(root, 'PROOF_MULTISTORE_FINANCIAL_PARITY.md');

const GR_QTY = Number(process.env.PROOF_GR_QTY || 10);
const GR_COST = Number(process.env.PROOF_GR_COST || 1000);
const SALE_QTY = Number(process.env.PROOF_SALE_QTY || 2);
const SALE_PRICE = Number(process.env.PROOF_SALE_PRICE || 1500);
const TAG = `MSFP-${Date.now().toString(36)}`;

const NET_ACTIVE = `
  lt."Status" = 'POSTED' AND lt."IsReversed" = FALSE
  AND lt."Id" NOT IN (
    SELECT "ReversedByTransactionId" FROM ledger_transactions
    WHERE "ReversedByTransactionId" IS NOT NULL
  )`;

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
function info(s) {
  console.log(`  ....  ${s}`);
  lines.push(`- ${s}`);
}
function money(n) {
  return Math.round(Number(n || 0) * 100) / 100;
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
  // Must match API default tenant DB (tenants.slug = 'default' → pos_system).
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/pos_system';
  }
}

function getPool() {
  loadEnv();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const require = createRequire(resolve(serverDir, 'package.json'));
  const pg = require('pg');
  return new pg.Pool({ connectionString: process.env.DATABASE_URL });
}

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
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

async function glLinesForRef(pool, referenceType, referenceId) {
  const r = await pool.query(
    `SELECT a."AccountCode" AS code, SUM(le."DebitAmount") AS debit, SUM(le."CreditAmount") AS credit
     FROM ledger_entries le
     JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
     JOIN accounts a ON a."Id" = le."AccountId"
     WHERE lt."ReferenceType" = $1 AND lt."ReferenceId" = $2::uuid AND ${NET_ACTIVE}
     GROUP BY a."AccountCode" ORDER BY a."AccountCode"`,
    [referenceType, referenceId],
  );
  return r.rows.map((row) => ({ code: row.code, debit: money(row.debit), credit: money(row.credit) }));
}

async function globalSnapshot(pool) {
  const r = await pool.query(`
    SELECT
      (SELECT COALESCE(SUM(le."DebitAmount"), 0) FROM ledger_entries le JOIN ledger_transactions lt ON lt."Id" = le."TransactionId" WHERE ${NET_ACTIVE}) AS tb_debits,
      (SELECT COALESCE(SUM(le."CreditAmount"), 0) FROM ledger_entries le JOIN ledger_transactions lt ON lt."Id" = le."TransactionId" WHERE ${NET_ACTIVE}) AS tb_credits,
      (SELECT COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0) FROM ledger_entries le JOIN ledger_transactions lt ON lt."Id" = le."TransactionId" JOIN accounts a ON a."Id" = le."AccountId" WHERE a."AccountCode" = '1300' AND ${NET_ACTIVE}) AS inv_gl,
      (SELECT COALESCE(SUM(remaining_quantity * cost_price), 0) FROM inventory_batches WHERE status = 'ACTIVE' AND remaining_quantity > 0) AS batch_val
  `);
  const row = r.rows[0];
  return {
    tbDebits: money(row.tb_debits),
    tbCredits: money(row.tb_credits),
    invGl: money(row.inv_gl),
    batchVal: money(row.batch_val),
  };
}

async function createProduct(token, mode) {
  const stamp = `${TAG}-${mode}`;
  const created = await req('POST', '/api/products', {
    token,
    body: {
      name: `PROOF MS ${mode} ${stamp}`,
      sku: `PROOF-MS-${mode}-${stamp}`,
      costPrice: GR_COST,
      sellingPrice: SALE_PRICE,
      unitOfMeasure: 'PCS',
      quantityOnHand: 0,
      trackExpiry: false,
      reorderLevel: 0,
    },
  });
  const id = created.data?.data?.id ?? created.data?.id;
  assert(!!id, `Create product (${mode})`, created.data?.error);
  const uoms = await req('GET', `/api/products/${id}/uoms`, { token });
  const uomList = uoms.data?.data ?? uoms.data ?? [];
  const defaultUom =
    (Array.isArray(uomList) ? uomList.find((u) => u.isDefault) : null) ||
    (Array.isArray(uomList) ? uomList[0] : null);
  const uomSymbol = defaultUom?.symbol || defaultUom?.uomSymbol || 'PCS';
  return { id, sku: `PROOF-MS-${mode}-${stamp}`, uomSymbol };
}

async function createCustomer(token, mode) {
  const stamp = `${TAG}-${mode}`;
  const created = await req('POST', '/api/customers', {
    token,
    body: { name: `PROOF MS CUST ${mode} ${stamp}`, creditLimit: 1000000 },
  });
  const id = created.data?.data?.id;
  assert(!!id, `Create customer (${mode})`, created.data?.error);
  return id;
}

async function completeTransferWorkflow(token, transferId, initialStatus) {
  let status = initialStatus;
  if (status === 'RECEIVED') return;
  if (status === 'DRAFT') {
    const approved = await req('POST', `/api/inventory/store-transfers/${transferId}/approve`, { token });
    assert(approved.status === 200, 'Parity transfer approve', approved.data?.error);
    status = approved.data?.data?.status ?? 'APPROVED';
  }
  if (status === 'APPROVED' || status === 'DISPATCHED') {
    const dispatched = await req('POST', `/api/inventory/store-transfers/${transferId}/dispatch`, { token });
    assert(dispatched.status === 200, 'Parity transfer dispatch', dispatched.data?.error);
    status = dispatched.data?.data?.status ?? 'IN_TRANSIT';
  }
  if (status === 'IN_TRANSIT' || status === 'DISPATCHED') {
    const received = await req('POST', `/api/inventory/store-transfers/${transferId}/receive`, { token });
    assert(received.status === 200, 'Parity transfer receive', received.data?.error);
  }
}

/** Multistore POS deducts at the selling store — stage stock after GRN at MAIN. */
async function stageSellingStoreStock(token, pool, productId, qty, mode) {
  const ens = await req('POST', '/api/inventory/store-locations/ensure-defaults', { token });
  const destStoreId = ens.data?.data?.selling?.id;
  assert(!!destStoreId, 'Parity selling store id', ens.data?.error);

  const lotRow = await pool.query(
    `SELECT pl.id AS product_lot_id
     FROM inventory_balances ib
     INNER JOIN product_lots pl ON pl.id = ib.product_lot_id
     INNER JOIN store_locations sl_main ON sl_main.id = ib.store_location_id AND sl_main.store_type = 'MAIN'
     WHERE ib.product_id = $1
     ORDER BY ib.quantity_on_hand DESC
     LIMIT 1`,
    [productId],
  );
  const productLotId = lotRow.rows[0]?.product_lot_id;
  if (!productLotId || !destStoreId) {
    bad('Stage selling stock — missing lot or selling store');
    return;
  }

  const transfer = await req('POST', '/api/inventory/store-transfers', {
    token,
    body: {
      destinationStoreId: destStoreId,
      notes: `parity stage ${TAG}`,
      assortmentExpansions: [{ productId, expandPermanently: true }],
      lines: [{ productLotId, quantity: qty }],
    },
  });
  const transferId = transfer.data?.data?.id;
  const status = transfer.data?.data?.status;
  assert(transfer.status === 201 && transferId, 'Parity MAIN→SELLING transfer', transfer.data?.error);
  if (transferId) {
    await completeTransferWorkflow(token, transferId, status);
    ok(`Selling store staged (${mode})`, `${qty} units`);
  }
}

async function runWorkflow(pool, token, userId, mode) {
  info(`\nWorkflow multistore ${mode}`);
  await setMultistore(pool, mode === 'ON');

  const before = await globalSnapshot(pool);
  const suppliers = await req('GET', '/api/suppliers?limit=1', { token });
  const supplierId = (suppliers.data?.data?.data ?? suppliers.data?.data ?? [])[0]?.id;
  assert(!!supplierId, `Supplier (${mode})`);

  const supplierBefore = money(
    (await pool.query(`SELECT "OutstandingBalance" FROM suppliers WHERE "Id" = $1`, [supplierId])).rows[0]
      ?.OutstandingBalance,
  );

  const product = await createProduct(token, mode);
  const customerId = await createCustomer(token, mode);
  const customerBefore = money(
    (await pool.query(`SELECT balance FROM customers WHERE id = $1`, [customerId])).rows[0]?.balance,
  );

  const grCreate = await req('POST', '/api/goods-receipts', {
    token,
    body: {
      supplierId,
      receiptDate: todayYmd(),
      receivedBy: userId,
      notes: `proof-multistore-financial-parity ${mode}`,
      items: [
        {
          productId: product.id,
          productName: `PROOF MS ${mode}`,
          orderedQuantity: GR_QTY,
          receivedQuantity: GR_QTY,
          unitCost: GR_COST,
          batchNumber: `BATCH-${TAG}-${mode}`,
          expiryDate: futureYmd(365),
        },
      ],
    },
  });
  const grId = grCreate.data?.data?.gr?.id ?? grCreate.data?.data?.id;
  assert(grCreate.status === 200 || grCreate.status === 201, `Create GR (${mode})`, grCreate.data?.error);
  assert(!!grId, `GR id (${mode})`);

  const fin = await req('POST', `/api/goods-receipts/${grId}/finalize`, { token });
  const finOk = fin.status === 200 && (fin.data?.success === true || fin.data?.data?.gr?.status === 'COMPLETED');
  assert(finOk, `Finalize GR (${mode})`, fin.data?.error ?? fin.text?.slice(0, 200));
  if (!finOk) throw new Error(`GR finalize failed (${mode})`);

  const grGl = await glLinesForRef(pool, 'GOODS_RECEIPT', grId);
  const grBatchVal = money(
    (
      await pool.query(
        `SELECT COALESCE(SUM(remaining_quantity * cost_price), 0) AS v FROM inventory_batches WHERE goods_receipt_id = $1`,
        [grId],
      )
    ).rows[0]?.v,
  );
  const compositeLots = Number(
    (
      await pool.query(
        `SELECT COUNT(*)::int AS c FROM product_lots pl JOIN inventory_batches ib ON ib.id = pl.inventory_batch_id WHERE ib.goods_receipt_id = $1`,
        [grId],
      )
    ).rows[0]?.c ?? 0,
  );
  const compositeBalances = Number(
    (
      await pool.query(
        `SELECT COUNT(*)::int AS c FROM inventory_balances ib
         JOIN product_lots pl ON pl.id = ib.product_lot_id
         JOIN inventory_batches bat ON bat.id = pl.inventory_batch_id WHERE bat.goods_receipt_id = $1`,
        [grId],
      )
    ).rows[0]?.c ?? 0,
  );

  const supplierAfterGr = money(
    (await pool.query(`SELECT "OutstandingBalance" FROM suppliers WHERE "Id" = $1`, [supplierId])).rows[0]
      ?.OutstandingBalance,
  );

  if (mode === 'ON') {
    await stageSellingStoreStock(token, pool, product.id, GR_QTY, mode);
  }

  const saleTotal = SALE_QTY * SALE_PRICE;
  const sale = await req('POST', '/api/sales', {
    token,
    body: {
      customerId,
      idempotencyKey: `proof-ms-${TAG}-${mode}`,
      lineItems: [
        {
          productId: product.id,
          productName: `PROOF MS ${mode}`,
          sku: product.sku,
          uom: product.uomSymbol,
          quantity: SALE_QTY,
          unitPrice: SALE_PRICE,
          costPrice: GR_COST,
          subtotal: saleTotal,
        },
      ],
      subtotal: saleTotal,
      taxAmount: 0,
      totalAmount: saleTotal,
      paymentMethod: 'CREDIT',
      amountTendered: 0,
    },
  });
  const saleId = sale.data?.data?.sale?.id;
  const saleTotalCost = money(sale.data?.data?.sale?.totalCost ?? sale.data?.data?.sale?.total_cost);
  assert(sale.status === 201 && saleId, `Create sale (${mode})`, sale.data?.error ?? sale.text?.slice(0, 300));
  if (!saleId) throw new Error(`Sale failed (${mode})`);

  const saleGl = await glLinesForRef(pool, 'SALE', saleId);
  const cogs = money(
    (
      await pool.query(
        `SELECT COALESCE(SUM(le."DebitAmount" - le."CreditAmount"), 0) AS cogs
         FROM ledger_entries le JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
         JOIN accounts a ON a."Id" = le."AccountId"
         WHERE lt."ReferenceType" = 'SALE' AND lt."ReferenceId" = $1::uuid AND a."AccountCode" LIKE '5%' AND ${NET_ACTIVE}`,
        [saleId],
      )
    ).rows[0]?.cogs,
  );

  const customerAfter = money(
    (await pool.query(`SELECT balance FROM customers WHERE id = $1`, [customerId])).rows[0]?.balance,
  );
  const after = await globalSnapshot(pool);
  const stockVal = money(
    (
      await pool.query(
        `SELECT COALESCE(SUM(remaining_quantity * cost_price), 0) AS v FROM inventory_batches WHERE product_id = $1 AND remaining_quantity > 0`,
        [product.id],
      )
    ).rows[0]?.v,
  );

  return {
    mode,
    grId,
    saleId,
    grGl,
    saleGl,
    cogs,
    grBatchVal,
    stockVal,
    supplierDelta: money(supplierAfterGr - supplierBefore),
    customerDelta: money(customerAfter - customerBefore),
    globalDelta: {
      tbDebits: money(after.tbDebits - before.tbDebits),
      tbCredits: money(after.tbCredits - before.tbCredits),
      invGl: money(after.invGl - before.invGl),
      batchVal: money(after.batchVal - before.batchVal),
    },
    warehouse: { compositeLots, compositeBalances },
    grAmount: GR_QTY * GR_COST,
    saleRevenue: saleTotal,
    saleTotalCost,
  };
}

function compareMetric(label, off, on, tol = 0.02) {
  const match = Math.abs(off - on) <= tol;
  assert(match, `${label} parity`, `OFF=${off} ON=${on}`);
}

function compareGl(label, off, on) {
  const codes = [...new Set([...off.map((x) => x.code), ...on.map((x) => x.code)])].sort();
  for (const code of codes) {
    const a = off.find((x) => x.code === code);
    const b = on.find((x) => x.code === code);
    compareMetric(`${label} ${code} debit`, a?.debit ?? 0, b?.debit ?? 0);
    compareMetric(`${label} ${code} credit`, a?.credit ?? 0, b?.credit ?? 0);
  }
}

async function main() {
  console.log('\n=== Multi-Store Financial Parity Certification ===\n');
  console.log(`API: ${BASE}`);
  console.log(`Tag: ${TAG}`);
  console.log(`GR ${GR_QTY}@${GR_COST} | Sale ${SALE_QTY}@${SALE_PRICE}\n`);

  const health = await req('GET', '/api/health');
  assert(health.status === 200, 'API health', String(health.status));
  if (health.status !== 200) {
    bad('Start API first', 'npm run dev:server or npm run start in SamplePOS.Server');
    writeFileSync(OUT, lines.join('\n') + '\n');
    process.exit(1);
  }

  const pool = getPool();
  const login = await req('POST', '/api/auth/login', { body: { email: process.env.TEST_EMAIL || 'admin@samplepos.com', password: process.env.TEST_PASSWORD || 'admin123' } });
  const token = login.data?.data?.token;
  assert(login.status === 200 && token, 'Login', login.data?.error);
  if (!token) {
    await pool.end();
    process.exit(1);
  }

  const profile = await req('GET', '/api/auth/profile', { token });
  const userId = profile.data?.data?.id || profile.data?.data?.user?.id;
  assert(!!userId, 'User id');

  const off = await runWorkflow(pool, token, userId, 'OFF');
  const on = await runWorkflow(pool, token, userId, 'ON');

  info('GRN GL OFF: ' + off.grGl.map((l) => `${l.code} D${l.debit}/C${l.credit}`).join('; '));
  info('GRN GL ON:  ' + on.grGl.map((l) => `${l.code} D${l.debit}/C${l.credit}`).join('; '));
  compareGl('GRN', off.grGl, on.grGl);

  info('Sale GL OFF: ' + off.saleGl.map((l) => `${l.code} D${l.debit}/C${l.credit}`).join('; '));
  info('Sale GL ON:  ' + on.saleGl.map((l) => `${l.code} D${l.debit}/C${l.credit}`).join('; '));
  compareGl('Sale', off.saleGl, on.saleGl);

  compareMetric('GR batch valuation', off.grBatchVal, on.grBatchVal);
  compareMetric('COGS (sale totalCost)', off.saleTotalCost, on.saleTotalCost);
  compareMetric('COGS GL 5xxx net', off.cogs, on.cogs);
  compareMetric('Customer balance delta', off.customerDelta, on.customerDelta);
  compareMetric('Supplier balance delta', off.supplierDelta, on.supplierDelta);
  compareMetric('Stock valuation', off.stockVal, on.stockVal);
  compareMetric('Δ Trial balance debits', off.globalDelta.tbDebits, on.globalDelta.tbDebits);
  compareMetric('Δ Trial balance credits', off.globalDelta.tbCredits, on.globalDelta.tbCredits);
  compareMetric('Δ GL 1300', off.globalDelta.invGl, on.globalDelta.invGl);
  compareMetric('Δ Batch valuation', off.globalDelta.batchVal, on.globalDelta.batchVal);

  info(`Warehouse OFF lots=${off.warehouse.compositeLots} balances=${off.warehouse.compositeBalances}`);
  info(`Warehouse ON  lots=${on.warehouse.compositeLots} balances=${on.warehouse.compositeBalances}`);
  assert(
    on.warehouse.compositeBalances > off.warehouse.compositeBalances,
    'Composite warehouse records differ (ON > OFF)',
    `OFF=${off.warehouse.compositeBalances} ON=${on.warehouse.compositeBalances}`,
  );

  await pool.query('UPDATE system_settings SET is_multistore_enabled = false');
  await pool.end();

  writeFileSync(OUT, [
    '# Multi-Store Financial Parity Certification',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Tag: ${TAG}`,
    '',
    ...lines,
    '',
    fail === 0 ? '**RESULT: FINANCIAL PARITY PASS**' : `**RESULT: FAIL (${fail})**`,
  ].join('\n'));

  console.log(`\nWrote ${OUT}`);
  console.log(`\n${fail ? 'FAILED' : 'OK'}: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
