#!/usr/bin/env node
/**
 * Proof bundle: Reorder Intelligence — counts, summary consistency, PDF export.
 *
 * 1) Jest unit tests (always)
 * 2) Live API (when server + DB up)
 *
 * Usage:
 *   npm run proof:reorder-intelligence
 *   BASE_URL=http://localhost:3001 node scripts/proof-reorder-intelligence.mjs
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(root, 'SamplePOS.Server');
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';

let failed = 0;
function pass(msg) {
    console.log(`PASS ${msg}`);
}
function fail(msg) {
    console.error(`FAIL ${msg}`);
    failed++;
}
function skip(msg) {
    console.warn(`SKIP ${msg}`);
}

console.log('═'.repeat(60));
console.log(' proof-reorder-intelligence — Jest');
console.log('═'.repeat(60));

const unit = spawnSync(
    'node',
    [
        '--experimental-vm-modules',
        './node_modules/jest/bin/jest.js',
        'src/modules/reports/reorderDashboardLogic.test.ts',
        'src/modules/reports/reorderDashboardExport.test.ts',
        '--runInBand',
    ],
    { cwd: serverDir, stdio: 'inherit', shell: false },
);

if (unit.status !== 0) {
    console.error('\nproof-reorder-intelligence: Jest FAILED');
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

function assertCountMatch(label, summaryVal, arrayLen) {
    if (summaryVal === arrayLen) {
        pass(`${label}: summary ${summaryVal} = array ${arrayLen}`);
    } else {
        fail(`${label}: summary ${summaryVal} !== array ${arrayLen}`);
    }
}

async function liveProof() {
    console.log('\n' + '═'.repeat(60));
    console.log(' proof-reorder-intelligence — Live API');
    console.log('═'.repeat(60));

    let token;
    try {
        token = await login();
    } catch (e) {
        skip(`live — ${e instanceof Error ? e.message : e}`);
        return;
    }

    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const dashRes = await fetch(`${BASE}/api/reports/reorder-dashboard`, { headers });
    if (!dashRes.ok) {
        fail(`GET reorder-dashboard HTTP ${dashRes.status}`);
        return;
    }
    const dashJson = await dashRes.json();
    if (!dashJson.success || !dashJson.data) {
        fail('GET reorder-dashboard: success=false or no data');
        return;
    }

    const { summary, urgent, high, medium, deadStock } = dashJson.data;

    assertCountMatch('urgent', summary.urgentCount, urgent.length);
    assertCountMatch('high', summary.highCount, high.length);
    assertCountMatch('medium', summary.mediumCount, medium.length);
    assertCountMatch('deadStock', summary.deadStockCount, deadStock.length);

    if (typeof summary.itemsToReorderCount === 'number') {
        pass(`itemsToReorderCount present: ${summary.itemsToReorderCount}`);
    } else {
        fail('summary.itemsToReorderCount missing (deploy new API)');
    }

    const reorderBuckets = [...urgent, ...high, ...medium];
    const withQty = reorderBuckets.filter((i) => {
        const q =
            i.suggestedOrderQty > 0
                ? i.suggestedOrderQty
                : Math.max(
                      0,
                      Math.ceil((i.reorderPoint ?? 0) - i.currentStock - (i.qtyOnOrder ?? 0)),
                  );
        return q > 0 || (i.currentStock <= 0 && (i.reorderLevel ?? 0) > 0);
    });
    if (summary.itemsToReorderCount <= reorderBuckets.length) {
        pass(`itemsToReorderCount ${summary.itemsToReorderCount} <= reorder rows ${reorderBuckets.length}`);
    } else {
        fail(`itemsToReorderCount ${summary.itemsToReorderCount} > reorder rows ${reorderBuckets.length}`);
    }

    const inactiveOosInUrgent = urgent.filter(
        (i) =>
            i.currentStock <= 0 &&
            (i.unitsSold30d ?? 0) === 0 &&
            (i.dailySalesVelocity ?? 0) <= 0 &&
            (i.reorderLevel ?? 0) <= 0 &&
            (i.qtyOnOrder ?? 0) <= 0,
    );
    if (inactiveOosInUrgent.length === 0) {
        pass('no inactive OOS SKUs in urgent bucket');
    } else {
        fail(`${inactiveOosInUrgent.length} inactive OOS still in urgent (sample: ${inactiveOosInUrgent[0]?.name})`);
    }

    const totalListed =
        urgent.length + high.length + medium.length + deadStock.length;
    pass(`dashboard rows listed: ${totalListed} (urgent ${urgent.length}, high ${high.length}, normal ${medium.length}, dead ${deadStock.length})`);
    console.log(
        '  summary:',
        JSON.stringify(
            {
                urgent: summary.urgentCount,
                high: summary.highCount,
                medium: summary.mediumCount,
                dead: summary.deadStockCount,
                itemsToReorder: summary.itemsToReorderCount,
                totalReorderCost: summary.totalReorderCost,
                deadStockValue: summary.totalDeadStockValue,
            },
            null,
            0,
        ),
    );

    const pdfIds = reorderBuckets.slice(0, 3).map((i) => i.productId);
    if (pdfIds.length === 0) {
        skip('PDF export — no reorder-candidate rows to export');
    } else {
        const pdfRes = await fetch(`${BASE}/api/reports/reorder-dashboard/pdf`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ productIds: pdfIds }),
        });
        const ct = pdfRes.headers.get('content-type') || '';
        if (pdfRes.ok && ct.includes('application/pdf')) {
            const buf = await pdfRes.arrayBuffer();
            if (buf.byteLength > 500) {
                pass(`PDF export ${pdfIds.length} lines (${buf.byteLength} bytes)`);
            } else {
                fail(`PDF too small (${buf.byteLength} bytes)`);
            }
        } else if (pdfRes.status === 404) {
            fail('PDF route missing — deploy POST /api/reports/reorder-dashboard/pdf');
        } else {
            const errText = await pdfRes.text().catch(() => '');
            fail(`PDF export HTTP ${pdfRes.status} ${errText.slice(0, 120)}`);
        }
    }

    if (pdfIds.length >= 1) {
        const badRes = await fetch(`${BASE}/api/reports/reorder-dashboard/pdf`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ productIds: [] }),
        });
        if (badRes.status === 400 || badRes.status === 422) {
            pass('PDF rejects empty productIds');
        } else {
            fail(`PDF empty body expected 400, got ${badRes.status}`);
        }

        const csvRes = await fetch(`${BASE}/api/reports/reorder-dashboard/csv`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ productIds: pdfIds }),
        });
        const csvCt = csvRes.headers.get('content-type') || '';
        if (csvRes.ok && csvCt.includes('text/csv')) {
            const text = await csvRes.text();
            const header = text.split('\n')[0] || '';
            if (header.includes('Category') && !header.includes('SKU')) {
                pass(`CSV export (${text.length} chars, Category present, no SKU)`);
            } else {
                fail(`CSV header wrong: ${header.slice(0, 120)}`);
            }
        } else if (csvRes.status === 404) {
            fail('CSV route missing — deploy POST /api/reports/reorder-dashboard/csv');
        } else {
            fail(`CSV export HTTP ${csvRes.status}`);
        }
    }
}

await liveProof();

console.log('\n' + '═'.repeat(60));
if (failed > 0) {
    console.error(` proof-reorder-intelligence: FAILED (${failed} check(s))`);
    process.exit(1);
}
console.log(' proof-reorder-intelligence: ALL PROOF PASSED');
console.log('═'.repeat(60));
process.exit(0);
