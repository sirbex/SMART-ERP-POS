#!/usr/bin/env node
/**
 * Proof: follow-up GR on same PO links to sibling supplier bill — no second AP invoice.
 *
 * Gate 1 — Historical audit PO-2026-0063 (may show pre-fix dual bills)
 * Gate 2 — Live API on historical PO
 * Gate 3 — E2E synthetic PO: partial GR → bill → top-up GR → auto sibling link
 *
 * Usage:
 *   node scripts/proof-po-sibling-bill.mjs
 *   BASE_URL=http://localhost:3001 node scripts/proof-po-sibling-bill.mjs
 *   PROOF_OUT=PROOF_PO_SIBLING_BILL.md node scripts/proof-po-sibling-bill.mjs
 */
import pg from 'pg';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(serverRoot, '..');
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';
const PO_NUMBER = process.env.PROOF_PO || 'PO-2026-0063';
const PRIMARY_GR = process.env.PROOF_PRIMARY_GR || 'GR-2026-0067';
const TOPUP_GR = process.env.PROOF_TOPUP_GR || 'GR-2026-0069';
const SKIP_E2E = process.env.SKIP_E2E === '1';
const OUT = process.env.PROOF_OUT || resolve(root, 'PROOF_PO_SIBLING_BILL.md');

let pass = 0;
let fail = 0;
const lines = [`# PO Sibling Bill Proof\n`, `Run: ${new Date().toISOString()}\n`, `PO: ${PO_NUMBER}\n`];

function ok(n, d = '') {
  pass++;
  const msg = `PASS  ${n}${d ? ` — ${d}` : ''}`;
  console.log(`  ${msg}`);
  lines.push(`- **PASS** ${n}${d ? ` — ${d}` : ''}`);
}
function bad(n, d = '') {
  fail++;
  const msg = `FAIL  ${n}${d ? ` — ${d}` : ''}`;
  console.error(`  ${msg}`);
  lines.push(`- **FAIL** ${n}${d ? ` — ${d}` : ''}`);
}
function assert(c, n, d = '') {
  if (c) ok(n, d);
  else bad(n, d);
}

function info(n, d = '') {
  console.log(`  INFO  ${n}${d ? ` — ${d}` : ''}`);
  lines.push(`- INFO ${n}${d ? ` — ${d}` : ''}`);
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function futureYmd(days = 365) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function apiReq(method, path, { token, body } = {}) {
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
    data = { raw: text?.slice(0, 400) };
  }
  return { status: res.status, data, ok: res.ok };
}

function loadUrl() {
  for (const rel of ['.env', '.env.local']) {
    const p = resolve(serverRoot, rel);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, 'utf8').match(/^DATABASE_URL=(.+)$/m);
    if (m) return m[1].replace(/^"|"$/g, '');
  }
  return process.env.DATABASE_URL;
}

const siblingBillSql = `
  SELECT si."Id" AS "invoiceId",
         si."SupplierInvoiceNumber" AS "invoiceNumber",
         gr.id AS "grnId",
         gr.receipt_number AS "grnNumber"
  FROM goods_receipts gr
  JOIN supplier_invoice_grn_links sigl ON sigl.grn_id = gr.id
  JOIN supplier_invoices si ON si."Id" = sigl.invoice_id
  WHERE gr.purchase_order_id = $1
    AND gr.id <> $2
    AND gr.status = 'COMPLETED'
    AND si.deleted_at IS NULL
    AND COALESCE(si."Status", '') NOT IN ('Cancelled', 'CANCELLED', 'Voided', 'VOIDED')
    AND COALESCE(si.document_type, 'SUPPLIER_INVOICE') = 'SUPPLIER_INVOICE'
  ORDER BY si."CreatedAt" DESC
  LIMIT 1`;

async function dbProof(pool) {
  console.log('\n' + '═'.repeat(60));
  console.log(' Gate 1 — Historical audit (PO-2026-0063)');
  console.log('═'.repeat(60));

  const poRes = await pool.query(
    `SELECT id, order_number, status FROM purchase_orders WHERE order_number = $1`,
    [PO_NUMBER],
  );
  const po = poRes.rows[0];
  assert(!!po, 'PO exists', PO_NUMBER);
  if (!po) return;

  lines.push(`\nPO status: **${po.status}**\n`);

  const grRes = await pool.query(
    `SELECT gr.id, gr.receipt_number, gr.status, gr.received_date::date AS d
     FROM goods_receipts gr
     WHERE gr.purchase_order_id = $1
     ORDER BY gr.received_date, gr.receipt_number`,
    [po.id],
  );
  assert(grRes.rows.length >= 2, 'PO has primary + top-up GR', `${grRes.rows.length} GR(s)`);
  lines.push(`\nGoods receipts: ${grRes.rows.map((g) => `${g.receipt_number} (${g.status})`).join(', ')}\n`);

  const primary = grRes.rows.find((g) => g.receipt_number === PRIMARY_GR);
  const topup = grRes.rows.find((g) => g.receipt_number === TOPUP_GR);
  assert(!!primary, `Primary GR ${PRIMARY_GR} exists`);
  assert(!!topup, `Top-up GR ${TOPUP_GR} exists`);
  assert(primary?.status === 'COMPLETED', `${PRIMARY_GR} is COMPLETED`, primary?.status);
  assert(topup?.status === 'COMPLETED', `${TOPUP_GR} is COMPLETED`, topup?.status);

  const links = await pool.query(
    `SELECT gr.receipt_number,
            si."Id" AS invoice_id,
            si."SupplierInvoiceNumber" AS bill_number
     FROM goods_receipts gr
     LEFT JOIN supplier_invoice_grn_links sigl ON sigl.grn_id = gr.id
     LEFT JOIN supplier_invoices si ON si."Id" = sigl.invoice_id
       AND si.deleted_at IS NULL
       AND COALESCE(si."Status", '') NOT IN ('Cancelled', 'CANCELLED', 'Voided', 'VOIDED')
     WHERE gr.purchase_order_id = $1
     ORDER BY gr.receipt_number`,
    [po.id],
  );

  const primaryLink = links.rows.find((r) => r.receipt_number === PRIMARY_GR);
  const topupLink = links.rows.find((r) => r.receipt_number === TOPUP_GR);

  assert(!!primaryLink?.invoice_id, `${PRIMARY_GR} has supplier bill link`, primaryLink?.bill_number ?? 'none');
  assert(!!topupLink?.invoice_id, `${TOPUP_GR} has supplier bill link`, topupLink?.bill_number ?? 'none');
  const sameBill =
    primaryLink?.invoice_id && topupLink?.invoice_id && primaryLink.invoice_id === topupLink.invoice_id;
  if (sameBill) {
    ok('Both GRs share the same supplier invoice', `${primaryLink?.bill_number}`);
  } else {
    info(
      'Historical PO has two bills (top-up finalized before sibling-link deploy)',
      `${primaryLink?.bill_number} vs ${topupLink?.bill_number}`,
    );
    lines.push(
      `\n> **Note:** ${TOPUP_GR} was billed separately before auto-link shipped. Gate 3 E2E proves the fix.\n`,
    );
  }

  const billCount = await pool.query(
    `SELECT COUNT(DISTINCT si."Id")::int AS n,
            array_agg(DISTINCT si."SupplierInvoiceNumber") AS bills
     FROM goods_receipts gr
     JOIN supplier_invoice_grn_links sigl ON sigl.grn_id = gr.id
     JOIN supplier_invoices si ON si."Id" = sigl.invoice_id
     WHERE gr.purchase_order_id = $1
       AND si.deleted_at IS NULL
       AND COALESCE(si."Status", '') NOT IN ('Cancelled', 'CANCELLED', 'Voided', 'VOIDED')`,
    [po.id],
  );
  if (billCount.rows[0].n === 1) {
    ok('Exactly one active supplier bill on PO', String(billCount.rows[0].bills));
  } else {
    info('Historical PO bill count', `${billCount.rows[0].n} — ${billCount.rows[0].bills}`);
  }

  if (topup) {
    const sibling = await pool.query(siblingBillSql, [po.id, topup.id]);
    // After link, top-up has direct link — sibling finder returns primary GR bill when queried from a hypothetical new GR
    const siblingFromNew = await pool.query(siblingBillSql, [po.id, '00000000-0000-0000-0000-000000000000']);
    assert(siblingFromNew.rows.length === 1, 'findPoSiblingSupplierBill finds primary bill', siblingFromNew.rows[0]?.invoiceNumber);
    // Top-up itself should NOT need poSiblingBill (has direct link)
    const direct = await pool.query(
      `SELECT 1 FROM supplier_invoice_grn_links WHERE grn_id = $1 LIMIT 1`,
      [topup.id],
    );
    assert(direct.rows.length > 0, `${TOPUP_GR} has direct invoice_grn_link (post-finalize auto-link)`);
    void sibling;
  }

  const openRes = await pool.query(
    `SELECT SUM(GREATEST(0, COALESCE(poi.ordered_quantity,0)::numeric - GREATEST(0,
       COALESCE(poi.received_quantity,0)::numeric - COALESCE((
         SELECT SUM(rl.quantity) FROM return_grn_lines rl
         JOIN return_grn rg ON rg.id = rl.rgrn_id AND rg.status = 'POSTED'
         WHERE EXISTS (
           SELECT 1 FROM goods_receipt_items gri
           WHERE gri.goods_receipt_id = rg.grn_id AND gri.po_item_id = poi.id AND gri.product_id = rl.product_id
         )
       ), 0)::numeric)))::numeric AS open_total
     FROM purchase_order_items poi WHERE poi.purchase_order_id = $1`,
    [po.id],
  );
  const openTotal = Number(openRes.rows[0]?.open_total ?? 0);
  assert(openTotal < 0.0001, 'PO fully received (open qty = 0)', `open=${openTotal}`);
  assert(po.status === 'COMPLETED', 'PO status is COMPLETED', po.status);

  return { po, primary, topup, billNumber: primaryLink?.bill_number, sameBill };
}

async function apiProof(ctx) {
  console.log('\n' + '═'.repeat(60));
  console.log(' Gate 2 — Live API (historical PO)');
  console.log('═'.repeat(60));

  let token;
  try {
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    if (!loginRes.ok) throw new Error(`login ${loginRes.status}`);
    const loginJson = await loginRes.json();
    token = loginJson.data?.token ?? loginJson.data?.accessToken;
    if (!token) throw new Error('no token');
    ok('API login');
  } catch (e) {
    bad('API login', e instanceof Error ? e.message : String(e));
    return null;
  }

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const health = await fetch(`${BASE}/api/health`);
  assert(health.ok, 'API health', String(health.status));

  for (const [label, grRow] of [
    ['primary', ctx.primary],
    ['top-up', ctx.topup],
  ]) {
    if (!grRow) continue;
    const res = await fetch(`${BASE}/api/goods-receipts/${grRow.id}`, { headers });
    assert(res.ok, `GET ${grRow.receipt_number} detail`, String(res.status));
    const json = await res.json();
    const gr = json.data?.gr ?? json.data;
    const bill = gr?.supplierBillNumber ?? gr?.supplier_bill_number;
    assert(!!bill, `${grRow.receipt_number} supplierBillNumber on API`, bill ?? 'missing');
    if (label === 'top-up') {
      assert(
        !gr?.poSiblingBill,
        `${TOPUP_GR} has no poSiblingBill (direct link after finalize)`,
        gr?.poSiblingBill ? JSON.stringify(gr.poSiblingBill) : 'null',
      );
    }
    if (label === 'primary' && bill) {
      ctx.apiBillNumber = bill;
    }
  }

  if (ctx.sameBill) {
    const topupRes = await fetch(`${BASE}/api/goods-receipts/${ctx.topup.id}`, { headers });
    const topupJson = await topupRes.json();
    const topupGr = topupJson.data?.gr ?? topupJson.data;
    const primaryRes = await fetch(`${BASE}/api/goods-receipts/${ctx.primary.id}`, { headers });
    const primaryJson = await primaryRes.json();
    const primaryGr = primaryJson.data?.gr ?? primaryJson.data;
    assert(
      topupGr?.supplierBillNumber === primaryGr?.supplierBillNumber,
      'API: top-up bill number matches primary',
      `${topupGr?.supplierBillNumber} vs ${primaryGr?.supplierBillNumber}`,
    );
  } else {
    info('Skip bill-match API check', 'historical dual-bill PO');
  }

  // Duplicate bill creation must be rejected
  const dupBill = await fetch(`${BASE}/api/supplier-payments/invoices/from-grn`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ grnId: ctx.topup.id }),
  });
  const dupJson = await dupBill.json().catch(() => ({}));
  const dupErr = dupJson.error ?? dupJson.message ?? '';
  assert(
    !dupBill.ok || dupJson.success === false,
    'POST from-grn on linked top-up GR is rejected',
    String(dupErr).slice(0, 120),
  );
  assert(
    /already billed|covered by that bill|no separate supplier invoice/i.test(String(dupErr)),
    'Rejection message mentions already billed or sibling coverage',
    String(dupErr).slice(0, 100),
  );

  // PENDING list includes PO only when open — should not appear when completed
  const pending = await fetch(`${BASE}/api/purchase-orders?status=PENDING&search=${encodeURIComponent(PO_NUMBER)}`, {
    headers,
  });
  const pendingJson = await pending.json();
  const pendingRows = pendingJson.data?.data ?? pendingJson.data ?? [];
  const foundPending = Array.isArray(pendingRows)
    ? pendingRows.some((p) => (p.orderNumber ?? p.order_number) === PO_NUMBER)
    : false;
  assert(!foundPending, 'Completed PO not in PENDING Create-from-PO list');
  return token;
}

async function e2eProof(pool, token) {
  console.log('\n' + '═'.repeat(60));
  console.log(' Gate 3 — E2E synthetic sibling link (required)');
  console.log('═'.repeat(60));

  const profile = await apiReq('GET', '/api/auth/profile', { token });
  const userId = profile.data?.data?.id ?? profile.data?.data?.user?.id;
  assert(!!userId, 'E2E user id');

  const prod = await pool.query(
    `SELECT p.id, p.name, COALESCE(pv.cost_price, 1000)::numeric AS cost
     FROM products p
     LEFT JOIN product_valuation pv ON pv.product_id = p.id
     WHERE COALESCE(p.track_expiry, false) = false
     ORDER BY p.name
     LIMIT 1`,
  );
  assert(prod.rows.length > 0, 'E2E product (no expiry tracking)');
  const productId = prod.rows[0].id;
  const productName = prod.rows[0].name;
  const unitCost = Number(prod.rows[0].cost) || 1000;

  const suppliers = await apiReq('GET', '/api/suppliers?limit=1', { token });
  const supplierList = suppliers.data?.data?.data ?? suppliers.data?.data ?? [];
  const supplier = Array.isArray(supplierList) ? supplierList[0] : null;
  const supplierId = supplier?.id ?? supplier?.Id;
  assert(!!supplierId, 'E2E supplier');

  const tag = `proof-sibling-${Date.now()}`;
  const createPo = await apiReq('POST', '/api/purchase-orders', {
    token,
    body: {
      supplierId,
      orderDate: todayYmd(),
      expectedDate: futureYmd(14),
      notes: tag,
      createdBy: userId,
      items: [
        {
          productId,
          productName,
          quantity: 2,
          unitCost,
          lineTotal: 2 * unitCost,
          uomId: null,
        },
      ],
    },
  });
  const poPayload = createPo.data?.data;
  const poId = poPayload?.po?.id;
  const poNumber = poPayload?.po?.po_number ?? poPayload?.po?.poNumber ?? '';
  assert((createPo.status === 201 || createPo.status === 200) && poId, 'E2E create PO', createPo.data?.error);

  const submit = await apiReq('POST', `/api/purchase-orders/${poId}/submit`, { token });
  assert(submit.status === 200 || String(submit.data?.error || '').includes('PENDING'), 'E2E submit PO');

  const send = await apiReq('POST', `/api/purchase-orders/${poId}/send-to-supplier`, { token });
  const gr1Id = send.data?.data?.goodsReceipt?.id;
  assert(send.status === 200 && gr1Id, 'E2E GR1 from send', send.data?.error);

  const gr1Detail = await apiReq('GET', `/api/goods-receipts/${gr1Id}`, { token });
  const gr1Item = gr1Detail.data?.data?.items?.[0];
  assert(!!gr1Item?.id, 'E2E GR1 line item');

  const batch1 = await apiReq('PUT', `/api/goods-receipts/${gr1Id}/items`, {
    token,
    body: { items: [{ itemId: gr1Item.id, receivedQuantity: 1 }] },
  });
  assert(batch1.ok, 'E2E GR1 partial qty', batch1.data?.error);

  const fin1 = await apiReq('POST', `/api/goods-receipts/${gr1Id}/finalize`, { token });
  assert(fin1.ok && fin1.data?.success !== false, 'E2E finalize GR1', fin1.data?.error);

  const bill1 = await apiReq('POST', '/api/supplier-payments/invoices/from-grn', {
    token,
    body: {
      grnId: gr1Id,
      supplierInvoiceNumber: `PROOF-${tag}`,
      invoiceDate: todayYmd(),
    },
  });
  const bill1Payload = bill1.data?.data;
  const bill1Num =
    bill1Payload?.invoice?.SupplierInvoiceNumber ??
    bill1Payload?.invoiceNumber ??
    bill1Payload?.SupplierInvoiceNumber;
  const bill1Id = bill1Payload?.invoice?.Id ?? bill1Payload?.id;
  assert(bill1.ok && bill1Num, 'E2E create bill on GR1', bill1.data?.error);

  const poGet = await apiReq('GET', `/api/purchase-orders/${poId}`, { token });
  const poItem = poGet.data?.data?.items?.[0];
  const openQty = Number(poItem?.open_quantity ?? poItem?.openQuantity ?? 0);
  assert(openQty >= 0.999, 'E2E PO open qty after partial GR', `open=${openQty}`);

  const createGr2 = await apiReq('POST', '/api/goods-receipts', {
    token,
    body: {
      purchaseOrderId: poId,
      receiptDate: todayYmd(),
      receivedBy: userId,
      notes: `${tag}-topup`,
      items: [
        {
          poItemId: poItem.id,
          productId,
          productName,
          orderedQuantity: Number(poItem.quantity ?? poItem.ordered_quantity ?? 2),
          receivedQuantity: 0,
          unitCost,
        },
      ],
    },
  });
  const gr2Payload = createGr2.data?.data;
  const gr2Id = gr2Payload?.gr?.id ?? gr2Payload?.id;
  assert((createGr2.status === 201 || createGr2.ok) && gr2Id, 'E2E create top-up GR2', createGr2.data?.error);

  const gr2Draft = await apiReq('GET', `/api/goods-receipts/${gr2Id}`, { token });
  const gr2Header = gr2Draft.data?.data?.gr ?? gr2Draft.data;
  const sibling = gr2Header?.poSiblingBill;
  assert(!!sibling?.invoiceNumber, 'E2E draft GR2 poSiblingBill', sibling?.invoiceNumber ?? 'missing');
  assert(
    sibling.invoiceNumber === bill1Num || (bill1Id && sibling.invoiceId === bill1Id),
    'E2E poSiblingBill matches GR1 bill',
    `${sibling.invoiceNumber} vs ${bill1Num}`,
  );

  const gr2Item = gr2Draft.data?.data?.items?.[0];
  const batch2 = await apiReq('PUT', `/api/goods-receipts/${gr2Id}/items`, {
    token,
    body: { items: [{ itemId: gr2Item.id, receivedQuantity: 1 }] },
  });
  assert(batch2.ok, 'E2E GR2 receive remaining qty', batch2.data?.error);

  const fin2 = await apiReq('POST', `/api/goods-receipts/${gr2Id}/finalize`, { token });
  const linked = fin2.data?.data?.linkedSiblingBill;
  assert(fin2.ok && fin2.data?.success !== false, 'E2E finalize GR2', fin2.data?.error);
  assert(!!linked?.invoiceNumber, 'E2E linkedSiblingBill in finalize response', linked?.invoiceNumber ?? 'missing');
  assert(
    linked.invoiceNumber === bill1Num,
    'E2E linkedSiblingBill matches GR1 bill',
    `${linked.invoiceNumber} vs ${bill1Num}`,
  );

  const gr2Final = await apiReq('GET', `/api/goods-receipts/${gr2Id}`, { token });
  const gr2Bill = gr2Final.data?.data?.gr?.supplierBillNumber;
  assert(gr2Bill === bill1Num, 'E2E GR2 supplierBillNumber matches GR1', `${gr2Bill} vs ${bill1Num}`);

  const dup = await apiReq('POST', '/api/supplier-payments/invoices/from-grn', {
    token,
    body: { grnId: gr2Id },
  });
  assert(!dup.ok, 'E2E blocks duplicate bill on GR2', String(dup.data?.error ?? '').slice(0, 100));

  const billCount = await pool.query(
    `SELECT COUNT(DISTINCT si."Id")::int AS n,
            array_agg(DISTINCT si."SupplierInvoiceNumber") AS bills
     FROM goods_receipts gr
     JOIN supplier_invoice_grn_links sigl ON sigl.grn_id = gr.id
     JOIN supplier_invoices si ON si."Id" = sigl.invoice_id
     WHERE gr.purchase_order_id = $1
       AND si.deleted_at IS NULL
       AND COALESCE(si."Status", '') NOT IN ('Cancelled', 'CANCELLED', 'Voided', 'VOIDED')`,
    [poId],
  );
  assert(billCount.rows[0].n === 1, 'E2E exactly one bill on synthetic PO', String(billCount.rows[0].bills));

  lines.push(`\n## E2E synthetic proof\n`);
  lines.push(`- PO: **${poNumber || poId}**`);
  lines.push(`- Shared bill: **${bill1Num}**`);
  lines.push(`- GR1 partial + bill, GR2 top-up auto-linked\n`);
  ok('E2E sibling bill flow complete', poNumber || poId);
}

const pool = new pg.Pool({ connectionString: loadUrl() });
let ctx = {};

try {
  console.log('═'.repeat(60));
  console.log(' proof-po-sibling-bill');
  console.log('═'.repeat(60));
  console.log(`PO: ${PO_NUMBER}  primary: ${PRIMARY_GR}  top-up: ${TOPUP_GR}`);
  console.log(`API: ${BASE}`);

  ctx = await dbProof(pool);
  let token;
  if (ctx.primary && ctx.topup) {
    token = await apiProof(ctx);
  }

  if (!SKIP_E2E) {
    if (!token) {
      const loginRes = await apiReq('POST', '/api/auth/login', {
        body: { email: EMAIL, password: PASSWORD },
      });
      token = loginRes.data?.data?.token ?? loginRes.data?.data?.accessToken;
    }
    if (token) {
      await e2eProof(pool, token);
    } else {
      bad('E2E skipped — no API token');
    }
  } else {
    info('Gate 3 E2E skipped', 'SKIP_E2E=1');
  }

  lines.push(`\n## Summary\n`);
  lines.push(`**${fail === 0 ? 'PASS' : 'FAIL'}** — ${pass} passed, ${fail} failed\n`);
  if (ctx.billNumber) {
    lines.push(`Shared supplier bill: **${ctx.billNumber}**\n`);
  }

  writeFileSync(OUT, lines.join('\n'));
  console.log('\n' + '═'.repeat(60));
  console.log(fail === 0 ? ` ALL PASS (${pass})` : ` FAILED (${fail} fail, ${pass} pass)`);
  console.log(` Report: ${OUT}`);
  console.log('═'.repeat(60));
  process.exit(fail === 0 ? 0 : 1);
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await pool.end();
}
