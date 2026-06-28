import {
  getInventoryCacheLane,
  getInventoryIntegrityLane,
  getInventoryJournalAuditLane,
} from '../../inventory/inventoryReconciliationLanes.js';
import type {
  FinancialLaneProvider,
  LaneComputation,
  LaneContext,
  EntityLaneRow,
  AuditJournalRow,
} from '../types.js';

type Db = LaneContext['pool'];

function mapProductExceptions(
  rows: Array<{
    productId: string;
    productName: string;
    leftAmount: number;
    rightAmount: number;
    difference: number;
  }>,
): EntityLaneRow[] {
  return rows.map((r) => ({
    entityId: r.productId,
    entityName: r.productName,
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
    inventoryImpact: number;
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
    impact: r.inventoryImpact,
    entityName: null,
  }));
}

export class InventoryReconciliationProvider implements FinancialLaneProvider {
  readonly domain = 'inventory' as const;
  readonly supportedLanes = ['integrity', 'cache', 'history'] as const;

  async computeIntegrity(ctx: LaneContext): Promise<LaneComputation> {
    const legacy = await getInventoryIntegrityLane(ctx.pool as Db, ctx.asOfDate);
    return {
      leftLabel: 'GL (Net Active)',
      leftAmount: legacy.glNetActive,
      rightLabel: 'Batch Subledger',
      rightAmount: legacy.batchSubledger,
      difference: legacy.integrityDifference,
      status: legacy.status,
      exceptions: mapProductExceptions(legacy.exceptions),
      details: legacy.details,
    };
  }

  async computeCache(ctx: LaneContext): Promise<LaneComputation> {
    const legacy = await getInventoryCacheLane(ctx.pool as Db, ctx.asOfDate);
    return {
      leftLabel: 'Batch Subledger',
      leftAmount: legacy.batchSubledger,
      rightLabel: 'Product Cache',
      rightAmount: legacy.productCacheBalance,
      difference: legacy.cacheDifference,
      status: legacy.status,
      exceptions: mapProductExceptions(legacy.exceptions),
      details: {
        storedBalance1300: legacy.storedBalance1300,
        storedBalanceDrift: legacy.storedBalanceDrift,
        cacheDifference: legacy.cacheDifference,
      },
    };
  }

  async computeAudit(ctx: LaneContext): Promise<LaneComputation> {
    const legacy = await getInventoryJournalAuditLane(ctx.pool as Db, ctx.asOfDate);
    return {
      leftLabel: 'Gross Posted',
      leftAmount: legacy.grossPosted,
      rightLabel: 'Net Active',
      rightAmount: legacy.netActive,
      difference: legacy.reversalImpact,
      status: legacy.status,
      auditJournals: mapAuditJournals(legacy.journals),
      details: {
        grossPosted: legacy.grossPosted,
        netActive: legacy.netActive,
        reversalImpact: legacy.reversalImpact,
      },
    };
  }
}

export const inventoryReconciliationProvider = new InventoryReconciliationProvider();
