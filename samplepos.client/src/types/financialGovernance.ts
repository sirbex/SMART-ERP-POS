/** Financial Governance API types (Phase G1/G2). */
export type MaterialityMode = 'default' | 'exact' | 'percent_floor' | 'percent_floor_cap';

export interface MaterialityConfigRow {
    id: string;
    domain: string;
    mode: MaterialityMode;
    exactTolerance: number | null;
    percentRate: number | null;
    floorAmount: number | null;
    capAmount: number | null;
    notes: string | null;
    updatedAt: string;
}

export interface IntegrityAlert {
    id: string;
    domain: string;
    lane: string;
    alertType: string;
    previousDifference: number | null;
    currentDifference: number | null;
    materialityThreshold: number | null;
    severity: 'info' | 'warning' | 'critical';
    message: string;
    snapshotId: string | null;
    acknowledged: boolean;
    createdAt: string;
}

export interface PeriodCloseSignoff {
    id: string;
    periodYear: number;
    periodMonth: number;
    snapshotId: string | null;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    requestedAt: string;
    attestation: string | null;
}

export interface ReconciliationSnapshot {
    id: string;
    asOfDate: string;
    capturedAt: string;
    captureSource: string;
    periodCloseBlocked: boolean;
    blockedDomains: string[];
    frameworkCommit: string | null;
}

export interface GovernanceDashboard {
    materiality: MaterialityConfigRow[];
    latestSnapshot: ReconciliationSnapshot | null;
    openAlerts: IntegrityAlert[];
    pendingSignoffs: PeriodCloseSignoff[];
    recentSnapshots: ReconciliationSnapshot[];
}

export interface SnapshotTrendPoint {
    capturedAt: string;
    asOfDate: string;
    integrityDifference: number;
    status: string;
}

export interface CaptureSnapshotResult {
    snapshot: ReconciliationSnapshot;
    alertsCreated: number;
}
