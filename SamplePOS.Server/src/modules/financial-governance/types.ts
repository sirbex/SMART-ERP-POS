import type { FinancialDomain } from '../financial-reconciliation/types.js';
import type { DomainLaneSummary } from '../financial-reconciliation/types.js';

export type MaterialityMode = 'default' | 'exact' | 'percent_floor' | 'percent_floor_cap';

export interface MaterialityConfigRow {
  id: string;
  domain: FinancialDomain;
  mode: MaterialityMode;
  exactTolerance: number | null;
  percentRate: number | null;
  floorAmount: number | null;
  capAmount: number | null;
  notes: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export type SnapshotCaptureSource =
  | 'manual'
  | 'scheduled'
  | 'signoff'
  | 'deploy'
  | 'stabilization';

export interface ReconciliationSnapshot {
  id: string;
  asOfDate: string;
  capturedAt: string;
  captureSource: SnapshotCaptureSource;
  periodYear: number | null;
  periodMonth: number | null;
  frameworkCommit: string | null;
  periodCloseBlocked: boolean;
  blockedDomains: string[];
  summary: DomainLaneSummary[];
  parity: unknown | null;
  createdBy: string | null;
}

export type SignoffStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface PeriodCloseSignoff {
  id: string;
  periodYear: number;
  periodMonth: number;
  snapshotId: string | null;
  status: SignoffStatus;
  requestedBy: string;
  requestedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  attestation: string | null;
}

export type IntegrityAlertType =
  | 'new_drift'
  | 'drift_worsened'
  | 'drift_resolved'
  | 'parity_mismatch';

export interface IntegrityAlert {
  id: string;
  domain: string;
  lane: string;
  alertType: IntegrityAlertType;
  previousDifference: number | null;
  currentDifference: number | null;
  materialityThreshold: number | null;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  snapshotId: string | null;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface GovernanceDashboard {
  materiality: MaterialityConfigRow[];
  latestSnapshot: ReconciliationSnapshot | null;
  openAlerts: IntegrityAlert[];
  pendingSignoffs: PeriodCloseSignoff[];
  recentSnapshots: ReconciliationSnapshot[];
}
