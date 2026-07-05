import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static gate: manual adjust + physical count must send storeLocationId when multistore is on.
 * Complements server-side proof:inventory-modes-parity (API direct calls).
 */
describe('InventoryAdjustments multistore parity', () => {
  const source = readFileSync(
    resolve(__dirname, '../pages/inventory/InventoryAdjustmentsPage.tsx'),
    'utf8',
  );

  it('passes storeLocationId in manual adjust submit payload', () => {
    expect(source).toMatch(
      /handleSubmitAdjustment[\s\S]*?storeLocationId:\s*isMultistoreEnabled\s*\?\s*adjustmentStoreId/,
    );
  });

  it('passes storeLocationId in physical count batch adjustments', () => {
    const loopStart = source.indexOf('for (const adj of adjustments)');
    expect(loopStart).toBeGreaterThan(-1);
    const loopBlock = source.slice(loopStart, loopStart + 600);
    expect(loopBlock).toContain('storeLocationId: isMultistoreEnabled ? adjustmentStoreId');
  });
});
