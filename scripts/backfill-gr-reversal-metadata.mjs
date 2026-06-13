#!/usr/bin/env node
/**
 * Backfill goods_receipts.reversed_by_return_grn_id for legacy full reversals
 * (posted Return GRN returned all lines, but metadata was never set — pre-522 orchestration).
 *
 * Usage:
 *   node scripts/backfill-gr-reversal-metadata.mjs [--tenant=henber] [--receipt=GR-2026-0001] [--execute]
 */
import pg from 'pg';

const execute = process.argv.includes('--execute');
const receiptFilter = (() => {
  const m = process.argv.find((a) => a.startsWith('--receipt='));
  return m ? m.slice('--receipt='.length) : null;
})();

function loadDatabaseUrl() {
  const tenantArg = process.argv.find((a) => a.startsWith('--tenant='));
  const tenant = tenantArg ? tenantArg.slice('--tenant='.length) : 'henber';
  if (process.env.HENBER_DATABASE_URL && tenant === 'henber') return process.env.HENBER_DATABASE_URL;
  if (process.env.DATABASE_URL) {
    if (tenant === 'default' || tenant === 'system') return process.env.DATABASE_URL;
    return process.env.DATABASE_URL.replace(/\/([^/?]+)(\?.*)?$/, `/pos_tenant_${tenant.replace(/-/g, '_')}$2`);
  }
  throw new Error('Set HENBER_DATABASE_URL or DATABASE_URL');
}

const LEGACY_FULLY_REVERSED = `
  EXISTS (SELECT 1 FROM return_grn rg WHERE rg.grn_id = gr.id AND rg.status = 'POSTED')
  AND NOT EXISTS (
    SELECT 1
    FROM goods_receipt_items gri
    WHERE gri.goods_receipt_id = gr.id
      AND COALESCE(gri.received_quantity, 0)::numeric > COALESCE((
        SELECT SUM(rl.quantity)
        FROM return_grn_lines rl
        INNER JOIN return_grn rg2 ON rg2.id = rl.rgrn_id AND rg2.status = 'POSTED'
        WHERE rg2.grn_id = gri.goods_receipt_id
          AND rl.product_id = gri.product_id
      ), 0)::numeric + 0.0001
  )
`;

const pool = new pg.Pool({ connectionString: loadDatabaseUrl() });

async function main() {
  const colCheck = await pool.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'goods_receipts' AND column_name = 'reversed_by_return_grn_id'
  `);
  if (colCheck.rows.length === 0) {
    console.error('FATAL: migration 522 not applied — run migrate:tenants first');
    process.exit(1);
  }

  const params = [];
  let receiptClause = '';
  if (receiptFilter) {
    params.push(receiptFilter);
    receiptClause = `AND gr.receipt_number = $${params.length}`;
  }

  const { rows: candidates } = await pool.query(
    `SELECT gr.id, gr.receipt_number,
            (SELECT rg.id FROM return_grn rg
             WHERE rg.grn_id = gr.id AND rg.status = 'POSTED'
             ORDER BY rg.posted_at DESC NULLS LAST, rg.created_at DESC
             LIMIT 1) AS rgrn_id,
            (SELECT rg.return_grn_number FROM return_grn rg
             WHERE rg.grn_id = gr.id AND rg.status = 'POSTED'
             ORDER BY rg.posted_at DESC NULLS LAST, rg.created_at DESC
             LIMIT 1) AS rgrn_number
     FROM goods_receipts gr
     WHERE gr.status = 'COMPLETED'
       AND gr.reversed_by_return_grn_id IS NULL
       AND ${LEGACY_FULLY_REVERSED}
       ${receiptClause}
     ORDER BY gr.receipt_number`,
    params,
  );

  console.log(`Found ${candidates.length} GR(s) with legacy full reversal (no metadata)`);
  for (const r of candidates) {
    console.log(`  ${r.receipt_number} → ${r.rgrn_number || r.rgrn_id}`);
  }

  if (!execute) {
    console.log('\nDry run — pass --execute to apply backfill');
    return;
  }

  if (candidates.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.allow_gr_reversal_metadata = 'true'`);
    let updated = 0;
    for (const r of candidates) {
      if (!r.rgrn_id) continue;
      const res = await client.query(
        `UPDATE goods_receipts
         SET reversed_by_return_grn_id = $1,
             reversal_timestamp = COALESCE(reversal_timestamp, CURRENT_TIMESTAMP),
             reversal_reason = COALESCE(reversal_reason, 'Backfill: inferred from posted Return GRN'),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND reversed_by_return_grn_id IS NULL`,
        [r.rgrn_id, r.id],
      );
      updated += res.rowCount ?? 0;
    }
    await client.query('COMMIT');
    console.log(`\nUpdated ${updated} goods receipt(s)`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
