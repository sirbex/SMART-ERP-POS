#!/usr/bin/env node
/**
 * Proof + integrity: sale customer reassignment (accounts AR 1200 + document tax immutability).
 *
 * Layers:
 *   1) Jest unit (behavioral accounting/tax paths)
 *   2) Jest evidence (structural seals)
 *   3) Live DB schema EXPLAIN (DATABASE_URL) — catches pg 42703 column mismatches
 *   4) Optional live API (BASE_URL) — snapshot TB/integrity; dry-run preview when SALE_ID set
 *
 * Usage:
 *   node scripts/proof-sale-customer-reassignment-integrity.mjs
 *   BASE_URL=http://localhost:3001 SALE_ID=<uuid> TO_CUSTOMER_ID=<uuid> node scripts/proof-sale-customer-reassignment-integrity.mjs
 *
 * Execute is OFF by default. Opt-in only:
 *   ALLOW_EXECUTE=1 ...
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';
const TENANT = process.env.TEST_TENANT || 'default';
const SALE_ID = process.env.SALE_ID || '';
const TO_CUSTOMER_ID = process.env.TO_CUSTOMER_ID || '';
const ALLOW_EXECUTE = process.env.ALLOW_EXECUTE === '1';

let pass = 0;
let fail = 0;
const failures = [];

function ok(n, d = '') {
  pass++;
  console.log(`  PASS  ${n}${d ? ` — ${d}` : ''}`);
}
function bad(n, d = '') {
  fail++;
  failures.push(`${n}${d ? ` — ${d}` : ''}`);
  console.error(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
}
function assert(c, n, d = '') {
  if (c) ok(n, d);
  else bad(n, d);
}

function loadDatabaseUrl() {
  for (const p of [path.join(SERVER_ROOT, '.env'), path.join(SERVER_ROOT, '..', '.env')]) {
    try {
      const env = fs.readFileSync(p, 'utf8');
      const m = env.match(/^DATABASE_URL=(.*)$/m);
      if (m) {
        let v = m[1].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        return v;
      }
    } catch {
      /* next */
    }
  }
  return process.env.DATABASE_URL || '';
}

async function gateLiveSchema() {
  const url = loadDatabaseUrl();
  if (!url) {
    console.log('  SKIP  live schema — no DATABASE_URL');
    return;
  }
  const pool = new pg.Pool({ connectionString: url });
  try {
    const cols = async (table) => {
      const r = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name=$1`,
        [table],
      );
      return new Set(r.rows.map((x) => x.column_name));
    };
    const salesCols = await cols('sales');
    const invCols = await cols('invoices');
    assert(salesCols.has('customer_id'), 'schema: sales.customer_id exists');
    assert(!salesCols.has('updated_at'), 'schema: sales has NO updated_at (repo must not SET it)');
    assert(invCols.has('customer_id'), 'schema: invoices.customer_id exists');
    assert(invCols.has('customer_name'), 'schema: invoices.customer_name exists');
    assert(invCols.has('updated_at'), 'schema: invoices.updated_at exists');

    const saleSql =
      'UPDATE sales SET customer_id = $2::uuid WHERE id = $1::uuid RETURNING id';
    const invSql = `UPDATE invoices SET customer_id = $2::uuid, customer_name = $3, updated_at = CURRENT_TIMESTAMP
       WHERE sale_id = $1::uuid AND UPPER(COALESCE(status, '')) NOT IN ('CANCELLED', 'VOID', 'VOIDED')
       RETURNING id`;
    try {
      await pool.query(`EXPLAIN ${saleSql}`, [
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
      ]);
      ok('schema: EXPLAIN sales reassignment UPDATE succeeds');
    } catch (e) {
      bad('schema: EXPLAIN sales reassignment UPDATE', e instanceof Error ? e.message : String(e));
    }
    try {
      await pool.query(`EXPLAIN ${invSql}`, [
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000002',
        'x',
      ]);
      ok('schema: EXPLAIN invoices reassignment UPDATE succeeds');
    } catch (e) {
      bad('schema: EXPLAIN invoices reassignment UPDATE', e instanceof Error ? e.message : String(e));
    }

    const repo = fs.readFileSync(
      path.join(SERVER_ROOT, 'src/modules/corrections/saleCustomerReassignmentRepository.ts'),
      'utf8',
    );
    const saleBlock = repo.match(/async updateSaleCustomer[\s\S]*?RETURNING id`/)?.[0] || '';
    const saleUpdateSrc = (saleBlock.match(/`[\s\S]*?`/) || [])[0] || '';
    assert(
      !!saleUpdateSrc &&
        !saleUpdateSrc.includes('updated_at') &&
        saleUpdateSrc.includes('customer_id'),
      'source vs live: sales UPDATE SQL sets customer_id only (no updated_at)',
    );
  } finally {
    await pool.end();
  }
}

function runJest(patterns) {
  const args = [
    '--experimental-vm-modules',
    './node_modules/jest/bin/jest.js',
    '--runInBand',
    '--forceExit',
    ...patterns,
  ];
  const r = spawnSync(process.execPath, args, {
    cwd: SERVER_ROOT,
    encoding: 'utf8',
    shell: false,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return r.status === 0;
}

async function req(method, p, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${p}`, {
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

async function snapshotBooks(token) {
  const tb = await req('GET', '/api/accounting/trial-balance', { token });
  const totals = tb.data?.data?.totals;
  const ig = await req('GET', '/api/accounting/integrity', { token });
  const d = ig.data?.data;
  const je = d?.checks?.journalEntryBalance;
  const ar = d?.checks?.arReconciliation;
  const tbGap =
    totals && totals.totalDebits != null && totals.totalCredits != null
      ? Math.abs(Number(totals.totalDebits) - Number(totals.totalCredits))
      : null;
  return {
    tbOk: tb.status === 200 && totals,
    tbGap,
    integrityOk: ig.status === 200 && d,
    integrityPassed: d?.passed === true,
    unbalancedJournals: je?.unbalancedCount ?? null,
    arDiff: ar?.difference != null ? Number(ar.difference) : null,
  };
}

console.log('\n══ Sale customer reassignment — proof + integrity ══\n');

console.log('── Gate A: unit tests (behavioral accounts + tax) ──');
const unitOk = runJest([
  'src/modules/corrections/saleCustomerReassignmentService.test.ts',
]);
assert(unitOk, 'unit: saleCustomerReassignmentService.test.ts');

console.log('\n── Gate B: evidence (structural + tax/AR seals) ──');
const evidenceOk = runJest([
  'src/modules/corrections/saleCustomerReassignment.evidence.test.ts',
]);
assert(evidenceOk, 'evidence: saleCustomerReassignment.evidence.test.ts');

console.log('\n── Gate B2: live DB schema (EXPLAIN reassignment SQL) ──');
await gateLiveSchema();

console.log('\n── Gate C: live API (optional) ──');
let liveProbed = false;
try {
  const health = await req('GET', '/api/health');
  if (health.status !== 200) {
    console.log('  SKIP  live API — server not reachable at', BASE);
  } else {
    liveProbed = true;
    ok('API health', BASE);

    const login = await req('POST', '/api/auth/login', {
      body: { email: EMAIL, password: PASSWORD, tenant: TENANT },
    });
    const token =
      login.data?.data?.token ||
      login.data?.token ||
      login.data?.data?.accessToken ||
      null;
    if (!token) {
      bad('login', `status=${login.status}`);
    } else {
      ok('login');

      const before = await snapshotBooks(token);
      assert(before.tbOk, 'trial balance loads (baseline)');
      assert(before.integrityOk, 'integrity API loads (baseline)');
      if (before.tbGap != null) {
        ok('baseline TB gap recorded', String(before.tbGap));
      }
      if (before.unbalancedJournals != null) {
        assert(
          Number(before.unbalancedJournals) === 0,
          'baseline: no unbalanced journals',
          `count=${before.unbalancedJournals}`,
        );
      }

      // Permission presence: preview without body should 400 not 403 for admin
      const preflight = await req('POST', '/api/sales/customer-reassignment/preview', {
        token,
        body: {},
      });
      assert(
        preflight.status === 400 || preflight.status === 422 || preflight.status === 200,
        'reassign routes registered (not 404)',
        `status=${preflight.status}`,
      );
      assert(
        preflight.status !== 403 && preflight.status !== 401,
        'admin can reach reassign permission gate',
        `status=${preflight.status}`,
      );

      if (SALE_ID && TO_CUSTOMER_ID) {
        // Resolve from customer
        const saleRes = await req('GET', `/api/sales/${SALE_ID}`, { token });
        const sale =
          saleRes.data?.data?.sale || saleRes.data?.data || saleRes.data?.sale || null;
        const taxBefore =
          sale?.taxAmount != null
            ? Number(sale.taxAmount)
            : sale?.tax_amount != null
              ? Number(sale.tax_amount)
              : null;
        const fromCustomerId = sale?.customerId ?? sale?.customer_id ?? null;

        const preview = await req('POST', '/api/sales/customer-reassignment/preview', {
          token,
          body: {
            saleId: SALE_ID,
            fromCustomerId,
            toCustomerId: TO_CUSTOMER_ID,
            reason: 'Integrity proof dry-run — wrong customer correction',
          },
        });
        assert(preview.status === 200, 'preview succeeds', `status=${preview.status}`);
        const p = preview.data?.data;
        if (p) {
          assert(p.documentTaxImmutable === true, 'preview stamps documentTaxImmutable');
          const dr = (p.journalLines || []).reduce((s, l) => s + Number(l.debit || 0), 0);
          const cr = (p.journalLines || []).reduce((s, l) => s + Number(l.credit || 0), 0);
          assert(Math.abs(dr - cr) < 0.01, 'preview journal balanced', `DR=${dr} CR=${cr}`);
          assert(
            (p.journalLines || []).every((l) => String(l.accountCode) === '1200') ||
              (p.journalLines || []).length === 0,
            'preview journal is 1200-only or empty',
          );
          if (Number(p.openArAmount) > 0.01 && Number(p.invoiceOutstandingAmount || 0) > 0.01) {
            // Should not fabricate when no GL; if GL present, lines exist
            if (p.accountScope === 'AR') {
              assert((p.journalLines || []).length === 2, 'AR scope has 2 reclass lines');
            }
          }
          if (Number(p.invoiceOutstandingAmount) > 0.01 && Number(p.openArAmount) <= 0.01) {
            assert(
              (p.journalLines || []).length === 0,
              'invoice residual alone does not create JE',
            );
          }
        }

        if (ALLOW_EXECUTE && p && (!p.blockers || p.blockers.length === 0)) {
          console.log('\n  ALLOW_EXECUTE=1 — running execute…');
          const exec = await req('POST', '/api/sales/customer-reassignment/execute', {
            token,
            body: {
              saleId: SALE_ID,
              fromCustomerId,
              toCustomerId: TO_CUSTOMER_ID,
              reason: 'Integrity proof execute — wrong customer correction',
            },
          });
          assert(
            exec.status === 200 || exec.status === 201,
            'execute status',
            `status=${exec.status}`,
          );

          const saleAfter = await req('GET', `/api/sales/${SALE_ID}`, { token });
          const s2 =
            saleAfter.data?.data?.sale || saleAfter.data?.data || saleAfter.data?.sale || null;
          const taxAfter =
            s2?.taxAmount != null
              ? Number(s2.taxAmount)
              : s2?.tax_amount != null
                ? Number(s2.tax_amount)
                : null;
          const toId = s2?.customerId ?? s2?.customer_id;
          assert(String(toId) === String(TO_CUSTOMER_ID), 'sale.customer_id updated');
          if (taxBefore != null && taxAfter != null) {
            assert(
              Math.abs(taxBefore - taxAfter) < 0.01,
              'sale.tax_amount unchanged after reassignment',
              `before=${taxBefore} after=${taxAfter}`,
            );
          }

          const after = await snapshotBooks(token);
          if (before.tbGap != null && after.tbGap != null) {
            assert(
              after.tbGap <= before.tbGap + 0.02,
              'TB gap did not worsen after reclass',
              `before=${before.tbGap} after=${after.tbGap}`,
            );
          }
          if (before.unbalancedJournals != null && after.unbalancedJournals != null) {
            assert(
              Number(after.unbalancedJournals) <= Number(before.unbalancedJournals),
              'unbalanced journals did not increase',
            );
          }
        } else if (ALLOW_EXECUTE) {
          bad('execute skipped — preview blockers', JSON.stringify(p?.blockers || []));
        } else {
          ok('execute skipped (set ALLOW_EXECUTE=1 to mutate)');
        }
      } else {
        console.log(
          '  SKIP  preview dry-run — set SALE_ID and TO_CUSTOMER_ID for live sale path',
        );
      }
    }
  }
} catch (e) {
  if (liveProbed) {
    bad('live probe exception', e instanceof Error ? e.message : String(e));
  } else {
    console.log('  SKIP  live API —', e instanceof Error ? e.message : String(e));
  }
}

console.log(`\n══ Result: ${pass} passed, ${fail} failed ══`);
if (failures.length) {
  console.error('\nFailures:');
  for (const f of failures) console.error(' -', f);
}
process.exit(fail > 0 ? 1 : 0);
