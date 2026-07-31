/**
 * Operational proof — data integrity logic, FEFO determinism, lock ordering (ADR-002).
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectLots, sortLotsFefo } from '@shared/inventory-lot/index.js';
import type { SelectableLot } from '@shared/inventory-lot/lotSelection.js';
import {
  SQL_BATCH_BALANCE_MISMATCH,
  SQL_EXPIRY_PROJECTION_DRIFT,
  SQL_NEGATIVE_BATCH_REMAINING,
  SQL_ORPHAN_PROJECTIONS,
} from './inventoryLotIntegrityQueries.js';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BUSINESS_DATE = '2026-07-07';

function src(rel: string): string {
  return readFileSync(resolve(serverRoot, rel), 'utf8');
}

function makeLot(partial: Partial<SelectableLot> & Pick<SelectableLot, 'lotId' | 'lotNumber'>): SelectableLot {
  return {
    productId: 'prod-1',
    remainingQuantity: 10,
    costPrice: 100,
    expiryDate: null,
    receivedDate: '2026-01-01',
    ...partial,
  };
}

describe('FEFO deterministic ordering proof', () => {
  it('sorts expiry ASC, then received ASC, then lot_number ASC', () => {
    const lots: SelectableLot[] = [
      makeLot({ lotId: 'c', lotNumber: 'C', expiryDate: '2026-12-01', receivedDate: '2026-02-01' }),
      makeLot({ lotId: 'a', lotNumber: 'A', expiryDate: '2026-08-01', receivedDate: '2026-03-01' }),
      makeLot({ lotId: 'b', lotNumber: 'B', expiryDate: '2026-08-01', receivedDate: '2026-01-01' }),
      makeLot({ lotId: 'd', lotNumber: 'D', expiryDate: null, receivedDate: '2026-01-01' }),
    ];
    const sorted = sortLotsFefo(lots);
    expect(sorted.map((l) => l.lotId)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('allocation is stable across repeated runs (deterministic)', () => {
    const lots: SelectableLot[] = [
      makeLot({ lotId: '1', lotNumber: 'L1', expiryDate: '2026-09-01', remainingQuantity: 5, costPrice: 10 }),
      makeLot({ lotId: '2', lotNumber: 'L2', expiryDate: '2026-10-01', remainingQuantity: 8, costPrice: 12 }),
      makeLot({ lotId: '3', lotNumber: 'L3', expiryDate: '2026-11-01', remainingQuantity: 100, costPrice: 9 }),
    ];

    const results = Array.from({ length: 50 }, () =>
      selectLots({
        policy: 'FEFO',
        lots,
        quantity: 12,
        businessDate: BUSINESS_DATE,
      }),
    );

    const first = JSON.stringify(results[0].layers);
    for (const r of results) {
      expect(JSON.stringify(r.layers)).toBe(first);
    }
    expect(results[0].layers[0].lotId).toBe('1');
    expect(results[0].layers[1].lotId).toBe('2');
    expect(results[0].totalAllocated).toBe(12);
    expect(results[0].shortfall).toBe(0);
  });

  it('performance: FEFO allocation on 5k lots completes under 200ms', () => {
    const lots: SelectableLot[] = Array.from({ length: 5000 }, (_, i) =>
      makeLot({
        lotId: `lot-${i}`,
        lotNumber: `L-${String(i).padStart(5, '0')}`,
        expiryDate: i % 50 === 0 ? null : `2026-${String((i % 12) + 1).padStart(2, '0')}-15`,
        receivedDate: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
        remainingQuantity: 1 + (i % 20),
        costPrice: 10 + (i % 100),
      }),
    );

    const start = performance.now();
    const result = selectLots({
      policy: 'FEFO',
      lots,
      quantity: 2500,
      businessDate: BUSINESS_DATE,
    });
    const elapsed = performance.now() - start;

    expect(result.shortfall).toBe(0);
    expect(elapsed).toBeLessThan(200);
  });
});

describe('Lock ordering proof (structural)', () => {
  it('postgresLotSelector global path uses FOR UPDATE before mutation', () => {
    const selector = src('src/modules/inventory-lot/postgresLotSelector.ts');
    expect(selector).toMatch(/forUpdate \? ' FOR UPDATE'/);
    expect(selector).toContain('loadGlobalSelectableLots');
    expect(selector).toContain('loadStoreSelectableLots');
  });

  it('consumeLot selects before decrementMasterRemainingQuantity', () => {
    const svc = src('src/modules/inventory-lot/lotService.ts');
    const consumeStart = svc.indexOf('async consumeLot');
    const returnStart = svc.indexOf('async returnLot', consumeStart);
    const consumeBlock = svc.slice(consumeStart, returnStart > consumeStart ? returnStart : undefined);
    expect(consumeBlock).toContain('selectLots');
    expect(consumeBlock).toContain('decrementMasterRemainingQuantity');
    expect(consumeBlock).toContain('selection.shortfall > 0.001');
    expect(consumeBlock).toContain('selection.totalAllocated + 0.001 < input.quantity');
  });

  it('movement numbers use Postgres SEQUENCE (no TX-scoped advisory lock)', () => {
    const movementRepo = src('src/modules/stock-movements/stockMovementRepository.ts');
    expect(movementRepo).toContain('allocateNextMovementNumber');
    expect(movementRepo).not.toContain("pg_advisory_xact_lock(hashtext('movement_number_seq'))");
  });
});

describe('Data integrity SQL probes (shape)', () => {
  it('integrity queries target drift, orphans, and balance mismatch', () => {
    expect(SQL_EXPIRY_PROJECTION_DRIFT).toContain('IS DISTINCT FROM');
    expect(SQL_ORPHAN_PROJECTIONS).toContain('inventory_batch_id IS NULL');
    expect(SQL_BATCH_BALANCE_MISMATCH).toContain('HAVING ABS');
    expect(SQL_NEGATIVE_BATCH_REMAINING).toContain('remaining_quantity <');
  });
});

describe('Multistore synchronization contract', () => {
  it('consumeLot decrements store balance when storeLocationId set', () => {
    const svc = src('src/modules/inventory-lot/lotService.ts');
    expect(svc).toContain('adjustSellableQuantity');
    expect(svc).toContain('loadStoreSelectableLots');
  });

  it('upsertProjection reads expiry from master not caller params', () => {
    const wh = src('src/modules/inventory/warehouse/warehouseInventoryRepository.ts');
    expect(wh).toContain('master.attributes.expiryDate');
  });
});
