#!/usr/bin/env node
/**
 * Phase 1A — static posting-path forensic audit (read-only).
 * Emits JSON + markdown summary for docs/PHASE_1A_POSTING_PATH_AUDIT.md refresh.
 *
 * Usage: node scripts/audit-posting-paths.mjs [--json]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSON_OUT = process.argv.includes('--json');

const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.git', 'coverage', 'release-evidence', 'samplepos.client/dist',
]);

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const allFiles = walk(ROOT);

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

function scanContent(files, extRe, patterns) {
  const hits = [];
  for (const f of files) {
    if (!extRe.test(f)) continue;
    const text = readFileSync(f, 'utf8');
    for (const { name, re } of patterns) {
      if (re.test(text)) hits.push({ rule: name, file: rel(f) });
    }
  }
  return hits;
}

const tsJsFiles = allFiles.filter((f) => /\.(ts|tsx|js|mjs|cjs)$/.test(f));
const sqlFiles = allFiles.filter((f) => f.endsWith('.sql'));

// ── 1. Direct ledger INSERT bypass (TypeScript) ─────────────────────────────
const ledgerInsertHits = [];
for (const f of tsJsFiles) {
  const r = rel(f);
  if (r.includes('accountingCore.ts')) continue;
  if (/\.test\.(ts|js|mjs)$/.test(r) || r.includes('__tests__')) continue;
  const text = readFileSync(f, 'utf8');
  if (/INSERT\s+INTO\s+ledger_(entries|transactions)/i.test(text)) {
    ledgerInsertHits.push(r);
  }
}

// ── 2. createJournalEntry / reverseTransaction callers ──────────────────────
const journalCallers = [];
for (const f of tsJsFiles) {
  const text = readFileSync(f, 'utf8');
  if (!/createJournalEntry|reverseTransaction/.test(text)) continue;
  const r = rel(f);
  if (r.includes('accountingCore.ts')) continue;
  const creates = (text.match(/createJournalEntry\s*\(/g) || []).length;
  const reverses = (text.match(/reverseTransaction\s*\(/g) || []).length;
  journalCallers.push({ file: r, createJournalEntry: creates, reverseTransaction: reverses });
}
journalCallers.sort((a, b) => (b.createJournalEntry + b.reverseTransaction) - (a.createJournalEntry + a.reverseTransaction));

// ── 3. glEntryService record* exports ───────────────────────────────────────
const glEntryPath = path.join(ROOT, 'SamplePOS.Server/src/services/glEntryService.ts');
const glEntryText = readFileSync(glEntryPath, 'utf8');
const recordFns = [...glEntryText.matchAll(/^export async function (record\w+)/gm)].map((m) => m[1]);

function fnUsesTxClient(fnName) {
  const re = new RegExp(`export async function ${fnName}[\\s\\S]*?(?=export async function |$)`);
  const block = glEntryText.match(re)?.[0] ?? '';
  return /txClient/.test(block);
}

function fnCallsCore(fnName) {
  const re = new RegExp(`export async function ${fnName}[\\s\\S]*?(?=export async function |$)`);
  const block = glEntryText.match(re)?.[0] ?? '';
  return /AccountingCore\.createJournalEntry|AccountingCore\.reverseTransaction/.test(block);
}

const glFacadeInventory = recordFns.map((fn) => ({
  function: fn,
  callsAccountingCore: fnCallsCore(fn),
  acceptsTxClient: fnUsesTxClient(fn),
}));

// ── 4. Repair / heal / remediate scripts ────────────────────────────────────
const repairPatterns = /heal|remediat|repair|drift|repost|fix-.*gl|integrity-repair/i;
const repairScripts = allFiles
  .filter((f) => /\.(mjs|ts|js|ps1|sh)$/.test(f) && repairPatterns.test(rel(f)))
  .map(rel)
  .sort();

// ── 5. SQL surface ──────────────────────────────────────────────────────────
const sqlPatterns = [
  { kind: 'INSERT ledger_entries', re: /INSERT\s+INTO\s+ledger_entries/i },
  { kind: 'INSERT ledger_transactions', re: /INSERT\s+INTO\s+ledger_transactions/i },
  { kind: 'UPDATE ledger', re: /UPDATE\s+ledger_(entries|transactions)/i },
  { kind: 'DELETE ledger', re: /DELETE\s+FROM\s+ledger_(entries|transactions)/i },
  { kind: 'CREATE TRIGGER ledger', re: /CREATE\s+TRIGGER[\s\S]*?ON\s+ledger_/i },
  { kind: 'CREATE TRIGGER post_*_to_ledger', re: /CREATE\s+TRIGGER\s+trg_post_\w+_to_ledger/i },
  { kind: 'CREATE FUNCTION GL', re: /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+fn_post_\w+_to_ledger/i },
];

const sqlSurface = [];
for (const f of sqlFiles) {
  const text = readFileSync(f, 'utf8');
  const r = rel(f);
  for (const { kind, re } of sqlPatterns) {
    if (re.test(text)) {
      const isMigration = r.includes('db/migrations/') || r.includes('shared/sql/');
      const isDisable = /DISABLE TRIGGER|DROP TRIGGER/i.test(text);
      sqlSurface.push({ file: r, kind, isMigration, disablesTriggers: isDisable });
    }
  }
}

// ── 6. txClient warnings in glEntryService callers ──────────────────────────
const noTxClientCallSites = [];
for (const f of tsJsFiles) {
  const r = rel(f);
  if (!r.startsWith('SamplePOS.Server/src/')) continue;
  const text = readFileSync(f, 'utf8');
  for (const fn of recordFns) {
    const callRe = new RegExp(`glEntryService\\.${fn}\\([^)]*\\)`, 'g');
    if (!callRe.test(text)) continue;
    // crude: if call doesn't include `client` as last arg context
    const blockRe = new RegExp(`${fn}\\([\\s\\S]{0,400}?\\)`, 'g');
    let m;
    while ((m = blockRe.exec(text)) !== null) {
      const call = m[0];
      if (!/,\s*client\s*\)|,\s*txClient\s*\)/.test(call) && !/UnitOfWork/.test(text.slice(Math.max(0, m.index - 200), m.index + 50))) {
        if (fnUsesTxClient(fn) && !r.includes('.test.') && !r.includes('glValidationService')) {
          noTxClientCallSites.push({ file: r, function: fn });
        }
      }
    }
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  bypassProof: {
    tsLedgerInsertsOutsideAccountingCore: ledgerInsertHits,
    tsBypassCount: ledgerInsertHits.length,
    verdict: ledgerInsertHits.length === 0
      ? 'PASS — TypeScript ledger writes only in accountingCore.ts'
      : 'FAIL — undocumented TS bypasses',
  },
  journalCallers,
  glFacadeInventory,
  repairScripts,
  sqlSurfaceSummary: {
    filesWithLedgerInsert: [...new Set(sqlSurface.filter((s) => s.kind.startsWith('INSERT')).map((s) => s.file))].length,
    activeGlPostingTriggerDefs: sqlSurface.filter((s) => s.kind.includes('post_')).length,
    disableOrDropMigrations: sqlSurface.filter((s) => s.disablesTriggers).map((s) => s.file),
  },
  txClientRiskCallSites: [...new Map(noTxClientCallSites.map((x) => [`${x.file}:${x.function}`, x])).values()],
};

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.bypassProof.tsBypassCount > 0 ? 1 : 0);
}

const lines = [];
const log = (s = '') => { lines.push(s); console.log(s); };

log('# Phase 1A — Static Audit Summary (auto-generated)');
log('');
log(`**Generated:** ${report.generatedAt}`);
log('');

log('## Zero bypass proof (TypeScript)');
log('');
if (report.bypassProof.verdict.startsWith('PASS')) {
  log(`✅ ${report.bypassProof.verdict}`);
} else {
  log(`❌ ${report.bypassProof.verdict}`);
  for (const f of ledgerInsertHits) log(`- ${f}`);
}
log('');

log('## glEntryService facade (' + recordFns.length + ' record* functions)');
log('');
log('| Function | AccountingCore | txClient param |');
log('|----------|----------------|----------------|');
for (const row of glFacadeInventory) {
  log(`| ${row.function} | ${row.callsAccountingCore ? '✅' : '❌'} | ${row.acceptsTxClient ? '✅' : '—'} |`);
}
log('');

log('## Journal callers (top 15 by volume)');
log('');
log('| File | createJournalEntry | reverseTransaction |');
log('|------|-------------------|-------------------|');
for (const row of journalCallers.slice(0, 15)) {
  log(`| ${row.file} | ${row.createJournalEntry} | ${row.reverseTransaction} |`);
}
log(`| … | **${journalCallers.length} files total** | |`);
log('');

log('## Repair / heal / remediate scripts (' + repairScripts.length + ')');
log('');
for (const s of repairScripts.slice(0, 40)) log(`- ${s}`);
if (repairScripts.length > 40) log(`- … and ${repairScripts.length - 40} more`);
log('');

log('## SQL ledger surface');
log('');
log(`- SQL files with ledger INSERT patterns: **${report.sqlSurfaceSummary.filesWithLedgerInsert}**`);
log(`- GL posting trigger definitions in repo: **${report.sqlSurfaceSummary.activeGlPostingTriggerDefs}** (disabled/dropped by migrations 250, 061)`);
log('');

log('## txClient risk call sites (heuristic)');
log('');
if (report.txClientRiskCallSites.length === 0) log('_None flagged._');
else for (const x of report.txClientRiskCallSites.slice(0, 20)) log(`- ${x.file} → ${x.function}()`);
log('');
log('Run `node scripts/ci-posting-guardrails.mjs` for CI enforcement.');

const outPath = path.join(ROOT, 'docs', 'PHASE_1A_STATIC_AUDIT_SNAPSHOT.md');
writeFileSync(outPath, lines.join('\n') + '\n');
log(`\nWrote ${rel(outPath)}`);

process.exit(report.bypassProof.tsBypassCount > 0 ? 1 : 0);
