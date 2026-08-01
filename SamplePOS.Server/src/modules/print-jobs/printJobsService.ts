import type { Pool, PoolClient } from 'pg';
import { NotFoundError, ValidationError } from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';
import { printJobsRepository } from './printJobsRepository.js';
import { printJobsTableReady } from './printJobsSchema.js';
import type {
  CreatePrintJobInput,
  PrintJobRecord,
  PrintJobStatus,
} from './printJobTypes.js';

type DbConn = Pool | PoolClient;

export const printJobsService = {
  async enqueue(conn: DbConn, input: CreatePrintJobInput): Promise<PrintJobRecord | null> {
    if (!(await printJobsTableReady(conn))) {
      logger.warn('print_jobs table missing — skip enqueue (apply migration 580)');
      return null;
    }
    if (!input.payloadJson || typeof input.payloadJson !== 'object' || Array.isArray(input.payloadJson)) {
      throw new ValidationError('print job payload_json is required');
    }
    if (!Array.isArray((input.payloadJson as { items?: unknown }).items)) {
      throw new ValidationError('print job payload must include items[]');
    }
    return printJobsRepository.create(conn, input);
  },

  async enqueueMany(conn: DbConn, inputs: CreatePrintJobInput[]): Promise<PrintJobRecord[]> {
    if (inputs.length === 0) return [];
    if (!(await printJobsTableReady(conn))) {
      logger.warn('print_jobs table missing — skip enqueueMany (apply migration 580)');
      return [];
    }
    const out: PrintJobRecord[] = [];
    for (const input of inputs) {
      const job = await this.enqueue(conn, input);
      if (job) out.push(job);
    }
    return out;
  },

  async listPending(pool: Pool, limit?: number): Promise<PrintJobRecord[]> {
    if (!(await printJobsTableReady(pool))) return [];
    // Reclaim stuck PRINTING (crash mid-delivery) so terminals can retry.
    await printJobsRepository.reclaimStalePrinting(pool);
    return printJobsRepository.listPending(pool, limit);
  },

  async getById(pool: Pool, id: string): Promise<PrintJobRecord> {
    if (!(await printJobsTableReady(pool))) {
      throw new NotFoundError('Print job');
    }
    const job = await printJobsRepository.getById(pool, id);
    if (!job) throw new NotFoundError('Print job');
    return job;
  },

  async markStatus(
    pool: Pool,
    id: string,
    status: PrintJobStatus,
    opts?: { errorMessage?: string | null },
  ): Promise<PrintJobRecord> {
    if (!(await printJobsTableReady(pool))) {
      throw new NotFoundError('Print job');
    }
    const existing = await printJobsRepository.getById(pool, id);
    if (!existing) throw new NotFoundError('Print job');

    // Idempotent: already printed stays printed.
    if (existing.status === 'PRINTED') {
      return existing;
    }

    const updated = await printJobsRepository.updateStatus(pool, id, {
      status,
      errorMessage: opts?.errorMessage ?? null,
      // Only ERROR counts as a retry attempt (PRINTING is in-flight).
      incrementRetry: status === 'ERROR',
    });
    if (!updated) throw new NotFoundError('Print job');
    return updated;
  },

  /** Kitchen/FOH reprint — reset to PENDING for another agent delivery. */
  async requeue(pool: Pool, id: string): Promise<PrintJobRecord> {
    if (!(await printJobsTableReady(pool))) {
      throw new NotFoundError('Print job');
    }
    const existing = await printJobsRepository.getById(pool, id);
    if (!existing) throw new NotFoundError('Print job');
    const updated = await printJobsRepository.updateStatus(pool, id, {
      status: 'PENDING',
      errorMessage: null,
      incrementRetry: false,
      clearPrintedAt: true,
    });
    if (!updated) throw new NotFoundError('Print job');
    return updated;
  },
};
