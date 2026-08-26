#!/usr/bin/env npx tsx
/**
 * LIVE FUNCTIONAL PROOF — Supplier invoice cannot exceed GRN without PRICE_VARIANCE
 *
 * Measured against DATABASE_URL:
 *   1) Seed product + COMPLETED GR (qty×cost = known total)
 *   2) from-grn over-bill without reason → REJECT
 *   3) from-grn over-bill with SUPPLIER_DISCOUNT → REJECT
 *   4) from-grn over-bill with PRICE_VARIANCE → ACCEPT (AP = supplier total)
 *   5) Manual createSupplierInvoice with grnIds + inflated lines → REJECT
 *   6) Fake grnIds → REJECT (not found / not billable)
 *
 * Usage:
 *   cd SamplePOS.Server && npx tsx scripts/proof-supplier-invoice-grn-bounds-live.ts
 *   npm run proof:supplier-invoice-grn-bounds:live
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
const SKU = `SIGB-${stamp}`;
const GRN_QTY = 10;
const UNIT_COST = 1_000;
const GRN_TOTAL = GRN_QTY * UNIT_COST; // 10_000
const OVER_TOTAL = GRN_TOTAL + 2_500; // 12_500

const pool = new pg.Pool({ connectionString, max: 8 });

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  console.log('═'.repeat(60));
  console.log(' LIVE proof: supplier invoice GRN bounds');
  console.log(` stamp: ${stamp}`);
  console.log('═'.repeat(60));

  const {
    createInvoiceFromGRN,
    createSupplierInvoice,
  } = await import('../src/modules/supplier-payments/supplierPaymentService.js');
  const { assertLinkedGrnsReadyForBilling } =
    await import('../src/modules/supplier-payments/supplierInvoiceGrnValidation.js');

  const userRes = await pool.query<{ id: string }>(
    `SELECT id::text AS id FROM users WHERE id::text <> '00000000-0000-0000-0000-000000000000' LIMIT 1`,
  );
  const userId = userRes.rows[0]?.id;
  gate('USER', Boolean(userId), `userId=${userId ?? 'none'}`);
  if (!userId) throw new Error('No user');

  const supplierRes = await pool.query<{ id: string; name: string }>(
    `SELECT "Id"::text AS id, "CompanyName" AS name
     FROM suppliers
     WHERE COALESCE("IsActive", true) = true
     ORDER BY "CreatedAt" DESC NULLS LAST
     LIMIT 1`,
  );
  const supplierId = supplierRes.rows[0]?.id;
  gate('SUPPLIER', Boolean(supplierId), `supplier=${supplierRes.rows[0]?.name ?? 'none'}`);
  if (!supplierId) throw new Error('No supplier');

  // Seed product (minimal)
  const productId = randomUUID();
  await pool.query(
    `INSERT INTO products (id, name, sku, is_active)
     VALUES ($1, $2, $3, true)`,
    [productId, `SIGB Proof ${stamp}`, SKU],
  );
  gate('SEED_PRODUCT', true, `productId=${productId} sku=${SKU}`);

  async function seedCompletedGr(label: string): Promise<{ grnId: string; grNumber: string; poId: string }> {
    const poId = randomUUID();
    const grnId = randomUUID();
    const poNumber = `PO-SIGB-${label}-${stamp}`;
    const grNumber = `GR-SIGB-${label}-${stamp}`;
    await pool.query(
      `INSERT INTO purchase_orders (
         id, order_number, supplier_id, order_date, status, total_amount, created_by_id
       ) VALUES ($1, $2, $3, CURRENT_DATE, 'COMPLETED', $4, $5)`,
      [poId, poNumber, supplierId, GRN_TOTAL, userId],
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
    return { grnId, grNumber, poId };
  }

  const primary = await seedCompletedGr('P');
  const grnId = primary.grnId;
  const grNumber = primary.grNumber;
  gate('SEED_GR', true, `grn=${grNumber} billable=${GRN_TOTAL}`);

  const linked = await assertLinkedGrnsReadyForBilling(pool, [grnId], supplierId);
  gate(
    'ASSERT_READY',
    linked.billableTotal.toNumber() === GRN_TOTAL,
    `assertLinked billable=${linked.billableTotal.toNumber()} expected=${GRN_TOTAL}`,
  );

  // Fake GRN id must fail
  let fakeOk = false;
  try {
    await assertLinkedGrnsReadyForBilling(pool, [randomUUID()], supplierId);
    fakeOk = true;
  } catch (err) {
    gate(
      'FAKE_GRN_REJECT',
      /not found/i.test(err instanceof Error ? err.message : String(err)),
      err instanceof Error ? err.message.slice(0, 120) : String(err),
    );
  }
  if (fakeOk) gate('FAKE_GRN_REJECT', false, 'fake grn unexpectedly accepted');

  // Over-bill without reason
  let rejectNoReason = false;
  try {
    await createInvoiceFromGRN(pool, {
      grnId,
      supplierInvoiceNumber: `INV-OVER-NR-${stamp}`,
      supplierReportedTotal: OVER_TOTAL,
    }, userId);
  } catch (err) {
    rejectNoReason = /differs from goods received|variance reason/i.test(
      err instanceof Error ? err.message : String(err),
    );
    gate('REJECT_OVER_NO_REASON', rejectNoReason, (err instanceof Error ? err.message : String(err)).slice(0, 160));
  }
  if (!rejectNoReason && gates.every((g) => g.id !== 'REJECT_OVER_NO_REASON')) {
    gate('REJECT_OVER_NO_REASON', false, 'over-bill without reason was accepted');
  }

  // Over-bill with wrong direction reason
  let rejectDiscount = false;
  try {
    await createInvoiceFromGRN(pool, {
      grnId,
      supplierInvoiceNumber: `INV-OVER-DISC-${stamp}`,
      supplierReportedTotal: OVER_TOTAL,
      varianceReason: 'SUPPLIER_DISCOUNT',
    }, userId);
  } catch (err) {
    rejectDiscount = /PRICE_VARIANCE|exceeds goods received/i.test(
      err instanceof Error ? err.message : String(err),
    );
    gate('REJECT_OVER_DISCOUNT', rejectDiscount, (err instanceof Error ? err.message : String(err)).slice(0, 160));
  }
  if (!rejectDiscount && gates.every((g) => g.id !== 'REJECT_OVER_DISCOUNT')) {
    gate('REJECT_OVER_DISCOUNT', false, 'over-bill with SUPPLIER_DISCOUNT was accepted');
  }

  // Over-bill with PRICE_VARIANCE — accept
  let invoiceId: string | null = null;
  try {
    const created = await createInvoiceFromGRN(
      pool,
      {
        grnId,
        supplierInvoiceNumber: `INV-OVER-PV-${stamp}`,
        supplierReportedTotal: OVER_TOTAL,
        varianceReason: 'PRICE_VARIANCE',
      },
      userId,
    );
    invoiceId = created.id;
    const row = await pool.query<{
      total: string;
      grn_total: string | null;
      variance_reason: string | null;
      posted: boolean;
    }>(
      `SELECT "TotalAmount"::text AS total,
              grn_computed_total::text AS grn_total,
              variance_reason,
              COALESCE(is_posted_to_gl, false) AS posted
       FROM supplier_invoices WHERE "Id" = $1`,
      [invoiceId],
    );
    const total = Number(row.rows[0]?.total ?? 0);
    const grnStored = Number(row.rows[0]?.grn_total ?? 0);
    gate(
      'ACCEPT_OVER_PV',
      total === OVER_TOTAL &&
        Math.abs(grnStored - GRN_TOTAL) < 0.02 &&
        row.rows[0]?.variance_reason === 'PRICE_VARIANCE' &&
        row.rows[0]?.posted === true,
      `invoice=${created.invoiceNumber ?? invoiceId} AP=${total} grnStored=${grnStored} reason=${row.rows[0]?.variance_reason} posted=${row.rows[0]?.posted}`,
    );
  } catch (err) {
    gate('ACCEPT_OVER_PV', false, err instanceof Error ? err.message : String(err));
  }

  // Manual inflate path — second GR
  const manual = await seedCompletedGr('M');

  let rejectManual = false;
  try {
    await createSupplierInvoice(
      pool,
      {
        supplierId,
        supplierInvoiceNumber: `INV-MANUAL-OVER-${stamp}`,
        invoiceDate: new Date().toISOString().slice(0, 10),
        notes: `Attempt over-bill ${manual.grNumber}`,
        lineItems: [{ productName: 'Inflated', quantity: 1, unitPrice: OVER_TOTAL }],
        grnIds: [manual.grnId],
      },
      userId,
    );
  } catch (err) {
    rejectManual = /differs from goods received|exceeds goods received|variance reason/i.test(
      err instanceof Error ? err.message : String(err),
    );
    gate('REJECT_MANUAL_OVER', rejectManual, (err instanceof Error ? err.message : String(err)).slice(0, 160));
  }
  if (!rejectManual && gates.every((g) => g.id !== 'REJECT_MANUAL_OVER')) {
    gate('REJECT_MANUAL_OVER', false, 'manual over-bill with grnIds was accepted');
  }

  // Exact match from-grn on a third GR
  const exactGr = await seedCompletedGr('E');

  try {
    const exact = await createInvoiceFromGRN(
      pool,
      {
        grnId: exactGr.grnId,
        supplierInvoiceNumber: `INV-EXACT-${stamp}`,
      },
      userId,
    );
    const row = await pool.query<{ total: string }>(
      `SELECT "TotalAmount"::text AS total FROM supplier_invoices WHERE "Id" = $1`,
      [exact.id],
    );
    gate(
      'ACCEPT_EXACT',
      Math.abs(Number(row.rows[0]?.total ?? 0) - GRN_TOTAL) < 0.02,
      `exact bill AP=${row.rows[0]?.total} expected=${GRN_TOTAL}`,
    );
  } catch (err) {
    gate('ACCEPT_EXACT', false, err instanceof Error ? err.message : String(err));
  }

  if (process.env.SIGB_PROOF_CLEANUP === '1') {
    await pool.query(`UPDATE products SET is_active = false WHERE id = $1`, [productId]).catch(() => undefined);
    gate('CLEANUP', true, `deactivated product ${SKU}`);
  } else {
    gate('CLEANUP', true, `left fixtures sku=${SKU}`);
  }

  const failed = gates.filter((g) => !g.ok);
  const evidence = {
    feature: 'SUPPLIER_INVOICE_GRN_BOUNDS_LIVE',
    provenAt: new Date().toISOString(),
    startedAt,
    stamp,
    sku: SKU,
    contract:
      'LIVE: over-GRN bill rejected without reason and with wrong reason; accepted only with PRICE_VARIANCE; manual grnIds inflate rejected; fake GR rejected; exact match accepted',
    fixture: { productId, grnId, grNumber, supplierId, GRN_TOTAL, OVER_TOTAL, invoiceId },
    gates,
    summary: {
      total: gates.length,
      passed: gates.filter((g) => g.ok).length,
      failed: failed.length,
      verdict: failed.length === 0 ? 'PASS' : 'FAIL',
    },
  };

  const jsonPath = path.join(repoRoot, 'PROOF_SUPPLIER_INVOICE_GRN_BOUNDS_LIVE.json');
  const mdPath = path.join(repoRoot, 'PROOF_SUPPLIER_INVOICE_GRN_BOUNDS_LIVE.md');
  fs.writeFileSync(jsonPath, JSON.stringify(evidence, null, 2));
  fs.writeFileSync(
    mdPath,
    [
      '# PROOF — Supplier invoice GRN bounds (LIVE)',
      '',
      `**Verdict:** ${evidence.summary.verdict}`,
      `**Proven at:** ${evidence.provenAt}`,
      '',
      `**Contract:** ${evidence.contract}`,
      '',
      '## Gates',
      '',
      ...gates.map((g) => `- ${g.ok ? 'PASS' : 'FAIL'} \`${g.id}\`: ${g.detail}`),
      '',
      '## Reproduce',
      '',
      '```bash',
      'cd SamplePOS.Server && npx tsx scripts/proof-supplier-invoice-grn-bounds-live.ts',
      'npm run proof:supplier-invoice-grn-bounds:live',
      '```',
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
