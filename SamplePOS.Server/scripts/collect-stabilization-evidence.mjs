#!/usr/bin/env node
/**
 * Phase F0 — collect stabilization evidence after deploy.
 *
 * Usage:
 *   BASE_URL=https://henber.wizarddigital-inv.com \
 *   TEST_EMAIL=... TEST_PASSWORD=... \
 *   HENBER_DATABASE_URL=... \
 *   node SamplePOS.Server/scripts/collect-stabilization-evidence.mjs
 *
 * Writes docs/FINANCIAL_STABILIZATION_EVIDENCE.md (append cycle section).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.BASE_URL || 'https://henber.wizarddigital-inv.com';
const EMAIL = process.env.TEST_EMAIL || '';
const PASSWORD = process.env.TEST_PASSWORD || '';
const OUT = path.join(root, 'docs/FINANCIAL_STABILIZATION_EVIDENCE.md');

const git = (args) => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return (r.stdout || '').trim();
};

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  if (!res.ok) throw new Error(`login HTTP ${res.status}`);
  const json = await res.json();
  return json.data?.token ?? json.data?.accessToken;
}

async function apiGet(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json, deprecated: res.headers.get('deprecation') };
}

const lines = [];
const log = (s = '') => {
  lines.push(s);
  console.log(s);
};

async function main() {
  const now = new Date().toISOString();
  const head = git(['rev-parse', 'HEAD']);
  const origin = git(['rev-parse', 'origin/main']);

  log('## Stabilization cycle entry');
  log('');
  log(`| Field | Value |`);
  log(`|-------|-------|`);
  log(`| Collected | ${now} |`);
  log(`| Local HEAD | \`${head}\` |`);
  log(`| origin/main | \`${origin}\` |`);
  log(`| Target tenant | ${BASE} |`);
  log(`| Framework phase | F0 (legacy deprecated, not retired) |`);
  log('');

  // Health
  try {
    const h = await fetch(`${BASE}/api/health`);
    log(`- Health: ${h.ok ? 'OK' : `HTTP ${h.status}`}`);
  } catch (e) {
    log(`- Health: ERROR ${e.message}`);
  }

  if (!EMAIL || !PASSWORD) {
    log('- API evidence: SKIPPED (set TEST_EMAIL / TEST_PASSWORD)');
  } else {
    const token = await login();
    log('- Login: OK');

    for (const [label, path] of [
      ['Financial health', '/api/erp-accounting/reconciliation/financial-health'],
      ['Consumer audit', '/api/erp-accounting/reconciliation/stabilization/consumer-audit'],
      ['Parity', '/api/erp-accounting/reconciliation/stabilization/parity'],
      ['Governance dashboard', '/api/erp-accounting/reconciliation/governance/dashboard'],
    ]) {
      const r = await apiGet(path, token);
      if (!r.ok) {
        log(`- ${label}: HTTP ${r.status}`);
        continue;
      }
      const data = r.json.data;
      if (label === 'Financial health' && Array.isArray(data)) {
        const blocked = data.filter((d) => d.periodCloseBlocked).map((d) => d.domain);
        log(`- ${label}: ${blocked.length ? `BLOCKED [${blocked.join(', ')}]` : 'CLEAR'}`);
      } else if (label === 'Parity' && data?.parity) {
        log(`- ${label}: ok=${data.parity.ok} mismatches=${data.parity.mismatches?.length ?? 0}`);
      } else if (label === 'Consumer audit') {
        log(`- ${label}: ${data?.surfaces?.length ?? 0} legacy surfaces cataloged`);
      } else {
        log(`- ${label}: OK`);
      }
    }
  }

  // DB baseline proof
  log('');
  log('### Framework baseline proof');
  const proof = spawnSync(
    'npm',
    ['run', 'proof:framework-baseline'],
    { cwd: path.join(root, 'SamplePOS.Server'), encoding: 'utf8', shell: true },
  );
  if (proof.status === 0) {
    log('- `npm run proof:framework-baseline`: PASS');
  } else {
    log('- `npm run proof:framework-baseline`: FAIL (see console)');
    if (proof.stderr) log('```\n' + proof.stderr.slice(0, 2000) + '\n```');
  }

  log('');
  log('### Phase F exit criteria status');
  log('');
  log('| Criterion | This cycle |');
  log('|-----------|------------|');
  log('| Legacy endpoint usage | Review `[LEGACY RECON]` production logs |');
  log('| Framework parity | Known AP SQL mismatch documented; PARITY_STRICT for CI only |');
  log('| Dashboard adoption | Pending finance sign-off |');
  log('| Regression suite | post-deploy-financial-smoke + unit tests |');
  log('| Documentation | FINANCIAL_RECONCILIATION_FRAMEWORK.md + LEGACY audit |');
  log('| Rollback | Legacy code paths remain in repo through F0 |');
  log('');

  const header = `# Financial Stabilization Evidence (Phase F0)

Operational evidence log for the Financial Integrity Framework stabilization period.
**Legacy reconciliation is NOT retired until all Phase F exit criteria are met.**

See [LEGACY_RECONCILIATION_CONSUMER_AUDIT.md](./LEGACY_RECONCILIATION_CONSUMER_AUDIT.md) for governance gates.

---

`;
  const existing = existsSync(OUT) ? readFileSync(OUT, 'utf8') : header;
  const body = existing.startsWith('# Financial Stabilization') ? existing : header + existing;
  writeFileSync(OUT, body.trimEnd() + '\n\n' + lines.join('\n') + '\n');
  log(`\nWrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
