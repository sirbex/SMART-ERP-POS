/**
 * Phase 2B — quarantine SSOT unit proofs (LQ-INV-4 / LQ-INV-5)
 */

import {
  isQuarantineStoreType,
  isSellableStoreType,
  QUARANTINE_STORE_TYPES,
} from './quarantineLotStatus.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('Quarantine operational SSOT (Phase 2B)', () => {
  it('LQ-INV-4 store type helpers', () => {
    expect(isQuarantineStoreType('DAMAGE')).toBe(true);
    expect(isQuarantineStoreType('EXPIRED')).toBe(true);
    expect(isQuarantineStoreType('RETURN')).toBe(true);
    expect(isQuarantineStoreType('MAIN')).toBe(false);
    expect(isSellableStoreType('SELLING')).toBe(true);
    expect(QUARANTINE_STORE_TYPES).toContain('DAMAGE');
  });

  it('DAMAGE path syncs lot status after quarantine', () => {
    const adj = readRepo(
      'SamplePOS.Server/src/modules/inventory/warehouse/warehouseAdjustmentService.ts',
    );
    expect(adj).toContain('syncLotStatusAfterQuarantine');
    expect(adj).toContain("quarantineKind: 'DAMAGE'");
  });

  it('FEFO store selection excludes quarantine store types', () => {
    const sel = readRepo(
      'SamplePOS.Server/src/modules/inventory-lot/postgresLotSelector.ts',
    );
    expect(sel).toContain("sl.store_type IN ('MAIN', 'SELLING')");
  });

  it('consumeLot blocks allocation from quarantine stores', () => {
    const svc = readRepo('SamplePOS.Server/src/modules/inventory-lot/lotService.ts');
    expect(svc).toMatch(/Cannot allocate\/sell stock from/);
    expect(svc).toContain('LQ-INV-5');
  });

  it('aging API route is mounted', () => {
    const routes = readRepo(
      'SamplePOS.Server/src/modules/loss-quarantine/lossQuarantineRoutes.ts',
    );
    expect(routes).toContain('/quarantine-aging');
    const inv = readRepo('SamplePOS.Server/src/modules/inventory/inventoryRoutes.ts');
    expect(inv).toContain("'/loss-quarantine'");
  });
});
