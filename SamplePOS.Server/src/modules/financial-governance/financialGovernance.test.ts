import { describe, expect, it } from '@jest/globals';
import { defaultMaterialityThreshold } from './materialityConfigService.js';

describe('financial governance — materiality defaults', () => {
  it('AP uses exact 0.01 tolerance by default', () => {
    expect(defaultMaterialityThreshold('ap', 5_000_000)).toBe(0.01);
  });

  it('AR uses percent floor capped at 5000', () => {
    expect(defaultMaterialityThreshold('ar', 100_000)).toBe(500);
    expect(defaultMaterialityThreshold('ar', 50_000_000)).toBe(5000);
  });

  it('Inventory uses 5000 floor with percent scaling', () => {
    expect(defaultMaterialityThreshold('inventory', 100_000)).toBe(5000);
    expect(defaultMaterialityThreshold('inventory', 50_000_000)).toBe(5000);
  });
});
