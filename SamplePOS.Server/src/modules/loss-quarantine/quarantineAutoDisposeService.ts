/**
 * Quarantine auto-dispose (P4) — policy-gated write-off after aging.
 * Uses existing disposeFromQuarantine gateway (soft/hard). Posts P&L.
 * Separate flag from expiry_automation_enabled; default OFF.
 */

import type { Pool } from 'pg';
import type { DbConnection } from '../../db/unitOfWork.js';
import { ValidationError } from '../../middleware/errorHandler.js';
import { tableHasColumn } from '../../db/schemaColumnCache.js';
import logger from '../../utils/logger.js';
import {
  QUARANTINE_AUTO_DISPOSE_BUCKET,
  QUARANTINE_AUTO_DISPOSE_DEFAULT_MIN_AGE_DAYS,
  QUARANTINE_AUTO_DISPOSE_MAX_LINES_PER_RUN,
} from '@shared/loss-quarantine/index.js';
import { getQuarantineAging, type QuarantineAgingLine } from './quarantineAgingService.js';
import { disposeFromQuarantine, type DisposeResult } from './lossDisposalService.js';

export interface QuarantineAutoDisposeSettings {
  enabled: boolean;
  minAgeDays: number;
}

export interface AutoDisposeCandidate extends QuarantineAgingLine {}

export interface QuarantineAutoDisposePreview {
  quarantineMode: 'HARD' | 'SOFT';
  enabled: boolean;
  minAgeDays: number;
  candidates: AutoDisposeCandidate[];
  totalQuantity: number;
  totalValue: number;
}

export interface QuarantineAutoDisposeLineResult {
  inventoryBatchId: string | null;
  productLotId: string | null;
  productName: string;
  lotNumber: string;
  quantity: number;
  ageDays: number;
  documentNumber?: string;
  expenseAccountCode?: string;
  ok: boolean;
  error?: string;
}

export interface QuarantineAutoDisposeResult {
  quarantineMode: 'HARD' | 'SOFT';
  minAgeDays: number;
  linesProcessed: number;
  linesFailed: number;
  totalQuantityDisposed: number;
  totalAmount: number;
  lines: QuarantineAutoDisposeLineResult[];
  dryRun: boolean;
}

async function readAutoDisposeSettings(conn: DbConnection): Promise<QuarantineAutoDisposeSettings> {
  const hasEnabled = await tableHasColumn(conn, 'system_settings', 'quarantine_auto_dispose_enabled');
  if (!hasEnabled) {
    return { enabled: false, minAgeDays: QUARANTINE_AUTO_DISPOSE_DEFAULT_MIN_AGE_DAYS };
  }

  const hasMinAge = await tableHasColumn(
    conn,
    'system_settings',
    'quarantine_auto_dispose_min_age_days',
  );

  const result = await conn.query<{ enabled: boolean; min_age: number | null }>(
    hasMinAge
      ? `SELECT COALESCE(quarantine_auto_dispose_enabled, false) AS enabled,
                COALESCE(quarantine_auto_dispose_min_age_days, ${QUARANTINE_AUTO_DISPOSE_DEFAULT_MIN_AGE_DAYS}) AS min_age
         FROM system_settings LIMIT 1`
      : `SELECT COALESCE(quarantine_auto_dispose_enabled, false) AS enabled,
                ${QUARANTINE_AUTO_DISPOSE_DEFAULT_MIN_AGE_DAYS}::int AS min_age
         FROM system_settings LIMIT 1`,
  );

  const row = result.rows[0];
  const minAgeDays = Math.min(
    3650,
    Math.max(0, Number(row?.min_age ?? QUARANTINE_AUTO_DISPOSE_DEFAULT_MIN_AGE_DAYS)),
  );
  return {
    enabled: Boolean(row?.enabled),
    minAgeDays,
  };
}

export async function isQuarantineAutoDisposeEnabled(conn: DbConnection): Promise<boolean> {
  return (await readAutoDisposeSettings(conn)).enabled;
}

/** Attribute scheduled disposals to an active user (documents require UUID FK). */
async function resolveAutomationActorUserId(conn: DbConnection): Promise<string> {
  const result = await conn.query<{ id: string }>(
    `SELECT id::text AS id
     FROM users
     WHERE COALESCE(is_active, true) = true
     ORDER BY created_at ASC NULLS LAST
     LIMIT 1`,
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new ValidationError(
      'Quarantine auto-dispose requires at least one active user to attribute the disposal document',
    );
  }
  return id;
}

function reasonForLine(line: QuarantineAgingLine): 'EXPIRY' {
  return 'EXPIRY';
}

async function loadExpiredAgedCandidates(
  conn: DbConnection,
  minAgeDays: number,
): Promise<{ quarantineMode: 'HARD' | 'SOFT'; lines: QuarantineAgingLine[] }> {
  const report = await getQuarantineAging(conn, {
    minAgeDays,
    storeType: QUARANTINE_AUTO_DISPOSE_BUCKET,
    limit: QUARANTINE_AUTO_DISPOSE_MAX_LINES_PER_RUN,
  });
  return { quarantineMode: report.quarantineMode, lines: report.lines };
}

export async function previewQuarantineAutoDispose(
  conn: DbConnection,
): Promise<QuarantineAutoDisposePreview> {
  const settings = await readAutoDisposeSettings(conn);
  const { quarantineMode, lines } = await loadExpiredAgedCandidates(conn, settings.minAgeDays);
  const totalQuantity = lines.reduce((s, l) => s + l.quantity, 0);
  const totalValue = lines.reduce((s, l) => s + l.inventoryValue, 0);
  return {
    quarantineMode,
    enabled: settings.enabled,
    minAgeDays: settings.minAgeDays,
    candidates: lines,
    totalQuantity,
    totalValue,
  };
}

export async function processQuarantineAutoDispose(
  conn: DbConnection,
  userId: string | null | undefined,
  options?: { dryRun?: boolean; force?: boolean },
): Promise<QuarantineAutoDisposeResult> {
  const settings = await readAutoDisposeSettings(conn);
  if (!options?.force && !settings.enabled) {
    throw new ValidationError(
      'Quarantine auto-dispose is disabled. Enable it in settings or pass force=true for a manual run.',
    );
  }

  const dryRun = options?.dryRun ?? false;
  const actorUserId = userId?.trim() || (await resolveAutomationActorUserId(conn));
  const { quarantineMode, lines } = await loadExpiredAgedCandidates(conn, settings.minAgeDays);

  const results: QuarantineAutoDisposeLineResult[] = [];
  let totalQuantityDisposed = 0;
  let totalAmount = 0;
  let linesProcessed = 0;
  let linesFailed = 0;

  for (const line of lines) {
    if (dryRun) {
      results.push({
        inventoryBatchId: line.inventoryBatchId,
        productLotId: line.productLotId,
        productName: line.productName,
        lotNumber: line.lotNumber,
        quantity: line.quantity,
        ageDays: line.ageDays,
        ok: true,
      });
      totalQuantityDisposed += line.quantity;
      totalAmount += line.inventoryValue;
      linesProcessed += 1;
      continue;
    }

    try {
      const soft = quarantineMode === 'SOFT' || !line.storeLocationId;
      const disposed: DisposeResult = await disposeFromQuarantine(conn, {
        storeLocationId: soft ? undefined : line.storeLocationId,
        productId: line.productId,
        productLotId: soft ? undefined : line.productLotId ?? undefined,
        inventoryBatchId: line.inventoryBatchId ?? undefined,
        quantity: line.quantity,
        reason: reasonForLine(line),
        memo: `Auto-dispose after ${line.ageDays}d quarantine aging (EXPIRED)`,
        unitCost: line.unitCost > 0 ? line.unitCost : undefined,
        userId: actorUserId,
        quarantineMode: soft ? 'SOFT' : 'HARD',
      });
      results.push({
        inventoryBatchId: line.inventoryBatchId,
        productLotId: line.productLotId,
        productName: line.productName,
        lotNumber: line.lotNumber,
        quantity: line.quantity,
        ageDays: line.ageDays,
        documentNumber: disposed.documentNumber,
        expenseAccountCode: disposed.expenseAccountCode,
        ok: true,
      });
      totalQuantityDisposed += disposed.quantity;
      totalAmount += disposed.totalAmount;
      linesProcessed += 1;
    } catch (err) {
      linesFailed += 1;
      results.push({
        inventoryBatchId: line.inventoryBatchId,
        productLotId: line.productLotId,
        productName: line.productName,
        lotNumber: line.lotNumber,
        quantity: line.quantity,
        ageDays: line.ageDays,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info('Quarantine auto-dispose completed', {
    quarantineMode,
    minAgeDays: settings.minAgeDays,
    linesProcessed,
    linesFailed,
    totalQuantityDisposed,
    dryRun,
  });

  return {
    quarantineMode,
    minAgeDays: settings.minAgeDays,
    linesProcessed,
    linesFailed,
    totalQuantityDisposed,
    totalAmount,
    lines: results,
    dryRun,
  };
}

/**
 * Nightly runner — no-op when flag off (default). Posts P&L via dispose gateway.
 */
export async function runScheduledQuarantineAutoDispose(pool: Pool): Promise<void> {
  if (!(await isQuarantineAutoDisposeEnabled(pool))) return;

  try {
    const result = await processQuarantineAutoDispose(pool, null, { force: true });
    logger.info('[QuarantineAutoDispose] Scheduled run finished', {
      quarantineMode: result.quarantineMode,
      minAgeDays: result.minAgeDays,
      linesProcessed: result.linesProcessed,
      linesFailed: result.linesFailed,
      totalQuantityDisposed: result.totalQuantityDisposed,
    });
  } catch (error) {
    logger.error('[QuarantineAutoDispose] Scheduled run failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
