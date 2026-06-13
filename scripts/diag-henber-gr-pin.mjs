#!/usr/bin/env node
/**
 * Read-only diagnostic: Henber GR billing lane + quick-login PIN readiness.
 *
 * Usage: node scripts/diag-henber-gr-pin.mjs [--receipt=GR-2026-0001]
 */
import pg from 'pg';

const receiptFilter = (() => {
  const m = process.argv.find((a) => a.startsWith('--receipt='));
  return m ? m.slice('--receipt='.length) : null;
})();

function loadDatabaseUrl() {
  if (process.env.HENBER_DATABASE_URL) return process.env.HENBER_DATABASE_URL;
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL.replace(/\/([^/?]+)(\?.*)?$/, '/pos_tenant_henber_pharmacy$2');
  }
  throw new Error('Set HENBER_DATABASE_URL or DATABASE_URL');
}

const LEGACY_FULLY_REVERSED = `
  EXISTS (SELECT 1 FROM return_grn rg WHERE rg.grn_id = gr.id AND rg.status = 'POSTED')
  AND NOT EXISTS (
    SELECT 1 FROM goods_receipt_items gri
    WHERE gri.goods_receipt_id = gr.id
      AND COALESCE(gri.received_quantity, 0)::numeric > COALESCE((
        SELECT SUM(rl.quantity) FROM return_grn_lines rl
        INNER JOIN return_grn rg2 ON rg2.id = rl.rgrn_id AND rg2.status = 'POSTED'
        WHERE rg2.grn_id = gri.goods_receipt_id AND rl.product_id = gri.product_id
      ), 0)::numeric + 0.0001
  )
`;

const pool = new pg.Pool({ connectionString: loadDatabaseUrl() });

async function main() {
  const has522 = (await pool.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'goods_receipts' AND column_name = 'reversed_by_return_grn_id'
  `)).rows.length > 0;

  console.log('=== GR billing (GR-2026-0001..0005) ===\n');
  const grParams = receiptFilter ? [receiptFilter] : [];
  const grWhere = receiptFilter
    ? `WHERE gr.receipt_number = $1`
    : `WHERE gr.receipt_number ~ '^GR-2026-000[1-5]$'`;

  const { rows: grs } = await pool.query(
    `SELECT gr.receipt_number, gr.status,
            gr.reversed_by_return_grn_id,
            (SELECT rg.return_grn_number FROM return_grn rg WHERE rg.id = gr.reversed_by_return_grn_id) AS meta_rgrn,
            (${LEGACY_FULLY_REVERSED}) AS legacy_fully_reversed,
            (SELECT COUNT(*)::int FROM return_grn rg WHERE rg.grn_id = gr.id AND rg.status = 'POSTED') AS posted_returns
     FROM goods_receipts gr
     ${grWhere}
     ORDER BY gr.receipt_number`,
    grParams,
  );

  if (grs.length === 0) {
    console.log('No matching goods receipts found.');
  }
  for (const g of grs) {
    const wouldBeReversed = has522
      ? (g.reversed_by_return_grn_id != null || g.legacy_fully_reversed)
      : g.legacy_fully_reversed;
    console.log(`${g.receipt_number}  status=${g.status}  posted_returns=${g.posted_returns}`);
    console.log(`  metadata: ${g.meta_rgrn || '(none)'}  legacy_fully_reversed=${g.legacy_fully_reversed}`);
    console.log(`  → billing after fix: ${wouldBeReversed ? 'REVERSED (not in To invoice)' : 'TO_INVOICE if no bill'}`);
    console.log('');
  }

  console.log('=== Quick login / PIN readiness ===\n');

  const { rows: pinUsers } = await pool.query(`
    SELECT u.id, u.full_name, u.email, u.role, u.quick_login_enabled, u.pin_hash IS NOT NULL AS has_pin,
           COALESCE(pa.failed_attempts, 0) AS failed_attempts, pa.locked_until
    FROM users u
    LEFT JOIN pin_attempts pa ON pa.user_id = u.id
    WHERE u.is_active = true AND (u.quick_login_enabled = true OR u.pin_hash IS NOT NULL)
    ORDER BY u.full_name
  `);

  if (pinUsers.length === 0) {
    console.log('No users with quick login or PIN configured.');
  } else {
    for (const u of pinUsers) {
      const locked = u.locked_until && new Date(u.locked_until) > new Date();
      console.log(`${u.full_name} (${u.role})  ql=${u.quick_login_enabled}  pin=${u.has_pin}  attempts=${u.failed_attempts ?? 0}${locked ? '  LOCKED until ' + u.locked_until : ''}`);
    }
  }

  const { rows: devices } = await pool.query(`
    SELECT device_name, location_name, is_active, device_fingerprint, created_at
    FROM trusted_devices ORDER BY created_at DESC LIMIT 10
  `);
  console.log(`\nTrusted devices: ${devices.length} (showing up to 10)`);
  for (const d of devices) {
    console.log(`  ${d.is_active ? '✓' : '✗'} ${d.device_name}${d.location_name ? ' @ ' + d.location_name : ''}  fp=${d.device_fingerprint.slice(0, 12)}…`);
  }

  const { rows: audit } = await pool.query(`
    SELECT created_at, user_name, method, success, failure_reason, device_fingerprint
    FROM quick_login_audit
    ORDER BY created_at DESC LIMIT 8
  `);
  console.log('\nRecent quick-login audit:');
  if (audit.length === 0) console.log('  (none)');
  for (const a of audit) {
    console.log(`  ${a.created_at.toISOString().slice(0, 19)}  ${a.user_name}  ${a.method}  ${a.success ? 'OK' : 'FAIL:' + (a.failure_reason || '?')}`);
  }
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  })
  .finally(() => pool.end());
