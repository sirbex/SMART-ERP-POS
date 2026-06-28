import type { Pool, PoolClient } from 'pg';
import { listMaterialityConfig } from './materialityConfigService.js';
import {
  captureReconciliationSnapshot,
  getLatestSnapshot,
  listRecentSnapshots,
  type CaptureSnapshotInput,
} from './reconciliationSnapshotService.js';
import { detectIntegrityDriftAlerts, listOpenAlerts } from './integrityAlertService.js';
import { listPendingSignoffs } from './periodCloseSignoffService.js';
import type { GovernanceDashboard, ReconciliationSnapshot } from './types.js';

type Db = Pool | PoolClient;

export async function getGovernanceDashboard(conn: Db): Promise<GovernanceDashboard> {
  const [materiality, latestSnapshot, openAlerts, pendingSignoffs, recentSnapshots] =
    await Promise.all([
      listMaterialityConfig(conn),
      getLatestSnapshot(conn),
      listOpenAlerts(conn),
      listPendingSignoffs(conn),
      listRecentSnapshots(conn, 14),
    ]);

  return {
    materiality,
    latestSnapshot,
    openAlerts,
    pendingSignoffs,
    recentSnapshots,
  };
}

export async function captureSnapshotWithAlerts(
  conn: Db,
  input: CaptureSnapshotInput,
): Promise<{ snapshot: ReconciliationSnapshot; alertsCreated: number }> {
  const previous = await getLatestSnapshot(conn);
  const snapshot = await captureReconciliationSnapshot(conn, input);

  let alertsCreated = 0;
  if (previous) {
    const alerts = await detectIntegrityDriftAlerts(
      conn,
      previous.summary,
      snapshot.summary,
      snapshot.id,
    );
    alertsCreated = alerts.length;
  }

  return { snapshot, alertsCreated };
}

export async function buildAuditEvidencePack(conn: Db, snapshotId: string) {
  const res = await conn.query(`
    SELECT s.*,
           (
             SELECT COALESCE(json_agg(a ORDER BY a.created_at), '[]'::json)
             FROM financial_integrity_alerts a
             WHERE a.snapshot_id = s.id
           ) AS alerts,
           (
             SELECT COALESCE(json_agg(sig ORDER BY sig.requested_at), '[]'::json)
             FROM financial_period_close_signoffs sig
             WHERE sig.snapshot_id = s.id
           ) AS signoffs
    FROM financial_reconciliation_snapshots s
    WHERE s.id = $1
  `, [snapshotId]);

  if (!res.rows[0]) {
    throw new Error(`Snapshot not found: ${snapshotId}`);
  }

  const row = res.rows[0];
  const materiality = await listMaterialityConfig(conn);

  return {
    generatedAt: new Date().toISOString(),
    snapshot: {
      id: row.id,
      asOfDate: row.as_of_date,
      capturedAt: row.captured_at,
      captureSource: row.capture_source,
      periodCloseBlocked: row.period_close_blocked,
      blockedDomains: row.blocked_domains,
      frameworkCommit: row.framework_commit,
      summary: row.summary_json,
      parity: row.parity_json,
    },
    materialityConfig: materiality,
    alerts: row.alerts ?? [],
    signoffs: row.signoffs ?? [],
    frameworkPhase: 'F0',
    authoritativeSource: 'financial-lane-framework',
  };
}
