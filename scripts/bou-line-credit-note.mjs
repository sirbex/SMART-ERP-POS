#!/usr/bin/env node
/**
 * BOU — line-level PRICE_CORRECTION credit notes (one CN line per overcharged sale line).
 *
 * Usage:
 *   node scripts/bou-line-credit-note.mjs --invoice INV-2026-0026
 *   node scripts/bou-line-credit-note.mjs --invoice INV-2026-0026 --create
 *   node scripts/bou-line-credit-note.mjs --invoice INV-2026-0026 --create --post
 *   node scripts/bou-line-credit-note.mjs --all-overcharged --dry-run
 *
 * Env:
 *   BASE_URL  default https://henber.wizarddigital-inv.com
 *   TEST_EMAIL / TEST_PASSWORD
 */
const BASE = process.env.BASE_URL || 'https://henber.wizarddigital-inv.com';
const EMAIL = process.env.TEST_EMAIL || 'admin@test.com';
const PASSWORD = process.env.TEST_PASSWORD || 'VoidOp_2026';
const BOU_ID = process.env.BOU_CUSTOMER_ID || '81c0d6d5-d939-4bad-a17b-86728b4b72e4';

const args = process.argv.slice(2);
const invoiceArg = args.find((a) => a.startsWith('--invoice='))?.split('=')[1]
  ?? (args.includes('--invoice') ? args[args.indexOf('--invoice') + 1] : null);
const allMode = args.includes('--all-overcharged');
const doCreate = args.includes('--create');
const doPost = args.includes('--post');
const dryRun = args.includes('--dry-run') || (!doCreate && !doPost);

async function request(method, path, { token, body } = {}) {
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
    data = { raw: text };
  }
  return { status: res.status, data };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function login() {
  const login = await request('POST', '/api/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  });
  const token =
    login.data?.data?.token ??
    login.data?.data?.accessToken ??
    login.data?.token;
  if (login.status !== 200 || !token) {
    throw new Error(login.data?.error || `Login failed (${login.status})`);
  }
  return token;
}

async function findInvoice(token, invoiceNumber) {
  const list = await request('GET', `/api/invoices?customerId=${BOU_ID}&limit=50`, { token });
  const inv = (list.data?.data || []).find(
    (i) => i.invoiceNumber === invoiceNumber || i.invoice_number === invoiceNumber,
  );
  if (!inv) throw new Error(`Invoice ${invoiceNumber} not found for BOU`);
  return inv;
}

async function getSaleLines(token, invoiceId) {
  const detail = await request('GET', `/api/invoices/${invoiceId}`, { token });
  if (detail.status !== 200) throw new Error(detail.data?.error || 'Invoice fetch failed');
  const inv = detail.data?.data?.invoice ?? detail.data?.invoice;
  const saleId = inv?.sale_id ?? inv?.saleId;
  if (!saleId) throw new Error('Invoice has no linked sale');
  const sale = await request('GET', `/api/sales/${saleId}`, { token });
  if (sale.status !== 200) throw new Error(sale.data?.error || 'Sale fetch failed');
  const saleRec = sale.data?.data?.sale ?? sale.data?.sale;
  if (saleRec?.status === 'VOID' || saleRec?.status === 'VOIDED_BY_RETURN') {
    throw new Error(`Sale ${saleRec.saleNumber} is void — skip credit note`);
  }
  const items = sale.data?.data?.items ?? sale.data?.items ?? [];
  return { inv, sale: saleRec, items, saleId };
}

async function enginePrice(token, productId, quantity) {
  const q = await request(
    'GET',
    `/api/pricing/price?productId=${productId}&customerId=${BOU_ID}&quantity=${quantity}`,
    { token },
  );
  if (q.status !== 200) return null;
  return {
    finalPrice: num(q.data?.data?.finalPrice),
    scope: q.data?.data?.appliedRule?.scope,
  };
}

/** One CN line per sale line where charged unit price > engine at-cost */
async function buildLineLevelCn(token, invoiceNumber) {
  const inv = await findInvoice(token, invoiceNumber);
  const { inv: invRec, sale, items } = await getSaleLines(token, inv.id);

  const cnLines = [];
  let totalCredit = 0;

  console.log(`\n${invoiceNumber} ← ${sale.saleNumber} (${sale.status})\n`);
  console.log('Line# | Product | Qty | Charged | At-cost (engine) | Credit/unit | Line credit');
  console.log('------|---------|-----|---------|------------------|-------------|------------');

  let lineNo = 0;
  for (const it of items) {
    lineNo += 1;
    const charged = num(it.unitPrice);
    const batchCost = num(it.unitCost);
    const eng = await enginePrice(token, it.productId, it.quantity);
    const correct = eng?.finalPrice ?? batchCost;
    const creditPerUnit = charged - correct;

    if (creditPerUnit <= 0.01) {
      console.log(
        `${String(lineNo).padStart(5)} | ${(it.productName || '').slice(0, 24).padEnd(24)} | ${it.quantity} | ${charged} | ${correct} | — | (ok)`,
      );
      continue;
    }

    const lineCredit = creditPerUnit * num(it.quantity);
    totalCredit += lineCredit;

    console.log(
      `${String(lineNo).padStart(5)} | ${(it.productName || '').slice(0, 24).padEnd(24)} | ${it.quantity} | ${charged} | ${correct} (${eng?.scope || 'batch'}) | ${creditPerUnit.toFixed(2)} | ${lineCredit.toFixed(2)}`,
    );

    cnLines.push({
      productId: it.productId,
      productName: it.productName,
      description: `Sale line ${it.id} — charged ${charged}, at-cost ${correct}`,
      quantity: num(it.quantity),
      unitPrice: Math.round(creditPerUnit * 100) / 100,
      taxRate: 0,
    });
  }

  console.log(`\nCN lines: ${cnLines.length}  Total credit: UGX ${totalCredit.toFixed(2)}\n`);

  if (cnLines.length === 0) {
    return { skip: true, reason: 'No overcharged lines' };
  }

  return {
    invoiceId: inv.id,
    invoiceNumber,
    saleNumber: sale.saleNumber,
    payload: {
      invoiceId: inv.id,
      reason: `AT_COST line-level correction — ${invoiceNumber} / ${sale.saleNumber}`,
      noteType: 'PRICE_CORRECTION',
      returnsGoods: false,
      lines: cnLines,
      notes: `One credit line per overcharged sale line. Engine at-cost for BOU.`,
    },
    totalCredit,
  };
}

async function createAndMaybePost(token, built) {
  if (dryRun) {
    console.log('DRY RUN — payload:\n', JSON.stringify(built.payload, null, 2));
    return;
  }

  const create = await request('POST', '/api/credit-debit-notes/customer/credit-note', {
    token,
    body: built.payload,
  });
  if (create.status !== 200 && create.status !== 201) {
    throw new Error(create.data?.error || JSON.stringify(create.data) || `Create failed ${create.status}`);
  }
  const note = create.data?.data?.note ?? create.data?.note;
  const noteId = note?.id;
  const noteNum = note?.invoiceNumber ?? note?.invoice_number;
  console.log(`Created DRAFT credit note: ${noteNum} (${noteId})`);

  if (doPost && noteId) {
    const post = await request('POST', `/api/credit-debit-notes/customer/${noteId}/post`, { token });
    if (post.status !== 200) {
      throw new Error(post.data?.error || `Post failed ${post.status}`);
    }
    console.log(`POSTED — BOU balance should decrease by UGX ${built.totalCredit.toFixed(2)}`);
  } else if (!doPost) {
    console.log('Next: Accounting → Credit & Debit Notes → open note → Post');
  }
}

async function main() {
  console.log(`BOU line-level credit notes → ${BASE}\n`);
  const token = await login();

  if (allMode) {
    const targets = [];
    const list = await request('GET', `/api/invoices?customerId=${BOU_ID}&limit=50`, { token });
    for (const inv of list.data?.data || []) {
      const invNum = inv.invoiceNumber || inv.invoice_number;
      if (!invNum) continue;
      try {
        const built = await buildLineLevelCn(token, invNum);
        if (!built.skip) targets.push({ invNum, total: built.totalCredit });
      } catch (e) {
        if (!String(e.message).includes('void')) console.warn(`${invNum}: ${e.message}`);
      }
    }
    console.log('\n=== Invoices with line-level overcharge ===\n');
    for (const t of targets) {
      console.log(`  ${t.invNum}  →  UGX ${t.total.toFixed(2)}`);
    }
    return;
  }

  if (!invoiceArg) {
    console.error('Provide --invoice INV-2026-0026 or --all-overcharged');
    process.exit(1);
  }

  const built = await buildLineLevelCn(token, invoiceArg);
  if (built.skip) {
    console.log('Nothing to credit.');
    return;
  }

  if (doCreate || doPost) {
    await createAndMaybePost(token, built);
  } else {
    console.log('DRY RUN (add --create to save draft, --create --post to post)\n');
    console.log(JSON.stringify(built.payload, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
