/**
 * Phase 2D governance proofs — repair skip, legacy GL guard, quarantine lane.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';
import {
  shouldSkipGlRepairForMovement,
} from '@shared/loss-quarantine/index.js';
import {
  LOSS_QUARANTINE_TOUCHPOINT_REGISTRY,
} from './lossQuarantineTouchpointRegistry.js';
import {
  resolvePeriodCloseBlocking,
  resolveSeverity,
  resolveRecommendedAction,
  buildFinancialLaneResult,
} from '../financial-reconciliation/laneMetadata.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('Loss & Quarantine Phase 2D governance', () => {
  it('LQ-INV-8: quarantine movements skip GL repair', () => {
    expect(
      shouldSkipGlRepairForMovement({
        economicEvent: 'QUARANTINE_TRANSFER',
        postsGl: false,
        movementType: 'TRANSFER',
        notes: 'internal quarantine transfer',
      }),
    ).toBe(true);
    expect(
      shouldSkipGlRepairForMovement({
        economicEvent: 'LOSS_DISPOSAL',
        postsGl: true,
        movementType: 'ADJUSTMENT_OUT',
        notes: null,
      }),
    ).toBe(false);
  });

  it('glRepairService excludes posts_gl=false and QUARANTINE_TRANSFER', () => {
    const src = readRepo('SamplePOS.Server/src/modules/system/glRepairService.ts');
    expect(src).toMatch(/posts_gl IS FALSE/);
    expect(src).toMatch(/QUARANTINE_TRANSFER/);
    expect(src).toMatch(/shouldSkipGlRepairForMovement/);
  });

  it('legacy recordStockAdjustmentToGL is guarded', () => {
    const src = readRepo('SamplePOS.Server/src/services/glEntryService.ts');
    expect(src).toMatch(/ALLOW_LEGACY_STOCK_ADJUSTMENT_GL/);
    expect(src).toMatch(/retired \(ADR-004/);
  });

  it('schema 547 drops stock movement GL trigger', () => {
    expect(existsSync(path.join(repoRoot, 'shared/sql/547_drop_stock_movement_gl_trigger.sql'))).toBe(
      true,
    );
    const sql = readRepo('shared/sql/547_drop_stock_movement_gl_trigger.sql');
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS trg_post_stock_movement_to_ledger/);
    const ver = readRepo('SamplePOS.Server/src/constants/schemaVersion.ts');
    const m = ver.match(/CURRENT_SCHEMA_VERSION\s*=\s*(\d+)/);
    expect(Number(m?.[1])).toBeGreaterThanOrEqual(547);
  });

  it('fixInventoryGLDrift documents quarantine BS exposure', () => {
    const src = readRepo('SamplePOS.Server/src/scripts/fixInventoryGLDrift.ts');
    expect(src).toMatch(/getQuarantineAging/);
    expect(src).toMatch(/do NOT heal as shrinkage/i);
  });

  it('inventory provider exposes quarantine lane', () => {
    const src = readRepo(
      'SamplePOS.Server/src/modules/financial-reconciliation/providers/inventoryReconciliationProvider.ts',
    );
    expect(src).toMatch(/'quarantine'/);
    expect(src).toMatch(/computeQuarantine/);
  });

  it('quarantine lane never blocks period close', () => {
    expect(resolvePeriodCloseBlocking('quarantine')).toBe(false);
    expect(resolveSeverity('quarantine', 'INFORMATIONAL', 50_000)).toBe('informational');
    expect(resolveRecommendedAction('inventory', 'quarantine', 'INFORMATIONAL', 12_000)).toMatch(
      /dispose/i,
    );
    const result = buildFinancialLaneResult('inventory', 'quarantine', '2026-07-12', {
      leftLabel: 'Quarantine',
      leftAmount: 12_000,
      rightLabel: 'Disposed',
      rightAmount: 0,
      difference: 12_000,
      status: 'INFORMATIONAL',
    });
    expect(result.periodCloseBlocking).toBe(false);
    expect(result.severity).toBe('informational');
  });

  it('LQ08/LQ09 are migrated after 2D', () => {
    const byId = Object.fromEntries(
      LOSS_QUARANTINE_TOUCHPOINT_REGISTRY.map((t) => [t.id, t]),
    );
    expect(byId.LQ08.status).toBe('MIGRATED');
    expect(byId.LQ09.status).toBe('MIGRATED');
    expect(byId.LQ10.status).toBe('CLASSIFIED');
  });
});
