#!/usr/bin/env node
/**
 * Smoke test: AP reconciliation lane services (no HTTP server required).
 * Exit 0 when integrity lane is reconciled.
 */
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || process.env.HENBER_DATABASE_URL,
});

const { getApIntegrityLane, getApCacheLane, getApJournalAuditLane } = await import(
  '../dist/SamplePOS.Server/src/modules/supplier-payments/apReconciliationLanes.js'
);

const integrity = await getApIntegrityLane(pool);
const cache = await getApCacheLane(pool);
const history = await getApJournalAuditLane(pool);

console.log('SMOKE: AP Reconciliation Lanes\n');
console.log('Integrity:', {
  status: integrity.status,
  integrityDifference: integrity.integrityDifference,
  gatesPeriodClose: integrity.gatesPeriodClose,
  exceptions: integrity.exceptions.length,
});
console.log('Cache:', {
  status: cache.status,
  cacheDifference: cache.cacheDifference,
  gatesPeriodClose: cache.gatesPeriodClose,
});
console.log('Journal audit:', {
  reversalImpact: history.reversalImpact,
  journals: history.journals.length,
  supplierExceptions: history.supplierExceptions.length,
});

const ok = integrity.status === 'RECONCILED' && integrity.gatesPeriodClose === true;
console.log(ok ? '\n✓ SMOKE PASSED' : '\n✗ SMOKE FAILED — integrity not reconciled');
await pool.end();
process.exit(ok ? 0 : 1);
