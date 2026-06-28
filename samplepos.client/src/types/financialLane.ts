/** Shared financial lane contract (mirrors server FinancialLaneResult). */
export type FinancialDomain = 'ap' | 'ar' | 'inventory' | 'cash';
export type LaneKind = 'integrity' | 'cache' | 'history';
export type LaneSeverity = 'critical' | 'maintenance' | 'informational';
export type LaneStatus =
    | 'RECONCILED'
    | 'DISCREPANCY'
    | 'HEALTHY'
    | 'DRIFT'
    | 'INFORMATIONAL';

export interface EntityLaneRow {
    entityId: string;
    entityName: string;
    leftAmount: number;
    rightAmount: number;
    difference: number;
}

export interface AuditJournalRow {
    transactionId: string;
    transactionNumber: string;
    referenceType: string;
    referenceNumber: string | null;
    transactionDate: string;
    isReversed: boolean;
    isReversingEntry: boolean;
    impact: number;
    entityName: string | null;
}

export interface FinancialLaneResult {
    domain: FinancialDomain;
    lane: LaneKind;
    title: string;
    subtitle: string;
    status: LaneStatus;
    leftLabel: string;
    leftAmount: number;
    rightLabel: string;
    rightAmount: number;
    difference: number;
    periodCloseBlocking: boolean;
    gatesPeriodClose: boolean;
    severity: LaneSeverity;
    recommendedAction: string | null;
    asOfDate: string;
    lastCalculated: string;
    exceptions: EntityLaneRow[];
    auditJournals: AuditJournalRow[];
    details?: Record<string, unknown>;
}

export interface DomainLaneSummary {
    domain: FinancialDomain;
    domainTitle: string;
    lanes: FinancialLaneResult[];
    periodCloseBlocked: boolean;
}

export function laneStatusLabel(lane: FinancialLaneResult): string {
    if (lane.lane === 'history') return 'Informational';
    if (lane.lane === 'integrity') {
        return lane.status === 'RECONCILED' ? 'Reconciled' : 'Investigate';
    }
    if (lane.lane === 'cache') {
        return lane.status === 'HEALTHY' ? 'Healthy' : 'Cache drift';
    }
    return lane.status;
}

export function laneStatusTone(
    lane: FinancialLaneResult,
): 'success' | 'danger' | 'warning' | 'neutral' {
    if (lane.severity === 'critical') return 'danger';
    if (lane.severity === 'maintenance') return 'warning';
    if (lane.lane === 'integrity' && lane.status === 'RECONCILED') return 'success';
    return 'neutral';
}

export function differenceTone(lane: FinancialLaneResult): 'success' | 'danger' | 'warning' | 'neutral' {
    if (lane.lane === 'integrity') {
        return lane.status === 'RECONCILED' ? 'success' : 'danger';
    }
    if (lane.lane === 'cache') {
        return lane.status === 'HEALTHY' ? 'success' : 'warning';
    }
    return 'neutral';
}

export function isPeriodCloseClear(lane: FinancialLaneResult): boolean {
    return (
        lane.lane === 'integrity'
        && lane.status === 'RECONCILED'
        && Math.abs(lane.difference) <= 0.01
    );
}
