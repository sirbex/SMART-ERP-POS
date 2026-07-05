/**
 * Phase 5 — supplier policy parity proofs (M08–M12).
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
  if (start < 0) {
    const alt = source.indexOf(`${fnName}(`);
    if (alt < 0) throw new Error(`Function ${fnName} not found`);
    const nextFn = source.indexOf('\n  async ', alt + 1);
    return nextFn > alt ? source.slice(alt, nextFn) : source.slice(alt);
  }
  const nextFn = source.indexOf('\n  async ', start + 1);
  return nextFn > start ? source.slice(start, nextFn) : source.slice(start);
}

function exportFnBody(source: string, fnName: string): string {
  const marker = `export async function ${fnName}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Function ${fnName} not found`);
  const nextFn = source.indexOf('\nexport async function ', start + 1);
  return nextFn > start ? source.slice(start, nextFn) : source.slice(start);
}

describe('Phase 5 supplier credit guard (M08)', () => {
  it('assertSupplierCreditHeadroom uses open-item AP balance + CreditLimit', () => {
    const guard = src('src/modules/suppliers/supplierCreditGuard.ts');
    expect(guard).toContain('BR-SUP-002');
    expect(guard).toContain('computeSupplierOpenItemBalance');
    expect(guard).toContain('creditLimit <= 0');
  });

  it('credit guard wired at PO create, submit, send, manual GR, invoice post', () => {
    expect(fnBody(src('src/modules/purchase-orders/purchaseOrderService.ts'), 'createPO'))
      .toContain('assertSupplierCreditHeadroom');
    expect(fnBody(src('src/modules/purchase-orders/purchaseOrderService.ts'), 'submitPO'))
      .toContain('assertSupplierCreditHeadroom');
    expect(fnBody(src('src/modules/purchase-orders/purchaseOrderService.ts'), 'sendPOToSupplier'))
      .toContain('assertSupplierCreditHeadroom');
    const gr = src('src/modules/goods-receipts/goodsReceiptService.ts');
    const manualBlock = gr.slice(
      gr.indexOf('Creating manual PO for supplier'),
      gr.indexOf('createManualPO'),
    );
    expect(manualBlock).toContain('assertSupplierCreditHeadroom');
    expect(exportFnBody(src('src/modules/supplier-payments/supplierPaymentService.ts'), 'postInvoiceToGL'))
      .toContain('assertSupplierCreditHeadroom');
  });
});

describe('Phase 5 supplier active revalidation (M09–M10)', () => {
  it('submitPO and sendPOToSupplier re-validate supplier', () => {
    const po = src('src/modules/purchase-orders/purchaseOrderService.ts');
    expect(fnBody(po, 'submitPO')).toContain('validateSupplierExists');
    expect(fnBody(po, 'sendPOToSupplier')).toContain('validateSupplierExists');
  });

  it('manual GR validates supplier before createManualPO', () => {
    const gr = src('src/modules/goods-receipts/goodsReceiptService.ts');
    const manualBlock = gr.slice(
      gr.indexOf('Creating manual PO for supplier'),
      gr.indexOf('createManualPO'),
    );
    expect(manualBlock).toContain('validateSupplierExists');
  });
});

describe('Phase 5 AP outstanding parity (M11)', () => {
  it('getTotalOutstanding aligns invoice subquery with GL-posted SSOT', () => {
    const repo = src('src/modules/suppliers/supplierRepository.ts');
    expect(repo).toContain('AP_OPEN_INVOICE_GL_POSTED_SQL');
    expect(exportFnBody(repo, 'getTotalOutstanding')).toContain('AP_OPEN_INVOICE_GL_POSTED_SQL');
  });
});

describe('Phase 5 dead PO rule calls removed (M12)', () => {
  it('purchaseOrderService no longer calls disabled lead time / MOV validators', () => {
    const po = src('src/modules/purchase-orders/purchaseOrderService.ts');
    expect(po).not.toMatch(/validateLeadTime\s*\(/);
    expect(po).not.toMatch(/validateMinimumOrderValue\s*\(/);
  });
});
