/**
 * PO net-received SQL helpers — unit tests (pure string / logic).
 */
import { describe, it, expect } from '@jest/globals';
import {
  poItemReturnedQuantitySql,
  poItemNetReceivedQuantitySql,
  poItemOpenQuantitySql,
} from './purchaseOrderNetReceived.js';
import { derivePOReceiptStatusBadge } from '../../../../shared/utils/purchaseOrderReceiptDisplay.js';

describe('purchaseOrderNetReceived SQL helpers', () => {
  it('returned qty subquery references po_item_id and POSTED return GRN', () => {
    const sql = poItemReturnedQuantitySql('poi');
    expect(sql).toContain('return_grn');
    expect(sql).toContain("rg.status = 'POSTED'");
    expect(sql).toContain('gri.po_item_id = poi.id');
  });

  it('net received subtracts returned from gross received_quantity', () => {
    const sql = poItemNetReceivedQuantitySql('poi');
    expect(sql).toContain('received_quantity');
    expect(sql).toContain('GREATEST(0');
  });

  it('open quantity uses ordered minus net received', () => {
    const sql = poItemOpenQuantitySql('poi');
    expect(sql).toContain('ordered_quantity');
    expect(sql).toContain('GREATEST(0');
  });

  it('derivePOReceiptStatusBadge shows Partially Received after return reopen', () => {
    const badge = derivePOReceiptStatusBadge('PENDING', {
      completedGrCount: 1,
      netReceivedQtyTotal: 29,
      openQtyTotal: 1,
    });
    expect(badge.label).toBe('Partially Received');
  });

  it('derivePOReceiptStatusBadge shows Draft after full reverse (net 0)', () => {
    const badge = derivePOReceiptStatusBadge('DRAFT', {
      completedGrCount: 1,
      netReceivedQtyTotal: 0,
      openQtyTotal: 24,
    });
    expect(badge.label).toBe('Draft');
    expect(badge.lane).toBe('DRAFT');
  });

  it('resolveTargetPOWorkflowStatus maps full reverse to DRAFT', async () => {
    const { resolveTargetPOWorkflowStatus } = await import(
      '../../../../shared/domain/poReceiptWorkflowSsot.js'
    );
    expect(
      resolveTargetPOWorkflowStatus('PENDING', { fullyReceived: false, fullyReversed: true }),
    ).toBe('DRAFT');
  });

  it('derivePOReceiptStatusBadge shows Awaiting Receipt before first GR', () => {
    const badge = derivePOReceiptStatusBadge('PENDING', {
      completedGrCount: 0,
      netReceivedQtyTotal: 0,
      openQtyTotal: 10,
    });
    expect(badge.label).toBe('Awaiting Receipt');
  });
});
