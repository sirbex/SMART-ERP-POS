import {
  getWhtIntegrityLane,
  getWhtJournalAuditLane,
} from './whtReconciliationLanes.js';
import type {
  FinancialLaneProvider,
  LaneComputation,
  LaneContext,
  EntityLaneRow,
  AuditJournalRow,
} from '../types.js';

export class WhtReconciliationProvider implements FinancialLaneProvider {
  readonly domain = 'wht' as const;
  readonly supportedLanes = ['integrity', 'history'] as const;

  async computeIntegrity(ctx: LaneContext): Promise<LaneComputation> {
    const lane = await getWhtIntegrityLane(ctx.pool, ctx.asOfDate);
    const exceptions: EntityLaneRow[] = lane.exceptions.map((e) => ({
      entityId: e.entityId,
      entityName: e.entityName,
      leftAmount: e.leftAmount,
      rightAmount: e.rightAmount,
      difference: e.difference,
    }));

    return {
      leftLabel: 'GL WHT Payable (2350)',
      leftAmount: lane.payableGl,
      rightLabel: 'WHT Entry Subledger (payable)',
      rightAmount: lane.payableEntries,
      difference: lane.integrityDifference,
      status: lane.status,
      exceptions,
      details: {
        payable: {
          gl: lane.payableGl,
          entries: lane.payableEntries,
          difference: lane.payableDiff,
        },
        receivable: {
          gl: lane.receivableGl,
          entries: lane.receivableEntries,
          difference: lane.receivableDiff,
        },
      },
    };
  }

  async computeAudit(ctx: LaneContext): Promise<LaneComputation> {
    const lane = await getWhtJournalAuditLane(ctx.pool, ctx.asOfDate);
    const auditJournals: AuditJournalRow[] = lane.journals.map((j) => ({
      transactionId: j.transactionId,
      transactionNumber: j.transactionNumber,
      referenceType: j.referenceType,
      referenceNumber: j.referenceNumber,
      transactionDate: j.transactionDate,
      isReversed: j.isReversed,
      isReversingEntry: j.isReversingEntry,
      impact: j.impact,
      entityName: j.entityName,
    }));

    return {
      leftLabel: 'Gross Posted (|impact|)',
      leftAmount: lane.grossPosted,
      rightLabel: 'Net Active (|1250|+|2350|)',
      rightAmount: lane.netActive,
      difference: lane.reversalImpact,
      status: lane.status,
      auditJournals,
      details: {
        grossPosted: lane.grossPosted,
        netActive: lane.netActive,
        reversalImpact: lane.reversalImpact,
      },
    };
  }
}

export const whtReconciliationProvider = new WhtReconciliationProvider();
