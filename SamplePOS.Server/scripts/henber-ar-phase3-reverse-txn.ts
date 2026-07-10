#!/usr/bin/env tsx
/**
 * Single-transaction GL reversal for Henber AR Phase 3 (invoked from .mjs orchestrator).
 *
 * Env: HENBER_DATABASE_URL, ORIGINAL_TXN_ID, REVERSAL_DATE, SYSTEM_USER_ID, IDEMPOTENCY_KEY
 */
import pg from 'pg';
import { AccountingCore } from '../src/services/accountingCore.js';

const connectionString = process.env.HENBER_DATABASE_URL;
const originalTransactionId = process.env.ORIGINAL_TXN_ID;
const reversalDate = process.env.REVERSAL_DATE || new Date().toISOString().slice(0, 10);
const userId = process.env.SYSTEM_USER_ID || '4971ceff-c094-41b0-bfaf-a3d88ea634a1';
const idempotencyKey = process.env.IDEMPOTENCY_KEY;

if (!connectionString || !originalTransactionId || !idempotencyKey) {
  console.error('Missing HENBER_DATABASE_URL, ORIGINAL_TXN_ID, or IDEMPOTENCY_KEY');
  process.exit(2);
}

const pool = new pg.Pool({ connectionString });

try {
  const result = await AccountingCore.reverseTransaction(
    {
      originalTransactionId,
      reversalDate,
      reason:
        'Phase 3 AR remediation: reverse duplicate/erroneous SALE_REFUND (−52,800 integrity drift)',
      userId,
      idempotencyKey,
    },
    pool,
  );
  console.log(JSON.stringify({ transactionNumber: result.transactionNumber, transactionId: result.transactionId }));
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await pool.end();
}
