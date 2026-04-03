/**
 * Import Repository - SQL layer for CSV import jobs
 *
 * ARCHITECTURE: Repository layer — raw SQL queries only.
 * All functions accept a pool/client parameter for transaction support.
 */

import { pool as globalPool } from '../../db/pool.js';
import logger from '../../utils/logger.js';
import { Money } from '../../utils/money.js';
import { SYSTEM_SUPPLIER_ID } from '../suppliers/supplierService.js';
import type pg from 'pg';
import type {
  ImportJob,
  ImportJobError,
  ImportEntityType,
  DuplicateStrategy,
  ImportErrorType,
} from '../../../../shared/zod/importSchemas.js';

// ── Normalize DB rows to camelCase ────────────────────────

function normalizeJobRow(row: Record<string, unknown>): ImportJob {
  return {
    id: row.id as string,
    jobNumber: row.job_number as string,
    entityType: row.entity_type as ImportEntityType,
    fileName: row.file_name as string,
    fileSizeBytes: Number(row.file_size_bytes),
    duplicateStrategy: row.duplicate_strategy as DuplicateStrategy,
    status: row.status as string as ImportJob['status'],
    rowsTotal: Number(row.rows_total),
    rowsProcessed: Number(row.rows_processed),
    rowsImported: Number(row.rows_imported),
    rowsSkipped: Number(row.rows_skipped),
    rowsFailed: Number(row.rows_failed),
    errorSummary: (row.error_summary as string) || null,
    startedAt: (row.started_at as string) || null,
    completedAt: (row.completed_at as string) || null,
    userId: row.user_id as string,
    createdAt: row.created_at as string,
  };
}

function normalizeErrorRow(row: Record<string, unknown>): ImportJobError {
  return {
    id: row.id as string,
    importJobId: row.import_job_id as string,
    rowNumber: Number(row.row_number),
    rawData: (row.raw_data as Record<string, string>) || null,
    errorMessage: row.error_message as string,
    errorType: row.error_type as ImportErrorType,
    createdAt: row.created_at as string,
  };
}

// ── Import Job CRUD ───────────────────────────────────────

/**
 * Generate the next job number: IMP-YYYY-####
 */
export async function generateJobNumber(dbPool?: pg.Pool | pg.PoolClient): Promise<string> {
  const pool = dbPool || globalPool;
  const year = new Date().getFullYear();
  const result = await pool.query(`SELECT nextval('import_job_number_seq') AS seq`);
  const seq = String(result.rows[0].seq).padStart(4, '0');
  return `IMP-${year}-${seq}`;
}

/**
 * Create a new import job record.
 */
export async function createImportJob(
  data: {
    jobNumber: string;
    entityType: ImportEntityType;
    fileName: string;
    filePath: string;
    fileSizeBytes: number;
    duplicateStrategy: DuplicateStrategy;
    userId: string;
  },
  dbPool?: pg.Pool | pg.PoolClient
): Promise<ImportJob> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `INSERT INTO import_jobs (
      job_number, entity_type, file_name, file_path,
      file_size_bytes, duplicate_strategy, status, user_id
    ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7)
    RETURNING *`,
    [
      data.jobNumber,
      data.entityType,
      data.fileName,
      data.filePath,
      data.fileSizeBytes,
      data.duplicateStrategy,
      data.userId,
    ]
  );
  return normalizeJobRow(result.rows[0]);
}

/**
 * Find import job by ID.
 */
export async function findJobById(
  jobId: string,
  dbPool?: pg.Pool | pg.PoolClient
): Promise<ImportJob | null> {
  const pool = dbPool || globalPool;
  const result = await pool.query(`SELECT * FROM import_jobs WHERE id = $1`, [jobId]);
  return result.rows[0] ? normalizeJobRow(result.rows[0]) : null;
}

/**
 * Find import job by job number (e.g., IMP-2026-0001).
 */
export async function findJobByNumber(
  jobNumber: string,
  dbPool?: pg.Pool | pg.PoolClient
): Promise<ImportJob | null> {
  const pool = dbPool || globalPool;
  const result = await pool.query(`SELECT * FROM import_jobs WHERE job_number = $1`, [jobNumber]);
  return result.rows[0] ? normalizeJobRow(result.rows[0]) : null;
}

/**
 * List import jobs for a user (most recent first).
 */
export async function listJobs(
  filters: {
    userId?: string;
    entityType?: ImportEntityType;
    status?: string;
    limit?: number;
    offset?: number;
  },
  dbPool?: pg.Pool | pg.PoolClient
): Promise<{ rows: ImportJob[]; total: number }> {
  const pool = dbPool || globalPool;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (filters.userId) {
    conditions.push(`user_id = $${paramIdx++}`);
    params.push(filters.userId);
  }
  if (filters.entityType) {
    conditions.push(`entity_type = $${paramIdx++}`);
    params.push(filters.entityType);
  }
  if (filters.status) {
    conditions.push(`status = $${paramIdx++}`);
    params.push(filters.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM import_jobs ${where}`,
    params
  );
  const total = Number(countResult.rows[0].total);

  const limit = filters.limit || 20;
  const offset = filters.offset || 0;
  const dataResult = await pool.query(
    `SELECT * FROM import_jobs ${where}
     ORDER BY created_at DESC
     LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
    [...params, limit, offset]
  );

  return { rows: dataResult.rows.map(normalizeJobRow), total };
}

/**
 * Mark job as PROCESSING with started_at timestamp.
 * Only transitions from PENDING status (guard against overwriting CANCELLED).
 * Returns true if the transition happened, false if the job was already
 * cancelled or picked up by another worker.
 */
export async function markJobProcessing(
  jobId: string,
  rowsTotal: number,
  dbPool?: pg.Pool | pg.PoolClient
): Promise<boolean> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `UPDATE import_jobs
     SET status = 'PROCESSING', rows_total = $2, started_at = NOW()
     WHERE id = $1 AND status = 'PENDING'`,
    [jobId, rowsTotal]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Update processing progress (called after each chunk).
 */
export async function updateImportProgress(
  jobId: string,
  progress: {
    rowsProcessed: number;
    rowsImported: number;
    rowsSkipped: number;
    rowsFailed: number;
  },
  dbPool?: pg.Pool | pg.PoolClient
): Promise<void> {
  const pool = dbPool || globalPool;
  await pool.query(
    `UPDATE import_jobs
     SET rows_processed = $2, rows_imported = $3,
         rows_skipped = $4, rows_failed = $5
     WHERE id = $1`,
    [
      jobId,
      progress.rowsProcessed,
      progress.rowsImported,
      progress.rowsSkipped,
      progress.rowsFailed,
    ]
  );
}

/**
 * Mark job as completed.
 */
export async function completeImportJob(
  jobId: string,
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED',
  errorSummary?: string,
  dbPool?: pg.Pool | pg.PoolClient
): Promise<void> {
  const pool = dbPool || globalPool;
  await pool.query(
    `UPDATE import_jobs
     SET status = $2, completed_at = NOW(), error_summary = $3
     WHERE id = $1`,
    [jobId, status, errorSummary || null]
  );
}

/**
 * Atomically cancel a PENDING job.
 * Returns true if cancelled, false if status already changed (race protection).
 */
export async function atomicCancelJob(
  jobId: string,
  dbPool?: pg.Pool | pg.PoolClient
): Promise<boolean> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `UPDATE import_jobs
     SET status = 'CANCELLED', completed_at = NOW()
     WHERE id = $1 AND status = 'PENDING'`,
    [jobId]
  );
  return (result.rowCount ?? 0) > 0;
}

// ── Import Job Error Logging ──────────────────────────────

/**
 * Log a single import error row.
 */
export async function logImportError(
  data: {
    importJobId: string;
    rowNumber: number;
    rawData: Record<string, string> | null;
    errorMessage: string;
    errorType: ImportErrorType;
  },
  dbPool?: pg.Pool | pg.PoolClient
): Promise<void> {
  const pool = dbPool || globalPool;
  await pool.query(
    `INSERT INTO import_job_errors (import_job_id, row_number, raw_data, error_message, error_type)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      data.importJobId,
      data.rowNumber,
      data.rawData ? JSON.stringify(data.rawData) : null,
      data.errorMessage,
      data.errorType,
    ]
  );
}

/**
 * Batch-log multiple import errors in a single INSERT.
 * Internally splits into sub-batches to stay under PostgreSQL's 65,535 parameter limit.
 * Each error uses 5 params → max ~10,000 errors per sub-batch.
 */
export async function logImportErrors(
  errors: Array<{
    importJobId: string;
    rowNumber: number;
    rawData: Record<string, string> | null;
    errorMessage: string;
    errorType: ImportErrorType;
  }>,
  dbPool?: pg.Pool | pg.PoolClient
): Promise<void> {
  if (errors.length === 0) return;
  const pool = dbPool || globalPool;

  // 5 params per error → 10,000 * 5 = 50,000 (safe under 65,535)
  const MAX_BATCH = 10000;

  for (let batchStart = 0; batchStart < errors.length; batchStart += MAX_BATCH) {
    const batch = errors.slice(batchStart, batchStart + MAX_BATCH);

    const values: unknown[] = [];
    const placeholders: string[] = [];
    let idx = 1;
    for (const e of batch) {
      placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`);
      values.push(
        e.importJobId,
        e.rowNumber,
        e.rawData ? JSON.stringify(e.rawData) : null,
        e.errorMessage,
        e.errorType
      );
      idx += 5;
    }

    await pool.query(
      `INSERT INTO import_job_errors (import_job_id, row_number, raw_data, error_message, error_type)
       VALUES ${placeholders.join(', ')}`,
      values
    );
  }
}

/**
 * Get errors for a job (paginated).
 */
export async function getJobErrors(
  jobId: string,
  limit: number = 100,
  offset: number = 0,
  dbPool?: pg.Pool | pg.PoolClient
): Promise<{ rows: ImportJobError[]; total: number }> {
  const pool = dbPool || globalPool;
  const countResult = await pool.query(
    `SELECT COUNT(*) as total FROM import_job_errors WHERE import_job_id = $1`,
    [jobId]
  );
  const total = Number(countResult.rows[0].total);

  const result = await pool.query(
    `SELECT * FROM import_job_errors
     WHERE import_job_id = $1
     ORDER BY row_number ASC
     LIMIT $2 OFFSET $3`,
    [jobId, limit, offset]
  );

  return { rows: result.rows.map(normalizeErrorRow), total };
}

/**
 * Get ALL errors for a job (no pagination, for CSV export).
 */
export async function getAllJobErrors(
  jobId: string,
  dbPool?: pg.Pool | pg.PoolClient
): Promise<ImportJobError[]> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `SELECT * FROM import_job_errors
     WHERE import_job_id = $1
     ORDER BY row_number ASC`,
    [jobId]
  );
  return result.rows.map(normalizeErrorRow);
}

// ── Job File Path (internal only) ─────────────────────────

/**
 * Get the file_path for a job (not exposed to API).
 */
export async function getJobFilePath(
  jobId: string,
  dbPool?: pg.Pool | pg.PoolClient
): Promise<string | null> {
  const pool = dbPool || globalPool;
  const result = await pool.query(`SELECT file_path FROM import_jobs WHERE id = $1`, [jobId]);
  return result.rows[0]?.file_path ?? null;
}

/**
 * Reset a job record for retry: clear counters, set status to PENDING.
 * Uses atomic WHERE status = 'FAILED' guard to prevent race conditions.
 * Returns true if the job was actually reset, false if status already changed.
 */
export async function resetJobForRetry(
  jobId: string,
  dbPool?: pg.Pool | pg.PoolClient
): Promise<boolean> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `UPDATE import_jobs
     SET status = 'PENDING',
         rows_total = 0, rows_processed = 0, rows_imported = 0,
         rows_skipped = 0, rows_failed = 0,
         error_summary = NULL, started_at = NULL, completed_at = NULL
     WHERE id = $1 AND status = 'FAILED'`,
    [jobId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Delete all errors for a job (used before retry).
 */
export async function deleteJobErrors(
  jobId: string,
  dbPool?: pg.Pool | pg.PoolClient
): Promise<void> {
  const pool = dbPool || globalPool;
  await pool.query(`DELETE FROM import_job_errors WHERE import_job_id = $1`, [jobId]);
}

// ── Bulk Entity Inserts ───────────────────────────────────
// Each function builds a multi-row INSERT with ON CONFLICT.
// Returns the count of newly inserted rows.

// REMOVED: bulkInsertProducts (500+ lines) — dead code.
// Product import now uses productService.bulkImportProducts + goodsReceiptService.createOpeningBalanceGRN.


/**
 * Bulk insert customers. Uses ON CONFLICT on name+email for dedup.
 * customer_number is auto-generated by database default.
 */
export async function bulkInsertCustomers(
  client: pg.PoolClient,
  rows: Array<{
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    creditLimit?: number;
  }>,
  duplicateStrategy: DuplicateStrategy
): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  // Skip trg_sync_customer_to_ar during bulk insert — it does SUM(balance)
  // over ALL customers on every row change, causing N² performance.
  // We recalculate AR once at the end of this function.
  await client.query("SET LOCAL app.skip_customer_ar_trigger = 'true'");

  // Pre-generate customer numbers (app-layer, trigger removed)
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('customer_number_seq'))`);
  const seqResult = await client.query(
    `SELECT nextval('customer_number_seq') AS seq FROM generate_series(1, $1)`,
    [rows.length]
  );
  const customerNumbers = seqResult.rows.map(
    (r: { seq: string }) => `CUST-${String(r.seq).padStart(6, '0')}`
  );

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let idx = 1;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5})`);
    values.push(customerNumbers[i], r.name, r.email || null, r.phone || null, r.address || null, r.creditLimit ?? 0);
    idx += 6;
  }

  // Customers don't have a strong unique constraint beyond name,
  // so we use a unique index on LOWER(name) + COALESCE(email,'') for dedup.
  // If this index doesn't exist, the insert will just succeed (no duplicates caught at DB level).
  // The worker pre-checks for duplicates using a Set.
  let conflictClause: string;
  if (duplicateStrategy === 'UPDATE') {
    conflictClause = `ON CONFLICT (LOWER(name), LOWER(COALESCE(email, '')))
      DO UPDATE SET
        phone = EXCLUDED.phone,
        address = EXCLUDED.address,
        credit_limit = EXCLUDED.credit_limit`;
  } else {
    conflictClause = `ON CONFLICT (LOWER(name), LOWER(COALESCE(email, '')))
      DO NOTHING`;
  }

  const sql = `
    INSERT INTO customers (customer_number, name, email, phone, address, credit_limit)
    VALUES ${placeholders.join(', ')}
    ${conflictClause}
    RETURNING id`;

  try {
    const result = await client.query(sql, values);
    const inserted = result.rowCount ?? 0;

    // Single AR recalculation after bulk insert (replaces N per-row trigger calls)
    await client.query(`
      UPDATE accounts
      SET "CurrentBalance" = COALESCE((
        SELECT SUM(balance) FROM customers WHERE is_active = true
      ), 0),
      "UpdatedAt" = NOW()
      WHERE "AccountCode" = '1200'
    `);

    return { inserted, skipped: rows.length - inserted };
  } catch (error: unknown) {
    // If the unique index doesn't exist, fail loudly — silent fallback creates duplicates.
    // The admin must create the dedup index before importing customers.
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('ON CONFLICT') || msg.includes('there is no unique')) {
      throw new Error(
        'Customer dedup index missing. Run: CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_name_email ' +
        "ON customers (LOWER(name), LOWER(COALESCE(email, '')));"
      );
    }
    throw error;
  }
}

/**
 * Bulk insert suppliers. Uses ON CONFLICT on "CompanyName" for dedup.
 * Supplier table uses PascalCase columns (legacy schema).
 */
export async function bulkInsertSuppliers(
  client: pg.PoolClient,
  rows: Array<{
    name: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    address?: string;
    paymentTerms?: string;
    creditLimit?: number;
    taxId?: string;
    notes?: string;
  }>,
  duplicateStrategy: DuplicateStrategy
): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  // Get the next supplier code sequence number from existing suppliers
  const seqRes = await client.query(
    `SELECT COALESCE(MAX(
       CASE WHEN "SupplierCode" ~ '^SUP-\\d{4}-\\d+$'
            THEN CAST(SPLIT_PART("SupplierCode", '-', 3) AS INTEGER)
            ELSE 0 END
     ), 0) AS max_seq FROM suppliers`
  );
  let nextSeq = (Number(seqRes.rows[0]?.max_seq) || 0) + 1;
  const year = new Date().getFullYear();

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let idx = 1;

  for (const r of rows) {
    const supplierCode = `SUP-${year}-${String(nextSeq++).padStart(4, '0')}`;
    const paymentTermsDays = paymentTermsStringToDays(r.paymentTerms || 'NET30');

    placeholders.push(
      `(gen_random_uuid(), $${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7}, 0, $${idx + 8}, $${idx + 9}, true, NOW(), NOW())`
    );
    values.push(
      supplierCode,
      r.name,
      r.contactPerson || null,
      r.email || null,
      r.phone || null,
      r.address || null,
      paymentTermsDays,
      r.creditLimit ?? 0,
      r.taxId || null,
      r.notes || null
    );
    idx += 10;
  }

  let conflictClause: string;
  if (duplicateStrategy === 'UPDATE') {
    conflictClause = `ON CONFLICT (LOWER("CompanyName")) DO UPDATE SET
      "ContactName" = EXCLUDED."ContactName",
      "Email" = EXCLUDED."Email",
      "Phone" = EXCLUDED."Phone",
      "Address" = EXCLUDED."Address",
      "DefaultPaymentTerms" = EXCLUDED."DefaultPaymentTerms",
      "CreditLimit" = EXCLUDED."CreditLimit",
      "TaxId" = EXCLUDED."TaxId",
      "Notes" = EXCLUDED."Notes",
      "UpdatedAt" = NOW()`;
  } else {
    conflictClause = `ON CONFLICT (LOWER("CompanyName")) DO NOTHING`;
  }

  const sql = `
    INSERT INTO suppliers (
      "Id", "SupplierCode", "CompanyName", "ContactName", "Email", "Phone", "Address",
      "DefaultPaymentTerms", "CreditLimit", "OutstandingBalance", "TaxId", "Notes",
      "IsActive", "CreatedAt", "UpdatedAt"
    ) VALUES ${placeholders.join(', ')}
    ${conflictClause}
    RETURNING "Id" as id`;

  const result = await client.query(sql, values);
  const inserted = result.rowCount ?? 0;
  return { inserted, skipped: rows.length - inserted };
}

// ── Duplicate pre-check for FAIL strategy ─────────────────

/**
 * Check which SKUs already exist in the products table.
 * Returns a Set of existing SKUs.
 */
export async function findExistingProductSkus(
  skus: string[],
  dbPool?: pg.Pool | pg.PoolClient
): Promise<Set<string>> {
  if (skus.length === 0) return new Set();
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `SELECT LOWER(sku) AS sku FROM products WHERE LOWER(sku) = ANY($1::text[])`,
    [skus.map((s) => s.toLowerCase())]
  );
  return new Set(result.rows.map((r: { sku: string }) => r.sku));
}

/**
 * Check which supplier names already exist.
 */
export async function findExistingSupplierNames(
  names: string[],
  dbPool?: pg.Pool | pg.PoolClient
): Promise<Set<string>> {
  if (names.length === 0) return new Set();
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `SELECT LOWER("CompanyName") AS name FROM suppliers WHERE LOWER("CompanyName") = ANY($1::text[])`,
    [names.map((n) => n.toLowerCase())]
  );
  return new Set(result.rows.map((r: { name: string }) => r.name));
}

/**
 * Check which customer name+email combos already exist.
 */
export async function findExistingCustomerKeys(
  keys: Array<{ name: string; email: string | null }>,
  dbPool?: pg.Pool | pg.PoolClient
): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const pool = dbPool || globalPool;

  // Build parameterized composite key check
  const names = keys.map((k) => k.name);
  const result = await pool.query(
    `SELECT LOWER(name) || '|' || LOWER(COALESCE(email, '')) AS key
     FROM customers
     WHERE LOWER(name) = ANY($1::text[])`,
    [names.map((n) => n.toLowerCase())]
  );
  return new Set(result.rows.map((r: { key: string }) => r.key));
}

// ── Helper ────────────────────────────────────────────────

function paymentTermsStringToDays(terms: string): number {
  switch (terms?.toUpperCase()) {
    case 'COD':
      return 0;
    case 'PREPAID':
      return -1;
    case 'NET15':
      return 15;
    case 'NET30':
      return 30;
    case 'NET60':
      return 60;
    case 'NET90':
      return 90;
    default: {
      const match = terms?.match(/NET(\d+)/i);
      if (match) return parseInt(match[1], 10);
      return 30;
    }
  }
}