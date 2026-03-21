/**
 * Import Service - Business logic for CSV import operations
 *
 * ARCHITECTURE: Service layer — orchestrates repository calls,
 * Bull job creation, and validation logic.
 *
 * This service handles:
 * - Creating import job records
 * - Enqueueing Bull jobs for background processing
 * - Querying job status and errors
 */

import logger from '../../utils/logger.js';
import { unlink, access } from 'fs/promises';
import * as importRepo from './importRepository.js';
import { NotFoundError, ValidationError } from '../../middleware/errorHandler.js';
import type { TenantPoolConfig } from '../../db/connectionManager.js';
import type pg from 'pg';
import {
  getTemplateHeaders,
  type ImportEntityType,
  type DuplicateStrategy,
  type ImportJob,
  type ImportJobError,
} from '../../../../shared/zod/importSchemas.js';

// Lazy-loaded reference to the job queue singleton.
// We import dynamically to avoid circular dependency with server startup.
let jobQueueInstance: {
  addJob: (queue: string, type: string, data: unknown) => Promise<unknown>;
  getQueue?: (
    name: string
  ) =>
    | {
      getWaiting: () => Promise<
        Array<{ data?: Record<string, unknown>; remove: () => Promise<void> }>
      >;
    }
    | undefined;
} | null = null;

async function getJobQueue() {
  if (!jobQueueInstance) {
    const mod = await import('../../services/jobQueue.js');
    jobQueueInstance = mod.jobQueue;
  }
  return jobQueueInstance!;
}

// ── Create Import Job ─────────────────────────────────────

export interface CreateImportJobInput {
  entityType: ImportEntityType;
  duplicateStrategy: DuplicateStrategy;
  fileName: string;
  filePath: string;
  fileSizeBytes: number;
  userId: string;
  tenantPoolConfig?: TenantPoolConfig;
}

/**
 * Create a new import job and enqueue it for background processing.
 * Returns the created job record.
 */
export async function createImportJob(
  input: CreateImportJobInput,
  dbPool?: pg.Pool
): Promise<ImportJob> {
  // Generate business ID
  const jobNumber = await importRepo.generateJobNumber(dbPool);

  // Insert job record
  const job = await importRepo.createImportJob(
    {
      jobNumber,
      entityType: input.entityType,
      fileName: input.fileName,
      filePath: input.filePath,
      fileSizeBytes: input.fileSizeBytes,
      duplicateStrategy: input.duplicateStrategy,
      userId: input.userId,
    },
    dbPool
  );

  // Enqueue Bull job for background processing
  try {
    const jq = await getJobQueue();
    await jq.addJob('imports', 'csv-import', {
      jobId: job.id,
      entityType: input.entityType,
      duplicateStrategy: input.duplicateStrategy,
      filePath: input.filePath,
      userId: input.userId,
      tenantPoolConfig: input.tenantPoolConfig,
    });

    logger.info('Import job created and enqueued', {
      jobId: job.id,
      jobNumber: job.jobNumber,
      entityType: input.entityType,
      fileName: input.fileName,
      fileSizeBytes: input.fileSizeBytes,
    });
  } catch (error: unknown) {
    // If queue enqueue fails, mark job as FAILED
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Failed to enqueue import job', { jobId: job.id, error: msg });
    await importRepo.completeImportJob(job.id, 'FAILED', `Queue error: ${msg}`, dbPool);
    throw error;
  }

  return job;
}

// ── Query Helpers ─────────────────────────────────────────

/**
 * Get import job by ID or job number.
 */
export async function getImportJob(
  identifier: string,
  dbPool?: pg.Pool
): Promise<ImportJob | null> {
  // UUID pattern check
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(identifier);
  if (isUuid) {
    return importRepo.findJobById(identifier, dbPool);
  }
  return importRepo.findJobByNumber(identifier, dbPool);
}

/**
 * List import jobs with optional filtering.
 */
export async function listImportJobs(
  filters: {
    userId?: string;
    entityType?: ImportEntityType;
    status?: string;
    limit?: number;
    offset?: number;
  },
  dbPool?: pg.Pool
): Promise<{ rows: ImportJob[]; total: number }> {
  return importRepo.listJobs(filters, dbPool);
}

/**
 * Get errors for a specific import job.
 */
export async function getImportJobErrors(
  jobId: string,
  limit: number = 100,
  offset: number = 0,
  dbPool?: pg.Pool
): Promise<{ rows: ImportJobError[]; total: number }> {
  return importRepo.getJobErrors(jobId, limit, offset, dbPool);
}

// ── Cancel Job ────────────────────────────────────────────

/**
 * Cancel an import job. Only PENDING jobs can be cancelled.
 * Removes the Bull queue job if it hasn't started processing.
 */
export async function cancelImportJob(identifier: string, dbPool?: pg.Pool): Promise<ImportJob> {
  const job = await getImportJob(identifier, dbPool);
  if (!job) throw new NotFoundError('Import job not found');

  if (job.status !== 'PENDING') {
    throw new ValidationError(
      `Cannot cancel job in ${job.status} state — only PENDING jobs can be cancelled`
    );
  }

  // Atomic cancel — prevents race condition with worker pickup
  const didCancel = await importRepo.atomicCancelJob(job.id, dbPool);
  if (!didCancel) {
    throw new ValidationError('Job status changed — it may have started processing');
  }

  // Best-effort: remove from Bull queue
  try {
    const jq = await getJobQueue();
    const queue = jq.getQueue?.('imports');
    if (queue) {
      const waitingJobs = await queue.getWaiting();
      const bullJob = waitingJobs.find((j) => {
        const payload = (j.data as Record<string, unknown>)?.payload as
          | Record<string, unknown>
          | undefined;
        return payload?.jobId === job.id;
      });
      if (bullJob) await bullJob.remove();
    }
  } catch (err: unknown) {
    logger.warn('Could not remove Bull job during cancel', {
      jobId: job.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info('Import job cancelled', { jobId: job.id, jobNumber: job.jobNumber });

  // Re-fetch to return accurate DB state (completedAt is now set)
  const updated = await importRepo.findJobById(job.id, dbPool);
  return updated ?? { ...job, status: 'CANCELLED' };
}

// ── Retry Job ─────────────────────────────────────────────

/**
 * Retry a FAILED import job by reading the stored file path and re-enqueueing.
 */
export async function retryImportJob(
  identifier: string,
  tenantPoolConfig?: TenantPoolConfig,
  dbPool?: pg.Pool
): Promise<ImportJob> {
  const job = await getImportJob(identifier, dbPool);
  if (!job) throw new NotFoundError('Import job not found');

  if (job.status !== 'FAILED') {
    throw new ValidationError(
      `Cannot retry job in ${job.status} state — only FAILED jobs can be retried`
    );
  }

  // Get the file_path from DB (not exposed in ImportJob interface)
  const filePath = await importRepo.getJobFilePath(job.id, dbPool);
  if (!filePath) {
    throw new ValidationError('CSV file path not found — file may have been cleaned up');
  }

  // Verify file actually exists on disk before re-queuing
  try {
    await access(filePath);
  } catch {
    throw new ValidationError('CSV file no longer exists on disk — cannot retry');
  }

  // Atomic reset — prevents race condition where two concurrent retries both succeed
  const didReset = await importRepo.resetJobForRetry(job.id, dbPool);
  if (!didReset) {
    throw new ValidationError('Job status changed — another retry may already be in progress');
  }

  // Clear previous errors
  await importRepo.deleteJobErrors(job.id, dbPool);

  // Re-enqueue
  const jq = await getJobQueue();
  await jq.addJob('imports', 'csv-import', {
    jobId: job.id,
    entityType: job.entityType,
    duplicateStrategy: job.duplicateStrategy,
    filePath,
    userId: job.userId,
    tenantPoolConfig,
  });

  logger.info('Import job retried', { jobId: job.id, jobNumber: job.jobNumber });

  // Re-fetch to return accurate DB state
  const updated = await importRepo.findJobById(job.id, dbPool);
  return (
    updated ?? {
      ...job,
      status: 'PENDING',
      rowsProcessed: 0,
      rowsImported: 0,
      rowsSkipped: 0,
      rowsFailed: 0,
      errorSummary: null,
    }
  );
}

// ── CSV Template ──────────────────────────────────────────

/**
 * Generate a CSV template (header row only) for a given entity type.
 * Uses the canonical field names from the CSV field maps.
 */
export function generateCsvTemplate(entityType: ImportEntityType): {
  headers: string[];
  filename: string;
} {
  const headers = [...getTemplateHeaders(entityType)];
  const filename = `${entityType.toLowerCase()}-template.csv`;
  return { headers, filename };
}

// ── File Cleanup ──────────────────────────────────────────

/**
 * Delete the uploaded CSV file for a completed/failed job.
 * Called after job processing finishes.
 */
export async function cleanupJobFile(jobId: string): Promise<void> {
  const filePath = await importRepo.getJobFilePath(jobId);
  if (!filePath) return;

  try {
    await unlink(filePath);
    logger.info('Cleaned up import file', { jobId, filePath });
  } catch (err: unknown) {
    // File may already be deleted — not critical
    logger.warn('Failed to clean up import file', {
      jobId,
      filePath,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // If file was an Excel conversion, also clean up the original .xlsx/.xls
  if (filePath.endsWith('.csv')) {
    for (const ext of ['.xlsx', '.xls']) {
      const originalPath = filePath.replace(/\.csv$/, ext);
      try {
        await access(originalPath);
        await unlink(originalPath);
        logger.info('Cleaned up original Excel file', { jobId, originalPath });
      } catch {
        // Original file doesn't exist or already deleted — ignore
      }
    }
  }
}
