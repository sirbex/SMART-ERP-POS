/**
 * Architecture proof: supplier payment reverse + correct-method (cash→bank)
 * must exist as first-class APIs (SAP FBRA / Odoo cancel+recreate).
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Supplier payment reverse / correct-method architecture', () => {
  const service = readFileSync(
    path.join(root, 'modules/supplier-payments/supplierPaymentService.ts'),
    'utf8',
  );
  const routes = readFileSync(
    path.join(root, 'modules/supplier-payments/supplierPaymentRoutes.ts'),
    'utf8',
  );

  it('exports reverseSupplierPayment and correctSupplierPaymentMethod', () => {
    expect(service).toMatch(/export async function reverseSupplierPayment/);
    expect(service).toMatch(/export async function correctSupplierPaymentMethod/);
  });

  it('reverse unapplies allocations then reverses SUPPLIER_PAYMENT GL', () => {
    expect(service).toMatch(/deleteAllocation/);
    expect(service).toMatch(/ReferenceType.*=.*'SUPPLIER_PAYMENT'/);
    expect(service).toMatch(/AccountingCore\.reverseTransaction/);
    expect(service).toMatch(/Status.*=.*'REVERSED'/);
  });

  it('correct-method reverses then createSupplierPayment with new method', () => {
    expect(service).toMatch(/exactAllocations/);
    expect(service).toMatch(/createSupplierPayment\(/);
    expect(service).toMatch(/newPaymentMethod/);
  });

  it('supplier payment GL path asserts liquidity funds before credit', () => {
    const gl = readFileSync(
      path.join(root, 'services/glEntryService.ts'),
      'utf8',
    );
    const fnStart = gl.indexOf('export async function recordSupplierPaymentToGL');
    expect(fnStart).toBeGreaterThan(0);
    const slice = gl.slice(fnStart, fnStart + 4500);
    expect(slice).toMatch(/assertSufficientLiquidityFunds/);
    expect(slice).toMatch(/paymentAccountCode/);
  });

  it('create path resolves pay-from bank book before GL', () => {
    expect(service).toMatch(/resolveSupplierPaymentCreditAccount/);
    expect(service).toMatch(/paymentAccountCode:\s*payFrom\.creditAccountCode/);
    expect(service).toMatch(/bankAccountId:\s*payFrom\.bankAccountId/);
  });

  it('exposes POST reverse and correct-method routes', () => {
    expect(routes).toMatch(/\/payments\/:id\/reverse/);
    expect(routes).toMatch(/\/payments\/:id\/correct-method/);
  });
});
