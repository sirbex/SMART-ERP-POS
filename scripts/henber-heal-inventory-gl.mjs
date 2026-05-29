#!/usr/bin/env node
/**
 * Henber — post inventory GL drift heal (runs inside smarterp-backend container).
 *
 * On production server:
 *   docker cp scripts/henber-heal-inventory-gl.mjs smarterp-backend:/tmp/
 *   docker exec smarterp-backend node /tmp/henber-heal-inventory-gl.mjs
 *
 * Or from repo root via SSH one-liner (see scripts/run-henber-heal-inventory.sh).
 */
import pg from 'pg';
import { healInventoryGlDrift } from '/app/dist/SamplePOS.Server/src/modules/system/glRepairService.js';
import { runInventoryGLIntegrityCheck } from '/app/dist/SamplePOS.Server/src/services/inventoryGLIntegrityCheckService.js';

function henberDatabaseUrl() {
  if (process.env.HENBER_DATABASE_URL) return process.env.HENBER_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (base) {
    return base.replace(/\/([^/?]+)(\?.*)?$/, '/pos_tenant_henber_pharmacy$2');
  }
  return 'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@postgres:5432/pos_tenant_henber_pharmacy';
}

const pool = new pg.Pool({ connectionString: henberDatabaseUrl() });

async function resolveAdminUserId(client) {
  if (process.env.ADMIN_USER_ID) return process.env.ADMIN_USER_ID;
  const res = await client.query(
    `SELECT id FROM users WHERE is_active = true ORDER BY created_at ASC LIMIT 1`,
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error('No active user in pos_tenant_henber_pharmacy for audit trail');
  return id;
}

try {
  const adminUserId = await resolveAdminUserId(pool);
  console.log('Henber DB:', henberDatabaseUrl().replace(/\/\/[^@]+@/, '//***@'));
  console.log('Admin user:', adminUserId);

  const before = await runInventoryGLIntegrityCheck(pool);
  console.log('Before:', {
    gl: before.glBalance,
    sub: before.subledgerBalance,
    drift: before.drift,
    isDrifting: before.isDrifting,
  });

  const heal = await healInventoryGlDrift(pool, adminUserId);
  console.log('Heal result:', heal);

  const after = await runInventoryGLIntegrityCheck(pool);
  console.log('After:', {
    gl: after.glBalance,
    sub: after.subledgerBalance,
    drift: after.drift,
    isDrifting: after.isDrifting,
    alertLevel: after.alertLevel,
  });

  if (after.isDrifting) {
    console.error('FAIL: drift still above threshold after heal');
    process.exit(1);
  }
  console.log('OK: inventory GL aligned with batch subledger');
} catch (e) {
  console.error(e?.message || e);
  process.exit(1);
} finally {
  await pool.end();
}
