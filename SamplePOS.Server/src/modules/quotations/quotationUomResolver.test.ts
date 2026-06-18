import {
  displayUomName,
  normalizeQuotationLineUom,
  resolveUomFromMasterList,
} from './quotationUomResolver.js';

const master = [
  { id: 'uom-each', name: 'Each', symbol: 'ea' },
  { id: 'uom-box', name: 'Box', symbol: 'box' },
];

describe('quotationUomResolver', () => {
  it('resolves by uomId to canonical symbol', () => {
    const r = resolveUomFromMasterList(master, { uomId: 'uom-box' });
    expect(r.matched).toBe(true);
    expect(r.uomId).toBe('uom-box');
    expect(r.uomName).toBe('box');
  });

  it('collapses duplicate free-text to same master UoM (Box vs box)', () => {
    const a = resolveUomFromMasterList(master, { uomName: 'Box' });
    const b = resolveUomFromMasterList(master, { uomName: 'box' });
    expect(a.uomId).toBe(b.uomId);
    expect(a.uomName).toBe(b.uomName);
  });

  it('resolves symbol alias ea → Each', () => {
    const r = resolveUomFromMasterList(master, { uomName: 'ea' });
    expect(r.matched).toBe(true);
    expect(r.uomId).toBe('uom-each');
  });

  it('rejects custom line with unknown free-text UoM', () => {
    expect(() =>
      normalizeQuotationLineUom(master, {
        itemType: 'custom',
        uomName: 'carton',
      })
    ).toThrow(/Select a unit from the system UoM list/);
  });

  it('allows product line with unresolved uom (legacy)', () => {
    const r = normalizeQuotationLineUom(master, {
      itemType: 'product',
      productId: 'p1',
      uomName: 'legacy-label',
    });
    expect(r.uomName).toBe('legacy-label');
    expect(r.uomId).toBeNull();
  });

  it('displayUomName prefers symbol', () => {
    expect(displayUomName({ name: 'Each', symbol: 'ea' })).toBe('ea');
  });
});
