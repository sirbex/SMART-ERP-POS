#!/usr/bin/env npx tsx
/**
 * LIVE PROOF — Full GR reverse: auto-cancel bills + reverse AP/GL + stock + PO→DRAFT
 *
 * No mocks. Failures throw or gate FAIL (exit 1). Errors are never swallowed.
 *
 * Gates:
 *   SEED_*                 fixtures
 *   BILL_POSTED            supplier bill + open SUPPLIER_INVOICE GL
 *   ELIGIBILITY_ALLOWS     reverse allowed with linked bill (auto-cancel planned)
 *   REVERSE_OK             reverseUninvoicedReceipt returns cancelledBills
 *   BILL_CANCELLED         Status=Cancelled, outstanding=0
 *   BILL_GL_REVERSED       no open SUPPLIER_INVOICE GL
 *   GR_REVERSED            isReversed / reversed_by_return_grn_id set
 *   RGRN_POSTED            Return GRN POSTED
 *   PO_DRAFT               purchase order status = DRAFT
 *   REBILL_BLOCKED         createInvoiceFromGRN rejects reversed GR
 *   STOCK_RETURNED         batch remaining_quantity = 0
 *
 * Usage:
 *   cd SamplePOS.Server && npx tsx scripts/proof-gr-full-reverse-live.ts
 *   npm run proof:gr-full-reverse:live
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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (m[1] === 'DATABASE_URL' || process.env[m[1]] === undefined) {
        process.env[m[1]] = v;
      }
    }
  }
}

loadEnv();

const rawUrl = (process.env.DATABASE_URL || '').trim();
if (!rawUrl) {
  console.error('DATABASE_URL missing — cannot run live proof');
  process.exit(2);
}
process.env.DATABASE_URL = rawUrl;
const connectionString = rawUrl.split('?')[0];

type Gate = { id: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string): void {
  gates.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}: ${detail}`);
  if (!ok) {
    // Do not continue on hard seed failures later — caller decides. Always record.
  }
}

function failHard(id: string, detail: string): never {
  gate(id, false, detail);
  throw new Error(`HARD FAIL ${id}: ${detail}`);
}

const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const SKU = `GFR-${stamp}`;
const GRN_QTY = 4;
const UNIT_COST = 1_500;
const GRN_TOTAL = GRN_QTY * UNIT_COST;

const pool = new pg.Pool({ connectionString, max: 8 });

async function countOpenSupplierInvoiceGl(invoiceId: string): Promise<number> {
  const r = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::int AS n FROM ledger_transactions
      WHERE "ReferenceType" = 'SUPPLIER_INVOICE'
        AND "ReferenceId" = $1
        AND "IsReversed" = FALSE
        AND "Status" = 'POSTED'`,
    [invoiceId],
  );
  return Number(r.rows[0]?.n ?? 0);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  console.log('═'.repeat(64));
  console.log(' LIVE proof: GR full reverse (bills + GL + stock + PO draft)');
  console.log(` stamp: ${stamp}`);
  console.log('═'.repeat(64));

  const { createInvoiceFromGRN } = await import(
    '../src/modules/supplier-payments/supplierPaymentService.js'
  );
  const { goodsReceiptService } = await import(
    '../src/modules/goods-receipts/goodsReceiptService.js'
  );
  const { correctionEligibilityService } = await import(
    '../src/modules/corrections/correctionEligibilityService.js'
  );
  const { planSupplierBillsForGrFullReverse } = await import(
    '../../shared/domain/grFullReverseSsot.js'
  );

  // Pure SSOT gate (no DB) — must not silently plan cancel for OB/CN
  const planProbe = planSupplierBillsForGrFullReverse([
    {
      id: 'x',
      invoiceNumber: 'SBILL-X',
      documentType: 'SUPPLIER_INVOICE',
      amountPaid: 0,
      totalAmount: 100,
      outstandingBalance: 100,
      isPostedToGl: true,
    },
  ]);
  gate(
    'SSOT_PLAN_CANCEL',
    planProbe.toCancel.length === 1 && planProbe.blockers.length === 0,
    `toCancel=${planProbe.toCancel.length} blockers=${planProbe.blockers.length}`,
  );

  const paidProbe = planSupplierBillsForGrFullReverse([
    {
      id: 'paid',
      invoiceNumber: 'SBILL-PAID',
      documentType: 'SUPPLIER_INVOICE',
      amountPaid: 50,
      totalAmount: 100,
      outstandingBalance: 50,
      isPostedToGl: true,
      status: 'PARTIALLY_PAID',
    },
  ]);
  gate(
    'SSOT_PLAN_BLOCK_PAID',
    paidProbe.toCancel.length === 0 && paidProbe.blockers.some((b) => /payments applied/i.test(b)),
    `toCancel=${paidProbe.toCancel.length} blockers=${paidProbe.blockers.join('; ')}`,
  );

  const userRes = await pool.query<{ id: string }>(
    `SELECT id::text AS id FROM users WHERE id::text <> '00000000-0000-0000-0000-000000000000' LIMIT 1`,
  );
  const userId = userRes.rows[0]?.id;
  if (!userId) failHard('USER', 'No user row in database');
  gate('USER', true, `userId=${userId}`);

  const supplierRes = await pool.query<{ id: string; name: string }>(
    `SELECT "Id"::text AS id, "CompanyName" AS name
     FROM suppliers WHERE COALESCE("IsActive", true) = true
     ORDER BY "CreatedAt" DESC NULLS LAST LIMIT 1`,
  );
  const supplierId = supplierRes.rows[0]?.id;
  if (!supplierId) failHard('SUPPLIER', 'No active supplier');
  gate('SUPPLIER', true, `supplier=${supplierRes.rows[0]?.name}`);

  const productId = randomUUID();
  const poId = randomUUID();
  const poItemId = randomUUID();
  const grnId = randomUUID();
  const grItemId = randomUUID();
  const batchId = randomUUID();
  const uomId = randomUUID();
  const grNumber = `GR-GFR-${stamp}`;
  const poNumber = `PO-GFR-${stamp}`;

  await pool.query(
    `INSERT INTO products (id, name, sku, is_active) VALUES ($1, $2, $3, true)`,
    [productId, `GFR Proof ${stamp}`, SKU],
  );

  // Base UoM required for Return GRN create
  await pool.query(
    `INSERT INTO uoms (id, name, symbol, is_active)
     VALUES ($1, $2, $3, true)
     ON CONFLICT DO NOTHING`,
    [uomId, `Each-${stamp}`, 'ea'],
  ).catch(async () => {
    await pool.query(
      `INSERT INTO uoms (id, name, symbol) VALUES ($1, $2, $3)`,
      [uomId, `Each-${stamp}`, 'ea'],
    );
  });

  const hasProductUoms = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables WHERE table_name = 'product_uoms'
     ) AS exists`,
  );
  if (hasProductUoms.rows[0]?.exists) {
    await pool.query(
      `INSERT INTO product_uoms (id, product_id, uom_id, conversion_factor, is_default)
       VALUES ($1, $2, $3, 1, true)`,
      [randomUUID(), productId, uomId],
    ).catch(async () => {
      await pool.query(
        `INSERT INTO product_uoms (product_id, uom_id, conversion_factor, is_default)
         VALUES ($1, $2, 1, true)`,
        [productId, uomId],
      );
    });
  }

  // Attach base_uom if column exists
  const prodCols = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'products'`,
  );
  if (prodCols.rows.some((c) => c.column_name === 'base_uom_id')) {
    await pool.query(`UPDATE products SET base_uom_id = $1 WHERE id = $2`, [uomId, productId]);
  }

  gate('SEED_PRODUCT', true, `sku=${SKU} uom=${uomId.slice(0, 8)}`);

  await pool.query(
    `INSERT INTO purchase_orders (
       id, order_number, supplier_id, order_date, status, total_amount, created_by_id
     ) VALUES ($1, $2, $3, CURRENT_DATE, 'COMPLETED', $4, $5)`,
    [poId, poNumber, supplierId, GRN_TOTAL, userId],
  );

  // Detect PO item columns (schema variants)
  const poiCols = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'purchase_order_items'`,
  );
  const poiSet = new Set(poiCols.rows.map((r) => r.column_name));
  const qtyCol = poiSet.has('ordered_quantity')
    ? 'ordered_quantity'
    : poiSet.has('quantity')
      ? 'quantity'
      : null;
  if (!qtyCol) failHard('SEED_PO_ITEM', 'purchase_order_items has no ordered_quantity/quantity');

  const unitCol = poiSet.has('unit_price')
    ? 'unit_price'
    : poiSet.has('unit_cost')
      ? 'unit_cost'
      : poiSet.has('cost_price')
        ? 'cost_price'
        : null;
  if (!unitCol) failHard('SEED_PO_ITEM', 'purchase_order_items has no unit price column');

  const hasReceived = poiSet.has('received_quantity');
  const hasTotal = poiSet.has('total_price');
  const hasProductName = poiSet.has('product_name');

  await pool.query(
    `INSERT INTO purchase_order_items (
       id, purchase_order_id, product_id, ${qtyCol}, ${unitCol}
       ${hasReceived ? ', received_quantity' : ''}
       ${hasTotal ? ', total_price' : ''}
       ${hasProductName ? ', product_name' : ''}
     ) VALUES (
       $1, $2, $3, $4, $5
       ${hasReceived ? ', $4' : ''}
       ${hasTotal ? ', $6' : ''}
       ${hasProductName ? ', $7' : ''}
     )`,
    hasProductName
      ? [poItemId, poId, productId, GRN_QTY, UNIT_COST, GRN_TOTAL, `GFR Proof ${stamp}`]
      : hasTotal
        ? [poItemId, poId, productId, GRN_QTY, UNIT_COST, GRN_TOTAL]
        : [poItemId, poId, productId, GRN_QTY, UNIT_COST],
  );

  await pool.query(
    `INSERT INTO goods_receipts (
       id, receipt_number, purchase_order_id, status, received_date, received_by_id
     ) VALUES ($1, $2, $3, 'COMPLETED', CURRENT_DATE, $4)`,
    [grnId, grNumber, poId, userId],
  );

  const griCols = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'goods_receipt_items'`,
  );
  const griSet = new Set(griCols.rows.map((r) => r.column_name));
  const hasPoItem = griSet.has('po_item_id');
  const hasUom = griSet.has('uom_id');

  await pool.query(
    `INSERT INTO goods_receipt_items (
       id, goods_receipt_id, product_id, received_quantity, cost_price
       ${hasPoItem ? ', po_item_id' : ''}
       ${hasUom ? ', uom_id' : ''}
     ) VALUES ($1, $2, $3, $4, $5${hasPoItem ? ', $6' : ''}${hasUom ? (hasPoItem ? ', $7' : ', $6') : ''})`,
    hasPoItem && hasUom
      ? [grItemId, grnId, productId, GRN_QTY, UNIT_COST, poItemId, uomId]
      : hasPoItem
        ? [grItemId, grnId, productId, GRN_QTY, UNIT_COST, poItemId]
        : hasUom
          ? [grItemId, grnId, productId, GRN_QTY, UNIT_COST, uomId]
          : [grItemId, grnId, productId, GRN_QTY, UNIT_COST],
  );

  await pool.query(
    `INSERT INTO inventory_batches (
       id, product_id, batch_number, quantity, remaining_quantity,
       cost_price, received_date, status, source_type,
       goods_receipt_id, goods_receipt_item_id, purchase_order_id, purchase_order_item_id
     ) VALUES (
       $1, $2, $3, $4, $4, $5, CURRENT_DATE, 'ACTIVE', 'GOODS_RECEIPT',
       $6, $7, $8, $9
     )`,
    [batchId, productId, `B-${SKU}`, GRN_QTY, UNIT_COST, grnId, grItemId, poId, poItemId],
  );

  await pool.query(
    `INSERT INTO cost_layers (
       id, product_id, quantity, remaining_quantity, unit_cost, received_date,
       batch_number, is_active, goods_receipt_id
     ) VALUES ($1, $2, $3, $3, $4, CURRENT_DATE, $5, true, $6)`,
    [randomUUID(), productId, GRN_QTY, UNIT_COST, `B-${SKU}`, grnId],
  );

  // product_inventory if table exists
  const piExists = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables WHERE table_name = 'product_inventory'
     ) AS exists`,
  );
  if (piExists.rows[0]?.exists) {
    await pool.query(
      `INSERT INTO product_inventory (product_id, quantity_on_hand, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (product_id) DO UPDATE
         SET quantity_on_hand = product_inventory.quantity_on_hand + EXCLUDED.quantity_on_hand,
             updated_at = NOW()`,
      [productId, GRN_QTY],
    ).catch(async () => {
      // Some schemas use different PK — try upsert-less insert ignore
      await pool.query(
        `UPDATE products SET quantity_on_hand = COALESCE(quantity_on_hand, 0) + $2 WHERE id = $1`,
        [productId, GRN_QTY],
      ).catch(() => undefined);
    });
  }

  gate('SEED_GR_STOCK', true, `${grNumber} qty=${GRN_QTY} batch=${batchId.slice(0, 8)}`);

  const created = await createInvoiceFromGRN(
    pool,
    { grnId, supplierInvoiceNumber: `INV-GFR-${stamp}` },
    userId,
  );
  const invoiceId = created.id as string;
  if (!invoiceId) failHard('BILL_POSTED', 'createInvoiceFromGRN returned no id');

  const invRow = await pool.query<{
    total: string;
    posted: boolean;
    status: string;
  }>(
    `SELECT "TotalAmount"::text AS total, COALESCE(is_posted_to_gl,false) AS posted, "Status" AS status
     FROM supplier_invoices WHERE "Id" = $1`,
    [invoiceId],
  );
  const openGlBefore = await countOpenSupplierInvoiceGl(invoiceId);
  const billOk =
    Number(invRow.rows[0]?.total) === GRN_TOTAL &&
    invRow.rows[0]?.posted === true &&
    openGlBefore >= 1;
  gate(
    'BILL_POSTED',
    billOk,
    `invoice=${created.invoiceNumber} total=${invRow.rows[0]?.total} posted=${invRow.rows[0]?.posted} openGl=${openGlBefore}`,
  );
  if (!billOk) failHard('BILL_POSTED', 'Bill not posted with open GL — reverse proof cannot proceed');

  const eligibility = await correctionEligibilityService.eligibilityReverseUninvoicedReceipt(
    pool,
    grnId,
  );
  gate(
    'ELIGIBILITY_ALLOWS',
    eligibility.allowed === true &&
      eligibility.route === 'REVERSE_UNINVOICED_RECEIPT' &&
      Number(eligibility.context?.billsToAutoCancel ?? 0) >= 1,
    `allowed=${eligibility.allowed} route=${eligibility.route} billsToAutoCancel=${eligibility.context?.billsToAutoCancel} blockers=${JSON.stringify(eligibility.blockers)}`,
  );
  if (!eligibility.allowed) {
    failHard('ELIGIBILITY_ALLOWS', eligibility.blockers.join(' | ') || 'not allowed');
  }

  let reverseResult: Awaited<ReturnType<typeof goodsReceiptService.reverseUninvoicedReceipt>>;
  try {
    reverseResult = await goodsReceiptService.reverseUninvoicedReceipt(pool, grnId, {
      reason: `LIVE proof full reverse ${stamp}`,
      userId,
    });
  } catch (err) {
    failHard(
      'REVERSE_OK',
      err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err),
    );
  }

  gate(
    'REVERSE_OK',
    Boolean(reverseResult.returnGrn?.id) &&
      (reverseResult.cancelledBills?.length ?? 0) >= 1 &&
      reverseResult.cancelledBills.some((b) => b.invoiceId === invoiceId),
    `rgrn=${reverseResult.returnGrn?.returnGrnNumber} cancelled=${JSON.stringify(reverseResult.cancelledBills)}`,
  );

  const afterBill = await pool.query<{ status: string; outstanding: string }>(
    `SELECT "Status" AS status, "OutstandingBalance"::text AS outstanding
     FROM supplier_invoices WHERE "Id" = $1`,
    [invoiceId],
  );
  gate(
    'BILL_CANCELLED',
    String(afterBill.rows[0]?.status).toUpperCase() === 'CANCELLED' &&
      Number(afterBill.rows[0]?.outstanding) === 0,
    `status=${afterBill.rows[0]?.status} outstanding=${afterBill.rows[0]?.outstanding}`,
  );

  const openGlAfter = await countOpenSupplierInvoiceGl(invoiceId);
  gate('BILL_GL_REVERSED', openGlAfter === 0, `openGlAfter=${openGlAfter} (must be 0)`);

  const grMeta = await pool.query<{
    reversed: boolean;
    rgrn_id: string | null;
    is_reversed: boolean;
  }>(
    `SELECT
       (reversed_by_return_grn_id IS NOT NULL) AS reversed,
       reversed_by_return_grn_id::text AS rgrn_id,
       (reversed_by_return_grn_id IS NOT NULL) AS is_reversed
     FROM goods_receipts WHERE id = $1`,
    [grnId],
  );
  gate(
    'GR_REVERSED',
    grMeta.rows[0]?.reversed === true &&
      grMeta.rows[0]?.rgrn_id === reverseResult.returnGrn.id,
    `reversed=${grMeta.rows[0]?.reversed} rgrn=${grMeta.rows[0]?.rgrn_id}`,
  );

  const rgrn = await pool.query<{ status: string; reason: string }>(
    `SELECT status, reason FROM return_grn WHERE id = $1`,
    [reverseResult.returnGrn.id],
  );
  gate(
    'RGRN_POSTED',
    rgrn.rows[0]?.status === 'POSTED' &&
      String(rgrn.rows[0]?.reason || '').includes('[Full reverse]'),
    `status=${rgrn.rows[0]?.status} reason=${String(rgrn.rows[0]?.reason || '').slice(0, 80)}`,
  );

  const poStatus = await pool.query<{ status: string }>(
    `SELECT status FROM purchase_orders WHERE id = $1`,
    [poId],
  );
  gate(
    'PO_DRAFT',
    String(poStatus.rows[0]?.status).toUpperCase() === 'DRAFT',
    `po.status=${poStatus.rows[0]?.status} (must be DRAFT after full reverse)`,
  );

  let rebillBlocked = false;
  try {
    await createInvoiceFromGRN(
      pool,
      { grnId, supplierInvoiceNumber: `INV-GFR-REBILL-${stamp}` },
      userId,
    );
    gate('REBILL_BLOCKED', false, 'createInvoiceFromGRN accepted on reversed GR — BUG');
  } catch (err) {
    rebillBlocked = /fully reversed|not billable|reversed/i.test(
      err instanceof Error ? err.message : String(err),
    );
    gate(
      'REBILL_BLOCKED',
      rebillBlocked,
      (err instanceof Error ? err.message : String(err)).slice(0, 160),
    );
  }

  const batchLeft = await pool.query<{ remaining: string }>(
    `SELECT remaining_quantity::text AS remaining FROM inventory_batches WHERE id = $1`,
    [batchId],
  );
  gate(
    'STOCK_RETURNED',
    Number(batchLeft.rows[0]?.remaining) === 0,
    `batch.remaining=${batchLeft.rows[0]?.remaining} (must be 0)`,
  );

  const passed = gates.filter((g) => g.ok).length;
  const failed = gates.filter((g) => !g.ok).length;
  const verdict = failed === 0 ? 'PASS' : 'FAIL';

  const artifact = {
    feature: 'GR_FULL_REVERSE_LIVE',
    verdict,
    startedAt,
    finishedAt: new Date().toISOString(),
    stamp,
    summary: { passed, failed, total: gates.length },
    contract:
      'Full reverse auto-cancels linked bills + reverses AP GL + posts Return GRN + marks GR reversed + PO→DRAFT; rebill blocked',
    fixtures: {
      sku: SKU,
      grNumber,
      poNumber,
      grnId,
      invoiceId,
      invoiceNumber: created.invoiceNumber,
      returnGrnNumber: reverseResult.returnGrn.returnGrnNumber,
      cancelledBills: reverseResult.cancelledBills,
    },
    gates,
  };

  const outJson = path.join(repoRoot, 'PROOF_GR_FULL_REVERSE_LIVE.json');
  const outMd = path.join(repoRoot, 'PROOF_GR_FULL_REVERSE_LIVE.md');
  fs.writeFileSync(outJson, JSON.stringify(artifact, null, 2));
  fs.writeFileSync(
    outMd,
    `# PROOF — GR full reverse (live)

**Generated:** ${artifact.finishedAt}  
**Verdict:** **${verdict}** (${passed}/${gates.length})  
**Scope:** ${artifact.contract}

## Fixtures

- GR: \`${grNumber}\`
- PO: \`${poNumber}\`
- Bill: \`${created.invoiceNumber}\`
- RGRN: \`${reverseResult.returnGrn.returnGrnNumber}\`

## Gates

| Gate | Result | Detail |
|------|--------|--------|
${gates.map((g) => `| \`${g.id}\` | ${g.ok ? 'PASS' : 'FAIL'} | ${g.detail.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`).join('\n')}

## Run

\`\`\`bash
npm run proof:gr-full-reverse:live
\`\`\`
`,
  );

  console.log('═'.repeat(64));
  console.log(` verdict: ${verdict}`);
  console.log(` passed: ${passed}/${gates.length}`);
  console.log(` wrote: ${path.basename(outJson)}`);
  console.log('═'.repeat(64));

  await pool.end();
  if (failed > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error('UNCAUGHT — proof aborted (not swallowed):', err);
  try {
    const failedGates = gates.length
      ? gates
      : [{ id: 'UNCAUGHT', ok: false, detail: err instanceof Error ? err.message : String(err) }];
    const artifact = {
      feature: 'GR_FULL_REVERSE_LIVE',
      verdict: 'FAIL',
      finishedAt: new Date().toISOString(),
      error: err instanceof Error ? { message: err.message, stack: err.stack } : String(err),
      gates: failedGates,
    };
    fs.writeFileSync(
      path.join(repoRoot, 'PROOF_GR_FULL_REVERSE_LIVE.json'),
      JSON.stringify(artifact, null, 2),
    );
    fs.writeFileSync(
      path.join(repoRoot, 'PROOF_GR_FULL_REVERSE_LIVE.md'),
      `# PROOF — GR full reverse (live)\n\n**Verdict:** FAIL (uncaught)\n\n\`\`\`\n${err instanceof Error ? err.stack || err.message : String(err)}\n\`\`\`\n`,
    );
  } catch {
    /* still exit non-zero */
  }
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
