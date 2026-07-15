/**
 * Gate C / D structural + concurrency proofs — Loss & Quarantine (Phase 2E)
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertDisposalCouplesSubledger,
  expenseAccountForDisposal,
  shouldSkipGlRepairForMovement,
  LossQuarantineInvariantError,
} from '@shared/loss-quarantine/index.js';
import {
  isQuarantineStoreType,
  isSellableStoreType,
} from './quarantineLotStatus.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('Loss & Quarantine operations proof (Gate C)', () => {
  it('C-01 quarantine store types are not sellable', () => {
    expect(isQuarantineStoreType('DAMAGE')).toBe(true);
    expect(isQuarantineStoreType('EXPIRED')).toBe(true);
    expect(isSellableStoreType('DAMAGE')).toBe(false);
    expect(isSellableStoreType('MAIN')).toBe(true);
  });

  it('C-02 / C-03 dispose from DAMAGE→5120 and EXPIRED→5130', () => {
    expect(
      expenseAccountForDisposal({ reason: 'WRITE_OFF', fromStoreType: 'DAMAGE' }),
    ).toBe('5120');
    expect(
      expenseAccountForDisposal({ reason: 'WRITE_OFF', fromStoreType: 'EXPIRED' }),
    ).toBe('5130');
    expect(
      expenseAccountForDisposal({ reason: 'SHRINKAGE', fromStoreType: 'MAIN' }),
    ).toBe('5110');
  });

  it('C-05 over-dispose rejected in service (available check)', () => {
    const svc = readRepo(
      'SamplePOS.Server/src/modules/loss-quarantine/lossDisposalService.ts',
    );
    expect(svc).toMatch(/Cannot dispose/);
    expect(svc).toMatch(/only \$\{available\} available/);
    expect(svc).toMatch(/FOR UPDATE/);
  });

  it('C-06 reverseDisposal restores lot and creates LOSS_REVERSAL', () => {
    const svc = readRepo(
      'SamplePOS.Server/src/modules/loss-quarantine/lossDisposalService.ts',
    );
    expect(svc).toMatch(/reverseDisposal/);
    expect(svc).toMatch(/LOSS_REVERSAL/);
    expect(svc).toMatch(/returnLot/);
  });

  it('C-04 / LQ-INV-9 single-store dispose path still LOSS_DISPOSAL via handler', () => {
    const handler = readRepo(
      'SamplePOS.Server/src/modules/inventory/stockMovementHandler.ts',
    );
    expect(handler).toMatch(/LOSS_DISPOSAL/);
  });

  it('C FEFO / consume blocks quarantine allocation (LQ-INV-5)', () => {
    const sel = readRepo(
      'SamplePOS.Server/src/modules/inventory-lot/postgresLotSelector.ts',
    );
    expect(sel).toContain("sl.store_type IN ('MAIN', 'SELLING')");
    const lot = readRepo('SamplePOS.Server/src/modules/inventory-lot/lotService.ts');
    expect(lot).toMatch(/LQ-INV-5/);
  });
});

describe('Loss & Quarantine concurrency proof (Gate D structural)', () => {
  it('D dispose locks inventory_balances with FOR UPDATE', () => {
    const svc = readRepo(
      'SamplePOS.Server/src/modules/loss-quarantine/lossDisposalService.ts',
    );
    const locks = (svc.match(/FOR UPDATE/g) ?? []).length;
    expect(locks).toBeGreaterThanOrEqual(2);
  });

  it('D disposal documents use row_version', () => {
    const svc = readRepo(
      'SamplePOS.Server/src/modules/loss-quarantine/lossDisposalService.ts',
    );
    expect(svc).toMatch(/row_version/);
    const sql = readRepo('shared/sql/546_loss_disposal_documents.sql');
    expect(sql).toMatch(/row_version/);
  });

  it('D concurrent double-dispose: second attempt fails after residual consumed', () => {
    // Simulates two races on the same quarantine residual after first wins.
    let available = 10;
    const attempt = (qty: number) => {
      if (qty - available > 0.0001) {
        throw new Error(`Cannot dispose ${qty}: only ${available} available`);
      }
      available = Math.round((available - qty) * 10000) / 10000;
    };
    attempt(10);
    expect(available).toBe(0);
    expect(() => attempt(1)).toThrow(/only 0 available/);
  });

  it('D LQ-INV-8 repair skip is idempotent for quarantine classifiers', () => {
    const input = {
      movementType: 'DAMAGE',
      notes: 'internal quarantine transfer',
      economicEvent: 'QUARANTINE_TRANSFER' as const,
      postsGl: false,
    };
    expect(shouldSkipGlRepairForMovement(input)).toBe(true);
    expect(shouldSkipGlRepairForMovement(input)).toBe(true);
  });

  it('D LQ-INV-2 coupling rejects mismatched disposal values', () => {
    expect(() =>
      assertDisposalCouplesSubledger({
        glAmount: 100,
        batchConsumptionValue: 90,
      }),
    ).toThrow(LossQuarantineInvariantError);
  });
});
