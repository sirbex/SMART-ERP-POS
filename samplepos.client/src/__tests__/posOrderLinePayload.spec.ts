import { describe, expect, it } from 'vitest';
import { buildPosOrderLinePayload, realUomId } from '../utils/posOrderLinePayload';

const PRODUCT_ID = 'ff0c86f8-bf99-4bb9-a46f-f33d25db6924';
const BASE_UOM_ID = 'c0000000-0000-4000-8000-000000000001';
const BOX_UOM_ID = 'd0000000-0000-4000-8000-000000000002';
const SYNTHETIC_UOM_ID = `default-${PRODUCT_ID}`;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('realUomId', () => {
  it('returns undefined for synthetic default-{productId} placeholders', () => {
    expect(realUomId(SYNTHETIC_UOM_ID)).toBeUndefined();
    expect(realUomId('default-anything')).toBeUndefined();
  });

  it('passes through real UUIDs', () => {
    expect(realUomId(BASE_UOM_ID)).toBe(BASE_UOM_ID);
  });
});

describe('buildPosOrderLinePayload', () => {
  it('Test 1 — product with no product_uoms (synthetic catalog UoM): omits uomId and baseUomId', () => {
    const payload = buildPosOrderLinePayload({
      id: PRODUCT_ID,
      name: 'Legacy Item',
      quantity: 2,
      unitPrice: 5000,
      selectedUomId: SYNTHETIC_UOM_ID,
      availableUoms: [
        {
          uomId: SYNTHETIC_UOM_ID,
          name: 'PIECE',
          symbol: 'PIECE',
          conversionFactor: 1,
          isDefault: true,
        },
      ],
    });

    expect(payload.productId).toBe(PRODUCT_ID);
    expect(payload.uomId).toBeUndefined();
    expect(payload.baseUomId).toBeUndefined();
    expect(payload.baseQty).toBe(2);
    expect(payload.conversionFactor).toBe(1);
    expect(JSON.stringify(payload)).not.toContain('default-');
  });

  it('Test 2 — product with proper product_uoms: sends real UUIDs for uomId and baseUomId', () => {
    const payload = buildPosOrderLinePayload({
      id: PRODUCT_ID,
      name: 'MUoM Item',
      quantity: 3,
      unitPrice: 12000,
      selectedUomId: BOX_UOM_ID,
      availableUoms: [
        {
          uomId: BASE_UOM_ID,
          name: 'Tablet',
          symbol: 'TAB',
          conversionFactor: 1,
          isDefault: true,
        },
        {
          uomId: BOX_UOM_ID,
          name: 'Box',
          symbol: 'BOX',
          conversionFactor: 30,
          isDefault: false,
        },
      ],
    });

    expect(payload.uomId).toBe(BOX_UOM_ID);
    expect(payload.baseUomId).toBe(BASE_UOM_ID);
    expect(payload.uomId).toMatch(UUID_RE);
    expect(payload.baseUomId).toMatch(UUID_RE);
    expect(payload.baseQty).toBe(90);
    expect(payload.conversionFactor).toBe(30);
  });
});
