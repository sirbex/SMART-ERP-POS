#!/usr/bin/env node
/**
 * Proof: Treasury Transfer flow — bank ↔ cash ↔ mobile money via TREASURY_TRANSFER.
 *
 * Exercises the same contract as Accounting → Treasury Transfer UI:
 *   POST /api/treasury/transfers { fromAccountCode, toAccountCode, amount, postImmediately: true }
 *
 * Scenarios:
 *   1) Bank (1030) → Mobile money (1040)
 *   2) Bank (1030) → Cash (1010)
 *   3) Mobile money (1040) → Bank (1030)
 *
 * Each posted document is reversed to keep the run non-destructive.
 *
 * Usage:
 *   npm run proof:treasury-transfer-flow
 *   TEST_EMAIL=... TEST_PASSWORD=... API_BASE=http://localhost:3001 npm run proof:treasury-transfer-flow
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serverRoot, '..');
const OUT =
  process.env.PROOF_OUT || resolve(repoRoot, 'PROOF_TREASURY_TRANSFER_FLOW.md');
const BASE = (process.env.API_BASE || 'http://localhost:3001').replace(/\/$/, '');
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';
const AMOUNT = Number(process.env.TRANSFER_PROOF_AMOUNT || '1.25');

const SCENARIOS = [
  { id: 'cash-to-bank', label: 'Cash → Bank', from: '1010', to: '1030' },
  { id: 'bank-to-momo', label: 'Bank → Mobile money', from: '1030', to: '1040' },
  { id: 'bank-to-cash', label: 'Bank → Cash', from: '1030', to: '1010' },
  { id: 'momo-to-bank', label: 'Mobile money → Bank', from: '1040', to: '1030' },
];

let pass = 0;
let fail = 0;
let skip = 0;
const lines = [
  '# Treasury Transfer Flow — Liquidity Moves Proof\n',
  `Run: ${new Date().toISOString()}\n`,
  `API: ${BASE}\n`,
  `Amount per leg: ${AMOUNT}\n`,
  '\nCovers operator path: **Accounting → Treasury Transfer**\n',
];

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
function skipped(n, d = '') {
  skip++;
  console.log(`  SKIP  ${n}${d ? ` — ${d}` : ''}`);
  lines.push(`- **SKIP** ${n}${d ? ` — ${d}` : ''}`);
}
function assert(c, n, d = '') {
  if (c) ok(n, d);
  else bad(n, d);
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    env: process.env,
  });
  return { code: r.status ?? 1, out: `${r.stdout || ''}${r.stderr || ''}` };
}

async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

function errMsg(res) {
  return (
    res.data?.error ||
    res.data?.message ||
    (typeof res.data === 'string' ? res.data : JSON.stringify(res.data)?.slice(0, 200)) ||
    `HTTP ${res.status}`
  );
}

console.log('═'.repeat(60));
console.log(' proof-treasury-transfer-flow');
console.log('═'.repeat(60));

lines.push('\n## Unit / static proofs\n');

const inv = run(
  'npm',
  ['test', '--', 'src/modules/treasury/treasuryTransfer.test.ts', '--forceExit'],
  serverRoot,
);
assert(
  inv.code === 0,
  'Jest treasuryTransfer invariants (incl. route matrix)',
  inv.code === 0
    ? (inv.out.match(/Tests:\s+[^\n]+/) || ['ok'])[0]
    : inv.out.slice(-500),
);

const ui = run(
  'npx',
  ['vitest', 'run', 'src/__tests__/treasury-transfer-flow-proof.test.ts'],
  resolve(repoRoot, 'samplepos.client'),
);
assert(
  ui.code === 0,
  'Vitest treasury-transfer-flow UI proof',
  ui.code === 0
    ? (ui.out.match(/Tests\s+[^\n]+/) || ui.out.match(/\d+ passed/) || ['ok'])[0]
    : ui.out.slice(-500),
);

lines.push('\n## Live API — Treasury Transfer scenarios\n');

let flagWasOn = false;
let token = null;

try {
  const health = await req('GET', '/api/health');
  if (health.status !== 200) {
    skipped('Live API', `health=${health.status}`);
  } else {
    ok('API health', String(health.status));

    const login = await req('POST', '/api/auth/login', {
      body: { email: EMAIL, password: PASSWORD },
    });
    token = login.data?.data?.token ?? login.data?.data?.accessToken;
    if (login.status !== 200 || !token) {
      bad('Admin login', errMsg(login));
    } else {
      ok('Admin login', EMAIL);

      const enabledBefore = await req('GET', '/api/treasury/enabled', { token });
      flagWasOn = Boolean(enabledBefore.data?.data?.enabled);
      if (!flagWasOn) {
        const enable = await req('PATCH', '/api/system-settings', {
          token,
          body: { treasuryDocumentEnabled: true },
        });
        assert(
          enable.status === 200 && enable.data?.data?.treasuryDocumentEnabled === true,
          'Enable treasuryDocumentEnabled for transfer proof',
          errMsg(enable),
        );
      } else {
        ok('Treasury already enabled');
      }

      const accountsRes = await req('GET', '/api/treasury/liquidity-accounts', { token });
      const accounts = accountsRes.data?.data?.items ?? [];
      assert(accountsRes.status === 200 && accounts.length > 0, 'List liquidity accounts', `count=${accounts.length}`);

      const byCode = new Map(accounts.map((a) => [a.accountCode, a]));
      for (const code of ['1010', '1030', '1040']) {
        assert(byCode.has(code), `Liquidity account ${code} present`, byCode.get(code)?.accountName || 'missing');
      }

      const balancesBefore = Object.fromEntries(
        ['1010', '1030', '1040'].map((c) => [c, Number(byCode.get(c)?.currentBalance ?? 0)]),
      );
      lines.push(
        `\nBalances before: cash=${balancesBefore['1010']} bank=${balancesBefore['1030']} momo=${balancesBefore['1040']}\n`,
      );

      const today = new Date().toISOString().slice(0, 10);
      const postedIds = [];

      for (const scenario of SCENARIOS) {
        lines.push(`\n### ${scenario.label} (${scenario.from} → ${scenario.to})\n`);
        if (!byCode.has(scenario.from) || !byCode.has(scenario.to)) {
          skipped(scenario.id, 'required account missing');
          continue;
        }

        const create = await req('POST', '/api/treasury/transfers', {
          token,
          body: {
            transactionDate: today,
            fromAccountCode: scenario.from,
            toAccountCode: scenario.to,
            amount: AMOUNT,
            memo: `PROOF ${scenario.id}`,
            postImmediately: true,
          },
        });

        const doc = create.data?.data;
        if (create.status !== 201 && create.status !== 200) {
          bad(`${scenario.id} create/post`, errMsg(create));
          continue;
        }

        assert(
          doc?.status === 'POSTED' && doc?.documentType === 'TREASURY_TRANSFER',
          `${scenario.id} posted TREASURY_TRANSFER`,
          `${doc?.documentNumber} journal=${doc?.journalEntryId ?? 'none'}`,
        );
        assert(Boolean(doc?.journalEntryId), `${scenario.id} has journalEntryId`);

        const detail = await req('GET', `/api/treasury/documents/${doc.id}`, { token });
        const full = detail.data?.data;
        const linesDoc = full?.lines ?? [];
        const debitTo = linesDoc.find(
          (l) => l.accountCode === scenario.to && Number(l.debitAmount) > 0,
        );
        const creditFrom = linesDoc.find(
          (l) => l.accountCode === scenario.from && Number(l.creditAmount) > 0,
        );
        assert(
          Boolean(debitTo) && Number(debitTo.debitAmount) === AMOUNT,
          `${scenario.id} DR ${scenario.to} = ${AMOUNT}`,
          debitTo ? String(debitTo.debitAmount) : 'missing',
        );
        assert(
          Boolean(creditFrom) && Number(creditFrom.creditAmount) === AMOUNT,
          `${scenario.id} CR ${scenario.from} = ${AMOUNT}`,
          creditFrom ? String(creditFrom.creditAmount) : 'missing',
        );

        postedIds.push({ id: doc.id, scenario: scenario.id, number: doc.documentNumber });
      }

      lines.push('\n### Reversals (non-destructive cleanup)\n');
      for (const p of postedIds) {
        const rev = await req('POST', `/api/treasury/documents/${p.id}/reverse`, {
          token,
          body: { reason: `PROOF reverse ${p.scenario}` },
        });
        const reversal = rev.data?.data?.reversal;
        assert(
          (rev.status === 200 || rev.status === 201) &&
            reversal?.documentType === 'TREASURY_REVERSAL' &&
            reversal?.status === 'POSTED' &&
            Boolean(reversal?.journalEntryId),
          `Reverse ${p.number}`,
          reversal?.documentNumber || errMsg(rev),
        );
      }

      const accountsAfter = await req('GET', '/api/treasury/liquidity-accounts', { token });
      const afterItems = accountsAfter.data?.data?.items ?? [];
      const afterMap = new Map(afterItems.map((a) => [a.accountCode, Number(a.currentBalance ?? 0)]));
      for (const code of ['1010', '1030', '1040']) {
        const before = balancesBefore[code];
        const after = afterMap.get(code) ?? 0;
        assert(
          Math.abs(after - before) < 0.0001,
          `Balance restored ${code}`,
          `before=${before} after=${after}`,
        );
      }
    }
  }
} catch (e) {
  bad('Live API exception', e instanceof Error ? e.message : String(e));
} finally {
  if (token && !flagWasOn) {
    const restore = await req('PATCH', '/api/system-settings', {
      token,
      body: { treasuryDocumentEnabled: false },
    });
    assert(
      restore.status === 200 && restore.data?.data?.treasuryDocumentEnabled === false,
      'Restore treasuryDocumentEnabled=false',
      errMsg(restore),
    );
  }
}

lines.push('\n## Verdict\n');
lines.push(`- PASS: ${pass}`);
lines.push(`- FAIL: ${fail}`);
lines.push(`- SKIP: ${skip}`);
const verdict = fail === 0 ? 'PASS' : 'FAIL';
lines.push(`\n**Overall: ${verdict}**\n`);

writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
console.log('\n' + '─'.repeat(60));
console.log(` Wrote ${OUT}`);
console.log(` PASS=${pass} FAIL=${fail} SKIP=${skip} → ${verdict}`);
console.log('─'.repeat(60));
process.exit(fail === 0 ? 0 : 1);
