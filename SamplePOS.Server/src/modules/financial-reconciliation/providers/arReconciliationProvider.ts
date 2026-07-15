import {
  getArCacheLane,
  getArIntegrityLane,
  getArJournalAuditLane,
  getArWriteoffExposureLane,
} from '../../customer-payments/arReconciliationLanes.js';
import type {
  FinancialLaneProvider,
  LaneComputation,
  LaneContext,
  EntityLaneRow,
  AuditJournalRow,
} from '../types.js';

type Db = LaneContext['pool'];

function mapCustomerExceptions(
  rows: Array<{
    customerId: string;
    customerName: string;
    leftAmount: number;
    rightAmount: number;
    difference: number;
  }>,
): EntityLaneRow[] {
  return rows.map((r) => ({
    entityId: r.customerId,
    entityName: r.customerName,
    leftAmount: r.leftAmount,
    rightAmount: r.rightAmount,
    difference: r.difference,
  }));
}

function mapAuditJournals(
  rows: Array<{
    transactionId: string;
    transactionNumber: string;
    referenceType: string;
    referenceNumber: string | null;
    transactionDate: string;
    isReversed: boolean;
    isReversingEntry: boolean;
    arImpact: number;
    customerName: string | null;
  }>,
): AuditJournalRow[] {
  return rows.map((r) => ({
    transactionId: r.transactionId,
    transactionNumber: r.transactionNumber,
    referenceType: r.referenceType,
    referenceNumber: r.referenceNumber,
    transactionDate: r.transactionDate,
    isReversed: r.isReversed,
    isReversingEntry: r.isReversingEntry,
    impact: r.arImpact,
    entityName: r.customerName,
  }));
}

export class ARReconciliationProvider implements FinancialLaneProvider {
  readonly domain = 'ar' as const;
  readonly supportedLanes = ['integrity', 'cache', 'history', 'writeoff'] as const;

  async computeIntegrity(ctx: LaneContext): Promise<LaneComputation> {
    const legacy = await getArIntegrityLane(ctx.pool as Db, ctx.asOfDate);
    return {
      leftLabel: 'GL (Net Active)',
      leftAmount: legacy.glNetActive,
      rightLabel: 'Open-item Subledger',
      rightAmount: legacy.openItemSubledger,
      difference: legacy.integrityDifference,
      status: legacy.status,
      exceptions: mapCustomerExceptions(legacy.exceptions),
      details: {
        glNetActive: legacy.glNetActive,
        openItemSubledger: legacy.openItemSubledger,
        integrityDifference: legacy.integrityDifference,
        materialityThreshold: legacy.materialityThreshold,
      },
    };
  }

  async computeCache(ctx: LaneContext): Promise<LaneComputation> {
    const legacy = await getArCacheLane(ctx.pool as Db, ctx.asOfDate);
    return {
      leftLabel: 'Open-item Balance',
      leftAmount: legacy.openItemBalance,
      rightLabel: 'Customer Cache',
      rightAmount: legacy.customerCacheBalance,
      difference: legacy.cacheDifference,
      status: legacy.status,
      exceptions: mapCustomerExceptions(legacy.exceptions),
      details: {
        openItemBalance: legacy.openItemBalance,
        customerCacheBalance: legacy.customerCacheBalance,
        cacheDifference: legacy.cacheDifference,
      },
    };
  }

  async computeAudit(ctx: LaneContext): Promise<LaneComputation> {
    const legacy = await getArJournalAuditLane(ctx.pool as Db, ctx.asOfDate);
    return {
      leftLabel: 'Gross Posted',
      leftAmount: legacy.grossPosted,
      rightLabel: 'Net Active (Customer Scope)',
      rightAmount: legacy.netActive,
      difference: legacy.reversalImpact,
      status: legacy.status,
      exceptions: mapCustomerExceptions(legacy.customerExceptions),
      auditJournals: mapAuditJournals(legacy.journals),
      details: {
        grossPosted: legacy.grossPosted,
        netActive: legacy.netActive,
        reversalImpact: legacy.reversalImpact,
      },
    };
  }

  async computeWriteoff(ctx: LaneContext): Promise<LaneComputation> {
    const legacy = await getArWriteoffExposureLane(ctx.pool as Db, ctx.asOfDate);
    return {
      leftLabel: `Overdue open (≥${legacy.minAgeDays}d)`,
      leftAmount: legacy.overdueOpen,
      rightLabel: 'Write-offs YTD',
      rightAmount: legacy.writeoffYtd,
      difference: legacy.exposureDifference,
      status: legacy.status,
      details: {
        overdueOpen: legacy.overdueOpen,
        writeoffYtd: legacy.writeoffYtd,
        exposureDifference: legacy.exposureDifference,
        overdueLines: legacy.overdueLines,
        writeoffDocs: legacy.writeoffDocs,
        minAgeDays: legacy.minAgeDays,
      },
    };
  }
}

export const arReconciliationProvider = new ARReconciliationProvider();
