/**
 * Phase 4 — warehouse adjustment + stock count parity proofs.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function src(rel: string): string {
  return readFileSync(resolve(serverRoot, rel), 'utf8');
}

function fnBody(source: string, fnName: string): string {
  const start = source.indexOf(`async ${fnName}(`);
  if (start < 0) throw new Error(`Function ${fnName} not found`);
  const nextFn = source.indexOf('\n    async ', start + 1);
  return nextFn > start ? source.slice(start, nextFn) : source.slice(start);
}

describe('Phase 4 warehouse adjustment parity', () => {
  it('M01: multistore DAMAGE quarantine is internal transfer + audit movement (no GL handler)', () => {
    const adj = src('src/modules/inventory/warehouse/warehouseAdjustmentService.ts');
    const body = fnBody(adj, 'adjustAtStore');
    const damageBlock = body.slice(
      body.indexOf("params.reason === 'DAMAGE'"),
      body.indexOf('await warehouseInventoryRepository.adjustSellableQuantity'),
    );
    expect(damageBlock).toContain('moveLotQuantityBetweenStores');
    expect(damageBlock).toContain('recordMovement');
    expect(damageBlock).toContain('internal quarantine transfer');
    expect(damageBlock).not.toContain('new StockMovementHandler');
    expect(body).toContain('quarantineStoreId');
  });
});

describe('Phase 4 stock count parity', () => {
  it('M04: legacy reconcile passes unitCost on ADJUSTMENT_IN', () => {
    const sc = src('src/modules/inventory/stockCountService.ts');
    const legacy = sc.slice(sc.indexOf('// Legacy global batch reconciliation'));
    expect(legacy).toContain('product_valuation');
    expect(legacy).toContain('unitCost: resolvedUnitCost');
  });

  it('M05: multistore reconcile honors allowNegativeAdjustments', () => {
    const sc = src('src/modules/inventory/stockCountService.ts');
    const block = sc.slice(
      sc.indexOf('if (useStoreReconciliation)'),
      sc.indexOf('// Legacy global batch reconciliation'),
    );
    expect(block).toContain('allowNegativeAdjustments');
    expect(block).toContain('inventory_balances');
  });
});

describe('Phase 4 GR draft/finalize parity', () => {
  it('M06: GR draft create no longer calls disabled validateMaxStockLevel', () => {
    const gr = src('src/modules/goods-receipts/goodsReceiptService.ts');
    expect(gr).not.toContain('validateMaxStockLevel');
  });

  it('M07: GR finalize throws on cost layer failure', () => {
    const gr = src('src/modules/goods-receipts/goodsReceiptService.ts');
    expect(gr).toContain('Cost layer creation failed');
    expect(gr).toContain('throw new ValidationError');
    expect(gr).not.toContain('Not throwing - cost layer failure');
  });
});
