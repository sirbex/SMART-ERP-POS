import { getVatIntegrityLane } from './vatReconciliationLanes.js';
import type {
  FinancialLaneProvider,
  LaneComputation,
  LaneContext,
} from '../types.js';

export class VatReconciliationProvider implements FinancialLaneProvider {
  readonly domain = 'vat' as const;
  readonly supportedLanes = ['integrity'] as const;

  async computeIntegrity(ctx: LaneContext): Promise<LaneComputation> {
    const lane = await getVatIntegrityLane(ctx.pool, ctx.asOfDate);
    return {
      leftLabel: 'Document net VAT payable (YTD)',
      leftAmount: lane.documentNetVatPayable,
      rightLabel: 'GL Tax Payable 2300',
      rightAmount: lane.glTaxPayable2300,
      difference: lane.integrityDifference,
      status: lane.status,
      exceptions: [],
      details: {
        ...lane.details,
        materialityThreshold: lane.materialityThreshold,
        periodCloseBlocking: false,
      },
    };
  }

  async computeAudit(ctx: LaneContext): Promise<LaneComputation> {
    // Integrity-only domain; audit not supported — callers should not request history.
    const lane = await this.computeIntegrity(ctx);
    return {
      ...lane,
      leftLabel: 'Document net VAT payable (YTD)',
      rightLabel: 'GL Tax Payable 2300',
      status: 'INFORMATIONAL',
    };
  }
}

export const vatReconciliationProvider = new VatReconciliationProvider();
