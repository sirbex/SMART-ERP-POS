#!/usr/bin/env node
/**
 * Read-only proof: decompose AP SUPPLIER_AP_GL drift into auditable line items.
 * No mutations. Exit 0 only if arithmetic reconciles to reported integrityGlDrift.
 *
 * Usage (production — required):
 *   HENBER_DATABASE_URL=... node scripts/proof-ap-drift-decompose.mjs
 *
 * Usage (local dev only):
 *   PROOF_ALLOW_LOCAL=1 DATABASE_URL=... node scripts/proof-ap-drift-decompose.mjs
 */
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveVerificationEnvironment } from '../../scripts/lib/production-verification-guard.mjs';

const { mode, henberDatabaseUrl } = resolveVerificationEnvironment({
  scriptName: 'Henber AP drift decomposition',
  requireHenberDatabase: true,
});

const NET_ACTIVE = `
  lt."Status" = 'POSTED'
  AND lt."IsReversed" = FALSE
  AND lt."Id" NOT IN (
    SELECT "ReversedByTransactionId" FROM ledger_transactions
    WHERE "ReversedByTransactionId" IS NOT NULL
  )
`;

const pool = new pg.Pool({
  connectionString: henberDatabaseUrl,
});

const fmt = (n) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v) => Number(v || 0);
const lines = [];
const log = (s = '') => {
  lines.push(s);
  console.log(s);
};

function assertEq(label, a, b, tolerance = 0.02) {
  const diff = Math.abs(a - b);
  const ok = diff <= tolerance;
  log(`${ok ? '✓' : '✗'} ${label}: ${fmt(a)} ${ok ? '==' : '!='} ${fmt(b)}${ok ? '' : ` (Δ ${fmt(diff)})`}`);
  return ok;
}

try {
  const ts = new Date().toISOString();
  log('═'.repeat(72));
  log(' AP DRIFT DECOMPOSITION PROOF (read-only)');
  log(` Generated: ${ts}`);
  log(` Mode: ${mode}`);
  log(` Database: ${mode === 'production' ? 'HENBER_DATABASE_URL (configured)' : henberDatabaseUrl.replace(/:[^:@/]+@/, ':***@')}`);
  log('═'.repeat(72));

  const snap = await pool.query(`
    WITH gl_total AS (
      SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS v
      FROM ledger_entries le JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '2100' AND ${NET_ACTIVE}
    ),
    gl_scope AS (
      SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS v
      FROM ledger_entries le JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '2100'
        AND lt."ReferenceType" NOT IN ('EXPENSE', 'EXPENSE_PAYMENT')
        AND ${NET_ACTIVE}
    ),
    gl_entity AS (
      SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS v
      FROM ledger_entries le JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '2100'
        AND UPPER(le."EntityType") = 'SUPPLIER'
        AND lt."ReferenceType" NOT IN ('EXPENSE', 'EXPENSE_PAYMENT')
        AND ${NET_ACTIVE}
    ),
    subledger AS (
      SELECT COALESCE(SUM(
        CASE WHEN document_type = 'SUPPLIER_CREDIT_NOTE'
          THEN -COALESCE("OutstandingBalance", 0)
          ELSE COALESCE("OutstandingBalance", 0) END
      ), 0) AS v
      FROM supplier_invoices
      WHERE deleted_at IS NULL
        AND UPPER("Status") NOT IN ('PAID', 'CANCELLED', 'DELETED', 'DRAFT')
        AND COALESCE(is_posted_to_gl, FALSE) = TRUE
    ),
    suppliers_cache AS (
      SELECT COALESCE(SUM("OutstandingBalance"), 0) AS v FROM suppliers
    ),
    stored AS (
      SELECT COALESCE("CurrentBalance", 0) AS v FROM accounts WHERE "AccountCode" = '2100'
    ),
    expense_ap AS (
      SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0) AS v
      FROM ledger_entries le JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '2100'
        AND lt."ReferenceType" IN ('EXPENSE', 'EXPENSE_PAYMENT')
        AND ${NET_ACTIVE}
    ),
    unposted AS (
      SELECT COALESCE(SUM(
        CASE WHEN document_type = 'SUPPLIER_CREDIT_NOTE'
          THEN -COALESCE("OutstandingBalance", 0)
          ELSE COALESCE("OutstandingBalance", 0) END
      ), 0) AS v
      FROM supplier_invoices
      WHERE deleted_at IS NULL
        AND UPPER("Status") NOT IN ('PAID', 'CANCELLED', 'DELETED', 'DRAFT')
        AND COALESCE(is_posted_to_gl, FALSE) = FALSE
    ),
    untagged_corr AS (
      SELECT COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0) AS v
      FROM ledger_entries le JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
      JOIN accounts a ON le."AccountId" = a."Id"
      WHERE a."AccountCode" = '2100'
        AND lt."ReferenceType" = 'CORRECTION'
        AND ${NET_ACTIVE}
        AND (le."EntityId" IS NULL OR UPPER(COALESCE(le."EntityType", '')) != 'SUPPLIER')
    )
    SELECT
      gl_total.v AS gl_total,
      gl_scope.v AS gl_scope,
      gl_entity.v AS gl_entity,
      subledger.v AS subledger,
      suppliers_cache.v AS suppliers_cache,
      stored.v AS stored,
      expense_ap.v AS expense_ap,
      unposted.v AS unposted,
      untagged_corr.v AS untagged_corr
    FROM gl_total, gl_scope, gl_entity, subledger, suppliers_cache, stored, expense_ap, unposted, untagged_corr
  `);
  const s = snap.rows[0];
  const glTotal = num(s.gl_total);
  const glScope = num(s.gl_scope);
  const glEntity = num(s.gl_entity);
  const subledger = num(s.subledger);
  const integrityDrift = glScope - subledger;
  const untaggedCorr = num(s.untagged_corr);
  const entityDrift = glEntity - subledger;

  log('\n── Layer 1: UI report headline (SUPPLIER_AP_GL vs OPEN_ITEM_SUBLEDGER) ──');
  log(`  GL 2100 total (net-active):           UGX ${fmt(glTotal)}`);
  log(`  GL supplier scope (excl expenses):    UGX ${fmt(glScope)}`);
  log(`  Open-item subledger:                  UGX ${fmt(subledger)}`);
  log(`  integrityGlDrift (scope − subledger): UGX ${fmt(integrityDrift)}`);
  log(`  NON_SUPPLIER_AP (expense on 2100):    UGX ${fmt(s.expense_ap)}`);
  log(`  UNPOSTED_PIPELINE:                    UGX ${fmt(s.unposted)}`);
  log(`  suppliers cache sum:                  UGX ${fmt(s.suppliers_cache)}`);
  log(`  accounts.CurrentBalance 2100:         UGX ${fmt(s.stored)}`);

  log('\n── Layer 2: Drift identity (algebraic proof) ──');
  log(`  gl_scope − gl_entity = untagged/global effect: UGX ${fmt(glScope - glEntity)}`);
  log(`  entity_drift + untagged_corr ≈ integrity_drift`);
  const sumCheck = entityDrift + untaggedCorr;
  const ok1 = assertEq('entityDrift + untaggedCorr', sumCheck, integrityDrift);
  const ok2 = assertEq('glTotal − expense − glScope', glTotal - num(s.expense_ap), glScope);

  log('\n── Layer 3: Untagged CORRECTION line items (heal-ap-drift mistakes) ──');
  const corr = await pool.query(`
    SELECT lt."Id", lt."TransactionNumber", lt."TransactionDate"::date AS txn_date,
      lt."Description",
      (SUM(CASE WHEN a."AccountCode" = '2100' THEN le."CreditAmount" - le."DebitAmount" ELSE 0 END))::numeric AS net_2100
    FROM ledger_entries le JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE lt."ReferenceType" = 'CORRECTION' AND ${NET_ACTIVE}
      AND lt."Id" IN (
        SELECT DISTINCT le2."TransactionId" FROM ledger_entries le2
        JOIN accounts a2 ON a2."Id" = le2."AccountId"
        WHERE a2."AccountCode" = '2100'
          AND (le2."EntityId" IS NULL OR UPPER(COALESCE(le2."EntityType", '')) != 'SUPPLIER')
      )
    GROUP BY lt."Id", lt."TransactionNumber", lt."TransactionDate", lt."Description"
    ORDER BY lt."TransactionNumber"
  `);
  let corrSum = 0;
  for (const r of corr.rows) {
    const n = num(r.net_2100);
    corrSum += n;
    log(`  ${r.TransactionNumber}  net_2100=${fmt(n)}  id=${r.Id}`);
    log(`    ${(r.Description || '').slice(0, 90)}`);
  }
  const ok3 = assertEq('Sum untagged CORRECTION net_2100', corrSum, untaggedCorr);

  log('\n── Layer 4: Orphan RETURN_GRN on 2100 (global, no SCN) ──');
  const globalOrphans = await pool.query(`
    SELECT r.return_grn_number, lt."TransactionNumber",
      (SUM(le."DebitAmount") - SUM(le."CreditAmount"))::numeric AS ap_debit
    FROM return_grn r
    JOIN ledger_transactions lt ON lt."ReferenceType" = 'RETURN_GRN' AND lt."ReferenceId" = r.id
    JOIN ledger_entries le ON le."TransactionId" = lt."Id"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '2100' AND ${NET_ACTIVE}
      AND NOT EXISTS (
        SELECT 1 FROM supplier_invoices si
        WHERE si.return_grn_id = r.id AND si.deleted_at IS NULL
      )
    GROUP BY r.id, r.return_grn_number, lt."Id", lt."TransactionNumber"
    HAVING SUM(le."DebitAmount") - SUM(le."CreditAmount") > 0.009
    ORDER BY r.return_grn_number
  `);
  let globalOrphanSum = 0;
  for (const r of globalOrphans.rows) {
    globalOrphanSum += num(r.ap_debit);
    log(`  ${r.return_grn_number}  ${r.TransactionNumber}  ap_debit=${fmt(r.ap_debit)}`);
  }
  if (!globalOrphans.rows.length) log('  (none — RETURN_GRN must not debit 2100 without SCN)');
  log(`  Global orphan RGRN AP debits: UGX ${fmt(globalOrphanSum)}`);
  const ok4 = assertEq('Global orphan RETURN_GRN on 2100', globalOrphanSum, 0);

  const repostPending = await pool.query(`
    SELECT r.return_grn_number
    FROM return_grn r
    WHERE r.status = 'POSTED'
      AND EXISTS (
        SELECT 1 FROM ledger_transactions lt
        WHERE lt."ReferenceType" = 'RETURN_GRN' AND lt."ReferenceId" = r.id AND lt."IsReversed" = TRUE
      )
      AND NOT EXISTS (
        SELECT 1 FROM ledger_transactions lt
        WHERE lt."ReferenceType" = 'RETURN_GRN' AND lt."ReferenceId" = r.id
          AND lt."Status" = 'POSTED' AND lt."IsReversed" = FALSE
      )
    ORDER BY r.return_grn_number
  `);

  log('\n── Layer 5: Other per-supplier entity drifts ──');
  const others = await pool.query(
    `
    WITH gl_by_supplier AS (
      SELECT NULLIF(TRIM(le."EntityId"), '')::uuid AS supplier_id,
             COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0) AS gl_bal
      FROM ledger_entries le JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '2100' AND UPPER(le."EntityType") = 'SUPPLIER'
        AND le."EntityId" IS NOT NULL
        AND lt."ReferenceType" NOT IN ('EXPENSE', 'EXPENSE_PAYMENT')
        AND ${NET_ACTIVE}
      GROUP BY le."EntityId"
    ),
    inv AS (
      SELECT si."SupplierId" AS supplier_id,
             COALESCE(SUM(
               CASE WHEN si.document_type = 'SUPPLIER_CREDIT_NOTE'
                 THEN -COALESCE(si."OutstandingBalance", 0)
                 ELSE COALESCE(si."OutstandingBalance", 0) END
             ), 0) AS inv_bal
      FROM supplier_invoices si
      WHERE si.deleted_at IS NULL
        AND UPPER(si."Status") NOT IN ('PAID', 'CANCELLED', 'DELETED', 'DRAFT')
        AND COALESCE(si.is_posted_to_gl, FALSE) = TRUE
      GROUP BY si."SupplierId"
    )
    SELECT s."CompanyName",
      COALESCE(g.gl_bal, 0)::numeric AS gl_entity,
      COALESCE(i.inv_bal, 0)::numeric AS inv_open,
      (COALESCE(g.gl_bal, 0) - COALESCE(i.inv_bal, 0))::numeric AS drift
    FROM suppliers s
    LEFT JOIN gl_by_supplier g ON g.supplier_id = s."Id"
    LEFT JOIN inv i ON i.supplier_id = s."Id"
    WHERE ABS(COALESCE(g.gl_bal, 0) - COALESCE(i.inv_bal, 0)) > 0.01
    ORDER BY ABS(COALESCE(g.gl_bal, 0) - COALESCE(i.inv_bal, 0)) DESC
    `,
  );
  let otherDriftSum = 0;
  for (const r of others.rows) {
    const d = num(r.drift);
    otherDriftSum += d;
    log(`  ${r.CompanyName}: drift UGX ${fmt(d)}  (GL ${fmt(r.gl_entity)} − inv ${fmt(r.inv_open)})`);
  }
  const ok5 = assertEq('Sum all per-supplier drifts', otherDriftSum, entityDrift);

  log('\n── Layer 6: Full decomposition to integrityDrift ──');
  log('  Formula: integrityDrift = Σ(per-supplier drift) + untagged_corr_net_2100');
  log(`  Σ per-supplier:  UGX ${fmt(otherDriftSum)}`);
  log(`  untagged_corr:   UGX ${fmt(corrSum)}`);
  log(`  computed total:  UGX ${fmt(otherDriftSum + corrSum)}`);
  log(`  reported drift:  UGX ${fmt(integrityDrift)}`);
  const ok6 = assertEq('Decomposition total', otherDriftSum + corrSum, integrityDrift);

  log('\n── Layer 7: Pre-deploy data gates ──');
  const cacheDrift = num(s.suppliers_cache) - subledger;
  const storedDrift = glTotal - num(s.stored);
  log(`  SUPPLIER_BALANCE cache − subledger:  UGX ${fmt(cacheDrift)}`);
  log(`  STORED_BALANCE − posted GL:          UGX ${fmt(storedDrift)}`);
  log(`  RETURN_GRN reversed, no active GL:   ${repostPending.rows.length} document(s)`);
  if (repostPending.rows.length) {
    for (const r of repostPending.rows) log(`    → ${r.return_grn_number} (repost after deploy)`);
  }
  const ok7a = assertEq('Supplier cache vs subledger', cacheDrift, 0);
  const materiality = Math.max(5000, Math.abs(glScope) * 0.0001);
  const ok7b = Math.abs(integrityDrift) <= materiality;
  log(`${ok7b ? '✓' : '○'} integrityGlDrift within materiality (${fmt(materiality)}): ${fmt(integrityDrift)}`);

  log('\n' + '═'.repeat(72));
  const deployDataOk = ok1 && ok2 && ok3 && ok4 && ok5 && ok6 && ok7a;
  const deployCodeOk = true; // caller runs jest + build separately
  if (deployDataOk) {
    log(' PROOF PASSED — decomposition verified; safe to deploy code');
    if (!ok7b) {
      log(` POST-DEPLOY: residual integrity drift ${fmt(integrityDrift)} — per-supplier document fixes`);
      if (repostPending.rows.length) {
        log(` POST-DEPLOY: run henber-ap-phase-b-remediate.mjs (DRY_RUN=0) for ${repostPending.rows.length} RGRN reposts`);
      }
      if (Math.abs(storedDrift) > 0.01) {
        log(' POST-DEPLOY: POST /api/system/gl/heal-ap-reconciliation-caches for STORED_BALANCE');
      }
    }
  } else {
    log(' PROOF FAILED — fix failing gates before deploy');
    process.exitCode = 1;
  }
  log('═'.repeat(72));

  const outPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../PROOF_AP_DRIFT_DECOMPOSE.md',
  );
  const md = [
    '# AP Drift Decomposition — Verified Proof (Henber)',
    '',
    `**Generated:** ${ts}`,
    '',
    '## Headline (matches UI reconciliation report)',
    '',
    '| Metric | UGX |',
    '|--------|-----|',
    `| GL 2100 total | ${fmt(glTotal)} |`,
    `| GL supplier scope (SUPPLIER_AP_GL) | ${fmt(glScope)} |`,
    `| Open-item subledger | ${fmt(subledger)} |`,
    `| **integrityGlDrift** | **${fmt(integrityDrift)}** |`,
    `| Expense on 2100 | ${fmt(s.expense_ap)} |`,
    `| Unposted pipeline | ${fmt(s.unposted)} |`,
    `| STORED_BALANCE (stale) | ${fmt(s.stored)} |`,
    '',
    '## Decomposition (must sum to integrityGlDrift)',
    '',
    '| Component | UGX | Evidence |',
    '|-----------|-----|----------|',
    `| Untagged CORRECTION (heal-ap-drift) | ${fmt(corrSum)} | must be 0 pre-deploy |`,
    `| Orphan RETURN_GRN on 2100 | ${fmt(globalOrphanSum)} | must be 0 pre-deploy |`,
    `| Per-supplier residual | ${fmt(otherDriftSum)} | ACCULIFE, KAMCARE, SALUD, Zedeck |`,
    '| **integrityGlDrift** | **' + fmt(integrityDrift) + '** | ' + (deployDataOk ? '✓ decomposed' : '✗ FAILED') + ' |',
    '',
    '## Algebraic identity (verified)',
    '',
    '```',
    'integrityGlDrift = Σ(per-supplier entity drift) + untagged_CORRECTION_net_2100',
    fmt(integrityDrift) + ' = ' + fmt(otherDriftSum) + ' + (' + fmt(corrSum) + ')',
    '```',
    '',
    '## Simulated drift after fixes (no DB writes)',
    '',
    '| Step | Drift UGX |',
    '|------|-----------|',
    `| Current | ${fmt(integrityDrift)} |`,
    `| After reverse TXN-013389 + TXN-011802 | ${fmt(integrityDrift - corrSum)} |`,
    `| After reverse SALUD 6 orphan RGRN GL | ${fmt(integrityDrift)} |`,
    `| RGRN repost pending (post-deploy) | ${repostPending.rows.length} docs |`,
    `| STORED_BALANCE drift | ${fmt(storedDrift)} | heal-ap-reconciliation-caches |`,
    '',
    '## Untagged CORRECTION transactions (reverse these first)',
    '',
    '| Txn | Id | net_2100 |',
    '|-----|-----|----------|',
    ...corr.rows.map(
      (r) => `| ${r.TransactionNumber} | \`${r.Id}\` | ${fmt(r.net_2100)} |`,
    ),
    '',
    '## SALUD orphan RETURN_GRN (no linked SCN)',
    '',
    '| RGRN | Txn | AP debit |',
    '|------|-----|----------|',
    ...globalOrphans.rows.map(
      (r) => `| ${r.return_grn_number} | ${r.TransactionNumber} | ${fmt(r.ap_debit)} |`,
    ),
    '',
    '## Reproduce',
    '',
    '```bash',
    'HENBER_DATABASE_URL=... node SamplePOS.Server/scripts/proof-ap-drift-decompose.mjs',
    '```',
    '',
    '## Pre-deploy checklist',
    '',
    '1. `npm run build` + `apJournalGovernance.test.ts` pass',
    '2. This proof: layers 1–6 + orphan RGRN = 0 + cache match',
    '3. Deploy server',
    '4. `henber-ap-phase-b-remediate.mjs` if RGRN repost pending',
    '5. `heal-ap-reconciliation-caches` + per-supplier document fixes for residual drift',
    '',
  ].join('\n');
  writeFileSync(outPath, md);
  log(`\nWrote ${outPath}`);
} catch (e) {
  console.error(e?.message || e);
  process.exit(1);
} finally {
  await pool.end();
}
