import { describe, it, expect } from 'vitest';
import { buildPurchaseUomOptions } from '@/validation/product';

const masterUoms = [
  { id: 'base-id', name: 'tablet', symbol: 'tb' },
  { id: 'box-id', name: 'Box', symbol: 'BOX' },
  { id: 'pkt-id', name: 'PACKET', symbol: 'PKT' },
];

const configured = [
  { id: 'base-id', name: 'tablet', symbol: 'tb' },
  { id: 'pkt-id', name: 'PACKET', symbol: 'PKT' },
];

describe('buildPurchaseUomOptions', () => {
  it('returns all master UoMs when not restricted (quick-create bootstrap)', () => {
    const options = buildPurchaseUomOptions({
      restrictToConfigured: false,
      masterUoms,
    });
    expect(options.map((o) => o.id)).toEqual(['base-id', 'box-id', 'pkt-id']);
  });

  it('returns only configured Product UoMs when restricted (edit mode)', () => {
    const options = buildPurchaseUomOptions({
      restrictToConfigured: true,
      configuredProductUoms: configured,
      masterUoms,
    });
    expect(options.map((o) => o.id)).toEqual(['base-id', 'pkt-id']);
    expect(options.some((o) => o.id === 'box-id')).toBe(false);
  });

  it('surfaces orphan purchase UoM with repair label when restricted', () => {
    const options = buildPurchaseUomOptions({
      restrictToConfigured: true,
      configuredProductUoms: configured,
      masterUoms,
      currentPurchaseUomId: 'box-id',
    });
    expect(options).toHaveLength(3);
    const orphan = options.find((o) => o.id === 'box-id');
    expect(orphan?.name).toContain('not in Product UoMs');
  });
});
