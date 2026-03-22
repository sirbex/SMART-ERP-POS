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
  const result = await pool.query(
    `SELECT nextval('import_job_number_seq') AS seq`
  );
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
  const result = await pool.query(
    `SELECT * FROM import_jobs WHERE id = $1`,
    [jobId]
  );
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
  const result = await pool.query(
    `SELECT * FROM import_jobs WHERE job_number = $1`,
    [jobNumber]
  );
  return result.rows[0] ? normalizeJobRow(result.rows[0]) : null;
}

/**
 * List import jobs for a user (most recent first).
 */
export async function listJobs(
  filters: { userId?: string; entityType?: ImportEntityType; status?: string; limit?: number; offset?: number },
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
      values.push(e.importJobId, e.rowNumber, e.rawData ? JSON.stringify(e.rawData) : null, e.errorMessage, e.errorType);
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
  const result = await pool.query(
    `SELECT file_path FROM import_jobs WHERE id = $1`,
    [jobId]
  );
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
  await pool.query(
    `DELETE FROM import_job_errors WHERE import_job_id = $1`,
    [jobId]
  );
}

// ── Bulk Entity Inserts ───────────────────────────────────
// Each function builds a multi-row INSERT with ON CONFLICT.
// Returns the count of newly inserted rows.

/**
 * Bulk insert products. Uses ON CONFLICT (sku) for duplicate handling.
 * Returns { inserted, skipped } counts.
 */
export async function bulkInsertProducts(
  client: pg.PoolClient,
  rows: Array<{
    sku: string;
    barcode?: string;
    name: string;
    description?: string;
    category?: string;
    genericName?: string;
    conversionFactor?: number;
    costPrice?: number;
    sellingPrice?: number;
    isTaxable?: boolean;
    taxRate?: number;
    costingMethod?: string;
    pricingFormula?: string;
    autoUpdatePrice?: boolean;
    quantityOnHand?: number;
    reorderLevel?: number;
    trackExpiry?: boolean;
    minDaysBeforeExpirySale?: number;
    isActive?: boolean;
    unitOfMeasure?: string;
    batchNumber?: string;
    expiryDate?: string;
  }>,
  duplicateStrategy: DuplicateStrategy
): Promise<{ inserted: number; skipped: number; stockMovements: Array<{ movementId: string; movementNumber: string; productId: string; quantity: number; unitCost: number }> }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0, stockMovements: [] };

  // Collect created stock movements for GL posting by the caller
  const stockMovements: Array<{
    movementId: string;
    movementNumber: string;
    productId: string;
    quantity: number;
    unitCost: number;
  }> = [];

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let idx = 1;

  for (const r of rows) {
    placeholders.push(
      `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5},
        $${idx + 6}, $${idx + 7}, $${idx + 8}, $${idx + 9}, $${idx + 10}, $${idx + 11},
        $${idx + 12}, $${idx + 13}, $${idx + 14}, $${idx + 15}, $${idx + 16}, $${idx + 17}, $${idx + 18})`
    );
    values.push(
      r.sku,
      r.barcode || null,
      r.name,
      r.description || null,
      r.category || null,
      r.genericName || null,
      r.conversionFactor ?? 1,
      r.costPrice ?? 0,
      r.sellingPrice ?? 0,
      r.isTaxable ?? false,
      r.taxRate ?? 0,
      r.costingMethod || 'FIFO',
      r.pricingFormula || null,
      r.autoUpdatePrice ?? false,
      r.quantityOnHand ?? 0,
      r.reorderLevel ?? 0,
      r.trackExpiry ?? false,
      r.minDaysBeforeExpirySale ?? 0,
      r.isActive ?? true,
    );
    idx += 19;
  }

  let conflictClause: string;
  if (duplicateStrategy === 'UPDATE') {
    conflictClause = `ON CONFLICT (sku) DO UPDATE SET
      name = EXCLUDED.name,
      barcode = EXCLUDED.barcode,
      description = EXCLUDED.description,
      category = EXCLUDED.category,
      generic_name = EXCLUDED.generic_name,
      conversion_factor = EXCLUDED.conversion_factor,
      cost_price = EXCLUDED.cost_price,
      selling_price = EXCLUDED.selling_price,
      is_taxable = EXCLUDED.is_taxable,
      tax_rate = EXCLUDED.tax_rate,
      costing_method = EXCLUDED.costing_method,
      pricing_formula = EXCLUDED.pricing_formula,
      auto_update_price = EXCLUDED.auto_update_price,
      quantity_on_hand = EXCLUDED.quantity_on_hand,
      reorder_level = EXCLUDED.reorder_level,
      track_expiry = EXCLUDED.track_expiry,
      min_days_before_expiry_sale = EXCLUDED.min_days_before_expiry_sale,
      is_active = EXCLUDED.is_active`;
  } else {
    // SKIP or FAIL — both use DO NOTHING at SQL level;
    // FAIL strategy is enforced before this function is called.
    conflictClause = `ON CONFLICT (sku) DO NOTHING`;
  }

  const sql = `
    INSERT INTO products (
      sku, barcode, name, description, category, generic_name,
      conversion_factor, cost_price, selling_price,
      is_taxable, tax_rate, costing_method,
      pricing_formula, auto_update_price,
      quantity_on_hand, reorder_level, track_expiry, min_days_before_expiry_sale, is_active
    ) VALUES ${placeholders.join(', ')}
    ${conflictClause}
    RETURNING id, sku`;

  const result = await client.query(sql, values);
  const inserted = result.rowCount ?? 0;
  const skipped = rows.length - inserted;

  // ── Build SKU → product ID map from RETURNING + fallback SELECT ──
  const skuToProductId = new Map<string, string>();
  for (const row of result.rows) {
    skuToProductId.set(String(row.sku).toLowerCase(), row.id);
  }
  // RETURNING may miss rows for SKIP/DO NOTHING or UPDATE that didn't change.
  const missingSKUs = rows
    .filter(r => !skuToProductId.has(r.sku.toLowerCase()))
    .map(r => r.sku);
  if (missingSKUs.length > 0) {
    const lookupResult = await client.query(
      `SELECT id, LOWER(sku) AS sku FROM products WHERE LOWER(sku) = ANY($1::text[])`,
      [missingSKUs.map(s => s.toLowerCase())]
    );
    for (const row of lookupResult.rows) {
      skuToProductId.set(row.sku, row.id);
    }
  }

  // ── Sync child tables (vertical partition from migration 410) ──
  // product_valuation holds prices; product_inventory holds stock levels.
  // The AFTER INSERT trigger creates child rows for NEW products, but
  // ON CONFLICT DO UPDATE is treated as UPDATE — trigger doesn't fire.
  // Always upsert child tables so prices/quantities are correct for every
  // strategy: UPDATE syncs all products, SKIP/FAIL syncs only newly inserted.
  const newlyInsertedIds = new Set<string>(result.rows.map((r: { id: string }) => r.id));
  // For UPDATE: every row was touched; for SKIP/FAIL: only newly inserted rows
  const idsToSync = duplicateStrategy === 'UPDATE'
    ? new Set<string>(skuToProductId.values())
    : newlyInsertedIds;

  if (idsToSync.size > 0) {
    // Filter to rows whose product IDs are in the sync set
    const syncRows = rows.filter(r => {
      const pid = skuToProductId.get(r.sku.toLowerCase());
      return pid && idsToSync.has(pid);
    });

    // ── product_valuation: prices, costing, formula ──
    const pvValues: unknown[] = [];
    const pvPlaceholders: string[] = [];
    let pvIdx = 1;
    for (const r of syncRows) {
      const productId = skuToProductId.get(r.sku.toLowerCase())!;
      pvPlaceholders.push(
        `($${pvIdx}::uuid, $${pvIdx + 1}::numeric, $${pvIdx + 2}::numeric, $${pvIdx + 3}::numeric, $${pvIdx + 4}::numeric, $${pvIdx + 5}, $${pvIdx + 6}, $${pvIdx + 7}::boolean)`
      );
      pvValues.push(
        productId,
        r.costPrice ?? 0,
        r.sellingPrice ?? 0,
        r.costPrice ?? 0, // average_cost = cost_price on import (no GR to recalculate)
        r.costPrice ?? 0, // last_cost = cost_price on import
        r.costingMethod || 'FIFO',
        r.pricingFormula || null,
        r.autoUpdatePrice ?? false,
      );
      pvIdx += 8;
    }
    if (pvPlaceholders.length > 0) {
      await client.query(
        `INSERT INTO product_valuation (product_id, cost_price, selling_price, average_cost, last_cost, costing_method, pricing_formula, auto_update_price)
         VALUES ${pvPlaceholders.join(', ')}
         ON CONFLICT (product_id) DO UPDATE SET
           cost_price = EXCLUDED.cost_price,
           selling_price = EXCLUDED.selling_price,
           average_cost = EXCLUDED.average_cost,
           last_cost = EXCLUDED.last_cost,
           costing_method = EXCLUDED.costing_method,
           pricing_formula = EXCLUDED.pricing_formula,
           auto_update_price = EXCLUDED.auto_update_price,
           updated_at = NOW()`,
        pvValues
      );
    }

    // ── product_inventory: stock levels ──
    const piValues: unknown[] = [];
    const piPlaceholders: string[] = [];
    let piIdx = 1;
    for (const r of syncRows) {
      const productId = skuToProductId.get(r.sku.toLowerCase())!;
      piPlaceholders.push(
        `($${piIdx}::uuid, $${piIdx + 1}::numeric, $${piIdx + 2}::numeric)`
      );
      piValues.push(
        productId,
        r.quantityOnHand ?? 0,
        r.reorderLevel ?? 0,
      );
      piIdx += 3;
    }
    if (piPlaceholders.length > 0) {
      await client.query(
        `INSERT INTO product_inventory (product_id, quantity_on_hand, reorder_level)
         VALUES ${piPlaceholders.join(', ')}
         ON CONFLICT (product_id) DO UPDATE SET
           quantity_on_hand = EXCLUDED.quantity_on_hand,
           reorder_level = EXCLUDED.reorder_level,
           updated_at = NOW()`,
        piValues
      );
    }

    // ── product_uoms: assign UOM to imported products ──
    // Uses the CSV "Unit of Measure" column if provided, otherwise defaults to "Each".
    {
      // Build a name→id lookup for all UOMs in the system
      const allUoms = await client.query(`SELECT id, UPPER(name) AS name, UPPER(symbol) AS symbol FROM uoms`);
      const uomNameMap = new Map<string, string>();
      for (const u of allUoms.rows) {
        uomNameMap.set(u.name, u.id);
        if (u.symbol) uomNameMap.set(u.symbol, u.id);
      }
      const eachUomId = uomNameMap.get('EACH') || uomNameMap.get('EA');

      const puValues: unknown[] = [];
      const puPlaceholders: string[] = [];
      let puIdx = 1;
      for (const r of syncRows) {
        const productId = skuToProductId.get(r.sku.toLowerCase())!;
        // Resolve UOM: try CSV value first, fall back to Each
        let uomId: string | undefined;
        if (r.unitOfMeasure) {
          uomId = uomNameMap.get(r.unitOfMeasure.toUpperCase());
        }
        if (!uomId) uomId = eachUomId;
        if (!uomId) continue; // no UOM available at all
        puPlaceholders.push(
          `($${puIdx}::uuid, $${puIdx + 1}::uuid, 1.0, true)`
        );
        puValues.push(productId, uomId);
        puIdx += 2;
      }
      if (puPlaceholders.length > 0) {
        await client.query(
          `INSERT INTO product_uoms (product_id, uom_id, conversion_factor, is_default)
           VALUES ${puPlaceholders.join(', ')}
           ON CONFLICT (product_id, uom_id) DO NOTHING`,
          puValues
        );
      }
    }
  }

  // ── Create inventory batches for rows that have batch data ──
  // Auto-generate a batch number for rows with stock but no explicit batch,
  // so FEFO inventory tracking has a batch to draw from during sales.
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const batchRows = rows
    .map((r, i) => ({
      ...r,
      batchNumber: r.batchNumber || ((r.quantityOnHand ?? 0) > 0 ? `IMP-${datePart}-${String(i + 1).padStart(4, '0')}` : undefined),
    }))
    .filter(r => r.batchNumber);

  if (batchRows.length > 0) {
    // Skip the auto stock-movement trigger — we create OPENING_BALANCE movements
    // manually so they post to the GL via recordOpeningStockToGL (equity, not revenue).
    await client.query("SET LOCAL app.skip_stock_movement_trigger = 'true'");

    // For UPDATE strategy, capture existing batch quantities BEFORE upsert
    // so we can compute the delta for accurate stock movements.
    const existingBatchQty = new Map<string, number>();
    if (duplicateStrategy === 'UPDATE') {
      const batchKeys = batchRows
        .map(r => {
          const pid = skuToProductId.get(r.sku.toLowerCase());
          return pid ? { productId: pid, batchNumber: r.batchNumber! } : null;
        })
        .filter((k): k is { productId: string; batchNumber: string } => k !== null);

      if (batchKeys.length > 0) {
        // Build a lookup of existing batch quantities
        const pids = batchKeys.map(k => k.productId);
        const bns = batchKeys.map(k => k.batchNumber);
        const existingResult = await client.query(
          `SELECT product_id, batch_number, remaining_quantity
           FROM inventory_batches
           WHERE (product_id, batch_number) IN (
             SELECT UNNEST($1::uuid[]), UNNEST($2::text[])
           )`,
          [pids, bns]
        );
        for (const row of existingResult.rows) {
          const key = `${row.product_id}|${row.batch_number}`;
          existingBatchQty.set(key, Money.parseDb(row.remaining_quantity).toNumber());
        }
      }
    }

    // Build batch insert
    const batchValues: unknown[] = [];
    const batchPlaceholders: string[] = [];
    let bIdx = 1;

    for (const r of batchRows) {
      const productId = skuToProductId.get(r.sku.toLowerCase());
      if (!productId) continue; // Product was skipped — no batch to create

      const qty = r.quantityOnHand ?? 0;
      batchPlaceholders.push(
        `($${bIdx}, $${bIdx + 1}, $${bIdx + 2}, $${bIdx + 3}, $${bIdx + 4}, $${bIdx + 5}, 'IMPORT', $${bIdx + 6}::uuid)`
      );
      batchValues.push(
        productId,
        r.batchNumber,
        qty,
        qty,
        r.costPrice ?? 0,
        r.expiryDate || null,
        SYSTEM_SUPPLIER_ID,
      );
      bIdx += 7;
    }

    if (batchPlaceholders.length > 0) {
      // For UPDATE strategy: replace batch quantities (idempotent re-import).
      // For SKIP/FAIL strategy: only create brand-new batches, leave existing untouched.
      const batchConflict = duplicateStrategy === 'UPDATE'
        ? `ON CONFLICT (product_id, batch_number) DO UPDATE SET
            quantity = EXCLUDED.quantity,
            remaining_quantity = EXCLUDED.remaining_quantity,
            cost_price = EXCLUDED.cost_price,
            expiry_date = COALESCE(EXCLUDED.expiry_date, inventory_batches.expiry_date)`
        : `ON CONFLICT (product_id, batch_number) DO NOTHING`;

      const batchResult = await client.query(
        `INSERT INTO inventory_batches (
          product_id, batch_number, quantity, remaining_quantity,
          cost_price, expiry_date, source_type, source_reference_id
        ) VALUES ${batchPlaceholders.join(', ')}
        ${batchConflict}
        RETURNING id, product_id, batch_number, remaining_quantity, cost_price`,
        batchValues
      );

      // ── Create OPENING_BALANCE stock movements for imported quantities ──
      // Per SAP/Odoo/Tally/QuickBooks best practices, opening stock is a distinct
      // movement type — not an adjustment. The import worker posts GL entries as
      // DR Inventory (1300) / CR Opening Balance Equity (3050).
      if (batchResult.rows.length > 0) {
        const smValues: unknown[] = [];
        const smPlaceholders: string[] = [];
        let smIdx = 1;

        for (const batch of batchResult.rows) {
          const batchQty = Money.parseDb(batch.remaining_quantity).toNumber();
          const batchCost = Money.parseDb(batch.cost_price).toNumber();

          // For UPDATE re-imports, only record the delta (new - old)
          const existingKey = `${batch.product_id}|${batch.batch_number}`;
          const oldQty = existingBatchQty.get(existingKey) ?? 0;
          const delta = batchQty - oldQty;

          // Skip if no change or negative (we don't create ADJUSTMENT_OUT for re-imports)
          if (delta <= 0) continue;

          smPlaceholders.push(
            `(gen_random_uuid(), generate_movement_number(), $${smIdx}::uuid, $${smIdx + 1}::uuid,
              'OPENING_BALANCE'::movement_type, $${smIdx + 2}::numeric, $${smIdx + 3}::numeric,
              'IMPORT', NULL, $${smIdx + 4}::text, NULL)`
          );
          smValues.push(
            batch.product_id,
            batch.id,
            delta,
            batchCost,
            `Opening balance stock import`,
          );
          smIdx += 5;
        }

        if (smPlaceholders.length > 0) {
          const smResult = await client.query(
            `INSERT INTO stock_movements (
              id, movement_number, product_id, batch_id,
              movement_type, quantity, unit_cost,
              reference_type, reference_id, notes, created_by_id
            ) VALUES ${smPlaceholders.join(', ')}
            RETURNING id, movement_number, product_id, quantity, unit_cost`,
            smValues
          );

          // Collect movement data for GL posting by the caller
          for (const sm of smResult.rows) {
            stockMovements.push({
              movementId: sm.id as string,
              movementNumber: sm.movement_number as string,
              productId: sm.product_id as string,
              quantity: Money.parseDb(sm.quantity).toNumber(),
              unitCost: Money.parseDb(sm.unit_cost).toNumber(),
            });
          }
        }
      }
    }
  }

  return { inserted, skipped, stockMovements };
}

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

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let idx = 1;

  for (const r of rows) {
    placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`);
    values.push(
      r.name,
      r.email || null,
      r.phone || null,
      r.address || null,
      r.creditLimit ?? 0,
    );
    idx += 5;
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
    INSERT INTO customers (name, email, phone, address, credit_limit)
    VALUES ${placeholders.join(', ')}
    ${conflictClause}
    RETURNING id`;

  try {
    const result = await client.query(sql, values);
    const inserted = result.rowCount ?? 0;
    return { inserted, skipped: rows.length - inserted };
  } catch (error: unknown) {
    // If the unique index doesn't exist, fall back to simple insert
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('ON CONFLICT') || msg.includes('there is no unique')) {
      logger.warn('Customer dedup index missing, inserting without ON CONFLICT');
      const fallbackSql = `
        INSERT INTO customers (name, email, phone, address, credit_limit)
        VALUES ${placeholders.join(', ')}
        RETURNING id`;
      const result = await client.query(fallbackSql, values);
      return { inserted: result.rowCount ?? 0, skipped: 0 };
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
      r.notes || null,
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
    [skus.map(s => s.toLowerCase())]
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
    [names.map(n => n.toLowerCase())]
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
  const names = keys.map(k => k.name);
  const result = await pool.query(
    `SELECT LOWER(name) || '|' || LOWER(COALESCE(email, '')) AS key
     FROM customers
     WHERE LOWER(name) = ANY($1::text[])`,
    [names.map(n => n.toLowerCase())]
  );
  return new Set(result.rows.map((r: { key: string }) => r.key));
}

// ── Helper ────────────────────────────────────────────────

function paymentTermsStringToDays(terms: string): number {
  switch (terms?.toUpperCase()) {
    case 'COD': return 0;
    case 'PREPAID': return -1;
    case 'NET15': return 15;
    case 'NET30': return 30;
    case 'NET60': return 60;
    case 'NET90': return 90;
    default: {
      const match = terms?.match(/NET(\d+)/i);
      if (match) return parseInt(match[1], 10);
      return 30;
    }
  }
}
