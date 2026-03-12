/**
 * Import Worker - Background CSV processing via Bull queue
 *
 * ARCHITECTURE: Worker process — registered with Bull queue system.
 * Streams CSV files line-by-line to keep memory below 20MB even for 100MB files.
 *
 * Processing flow:
 * 1. Count total rows (quick stream pass)
 * 2. Stream CSV rows, map columns, validate with Zod
 * 3. Accumulate valid rows into chunks of CHUNK_SIZE
 * 4. Each chunk gets its own BEGIN/COMMIT transaction
 * 5. Errors are batch-logged to import_job_errors
 * 6. Job progress updated after each chunk
 */

import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { parse } from 'csv-parse';
import { Transform, type TransformCallback } from 'stream';
import { pipeline } from 'stream/promises';
import logger from '../../utils/logger.js';
import { pool as globalPool } from '../../db/pool.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import * as importRepo from './importRepository.js';
import { cleanupJobFile } from './importService.js';
import { ProductCreateSchema } from '../../../../shared/zod/product.js';
import { CreateCustomerSchema } from '../../../../shared/zod/customer.js';
import { CreateSupplierSchema } from '../../../../shared/zod/supplier.js';
import {
  getFieldMapForEntity,
  type ImportEntityType,
  type DuplicateStrategy,
  type ImportErrorType,
} from '../../../../shared/zod/importSchemas.js';
import type { ZodSchema } from 'zod';

// ── Tuning Constants ──────────────────────────────────────
// Entity-aware chunk sizes balance throughput vs PostgreSQL's 65,535 parameter limit.
// Products: 19 fields × 500 = 9,500 params. Customers: 5 × 1,000 = 5,000. Suppliers: 10 × 500 = 5,000.
function getChunkSize(entityType: ImportEntityType): number {
  switch (entityType) {
    case 'PRODUCT': return 500;
    case 'CUSTOMER': return 1000;
    case 'SUPPLIER': return 500;
  }
}

// Max pending errors before forced flush (5 params each → 2,000 × 5 = 10,000, safe under 65,535)
const ERROR_FLUSH_THRESHOLD = 2000;

// Minimum rows between progress DB updates (prevents 0% UI when many rows fail sequentially)
const PROGRESS_UPDATE_INTERVAL = 500;

// ── Types ─────────────────────────────────────────────────

interface ImportJobPayload {
  jobId: string;
  entityType: ImportEntityType;
  duplicateStrategy: DuplicateStrategy;
  filePath: string;
  userId: string;
}

interface PendingError {
  importJobId: string;
  rowNumber: number;
  rawData: Record<string, string> | null;
  errorMessage: string;
  errorType: ImportErrorType;
}

interface ChunkResult {
  inserted: number;
  skipped: number;
  failed: number;
}

// ── Entry Point ───────────────────────────────────────────

/**
 * Process a CSV import job. Called by the Bull queue worker.
 */
export async function processImportJob(payload: ImportJobPayload): Promise<void> {
  const { jobId, entityType, duplicateStrategy, filePath } = payload;
  const log = logger.child({ module: 'importWorker', jobId, entityType });

  log.info('Starting CSV import job', { filePath, duplicateStrategy });

  try {
    // Verify file exists
    await stat(filePath);
  } catch {
    log.error('Import file not found', { filePath });
    await importRepo.completeImportJob(jobId, 'FAILED', `File not found: ${filePath}`);
    return;
  }

  // Count total rows in a quick pass (stream, no memory load)
  const totalRows = await countCsvRows(filePath);
  if (totalRows === 0) {
    log.warn('CSV file is empty or has only headers');
    // For empty files, still guard the status transition
    const started = await importRepo.markJobProcessing(jobId, 0);
    if (!started) {
      log.warn('Job was cancelled before processing empty file');
      return;
    }
    await importRepo.completeImportJob(jobId, 'COMPLETED', 'File was empty');
    return;
  }

  // Atomically transition PENDING → PROCESSING (guards against cancelled jobs or duplicate workers)
  const didStart = await importRepo.markJobProcessing(jobId, totalRows);
  if (!didStart) {
    log.warn('Job was cancelled or already picked up — aborting');
    return;
  }

  // Get the Zod schema and field map for this entity type
  const schema = getZodSchema(entityType);
  const fieldMap = getFieldMapForEntity(entityType);
  const chunkSize = getChunkSize(entityType);

  log.info('Processing parameters', { totalRows, chunkSize, duplicateStrategy });

  // Track progress across all chunks
  const progress = {
    rowsProcessed: 0,
    rowsImported: 0,
    rowsSkipped: 0,
    rowsFailed: 0,
  };

  // Accumulator for chunk-based processing
  let chunkBuffer: Record<string, unknown>[] = [];
  let chunkRowNumbers: number[] = [];
  let pendingErrors: PendingError[] = [];
  let lastProgressUpdateAt = 0;

  // In-file duplicate detection (e.g., two rows with same SKU)
  const seenKeys = new Set<string>();

  let currentRow = 0;

  // ── Streaming transform that validates + buffers rows ──
  const validatingTransform = new Transform({
    objectMode: true,
    async transform(
      infoRecord: { record: Record<string, string>; info: { index: number; columns: { name: string }[]; error?: unknown } },
      _encoding: string,
      callback: TransformCallback
    ) {
      currentRow++;
      const rowNum = currentRow; // 1-based CSV data row (after header)
      const record = infoRecord.record;
      const recordInfo = infoRecord.info;

      try {
        // Detect rows with more fields than headers — indicates unquoted commas
        // inside values (e.g., "4,000" without quotes). These silently truncate
        // numeric values so we must reject them with a clear message.
        if (recordInfo.index > recordInfo.columns.length) {
          pendingErrors.push({
            importJobId: jobId,
            rowNumber: rowNum,
            rawData: record,
            errorMessage: `Row has ${recordInfo.index} fields but header has ${recordInfo.columns.length} columns. ` +
              'Values containing commas (e.g., "1,000") must be quoted in CSV files.',
            errorType: 'VALIDATION',
          });
          progress.rowsProcessed++;
          progress.rowsFailed++;

          if (pendingErrors.length >= ERROR_FLUSH_THRESHOLD) {
            await importRepo.logImportErrors(pendingErrors);
            pendingErrors = [];
          }
          if (progress.rowsProcessed - lastProgressUpdateAt >= PROGRESS_UPDATE_INTERVAL) {
            await importRepo.updateImportProgress(jobId, progress);
            lastProgressUpdateAt = progress.rowsProcessed;
          }
          callback();
          return;
        }

        // Map CSV columns to entity fields
        const mapped = mapCsvRow(record, fieldMap, entityType);

        // In-file duplicate detection
        const dedupeKey = getDedupeKey(mapped, entityType);
        if (dedupeKey && seenKeys.has(dedupeKey)) {
          pendingErrors.push({
            importJobId: jobId,
            rowNumber: rowNum,
            rawData: record,
            errorMessage: `Duplicate row in CSV: ${dedupeKey}`,
            errorType: 'DUPLICATE',
          });
          progress.rowsProcessed++;
          progress.rowsFailed++;

          // Safety valve: flush errors when buffer gets large
          if (pendingErrors.length >= ERROR_FLUSH_THRESHOLD) {
            await importRepo.logImportErrors(pendingErrors);
            pendingErrors = [];
          }

          // Periodic progress update
          if (progress.rowsProcessed - lastProgressUpdateAt >= PROGRESS_UPDATE_INTERVAL) {
            await importRepo.updateImportProgress(jobId, progress);
            lastProgressUpdateAt = progress.rowsProcessed;
          }

          callback();
          return;
        }
        if (dedupeKey) seenKeys.add(dedupeKey);

        // Validate with Zod
        const parseResult = schema.safeParse(mapped);
        if (!parseResult.success) {
          const errorMsg = parseResult.error.issues
            .map(i => `${i.path.join('.')}: ${i.message}`)
            .join('; ');
          pendingErrors.push({
            importJobId: jobId,
            rowNumber: rowNum,
            rawData: record,
            errorMessage: errorMsg,
            errorType: 'VALIDATION',
          });
          progress.rowsProcessed++;
          progress.rowsFailed++;

          // Safety valve: flush errors when buffer gets large (prevents PG param overflow)
          if (pendingErrors.length >= ERROR_FLUSH_THRESHOLD) {
            await importRepo.logImportErrors(pendingErrors);
            pendingErrors = [];
          }

          // Periodic progress update even without chunk flushes (prevents UI showing 0%)
          if (progress.rowsProcessed - lastProgressUpdateAt >= PROGRESS_UPDATE_INTERVAL) {
            await importRepo.updateImportProgress(jobId, progress);
            lastProgressUpdateAt = progress.rowsProcessed;
          }

          callback();
          return;
        }

        // Add to chunk buffer
        chunkBuffer.push(parseResult.data as Record<string, unknown>);
        chunkRowNumbers.push(rowNum);

        // Flush chunk when full
        if (chunkBuffer.length >= chunkSize) {
          const result = await flushChunk(
            chunkBuffer, chunkRowNumbers, entityType,
            duplicateStrategy, jobId, pendingErrors
          );
          progress.rowsProcessed += chunkBuffer.length;
          progress.rowsImported += result.inserted;
          progress.rowsSkipped += result.skipped;
          progress.rowsFailed += result.failed;

          // Flush pending errors
          if (pendingErrors.length > 0) {
            await importRepo.logImportErrors(pendingErrors);
            pendingErrors = [];
          }

          // Update job progress
          await importRepo.updateImportProgress(jobId, progress);
          lastProgressUpdateAt = progress.rowsProcessed;

          chunkBuffer = [];
          chunkRowNumbers = [];
        }

        callback();
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error('Error processing row', { rowNum, error: msg });
        pendingErrors.push({
          importJobId: jobId,
          rowNumber: rowNum,
          rawData: record,
          errorMessage: msg,
          errorType: 'DATABASE',
        });
        progress.rowsProcessed++;
        progress.rowsFailed++;

        // Safety valve: flush errors when buffer gets large
        if (pendingErrors.length >= ERROR_FLUSH_THRESHOLD) {
          await importRepo.logImportErrors(pendingErrors);
          pendingErrors = [];
        }

        callback();
      }
    },
  });

  try {
    // Stream the CSV file through the parser → validating transform
    const parser = parse({
      columns: true,       // Use first row as header keys
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,           // Strip UTF-8 BOM from Excel-exported files
      cast: false,          // Keep all values as strings; Zod handles coercion
      info: true,           // Attach record info so we can detect extra columns
    });

    await pipeline(
      createReadStream(filePath, { highWaterMark: 64 * 1024 }), // 64KB read chunks
      parser,
      validatingTransform,
    );

    // Flush remaining rows in the last partial chunk
    if (chunkBuffer.length > 0) {
      const result = await flushChunk(
        chunkBuffer, chunkRowNumbers, entityType,
        duplicateStrategy, jobId, pendingErrors
      );
      progress.rowsProcessed += chunkBuffer.length;
      progress.rowsImported += result.inserted;
      progress.rowsSkipped += result.skipped;
      progress.rowsFailed += result.failed;
    }

    // Flush remaining errors
    if (pendingErrors.length > 0) {
      await importRepo.logImportErrors(pendingErrors);
    }

    // Final progress update
    await importRepo.updateImportProgress(jobId, progress);
    await importRepo.completeImportJob(jobId, 'COMPLETED');

    log.info('Import job completed', {
      rowsTotal: totalRows,
      ...progress,
    });

    // Clean up uploaded file after successful completion
    await cleanupJobFile(jobId).catch(() => { });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error('Import job failed', { error: msg });

    // Any rows left in the buffer were validated but never flushed — count as failed
    if (chunkBuffer.length > 0) {
      for (let i = 0; i < chunkBuffer.length; i++) {
        pendingErrors.push({
          importJobId: jobId,
          rowNumber: chunkRowNumbers[i],
          rawData: chunkBuffer[i] as unknown as Record<string, string>,
          errorMessage: `Import aborted before row could be inserted: ${msg}`,
          errorType: 'DATABASE',
        });
      }
      progress.rowsProcessed += chunkBuffer.length;
      progress.rowsFailed += chunkBuffer.length;
    }

    // Flush any pending errors before marking failed
    if (pendingErrors.length > 0) {
      await importRepo.logImportErrors(pendingErrors).catch(() => { });
    }
    await importRepo.updateImportProgress(jobId, progress).catch(() => { });
    await importRepo.completeImportJob(jobId, 'FAILED', msg);

    // Note: NOT cleaning up file on failure to allow retry
  }
}

// ── Chunk Flusher ─────────────────────────────────────────

/**
 * Insert a chunk of validated rows inside a single transaction.
 * If FAIL strategy and duplicates exist, the entire chunk is rejected.
 */
async function flushChunk(
  rows: Record<string, unknown>[],
  rowNumbers: number[],
  entityType: ImportEntityType,
  duplicateStrategy: DuplicateStrategy,
  jobId: string,
  pendingErrors: PendingError[]
): Promise<ChunkResult> {
  let failedCount = 0;

  try {
    // For FAIL strategy, pre-check for DB-level duplicates
    if (duplicateStrategy === 'FAIL') {
      const existingDups = await checkExistingDuplicates(rows, entityType);
      if (existingDups.size > 0) {
        // Separate duplicates from non-duplicates in a single pass
        const nonDupRows: Record<string, unknown>[] = [];
        const nonDupRowNums: number[] = [];

        for (let i = 0; i < rows.length; i++) {
          const key = getDedupeKey(rows[i], entityType);
          if (key && existingDups.has(key)) {
            pendingErrors.push({
              importJobId: jobId,
              rowNumber: rowNumbers[i],
              rawData: rows[i] as unknown as Record<string, string>,
              errorMessage: `Duplicate: ${key} already exists in database`,
              errorType: 'DUPLICATE',
            });
            failedCount++;
          } else {
            nonDupRows.push(rows[i]);
            nonDupRowNums.push(rowNumbers[i]);
          }
        }

        if (nonDupRows.length === 0) {
          return { inserted: 0, skipped: 0, failed: failedCount };
        }
        rows = nonDupRows;
        rowNumbers = nonDupRowNums;
      }
    }

    // Execute bulk insert inside a transaction
    const result = await UnitOfWork.run(globalPool, async (client) => {
      // Safety: cancel any single statement that takes > 60s (prevents indefinite hangs)
      await client.query("SET LOCAL statement_timeout = '60000'");

      switch (entityType) {
        case 'PRODUCT':
          return importRepo.bulkInsertProducts(
            client,
            rows as Parameters<typeof importRepo.bulkInsertProducts>[1],
            duplicateStrategy
          );
        case 'CUSTOMER':
          return importRepo.bulkInsertCustomers(
            client,
            rows as Parameters<typeof importRepo.bulkInsertCustomers>[1],
            duplicateStrategy
          );
        case 'SUPPLIER':
          return importRepo.bulkInsertSuppliers(
            client,
            rows as Parameters<typeof importRepo.bulkInsertSuppliers>[1],
            duplicateStrategy
          );
      }
    });

    return { ...result, failed: failedCount };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Chunk insert failed', { entityType, chunkSize: rows.length, error: msg });

    // Log each row in the failed chunk as a DATABASE error
    for (let i = 0; i < rows.length; i++) {
      pendingErrors.push({
        importJobId: jobId,
        rowNumber: rowNumbers[i],
        rawData: rows[i] as unknown as Record<string, string>,
        errorMessage: `Chunk failed: ${msg}`,
        errorType: 'DATABASE',
      });
    }
    return { inserted: 0, skipped: 0, failed: rows.length + failedCount };
  }
}

// ── CSV Row Mapping ───────────────────────────────────────

/**
 * Map a raw CSV row (keyed by header names) to entity field names.
 * Handles case-insensitive header matching.
 * Coerces numeric strings for fields that Zod expects as numbers.
 */
function mapCsvRow(
  record: Record<string, string>,
  fieldMap: Record<string, string>,
  entityType: ImportEntityType
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [csvHeader, value] of Object.entries(record)) {
    const normalizedHeader = csvHeader.trim().toLowerCase();
    const fieldName = fieldMap[normalizedHeader];
    if (!fieldName) continue; // Unmapped column — skip silently

    // Sanitize: strip control characters, limit length
    const sanitized = value.replace(/[\x00-\x1F\x7F]/g, '').trim();
    if (sanitized === '') continue; // Skip empty values

    result[fieldName] = coerceValue(fieldName, sanitized, entityType);
  }

  return result;
}

/**
 * Coerce string values from CSV to the correct JS types.
 * Zod strict() mode needs numbers to actually be numbers, booleans to be booleans.
 */
function coerceValue(fieldName: string, value: string, entityType: ImportEntityType): unknown {
  // Numeric fields
  const numericFields = new Set([
    'costPrice', 'sellingPrice', 'taxRate', 'reorderLevel',
    'conversionFactor', 'minDaysBeforeExpirySale',
    'creditLimit', 'quantityOnHand',
  ]);

  if (numericFields.has(fieldName)) {
    // Strip thousand separators (commas/spaces) before parsing: "1,000" → "1000"
    const cleaned = value.replace(/[,\s]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? value : num; // Let Zod catch NaN values
  }

  // Boolean fields
  const booleanFields = new Set(['isTaxable', 'trackExpiry', 'isActive', 'autoUpdatePrice']);
  if (booleanFields.has(fieldName)) {
    const lower = value.toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(lower)) return true;
    if (['false', '0', 'no', 'n', ''].includes(lower)) return false;
    return value; // Zod will reject invalid booleans
  }

  // UOM alias normalisation — map common abbreviations to canonical enum values
  if (fieldName === 'unitOfMeasure') {
    const uomAliases: Record<string, string> = {
      'EA': 'EACH', 'EACH': 'EACH', 'PC': 'PIECE', 'PCS': 'PIECE', 'PIECE': 'PIECE',
      'BOX': 'BOX', 'BX': 'BOX', 'CTN': 'CARTON', 'CARTON': 'CARTON',
      'KG': 'KG', 'KILO': 'KG', 'KILOGRAM': 'KG',
      'L': 'LITER', 'LTR': 'LITER', 'LITER': 'LITER', 'LITRE': 'LITER',
      'M': 'METER', 'MTR': 'METER', 'METER': 'METER', 'METRE': 'METER',
      'BTL': 'BOTTLE', 'BOTTLE': 'BOTTLE',
      'CRT': 'CRATE', 'CRATE': 'CRATE',
      'DZ': 'DOZEN', 'DOZ': 'DOZEN', 'DOZEN': 'DOZEN',
      'PKT': 'PACKET', 'PACKET': 'PACKET', 'PACK': 'PACK',
      'SKT': 'SACHET', 'SACHET': 'SACHET',
      'SCK': 'SACK', 'SACK': 'SACK',
      'ST': 'STRIP', 'STRIP': 'STRIP',
      'TB': 'TABLET', 'TAB': 'TABLET', 'TABLET': 'TABLET',
      'TN': 'TIN', 'TIN': 'TIN',
    };
    return uomAliases[value.toUpperCase()] || value.toUpperCase();
  }

  // Date fields — normalise common formats to YYYY-MM-DD
  if (fieldName === 'expiryDate') {
    return normalizeDateString(value);
  }

  return value;
}

// ── Deduplication Helpers ─────────────────────────────────

/**
 * Normalise common date formats to YYYY-MM-DD for Zod validation.
 * Accepts: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, MM-DD-YYYY,
 * YYYY/MM/DD, and Excel serial date numbers.
 */
function normalizeDateString(value: string): string {
  let candidate: string | null = null;

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    candidate = value;
  }

  // YYYY/MM/DD
  if (!candidate && /^\d{4}\/\d{2}\/\d{2}$/.test(value)) {
    candidate = value.replace(/\//g, '-');
  }

  // DD/MM/YYYY or DD-MM-YYYY (day > 12 disambiguates)
  if (!candidate) {
    const slashParts = value.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/);
    if (slashParts) {
      const [, a, b, year] = slashParts;
      const aNum = parseInt(a, 10);
      const bNum = parseInt(b, 10);
      // If first part > 12, it must be a day (DD/MM/YYYY)
      if (aNum > 12) {
        candidate = `${year}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
      }
      // If second part > 12, it must be a day (MM/DD/YYYY)
      else if (bNum > 12) {
        candidate = `${year}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
      }
      // Ambiguous (both ≤ 12) — assume DD/MM/YYYY (more common internationally)
      else {
        candidate = `${year}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
      }
    }
  }

  // Excel serial number (e.g., 45678)
  if (!candidate) {
    const serial = parseInt(value, 10);
    if (!isNaN(serial) && serial > 30000 && serial < 100000 && String(serial) === value.trim()) {
      // Excel epoch: 1899-12-30
      const excelEpoch = new Date(1899, 11, 30);
      const d = new Date(excelEpoch.getTime() + serial * 86400000);
      const yy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      candidate = `${yy}-${mm}-${dd}`;
    }
  }

  // Validate the candidate is a real calendar date (rejects 1900-01-00, 2025-02-30, etc.)
  if (candidate) {
    const [y, m, d] = candidate.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    if (dateObj.getFullYear() === y && dateObj.getMonth() === m - 1 && dateObj.getDate() === d) {
      return candidate;
    }
    // Invalid date — fall through to return original value so Zod rejects it
  }

  // Return as-is — Zod regex will reject it with a clear message
  return value;
}

/**
 * Get a deduplication key for a row based on entity type.
 */
function getDedupeKey(row: Record<string, unknown>, entityType: ImportEntityType): string | null {
  switch (entityType) {
    case 'PRODUCT':
      return row.sku ? String(row.sku).toLowerCase() : null;
    case 'CUSTOMER': {
      const name = row.name ? String(row.name).toLowerCase() : '';
      const email = row.email ? String(row.email).toLowerCase() : '';
      return `${name}|${email}`;
    }
    case 'SUPPLIER':
      return row.name ? String(row.name).toLowerCase() : null;
  }
}

/**
 * Check for existing duplicates in the database (used by FAIL strategy).
 */
async function checkExistingDuplicates(
  rows: Record<string, unknown>[],
  entityType: ImportEntityType
): Promise<Set<string>> {
  switch (entityType) {
    case 'PRODUCT': {
      const skus = rows.map(r => String(r.sku || '')).filter(Boolean);
      const existing = await importRepo.findExistingProductSkus(skus);
      return new Set([...existing].map(s => s.toLowerCase()));
    }
    case 'SUPPLIER': {
      const names = rows.map(r => String(r.name || '')).filter(Boolean);
      const existing = await importRepo.findExistingSupplierNames(names);
      return new Set([...existing].map(s => s.toLowerCase()));
    }
    case 'CUSTOMER': {
      const keys = rows.map(r => ({
        name: String(r.name || ''),
        email: r.email ? String(r.email) : null,
      }));
      return importRepo.findExistingCustomerKeys(keys);
    }
  }
}

// ── Zod Schema Selector ──────────────────────────────────

function getZodSchema(entityType: ImportEntityType): ZodSchema {
  switch (entityType) {
    case 'PRODUCT': return ProductCreateSchema;
    case 'CUSTOMER': return CreateCustomerSchema;
    case 'SUPPLIER': return CreateSupplierSchema;
  }
}

// ── Row Counter ──────────────────────────────────────────

/**
 * Count data rows in a CSV file by streaming (excludes header).
 * Memory-safe — never loads the full file.
 */
function countCsvRows(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let count = 0;
    const parser = parse({
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
    });

    parser.on('readable', () => {
      while (parser.read() !== null) count++;
    });
    parser.on('end', () => resolve(count));
    parser.on('error', reject);

    createReadStream(filePath, { highWaterMark: 64 * 1024 }).pipe(parser);
  });
}
