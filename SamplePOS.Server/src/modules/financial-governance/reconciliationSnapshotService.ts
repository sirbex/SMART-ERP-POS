import type { Pool, PoolClient } from 'pg';
import { getAllDomainSummaries } from '../financial-reconciliation/financialLaneService.js';
import type { DomainLaneSummary } from '../financial-reconciliation/types.js';
import { compareSqlSummaryToFramework } from '../financial-reconciliation/reconciliationParityService.js';
import type { ReconciliationSnapshot, SnapshotCaptureSource } from './types.js';

type Db = Pool | PoolClient;

function mapSnapshot(row: Record<string, unknown>): ReconciliationSnapshot {
  return {
    id: String(row.id),
    asOfDate: String(row.as_of_date).slice(0, 10),
    capturedAt: String(row.captured_at),
    captureSource: row.capture_source as SnapshotCaptureSource,
    periodYear: row.period_year != null ? Number(row.period_year) : null,
    periodMonth: row.period_month != null ? Number(row.period_month) : null,
    frameworkCommit: row.framework_commit != null ? String(row.framework_commit) : null,
    periodCloseBlocked: Boolean(row.period_close_blocked),
    blockedDomains: (row.blocked_domains as string[]) ?? [],
    summary: row.summary_json as DomainLaneSummary[],
    parity: row.parity_json ?? null,
    createdBy: row.created_by != null ? String(row.created_by) : null,
  };
}

export interface CaptureSnapshotInput {
  asOfDate: string;
  captureSource?: SnapshotCaptureSource;
  periodYear?: number;
  periodMonth?: number;
  frameworkCommit?: string;
  createdBy?: string;
  includeParity?: boolean;
}

export async function captureReconciliationSnapshot(
  conn: Db,
  input: CaptureSnapshotInput,
): Promise<ReconciliationSnapshot> {
  const summaries = await getAllDomainSummaries(conn, input.asOfDate);
  const blockedDomains = summaries
    .filter((s) => s.periodCloseBlocked)
    .map((s) => s.domain);
  const periodCloseBlocked = blockedDomains.length > 0;

  const parity = input.includeParity !== false
    ? await compareSqlSummaryToFramework(conn, input.asOfDate)
    : null;

  const res = await conn.query(`
    INSERT INTO financial_reconciliation_snapshots (
      as_of_date, capture_source, period_year, period_month, framework_commit,
      period_close_blocked, blocked_domains, summary_json, parity_json, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
    RETURNING *
  `, [
    input.asOfDate,
    input.captureSource ?? 'manual',
    input.periodYear ?? null,
    input.periodMonth ?? null,
    input.frameworkCommit ?? null,
    periodCloseBlocked,
    blockedDomains,
    JSON.stringify(summaries),
    parity ? JSON.stringify(parity) : null,
    input.createdBy ?? null,
  ]);

  return mapSnapshot(res.rows[0]);
}

export async function getLatestSnapshot(conn: Db): Promise<ReconciliationSnapshot | null> {
  const res = await conn.query(`
    SELECT * FROM financial_reconciliation_snapshots
    ORDER BY captured_at DESC
    LIMIT 1
  `);
  return res.rows[0] ? mapSnapshot(res.rows[0]) : null;
}

export async function getSnapshotById(conn: Db, id: string): Promise<ReconciliationSnapshot | null> {
  const res = await conn.query(`SELECT * FROM financial_reconciliation_snapshots WHERE id = $1`, [id]);
  return res.rows[0] ? mapSnapshot(res.rows[0]) : null;
}

export async function listRecentSnapshots(
  conn: Db,
  limit = 30,
): Promise<ReconciliationSnapshot[]> {
  const res = await conn.query(`
    SELECT * FROM financial_reconciliation_snapshots
    ORDER BY captured_at DESC
    LIMIT $1
  `, [limit]);
  return res.rows.map((row) => mapSnapshot(row));
}

export async function listSnapshotTrend(
  conn: Db,
  domain: string,
  days = 90,
): Promise<Array<{ capturedAt: string; asOfDate: string; integrityDifference: number; status: string }>> {
  const res = await conn.query(`
    SELECT captured_at, as_of_date, summary_json
    FROM financial_reconciliation_snapshots
    WHERE captured_at >= NOW() - ($1::int || ' days')::interval
    ORDER BY captured_at ASC
  `, [days]);

  return res.rows.map((row) => {
    const summaries = row.summary_json as DomainLaneSummary[];
    const domainSummary = summaries.find((s) => s.domain === domain);
    const integrity = domainSummary?.lanes.find((l) => l.lane === 'integrity');
    return {
      capturedAt: String(row.captured_at),
      asOfDate: String(row.as_of_date).slice(0, 10),
      integrityDifference: integrity?.difference ?? 0,
      status: integrity?.status ?? 'UNKNOWN',
    };
  });
}
