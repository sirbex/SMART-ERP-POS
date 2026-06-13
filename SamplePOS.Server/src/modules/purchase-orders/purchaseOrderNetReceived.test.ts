/**
 * PO net-received SQL helpers — unit tests (pure string / logic).
 */
import { describe, it, expect } from '@jest/globals';
import {
  poItemReturnedQuantitySql,
  poItemNetReceivedQuantitySql,
  poItemOpenQuantitySql,
} from './purchaseOrderNetReceived.js';

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
});
