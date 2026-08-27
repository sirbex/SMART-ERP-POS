#!/usr/bin/env npx tsx
/**
 * LIVE proof — unpaid supplier bill cancel (reverse GL + rebill GR).
 *
 * Gates:
 *   1) Seed GR + exact bill (posted GL)
 *   2) REJECT cancel when AmountPaid > 0
 *   3) ACCEPT cancel → Status Cancelled, no open SUPPLIER_INVOICE GL
 *   4) REBILL same GR after cancel
 *   5) REJECT second cancel (already cancelled)
 *
 * Usage:
 *   cd SamplePOS.Server && npx tsx scripts/proof-supplier-bill-cancel-live.ts
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
  console.error('DATABASE_URL missing');
  process.exit(2);
}
process.env.DATABASE_URL = rawUrl;
const connectionString = rawUrl.split('?')[0];

type Gate = { id: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string): void {
  gates.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id}: ${detail}`);
}

const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const SKU = `SBC-${stamp}`;
const GRN_QTY = 5;
const UNIT_COST = 2_000;
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
  console.log('═'.repeat(60));
  console.log(' LIVE proof: supplier bill cancel');
  console.log(` stamp: ${stamp}`);
  console.log('═'.repeat(60));

  const { createInvoiceFromGRN, cancelSupplierInvoice } = await import(
    '../src/modules/supplier-payments/supplierPaymentService.js'
  );

  const userRes = await pool.query<{ id: string }>(
    `SELECT id::text AS id FROM users WHERE id::text <> '00000000-0000-0000-0000-000000000000' LIMIT 1`,
  );
  const userId = userRes.rows[0]?.id;
  gate('USER', Boolean(userId), `userId=${userId ?? 'none'}`);
  if (!userId) throw new Error('No user');

  const supplierRes = await pool.query<{ id: string; name: string }>(
    `SELECT "Id"::text AS id, "CompanyName" AS name
     FROM suppliers WHERE COALESCE("IsActive", true) = true
     ORDER BY "CreatedAt" DESC NULLS LAST LIMIT 1`,
  );
  const supplierId = supplierRes.rows[0]?.id;
  gate('SUPPLIER', Boolean(supplierId), `supplier=${supplierRes.rows[0]?.name ?? 'none'}`);
  if (!supplierId) throw new Error('No supplier');

  const productId = randomUUID();
  await pool.query(
    `INSERT INTO products (id, name, sku, is_active) VALUES ($1, $2, $3, true)`,
    [productId, `SBC Proof ${stamp}`, SKU],
  );
  gate('SEED_PRODUCT', true, `sku=${SKU}`);

  const poId = randomUUID();
  const grnId = randomUUID();
  const grNumber = `GR-SBC-${stamp}`;
  await pool.query(
    `INSERT INTO purchase_orders (
       id, order_number, supplier_id, order_date, status, total_amount, created_by_id
     ) VALUES ($1, $2, $3, CURRENT_DATE, 'COMPLETED', $4, $5)`,
    [poId, `PO-SBC-${stamp}`, supplierId, GRN_TOTAL, userId],
  );
  await pool.query(
    `INSERT INTO goods_receipts (
       id, receipt_number, purchase_order_id, status, received_date, received_by_id
     ) VALUES ($1, $2, $3, 'COMPLETED', CURRENT_DATE, $4)`,
    [grnId, grNumber, poId, userId],
  );
  await pool.query(
    `INSERT INTO goods_receipt_items (
       id, goods_receipt_id, product_id, received_quantity, cost_price
     ) VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), grnId, productId, GRN_QTY, UNIT_COST],
  );
  gate('SEED_GR', true, `${grNumber} total=${GRN_TOTAL}`);

  const created = await createInvoiceFromGRN(
    pool,
    { grnId, supplierInvoiceNumber: `INV-SBC-${stamp}` },
    userId,
  );
  const invoiceId = created.id as string;
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
  gate(
    'BILL_POSTED',
    Number(invRow.rows[0]?.total) === GRN_TOTAL &&
      invRow.rows[0]?.posted === true &&
      openGlBefore >= 1,
    `invoice=${created.invoiceNumber} total=${invRow.rows[0]?.total} openGl=${openGlBefore}`,
  );

  await pool.query(`UPDATE supplier_invoices SET "AmountPaid" = 500 WHERE "Id" = $1`, [invoiceId]);
  let rejectPaid = false;
  try {
    await cancelSupplierInvoice(pool, invoiceId, userId, 'proof should reject paid');
    gate('REJECT_PAID', false, 'cancel accepted despite AmountPaid > 0');
  } catch (err) {
    rejectPaid = /Reverse supplier payments|payments exist/i.test(
      err instanceof Error ? err.message : String(err),
    );
    gate('REJECT_PAID', rejectPaid, (err instanceof Error ? err.message : String(err)).slice(0, 120));
  }

  await pool.query(
    `UPDATE supplier_invoices SET "AmountPaid" = 0, "OutstandingBalance" = "TotalAmount" WHERE "Id" = $1`,
    [invoiceId],
  );

  const cancelResult = await cancelSupplierInvoice(
    pool,
    invoiceId,
    userId,
    'proof cancel for rebill',
  );
  const afterCancel = await pool.query<{ status: string; outstanding: string }>(
    `SELECT "Status" AS status, "OutstandingBalance"::text AS outstanding
     FROM supplier_invoices WHERE "Id" = $1`,
    [invoiceId],
  );
  const openGlAfter = await countOpenSupplierInvoiceGl(invoiceId);
  gate(
    'CANCEL_OK',
    cancelResult.glReversed === true &&
      String(afterCancel.rows[0]?.status).toUpperCase() === 'CANCELLED' &&
      Number(afterCancel.rows[0]?.outstanding) === 0 &&
      openGlAfter === 0,
    `glReversed=${cancelResult.glReversed} status=${afterCancel.rows[0]?.status} openGl=${openGlAfter}`,
  );

  let rebillId: string | null = null;
  try {
    const rebill = await createInvoiceFromGRN(
      pool,
      { grnId, supplierInvoiceNumber: `INV-SBC-REBILL-${stamp}` },
      userId,
    );
    rebillId = rebill.id as string;
    gate('REBILL_GR', Boolean(rebillId), `rebill=${rebill.invoiceNumber ?? rebillId}`);
  } catch (err) {
    gate('REBILL_GR', false, err instanceof Error ? err.message : String(err));
  }

  let rejectTwice = false;
  try {
    await cancelSupplierInvoice(pool, invoiceId, userId, 'proof second cancel');
  } catch (err) {
    rejectTwice = /already cancelled|cannot be cancelled/i.test(
      err instanceof Error ? err.message : String(err),
    );
    gate('REJECT_ALREADY_CANCELLED', rejectTwice, (err instanceof Error ? err.message : String(err)).slice(0, 120));
  }
  if (!rejectTwice) {
    gate('REJECT_ALREADY_CANCELLED', false, 'second cancel did not throw');
  }

  const passed = gates.filter((g) => g.ok).length;
  const failed = gates.filter((g) => !g.ok).length;
  const verdict = failed === 0 ? 'PASS' : 'FAIL';

  const artifact = {
    feature: 'SUPPLIER_BILL_CANCEL',
    verdict,
    startedAt,
    finishedAt: new Date().toISOString(),
    stamp,
    passed,
    failed,
    gates,
    fixtures: { sku: SKU, grNumber, invoiceId, rebillId },
  };

  const outJson = path.join(repoRoot, 'PROOF_SUPPLIER_BILL_CANCEL_LIVE.json');
  const outMd = path.join(repoRoot, 'PROOF_SUPPLIER_BILL_CANCEL_LIVE.md');
  fs.writeFileSync(outJson, JSON.stringify(artifact, null, 2));
  fs.writeFileSync(
    outMd,
    `# PROOF — Supplier bill cancel (live)\n\n**Verdict:** ${verdict} (${passed}/${gates.length})\n\n| Gate | Result | Detail |\n|------|--------|--------|\n${gates.map((g) => `| ${g.id} | ${g.ok ? 'PASS' : 'FAIL'} | ${g.detail.replace(/\|/g, '\\|')} |`).join('\n')}\n`,
  );

  console.log('═'.repeat(60));
  console.log(` verdict: ${verdict}`);
  console.log(` passed: ${passed}/${gates.length}`);
  console.log(` wrote: ${path.basename(outJson)}`);
  console.log('═'.repeat(60));

  await pool.end();
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
