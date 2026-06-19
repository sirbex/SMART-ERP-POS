import { describe, it, expect } from '@jest/globals';
import {
  isSyntheticProductId,
  isPersistedProductId,
  normalizeProductIdForDb,
} from './productIdBoundary.js';

describe('productIdBoundary', () => {
  it('treats custom_svc_ as synthetic', () => {
    expect(isSyntheticProductId('custom_svc_test_01_1781843390491_71bx')).toBe(true);
    expect(normalizeProductIdForDb('custom_svc_test_01_1781843390491_71bx')).toBeNull();
  });

  it('accepts real UUID product ids', () => {
    const id = 'ff0c86f8-bf99-4bb9-a46f-f33d25db6924';
    expect(isPersistedProductId(id)).toBe(true);
    expect(normalizeProductIdForDb(id)).toBe(id);
  });
});
