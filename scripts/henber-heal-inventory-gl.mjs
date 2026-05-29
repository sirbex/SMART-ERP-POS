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
import { healInventoryGlDrift } from './dist/modules/system/glRepairService.js';
import { runInventoryGLIntegrityCheck } from './dist/services/inventoryGLIntegrityCheckService.js';

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL
    ?? 'postgresql://postgres:55b9bed51c599b26e7115ab126a974e8@postgres:5432/pos_tenant_henber_pharmacy',
});

const ADMIN_USER_ID = process.env.ADMIN_USER_ID ?? '4971ceff-c094-41b0-bfaf-a3d88ea634a1';

try {
  const before = await runInventoryGLIntegrityCheck(pool);
  console.log('Before:', {
    gl: before.glBalance,
    sub: before.subledgerBalance,
    drift: before.drift,
    isDrifting: before.isDrifting,
  });

  const heal = await healInventoryGlDrift(pool, ADMIN_USER_ID);
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
