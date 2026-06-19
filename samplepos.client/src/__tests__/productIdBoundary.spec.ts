import { describe, it, expect } from 'vitest';
import { isPersistedProductId, isSyntheticProductId } from '../utils/productIdBoundary';

describe('productIdBoundary', () => {
  it('flags custom_svc POS service lines as synthetic', () => {
    expect(isSyntheticProductId('custom_svc_test_01_1781843390491_71bx')).toBe(true);
    expect(isPersistedProductId('custom_svc_test_01_1781843390491_71bx')).toBe(false);
  });

  it('accepts catalog UUIDs for delivery notes', () => {
    expect(isPersistedProductId('ff0c86f8-bf99-4bb9-a46f-f33d25db6924')).toBe(true);
  });

  it('rejects empty product id for delivery', () => {
    expect(isPersistedProductId(null)).toBe(false);
    expect(isPersistedProductId('')).toBe(false);
  });
});
