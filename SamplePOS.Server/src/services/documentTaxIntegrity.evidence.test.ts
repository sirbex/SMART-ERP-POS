/**
 * EVIDENCE: DocumentTax integrity hardening (cross-phase accuracy fixes).
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRel(rel: string): string {
  return readFileSync(path.join(serverRoot, rel), 'utf8');
}

describe('EVIDENCE — DocumentTax integrity hardening', () => {
  it('createSale hard-fails on lineResults mismatch / header-line tax drift', () => {
    const src = readRel('src/modules/sales/salesService.ts');
    expect(src).toMatch(/ERR_TAX_LINE_MISMATCH/);
    expect(src).toMatch(/ERR_TAX_LINE_HEADER_MISMATCH/);
    expect(src).toMatch(/isRestaurantCheck/);
    expect(src).toMatch(/applyTenantDefaultWhenUnresolved/);
  });

  it('DB product bridge overwrites client tax fields for UUID products', () => {
    const src = readRel('src/services/documentTaxService.ts');
    expect(src).toMatch(/isTaxable = bridge\.isTaxable/);
    expect(src).toMatch(/taxRate = bridge\.taxRate/);
    expect(src).not.toMatch(/if \(isTaxable === undefined\) isTaxable = bridge\.isTaxable/);
  });

  it('invoice paths use server DocumentTax amounts not client preview', () => {
    const src = readRel('src/modules/sales/salesService.ts');
    expect(src).toMatch(/taxAmount: Money\.toNumber\(taxAmount\)/);
    expect(src).not.toMatch(/taxAmount: Money\.toNumber\(Money\.parse\(input\.taxAmount \|\| 0\)\)/);
  });

  it('CN/DN persist DocumentTax line taxAmount', () => {
    const svc = readRel('src/modules/credit-debit-notes/creditDebitNoteService.ts');
    const repo = readRel('src/modules/credit-debit-notes/creditDebitNoteRepository.ts');
    expect(svc).toMatch(/taxAmount: priced\.lines\[idx\]\?\.taxAmount/);
    expect(repo).toMatch(/line\.taxAmount !== undefined/);
  });

  it('order complete uses restaurant tenant-default flag', () => {
    const src = readRel('src/modules/orders/ordersRoutes.ts');
    expect(src).toMatch(/applyTenantDefaultWhenUnresolved: isRestaurantCheck/);
  });

  it('mappings PUT validates UUIDs and hints tax snapshot refresh', () => {
    const src = readRel('src/modules/accounting/enterpriseAccountingRoutes.ts');
    expect(src).toMatch(/refresh_tax_snapshot/);
    expect(src).toMatch(/productId must be a UUID/);
    expect(src).toMatch(/lineNet = price \* qty/);
  });

  it('createInvoiceFromSale reads sale tax_amount', () => {
    const src = readRel('src/modules/invoices/invoiceRepository.ts');
    expect(src).toMatch(/FROM sales WHERE id = \$1::uuid/);
    expect(src).toMatch(/saleTax/);
    expect(src).not.toMatch(/\$5, 0, \$5, 0, \$5/);
  });
});
