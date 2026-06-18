import { describe, it, expect } from 'vitest';
import {
  displayMasterUomName,
  pickDefaultMasterUom,
  resolveQuotationUomFromMaster,
} from '../utils/quotationUom';

const master = [
  { id: '1', name: 'Each', symbol: 'ea', type: 'QUANTITY' },
  { id: '2', name: 'Box', symbol: 'box', type: 'QUANTITY' },
  { id: '3', name: 'Packet', symbol: null, type: 'QUANTITY' },
];

describe('quotationUom', () => {
  it('pickDefaultMasterUom prefers Each', () => {
    expect(pickDefaultMasterUom(master)?.id).toBe('1');
  });

  it('resolveQuotationUomFromMaster by id returns canonical symbol', () => {
    const r = resolveQuotationUomFromMaster(master, { uomId: '2' });
    expect(r.matched).toBe(true);
    expect(r.uomName).toBe('box');
  });

  it('duplicate text variants map to same uomId', () => {
    const upper = resolveQuotationUomFromMaster(master, { uomName: 'BOX' });
    const lower = resolveQuotationUomFromMaster(master, { uomName: 'box' });
    expect(upper.uomId).toBe(lower.uomId);
    expect(upper.uomName).toBe('box');
  });

  it('displayMasterUomName uses symbol when present', () => {
    expect(displayMasterUomName(master[2])).toBe('Packet');
  });

  it('unmatched free-text returns matched=false', () => {
    const r = resolveQuotationUomFromMaster(master, { uomName: 'crate' });
    expect(r.matched).toBe(false);
    expect(r.uomId).toBeNull();
  });
});
