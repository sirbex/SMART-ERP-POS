#!/usr/bin/env node
/**
 * Proof — Negotiable transfer workflow (partial approve → dispatch → receive).
 *
 * Gate 0 — Static: schema, workspace UI, request detail drawer
 * Gate 1 — Unit: transferNegotiation helpers
 * Gate 2 — Live E2E: partial approval pipeline with audited quantities
 *
 *   npm run proof:transfer-negotiation
 *   PROOF_OUT=PROOF_TRANSFER_NEGOTIATION.md npm run proof:transfer-negotiation
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
const OUT = process.env.PROOF_OUT || resolve(root, 'PROOF_TRANSFER_NEGOTIATION.md');
const REQUEST_QTY = Number(process.env.PROOF_TRANSFER_REQUEST_QTY || 10);
const APPROVE_QTY = Number(process.env.PROOF_TRANSFER_APPROVE_QTY || 8);
const DISPATCH_QTY = Number(process.env.PROOF_TRANSFER_DISPATCH_QTY || 8);
const RECEIVE_QTY = Number(process.env.PROOF_TRANSFER_RECEIVE_QTY || 7);

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
}

function getPool() {
  loadEnv();
  const require = createRequire(resolve(serverDir, 'package.json'));
  const pg = require('pg');
  return new pg.Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system',
  });
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

function gateStatic() {
  console.log('\n── Gate 0: Negotiable transfer (static) ──');
  assert(
    fileContains('shared/sql/532_transfer_line_negotiation.sql', 'quantity_approved'),
    'Migration 532 quantity_approved',
  );
  assert(
    fileContains('shared/utils/transferNegotiation.ts', 'PARTIALLY_APPROVED'),
    'transferNegotiation status helpers',
  );
  assert(
    fileContains('samplepos.client/src/components/inventory/TransferNegotiationWorkspace.tsx', 'Stock request approval'),
    'TransferNegotiationWorkspace',
  );
  assert(
    fileContains('samplepos.client/src/components/inventory/TransferApprovalWorkspaceHeader.tsx', 'Requesting store'),
    'TransferApprovalWorkspaceHeader',
  );
  assert(
    fileContains('samplepos.client/src/components/inventory/TransferNegotiationWorkspace.tsx', 'DataTable'),
    'Approval workspace uses DataTable',
  );
  assert(
    fileContains('samplepos.client/src/components/inventory/TransferRequestDetailDrawer.tsx', 'formatQtyRatio'),
    'TransferRequestDetailDrawer requesting-store view',
  );
  assert(
    fileContains('samplepos.client/src/pages/inventory/StoreTransfersPage.tsx', 'TransferRequestDetailDrawer'),
    'StoreTransfersPage wires detail drawer',
  );
  assert(
    fileContains('SamplePOS.Server/src/modules/inventory/warehouse/storeTransferRoutes.ts', 'ApproveTransferSchema'),
    'Approve API accepts line quantities',
  );
  assert(
    fileContains('SamplePOS.Server/src/modules/inventory/warehouse/storeTransferRoutes.ts', 'CancelTransferSchema'),
    'Cancel API route',
  );
  assert(
    fileContains('shared/utils/transferNegotiation.ts', "return 'CANCELLED'"),
    'All-zero approval → CANCELLED',
  );
  assert(
    fileContains('samplepos.client/src/components/inventory/TransferApprovalToolbar.tsx', 'Approve all'),
    'TransferApprovalToolbar bulk actions',
  );
  assert(
    fileContains('SamplePOS.Server/src/modules/inventory/warehouse/storeTransferRoutes.ts', '/:id/complete'),
    'Complete transfer API (override)',
  );
  assert(
    fileContains('samplepos.client/src/components/inventory/TransferRequestDetailDrawer.tsx', 'Withdraw request'),
    'Withdraw request UI',
  );
  assert(
    fileContains('SamplePOS.Server/src/modules/inventory/warehouse/storeTransferRoutes.ts', '/:id/approval-draft'),
    'Approval draft API (save without generating transfer)',
  );
  assert(
    fileContains('samplepos.client/src/utils/transferWorkflowUx.ts', 'Stock Requests'),
    'Request-only outlet hub labels',
  );
  assert(
    fileContains('samplepos.client/src/components/inventory/TransferApprovalToolbar.tsx', 'Generate transfer'),
    'Generate transfer action in approval toolbar',
  );
}

function gateUnit() {
  console.log('\n── Gate 1: transferNegotiation unit tests ──');
  const r = spawnSync('npx', ['vitest', 'run', 'src/utils/transferNegotiation.test.ts'], {
    cwd: clientDir,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });
  assert(r.status === 0, 'transferNegotiation.test.ts', r.status !== 0 ? (r.stderr || r.stdout || '').slice(-400) : '');
}

async function resolveMainAndDest(token, pool) {
  await pool.query('UPDATE system_settings SET is_multistore_enabled = true');
  const main = await pool.query(
    `SELECT id FROM store_locations WHERE store_type = 'MAIN' AND is_active = true LIMIT 1`,
  );
  const mainId = main.rows[0]?.id;
  const ens = await req('POST', '/api/inventory/store-locations/ensure-defaults', { token });
  const destId = ens.data?.data?.selling?.id;
  return { mainId, destId };
}

async function findStockedProducts(pool, mainId, minQty, limit = 1) {
  const stocked = await pool.query(
    `SELECT p.id AS product_id, pl.id AS lot_id, p.name,
            GREATEST(
              SUM(ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed),
              0
            )::float AS free_qty
     FROM products p
     INNER JOIN inventory_balances ib ON ib.product_id = p.id AND ib.store_location_id = $1
     INNER JOIN product_lots pl ON pl.id = ib.product_lot_id
     WHERE p.is_active = true
       AND pl.status = 'ACTIVE'
       AND NOT ib.blocked
       AND (pl.expiry_date IS NULL OR pl.expiry_date > CURRENT_DATE)
     GROUP BY p.id, pl.id, p.name
     HAVING SUM(GREATEST(ib.quantity_on_hand - ib.quantity_reserved - ib.quantity_committed, 0)) >= $2
     ORDER BY free_qty DESC
     LIMIT $3`,
    [mainId, minQty, limit],
  );
  return stocked.rows;
}

async function createTransferRequest(token, destId, lines, notes) {
  const body = {
    destinationStoreId: destId,
    assortmentExpansions: lines.map((l) => ({ productId: l.productId, expandPermanently: true })),
    lines: lines.map((l) => ({ productLotId: l.lotId, quantity: l.quantity })),
    notes,
  };
  return req('POST', '/api/inventory/store-transfers', { token, body });
}

async function gateNegotiationE2E(token, pool) {
  console.log('\n── Gate 2: Partial approve → dispatch → receive (live) ──');
  if (!token) {
    bad('Negotiation E2E', 'no token');
    return null;
  }

  const col = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_name = 'store_transfer_lines' AND column_name = 'quantity_approved'`,
  );
  assert(col.rows.length === 1, 'quantity_approved column exists');

  const { mainId, destId } = await resolveMainAndDest(token, pool);
  assert(!!mainId, 'MAIN store');
  assert(!!destId, 'SELLING destination');
  if (!mainId || !destId) return null;

  const stocked = await findStockedProducts(pool, mainId, REQUEST_QTY, 1);
  const sample = stocked[0];
  assert(!!sample, 'Product with enough free stock', sample?.name ?? `need ${REQUEST_QTY}`);
  if (!sample) return null;

  const create = await createTransferRequest(
    token,
    destId,
    [{ productId: sample.product_id, lotId: sample.lot_id, quantity: REQUEST_QTY }],
    'proof-transfer-negotiation',
  );
  assert(create.status === 201, 'Create transfer request', create.data?.error ?? String(create.status));
  const transferId = create.data?.data?.id;
  const lineId = create.data?.data?.lines?.[0]?.id;
  assert(!!transferId && !!lineId, 'Transfer has line id');

  const draftSave = await req('POST', `/api/inventory/store-transfers/${transferId}/approval-draft`, {
    token,
    body: {
      lines: [
        {
          lineId,
          quantity: APPROVE_QTY,
          comment: 'Warehouse review — draft quantities',
        },
      ],
    },
  });
  assert(draftSave.status === 200, 'Approval draft API', draftSave.data?.error);
  assert(
    draftSave.data?.data?.status === 'DRAFT',
    'Draft save keeps DRAFT status',
    draftSave.data?.data?.status,
  );
  assert(
    draftSave.data?.data?.lines?.[0]?.quantityApproved === APPROVE_QTY,
    'Draft saves quantityApproved',
    String(draftSave.data?.data?.lines?.[0]?.quantityApproved),
  );
  const draftEvents = draftSave.data?.data?.auditEvents ?? [];
  assert(
    draftEvents.some((e) => e.eventType === 'APPROVAL_DRAFT_SAVED'),
    'APPROVAL_DRAFT_SAVED audit event',
  );

  const approve = await req('POST', `/api/inventory/store-transfers/${transferId}/approve`, {
    token,
    body: {
      lines: [
        {
          lineId,
          quantity: APPROVE_QTY,
          comment: 'Insufficient stock — partial approval',
        },
      ],
    },
  });
  assert(approve.status === 200, 'Partial approve API', approve.data?.error);
  assert(
    approve.data?.data?.status === 'PARTIALLY_APPROVED',
    'Status PARTIALLY_APPROVED',
    approve.data?.data?.status,
  );
  assert(
    approve.data?.data?.lines?.[0]?.quantityApproved === APPROVE_QTY,
    'quantityApproved persisted',
    String(approve.data?.data?.lines?.[0]?.quantityApproved),
  );

  const dispatch = await req('POST', `/api/inventory/store-transfers/${transferId}/dispatch`, {
    token,
    body: { lines: [{ lineId, quantity: DISPATCH_QTY, comment: 'Two cartons damaged' }] },
  });
  assert(dispatch.status === 200, 'Partial dispatch API', dispatch.data?.error);
  const afterDispatch = dispatch.data?.data;
  assert(
    afterDispatch?.lines?.[0]?.quantityDispatched === DISPATCH_QTY,
    'quantityDispatched',
    String(afterDispatch?.lines?.[0]?.quantityDispatched),
  );
  assert(
    ['IN_TRANSIT', 'PARTIALLY_DISPATCHED'].includes(afterDispatch?.status),
    'Post-dispatch status valid',
    afterDispatch?.status,
  );

  const receive = await req('POST', `/api/inventory/store-transfers/${transferId}/receive`, {
    token,
    body: {
      lines: [
        {
          lineId,
          quantity: RECEIVE_QTY,
          comment: 'Transit damage — one carton',
        },
      ],
    },
  });
  assert(receive.status === 200, 'Partial receive API', receive.data?.error);
  const afterReceive = receive.data?.data;
  assert(
    afterReceive?.lines?.[0]?.quantityReceived === RECEIVE_QTY,
    'quantityReceived',
    String(afterReceive?.lines?.[0]?.quantityReceived),
  );
  const shortage = afterReceive?.lines?.[0]?.quantityShortage ?? 0;
  assert(
    shortage === DISPATCH_QTY - RECEIVE_QTY,
    'quantityShortage recorded',
    `shortage=${shortage} expected=${DISPATCH_QTY - RECEIVE_QTY}`,
  );
  assert(
    afterReceive?.status === 'PARTIALLY_RECEIVED',
    'Status PARTIALLY_RECEIVED',
    afterReceive?.status,
  );

  const detail = await req('GET', `/api/inventory/store-transfers/${transferId}`, { token });
  assert(detail.status === 200, 'GET transfer detail');
  const line = detail.data?.data?.lines?.[0];
  assert(line?.productName != null, 'Detail includes productName', line?.productName ?? 'missing');
  assert(
    line?.quantity === REQUEST_QTY && line?.quantityApproved === APPROVE_QTY,
    'Detail shows requested vs approved',
    `${line?.quantityApproved}/${line?.quantity}`,
  );

  const audit = detail.data?.data?.auditEvents ?? [];
  assert(
    audit.some((e) => e.eventType === 'PARTIALLY_APPROVED' || e.eventType === 'APPROVED'),
    'Audit has approval event',
  );
  assert(audit.some((e) => e.eventType.includes('DISPATCH')), 'Audit has dispatch event');
  assert(
    audit.some((e) => e.eventType === 'PARTIALLY_RECEIVED' || e.eventType === 'RECEIVED'),
    'Audit has receive event',
  );

  const transitId = detail.data?.data?.transitStoreId;
  if (transitId && shortage > 0) {
    const transitBal = await pool.query(
      `SELECT GREATEST(quantity_on_hand - quantity_reserved - quantity_committed, 0)::float AS free_qty
       FROM inventory_balances
       WHERE store_location_id = $1 AND product_lot_id = $2`,
      [transitId, sample.lot_id],
    );
    const transitFree = transitBal.rows[0]?.free_qty ?? 0;
    assert(transitFree < 0.001, 'Shortage cleared from TRANSIT', `transitFree=${transitFree}`);
  }

  return { token, pool, mainId, destId };
}

async function gateCancelDraft(token, pool, mainId, destId) {
  console.log('\n── Gate 3: Cancel DRAFT request (live) ──');
  if (!token || !mainId || !destId) {
    bad('Cancel DRAFT', 'missing setup');
    return;
  }

  const products = await findStockedProducts(pool, mainId, 2, 1);
  const sample = products[0];
  if (!sample) {
    bad('Cancel DRAFT — stocked product', 'none found');
    return;
  }

  const create = await createTransferRequest(
    token,
    destId,
    [{ productId: sample.product_id, lotId: sample.lot_id, quantity: 2 }],
    'proof-cancel-draft',
  );
  assert(create.status === 201, 'Create DRAFT for cancel', create.data?.error);
  const transferId = create.data?.data?.id;
  assert(create.data?.data?.status === 'DRAFT', 'New transfer is DRAFT');

  const cancel = await req('POST', `/api/inventory/store-transfers/${transferId}/cancel`, {
    token,
    body: { reason: 'Proof withdraw' },
  });
  assert(cancel.status === 200, 'Cancel API', cancel.data?.error);
  assert(cancel.data?.data?.status === 'CANCELLED', 'Status CANCELLED after cancel');

  const detail = await req('GET', `/api/inventory/store-transfers/${transferId}`, { token });
  const audit = detail.data?.data?.auditEvents ?? [];
  assert(audit.some((e) => e.eventType === 'CANCELLED'), 'Audit has CANCELLED event');
}

async function gateRejectApproval(token, pool, mainId, destId) {
  console.log('\n── Gate 4: Reject via zero approval (live) ──');
  if (!token || !mainId || !destId) {
    bad('Reject approval', 'missing setup');
    return;
  }

  const products = await findStockedProducts(pool, mainId, 3, 1);
  const sample = products[0];
  if (!sample) {
    bad('Reject — stocked product', 'none found');
    return;
  }

  const create = await createTransferRequest(
    token,
    destId,
    [{ productId: sample.product_id, lotId: sample.lot_id, quantity: 5 }],
    'proof-reject-approval',
  );
  assert(create.status === 201, 'Create DRAFT for reject');
  const transferId = create.data?.data?.id;
  const lineId = create.data?.data?.lines?.[0]?.id;

  const reject = await req('POST', `/api/inventory/store-transfers/${transferId}/approve`, {
    token,
    body: { lines: [{ lineId, quantity: 0, comment: 'Out of stock — reject' }] },
  });
  assert(reject.status === 200, 'Reject approve API', reject.data?.error);
  assert(reject.data?.data?.status === 'CANCELLED', 'Status CANCELLED after reject', reject.data?.data?.status);

  const detail = await req('GET', `/api/inventory/store-transfers/${transferId}`, { token });
  const audit = detail.data?.data?.auditEvents ?? [];
  assert(audit.some((e) => e.eventType === 'REJECTED'), 'Audit has REJECTED event');
}

async function gateMultiLinePartial(token, pool, mainId, destId) {
  console.log('\n── Gate 5: Multi-line partial approval (live) ──');
  if (!token || !mainId || !destId) {
    bad('Multi-line partial', 'missing setup');
    return;
  }

  const products = await findStockedProducts(pool, mainId, 10, 3);
  assert(products.length >= 3, 'Three products with stock ≥10', `found ${products.length}`);
  if (products.length < 3) return;

  const requests = [
    { product: products[0], requestQty: 10, approveQty: 10 },
    { product: products[1], requestQty: 5, approveQty: 3 },
    { product: products[2], requestQty: 20, approveQty: 0 },
  ];

  const create = await createTransferRequest(
    token,
    destId,
    requests.map((r) => ({
      productId: r.product.product_id,
      lotId: r.product.lot_id,
      quantity: r.requestQty,
    })),
    'proof-multi-line-partial',
  );
  assert(create.status === 201, 'Create 3-line transfer', create.data?.error);
  const transferId = create.data?.data?.id;
  const lines = create.data?.data?.lines ?? [];
  assert(lines.length === 3, 'Three lines created', String(lines.length));

  const approveBody = {
    lines: lines.map((line, idx) => ({
      lineId: line.id,
      quantity: requests[idx].approveQty,
      comment: requests[idx].approveQty === 0 ? 'Not stocked' : undefined,
    })),
  };
  const approve = await req('POST', `/api/inventory/store-transfers/${transferId}/approve`, {
    token,
    body: approveBody,
  });
  assert(approve.status === 200, 'Multi-line partial approve', approve.data?.error);
  assert(
    approve.data?.data?.status === 'PARTIALLY_APPROVED',
    'Status PARTIALLY_APPROVED (mixed lines)',
    approve.data?.data?.status,
  );

  const approved = approve.data?.data?.lines ?? [];
  assert(approved[0]?.quantityApproved === 10, 'Line 1 full approval');
  assert(approved[1]?.quantityApproved === 3, 'Line 2 partial approval');
  assert(approved[2]?.quantityApproved === 0, 'Line 3 rejected at line level');
}

function writeReport() {
  const md = [
    '# Transfer Negotiation — Proof',
    '',
    `- **Date:** ${new Date().toISOString()}`,
    `- **API:** ${BASE}`,
    `- **Qty:** request=${REQUEST_QTY} approve=${APPROVE_QTY} dispatch=${DISPATCH_QTY} receive=${RECEIVE_QTY}`,
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
  console.log('║  TRANSFER NEGOTIATION — partial workflow proof                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`API: ${BASE}\n`);

  gateStatic();
  gateUnit();

  const health = await req('GET', '/api/health').catch(() => ({ status: 0 }));
  if (health.status !== 200) {
    bad('API health — live gate requires server', 'start SamplePOS.Server');
  } else {
    ok('API health');
    const pool = getPool();
    try {
      const login = await req('POST', '/api/auth/login', {
        body: { email: EMAIL, password: PASSWORD },
      });
      const token = login.data?.data?.token;
      assert(login.status === 200 && token, 'Login', login.data?.error);
      const ctx = await gateNegotiationE2E(token, pool);
      if (ctx) {
        await gateCancelDraft(ctx.token, pool, ctx.mainId, ctx.destId);
        await gateRejectApproval(ctx.token, pool, ctx.mainId, ctx.destId);
        await gateMultiLinePartial(ctx.token, pool, ctx.mainId, ctx.destId);
      }
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
