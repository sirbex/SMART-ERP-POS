import type { Pool, PoolClient } from 'pg';
import {
  getApCacheLane,
  getApIntegrityLane,
  getApJournalAuditLane,
} from '../../supplier-payments/apReconciliationLanes.js';
import type {
  FinancialLaneProvider,
  LaneComputation,
  LaneContext,
  EntityLaneRow,
  AuditJournalRow,
} from '../types.js';

type Db = Pool | PoolClient;

function mapSupplierExceptions(
  rows: Array<{
    supplierId: string;
    supplierName: string;
    leftAmount: number;
    rightAmount: number;
    difference: number;
  }>,
): EntityLaneRow[] {
  return rows.map((r) => ({
    entityId: r.supplierId,
    entityName: r.supplierName,
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
    apImpact: number;
    supplierName: string | null;
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
    impact: r.apImpact,
    entityName: r.supplierName,
  }));
}

/**
 * AP domain provider — delegates calculations to apReconciliationLanes (read-only).
 */
export class APReconciliationProvider implements FinancialLaneProvider {
  readonly domain = 'ap' as const;
  readonly supportedLanes = ['integrity', 'cache', 'history'] as const;

  async computeIntegrity(ctx: LaneContext): Promise<LaneComputation> {
    const legacy = await getApIntegrityLane(ctx.pool as Db, ctx.asOfDate);
    return {
      leftLabel: 'GL (Net Active)',
      leftAmount: legacy.glNetActive,
      rightLabel: 'Open-item Subledger',
      rightAmount: legacy.openItemSubledger,
      difference: legacy.integrityDifference,
      status: legacy.status,
      exceptions: mapSupplierExceptions(legacy.exceptions),
      details: {
        glNetActive: legacy.glNetActive,
        openItemSubledger: legacy.openItemSubledger,
        integrityDifference: legacy.integrityDifference,
      },
    };
  }

  async computeCache(ctx: LaneContext): Promise<LaneComputation> {
    const legacy = await getApCacheLane(ctx.pool as Db, ctx.asOfDate);
    return {
      leftLabel: 'Open-item Balance',
      leftAmount: legacy.openItemBalance,
      rightLabel: 'Supplier Cache',
      rightAmount: legacy.supplierCacheBalance,
      difference: legacy.cacheDifference,
      status: legacy.status,
      exceptions: mapSupplierExceptions(legacy.exceptions),
      details: {
        openItemBalance: legacy.openItemBalance,
        supplierCacheBalance: legacy.supplierCacheBalance,
        cacheDifference: legacy.cacheDifference,
      },
    };
  }

  async computeAudit(ctx: LaneContext): Promise<LaneComputation> {
    const legacy = await getApJournalAuditLane(ctx.pool as Db, ctx.asOfDate);
    return {
      leftLabel: 'Gross Posted',
      leftAmount: legacy.grossPosted,
      rightLabel: 'Net Active',
      rightAmount: legacy.netActive,
      difference: legacy.reversalImpact,
      status: legacy.status,
      exceptions: mapSupplierExceptions(legacy.supplierExceptions),
      auditJournals: mapAuditJournals(legacy.journals),
      details: {
        grossPosted: legacy.grossPosted,
        netActive: legacy.netActive,
        reversalImpact: legacy.reversalImpact,
      },
    };
  }
}

export const apReconciliationProvider = new APReconciliationProvider();
