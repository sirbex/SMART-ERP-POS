/**
 * Shared financial reconciliation contract — domain providers supply calculations;
 * the framework owns metadata, API shape, and period-close semantics.
 */
import type { Pool, PoolClient } from 'pg';

export type FinancialDomain = 'ap' | 'ar' | 'inventory' | 'cash' | 'wht';

/** API lane slug (history = journal audit). */
export type LaneKind = 'integrity' | 'cache' | 'history';

export type LaneSeverity = 'critical' | 'maintenance' | 'informational';

export type LaneStatus =
  | 'RECONCILED'
  | 'DISCREPANCY'
  | 'HEALTHY'
  | 'DRIFT'
  | 'INFORMATIONAL';

export interface LaneContext {
  pool: Pool | PoolClient;
  asOfDate: string;
}

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

/** Raw calculation from a domain provider (read-only). */
export interface LaneComputation {
  leftLabel: string;
  leftAmount: number;
  rightLabel: string;
  rightAmount: number;
  difference: number;
  status: LaneStatus;
  exceptions?: EntityLaneRow[];
  auditJournals?: AuditJournalRow[];
  details?: Record<string, unknown>;
}

/** Unified API / UI contract for every control account. */
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
  /** @deprecated Prefer periodCloseBlocking — kept for backward compatibility. */
  gatesPeriodClose: boolean;
  severity: LaneSeverity;
  recommendedAction: string | null;
  asOfDate: string;
  lastCalculated: string;
  exceptions: EntityLaneRow[];
  auditJournals: AuditJournalRow[];
  details: Record<string, unknown>;
}

export interface FinancialLaneProvider {
  readonly domain: FinancialDomain;
  readonly supportedLanes: readonly LaneKind[];
  computeIntegrity(ctx: LaneContext): Promise<LaneComputation>;
  computeCache?(ctx: LaneContext): Promise<LaneComputation>;
  computeAudit(ctx: LaneContext): Promise<LaneComputation>;
}

export interface DomainLaneSummary {
  domain: FinancialDomain;
  domainTitle: string;
  lanes: FinancialLaneResult[];
  periodCloseBlocked: boolean;
}
