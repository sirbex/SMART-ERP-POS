/**
 * Phase 6 — structural cleanup + permission parity proofs (L01–L04).
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function src(rel: string): string {
  return readFileSync(resolve(serverRoot, rel), 'utf8');
}

describe('Phase 6 dead module cleanup (L01)', () => {
  it('supplierModule.ts removed; supplierRoutes is the mount', () => {
    expect(existsSync(resolve(serverRoot, 'src/modules/suppliers/supplierModule.ts'))).toBe(false);
    expect(src('src/server.ts')).toContain('supplierRoutes');
  });
});

describe('Phase 6 GR inventory SSOT documentation (L02)', () => {
  it('handler documents warehouseGrnService path for lot-based GRN', () => {
    const handler = src('src/modules/inventory/stockMovementHandler.ts');
    expect(handler).toContain('warehouseGrnService');
    expect(handler).toContain('finalizeGR');
  });

  it('finalizeGR uses createBatch + warehouseGrnService.postReceiptSegment', () => {
    const gr = src('src/modules/goods-receipts/goodsReceiptService.ts');
    const finalize = gr.slice(gr.indexOf('async finalizeGR('), gr.indexOf('async updateGRItem('));
    expect(finalize).toContain('warehouseGrnService.postReceiptSegment');
    expect(finalize).toContain('inventoryRepository.createBatch');
    expect(finalize).toContain('lot-based GRN');
  });
});

describe('Phase 6 supplier invoice read permission (L03)', () => {
  it('GET /invoices requires suppliers.read', () => {
    const routes = src('src/modules/supplier-payments/supplierPaymentRoutes.ts');
    const listBlock = routes.slice(
      routes.indexOf("'/invoices'"),
      routes.indexOf("'/invoices/unbilled-grns'"),
    );
    expect(listBlock).toContain("requirePermission('suppliers.read')");
  });
});

describe('Phase 6 GR permission parity (L04)', () => {
  it('finalize and reverse-uninvoiced both require purchasing.post', () => {
    const routes = src('src/modules/goods-receipts/goodsReceiptRoutes.ts');
    const finalizeBlock = routes.slice(
      routes.indexOf("'/:id/finalize'"),
      routes.indexOf("'/:id/items/:itemId'"),
    );
    expect(finalizeBlock).toContain("requirePermission('purchasing.post')");
    expect(routes).toMatch(
      /goodsReceiptRoutes\.post\(\s*'\/:id\/reverse-uninvoiced'[\s\S]*?requirePermission\('purchasing\.post'\)/,
    );
  });
});
