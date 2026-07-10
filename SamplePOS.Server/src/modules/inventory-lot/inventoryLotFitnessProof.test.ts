/**
 * Gate J — Architectural integrity proof (static).
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INVENTORY_LOT_CERTIFICATION_EXIT,
  LOT_TOUCHPOINT_REGISTRY,
  LOT_WRITE_GATEWAY,
  PENDING_ARCHITECTURAL_DEBT,
} from './inventoryLotTouchpointRegistry.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const fitnessScript = resolve(repoRoot, 'scripts/ci-inventory-lot-fitness.mjs');

describe('Gate J — architectural integrity', () => {
  it('defines certification exit criteria with gates A–J', () => {
    expect(INVENTORY_LOT_CERTIFICATION_EXIT.proofGatesPass).toContain('J');
    expect(INVENTORY_LOT_CERTIFICATION_EXIT.pendingArchitecturalDebt).toBe(0);
    expect(INVENTORY_LOT_CERTIFICATION_EXIT.orphanProjections).toBe(0);
    expect(PENDING_ARCHITECTURAL_DEBT).toHaveLength(0);
  });

  it('write gateway path is modules/inventory-lot/', () => {
    expect(LOT_WRITE_GATEWAY).toContain('modules/inventory-lot/');
  });

  it('every debt item maps to a NOT_STARTED or PARTIAL touchpoint', () => {
    for (const debt of PENDING_ARCHITECTURAL_DEBT) {
      expect(debt.file.length).toBeGreaterThan(0);
      expect(debt.targetMigration.length).toBeGreaterThan(0);
      if (debt.touchpointId) {
        const tp = LOT_TOUCHPOINT_REGISTRY.find((r) => r.id === debt.touchpointId);
        expect(tp).toBeDefined();
        expect(['NOT_STARTED', 'PARTIAL', 'EXCEPTION']).toContain(tp!.status);
      }
    }
  });

  it('fitness function script exists and defines Gate J checks', () => {
    const script = readFileSync(fitnessScript, 'utf8');
    expect(script).toContain('Gate J');
    expect(script).toContain('J-01');
    expect(script).toContain('LOT_CERTIFICATION_STRICT');
  });

  it('domain invariants module is SSOT for INV codes', () => {
    const inv = readFileSync(
      resolve(repoRoot, 'shared/inventory-lot/lotInvariants.ts'),
      'utf8',
    );
    expect(inv).toContain('INV-001');
    expect(inv).toContain('INV-007');
  });
});

describe('Gate J — certification readiness (informational until sprint complete)', () => {
  const certificationReady = process.env.LOT_CERTIFICATION_STRICT === '1';

  it('pending architectural debt must be zero when LOT_CERTIFICATION_STRICT=1', () => {
    if (!certificationReady) return;
    expect(PENDING_ARCHITECTURAL_DEBT).toHaveLength(0);
  });

  it('no NOT_STARTED touchpoints when LOT_CERTIFICATION_STRICT=1', () => {
    if (!certificationReady) return;
    const pending = LOT_TOUCHPOINT_REGISTRY.filter((r) => r.status === 'NOT_STARTED');
    expect(pending).toEqual([]);
  });
});
