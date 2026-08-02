/**
 * EVIDENCE: Phase 4 Customer Tax Profile wired into DocumentTaxService + schema 582.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveCustomerTaxGate,
  previewPosCartTax,
} from '@shared/utils/documentTaxPreview.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRel(rel: string): string {
  return readFileSync(path.join(serverRoot, rel), 'utf8');
}

describe('customer tax profile determination', () => {
  it('EXEMPT profile → EXEMPT gate', () => {
    expect(
      resolveCustomerTaxGate({
        customerProfile: { taxExempt: true, taxProfile: 'EXEMPT' },
      }),
    ).toBe('EXEMPT');
  });

  it('requires registered: walk-in → NONE', () => {
    expect(
      resolveCustomerTaxGate({
        vatOutputRequiresRegisteredCustomer: true,
        customerProfile: null,
      }),
    ).toBe('NONE');
  });

  it('requires registered: VAT customer → pass (null gate)', () => {
    expect(
      resolveCustomerTaxGate({
        vatOutputRequiresRegisteredCustomer: true,
        customerProfile: { vatRegistered: true, taxProfile: 'VAT_REGISTERED' },
      }),
    ).toBeNull();
  });

  it('POS preview: registered customer gets product bridge VAT', () => {
    const tax = previewPosCartTax(
      [
        {
          productId: '11111111-1111-1111-1111-111111111111',
          subtotal: 100_000,
          isTaxable: true,
          taxRate: 18,
        },
      ],
      {
        vatOutputRequiresRegisteredCustomer: true,
        customerProfile: { vatRegistered: true, taxProfile: 'VAT_REGISTERED' },
      },
    );
    expect(tax).toBe(18_000);
  });

  it('POS preview: walk-in with require-registered → 0', () => {
    const tax = previewPosCartTax(
      [{ subtotal: 100_000, isTaxable: true, taxRate: 18 }],
      { vatOutputRequiresRegisteredCustomer: true, customerProfile: null },
    );
    expect(tax).toBe(0);
  });
});

describe('EVIDENCE — Phase 4 wiring', () => {
  it('schema 582 + CURRENT_SCHEMA_VERSION', () => {
    const mig = readRel('../shared/sql/582_customer_tax_profile.sql');
    const ver = readRel('src/constants/schemaVersion.ts');
    expect(mig).toMatch(/vat_registered/);
    expect(mig).toMatch(/vat_output_requires_registered_customer/);
    expect(mig).toMatch(/VALUES \(582\)/);
    // Later phases bump CURRENT_SCHEMA_VERSION; Phase 4 migration remains 582.
    expect(ver).toMatch(/CURRENT_SCHEMA_VERSION\s*=\s*58[2-9]/);
  });

  it('DocumentTaxService loads customer tax profile', () => {
    const src = readRel('src/services/documentTaxService.ts');
    expect(src).toMatch(/loadCustomerTaxProfile/);
    expect(src).toMatch(/resolveCustomerTaxGate/);
    expect(src).toMatch(/vatOutputRequiresRegisteredCustomer/);
  });

  it('customer repository selects tax profile columns', () => {
    const src = readRel('src/modules/customers/customerRepository.ts');
    expect(src).toMatch(/vat_registered/);
    expect(src).toMatch(/tax_profile/);
    expect(src).toMatch(/allow_tax_override/);
  });
});
