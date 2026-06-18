#!/usr/bin/env node
/**
 * Compare tenant DB columns against a reference tenant (Henber by default).
 *
 * Usage:
 *   POSTGRES_CONTAINER=samplepos-postgres \
 *   REFERENCE_DB=pos_tenant_henber_pharmacy \
 *   TARGET_DB=pos_tenant_bliss_interior_ltd \
 *   node scripts/audit-tenant-schema-drift.mjs
 */
import { execSync } from 'child_process';

const container = process.env.POSTGRES_CONTAINER || 'samplepos-postgres';
const referenceDb = process.env.REFERENCE_DB || 'pos_tenant_henber_pharmacy';
const targetDb = process.env.TARGET_DB || process.argv[2];

if (!targetDb) {
  console.error('Usage: TARGET_DB=pos_tenant_xxx node scripts/audit-tenant-schema-drift.mjs');
  process.exit(1);
}

const tables = (
  process.env.TABLES ||
  'customers,customer_groups,price_groups,price_rules,pricing_tiers,products,product_uoms,uoms,quotations,quotation_items'
).split(',');

function fetchColumns(db) {
  const tableList = tables.map((t) => `'${t}'`).join(',');
  const sql = `SELECT table_name||'|'||column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN (${tableList}) ORDER BY 1;`;
  const out = execSync(
    `docker exec ${container} psql -U postgres -d ${db} -t -A -c "${sql}"`,
    { encoding: 'utf-8' }
  );
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .sort();
}

const refCols = fetchColumns(referenceDb);
const targetCols = fetchColumns(targetDb);
const missing = refCols.filter((c) => !targetCols.includes(c));
const extra = targetCols.filter((c) => !refCols.includes(c));

console.log(`\n=== Schema drift: ${targetDb} vs ${referenceDb} ===`);
console.log(`Reference columns: ${refCols.length}`);
console.log(`Target columns:    ${targetCols.length}`);
console.log(`Missing on target: ${missing.length}`);
console.log(`Extra on target:   ${extra.length}`);

if (missing.length) {
  console.log('\n--- Missing on target ---');
  for (const line of missing) console.log(`  ${line.replace('|', '.')}`);
}

if (extra.length) {
  console.log('\n--- Extra on target ---');
  for (const line of extra) console.log(`  ${line.replace('|', '.')}`);
}

process.exit(missing.length > 0 ? 1 : 0);
