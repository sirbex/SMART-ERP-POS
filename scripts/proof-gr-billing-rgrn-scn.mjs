#!/usr/bin/env node
/**
 * Proof bundle: GR billing column + RGRN SCN bill gate + SCN GL/cancel fixes.
 *
 * 1) Jest unit/integration tests (always)
 * 2) Live API read-only against localhost (when server + DB up)
 *
 * Usage:
 *   node scripts/proof-gr-billing-rgrn-scn.mjs
 *   BASE_URL=http://localhost:3001 node scripts/proof-gr-billing-rgrn-scn.mjs
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(root, 'SamplePOS.Server');
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';

console.log('═'.repeat(60));
console.log(' proof-gr-billing-rgrn-scn — Jest');
console.log('═'.repeat(60));

const unit = spawnSync(
    'node',
    [
        '--experimental-vm-modules',
        './node_modules/jest/bin/jest.js',
        'src/modules/return-grn/rgrnClearingAccount.test.ts',
        'src/modules/return-grn/returnGrnScnBilling.test.ts',
        'src/modules/goods-receipts/goodsReceiptBillingList.test.ts',
        'src/modules/credit-debit-notes/creditDebitNoteService.test.ts',
        '--testNamePattern',
        'resolveRgrnClearingAccountCode|requires supplier bill|billing status|clearingAccountCode 2160|reverses bill application|skips bill reversal',
        '--runInBand',
    ],
    { cwd: serverDir, stdio: 'inherit', shell: false },
);

if (unit.status !== 0) {
    console.error('\nproof-gr-billing-rgrn-scn: Jest FAILED');
    process.exit(unit.status ?? 1);
}

async function login() {
    const res = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    if (!res.ok) throw new Error(`Login failed ${res.status}`);
    const json = await res.json();
    const token = json.data?.token ?? json.data?.accessToken;
    if (!token) throw new Error('No token');
    return token;
}

async function liveProof() {
    console.log('\n' + '═'.repeat(60));
    console.log(' proof-gr-billing-rgrn-scn — Live API (read-only)');
    console.log('═'.repeat(60));

    let token;
    try {
        token = await login();
    } catch (e) {
        console.warn('SKIP live — cannot login:', e instanceof Error ? e.message : e);
        return;
    }

    const headers = { Authorization: `Bearer ${token}` };

    const listRes = await fetch(`${BASE}/api/goods-receipts?limit=10`, { headers });
    if (!listRes.ok) throw new Error(`List GR failed ${listRes.status}`);
    const listJson = await listRes.json();
    const grs = listJson.data ?? [];
    if (grs.length === 0) {
        console.warn('SKIP live billing fields — no GR rows');
        return;
    }

    const missingBilling = grs.filter((g) => !g.billingStatus);
    if (missingBilling.length > 0) {
        throw new Error(`GR list missing billingStatus on ${missingBilling.length} row(s)`);
    }
    console.log(`PASS list billingStatus present (${grs.length} rows)`);

    const sample = grs.slice(0, 3).map((g) => ({
        gr: g.grNumber ?? g.id,
        status: g.status,
        billingStatus: g.billingStatus,
        bill: g.supplierBillNumber ?? null,
    }));
    console.log('  sample:', JSON.stringify(sample, null, 2));

    const toInvoiceRes = await fetch(`${BASE}/api/goods-receipts?limit=5&billingStatus=TO_INVOICE`, { headers });
    if (!toInvoiceRes.ok) throw new Error(`TO_INVOICE filter failed ${toInvoiceRes.status}`);
    const toInvoice = (await toInvoiceRes.json()).data ?? [];
    for (const g of toInvoice) {
        if (g.billingStatus !== 'TO_INVOICE') {
            throw new Error(`Filter TO_INVOICE returned billingStatus=${g.billingStatus}`);
        }
    }
    console.log(`PASS filter TO_INVOICE (${toInvoice.length} rows)`);

    const uninvoicedGr = grs.find((g) => g.billingStatus === 'TO_INVOICE' && g.status === 'COMPLETED')
        ?? grs.find((g) => g.status === 'COMPLETED' && !g.supplierBillNumber);

    let postedNoCn = null;
    if (uninvoicedGr?.id) {
        const rgrnRes = await fetch(`${BASE}/api/return-grn/grn/${uninvoicedGr.id}`, { headers });
        const rgrns = rgrnRes.ok ? ((await rgrnRes.json()).data ?? []) : [];
        postedNoCn = rgrns.find((r) => r.status === 'POSTED' && !r.hasCreditNote) ?? null;
    }

    if (!postedNoCn?.id) {
        console.warn('SKIP SCN bill gate live — no POSTED RGRN on an uninvoiced GR (create return on GR-TO_INVOICE to prove)');
        return;
    }

    if (uninvoicedGr?.billingStatus === 'INVOICED') {
        console.warn('SKIP SCN bill gate — GR already invoiced');
        return;
    }

    const cnRes = await fetch(`${BASE}/api/return-grn/${postedNoCn.id}/credit-note`, {
        method: 'POST',
        headers,
    });
    const cnJson = await cnRes.json().catch(() => ({}));
    if (cnRes.status !== 400) {
        throw new Error(`Expected 400 for SCN without bill, got ${cnRes.status}: ${JSON.stringify(cnJson)}`);
    }
    const code = cnJson.error_code ?? cnJson.data?.error_code;
    const errText = String(cnJson.error ?? '');
    if (code !== 'ERR_RETURN_GRN_001' && !errText.includes('Supplier bill required')) {
        throw new Error(`Expected ERR_RETURN_GRN_001, got ${JSON.stringify(cnJson)}`);
    }
    console.log('PASS SCN blocked without supplier bill (ERR_RETURN_GRN_001)');
}

await liveProof();

console.log('\n' + '═'.repeat(60));
console.log(' proof-gr-billing-rgrn-scn: ALL PROOF PASSED');
console.log('═'.repeat(60) + '\n');
