/**
 * EVIDENCE — Why tax “worked before” and can suddenly post 0 after DocumentTax went live.
 *
 * Timeline (repo / prod):
 *   - Commit 4e2b03c9 (2026-08-02 23:45 +0300): DocumentTax SSOT ships
 *   - PROOF_DOCUMENT_TAX_DEPLOYED.md: live on prod 2026-08-03 ~04:04Z for that SHA
 *
 * BEFORE (parent of 4e2b03c9):
 *   createSale: taxAmount = input.taxAmount from the client (trusted)
 *
 * AFTER:
 *   createSale: DocumentTaxService.computeForLines is authoritative;
 *   resolveAuthoritativeTaxAmount always returns server tax (logs client override)
 *
 * Incomplete customer TIN (BPED-style) does NOT gate tax to zero.
 * what does: require-registered policy + non-VAT customer; product not bridge/mapped;
 * empty customer defaultVatRate; taxInclusive; future effective dates.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  previewPosCartTax,
  resolveCustomerTaxGate,
} from '@shared/utils/documentTaxPreview.js';
import { isIncompleteVatRegistration } from '@shared/utils/customerTaxProfileIntegrity.js';
import { resolveAuthoritativeTaxAmount } from './documentTaxService.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRel(rel: string): string {
  return readFileSync(path.join(serverRoot, rel), 'utf8');
}

describe('EVIDENCE — DocumentTax cutover (why tax seemed to stop)', () => {
  it('createSale wire is DocumentTax-authoritative (not client taxAmount)', () => {
    const sales = readRel('src/modules/sales/salesService.ts');
    expect(sales).toMatch(/DocumentTaxService\.computeForLines/);
    expect(sales).toMatch(/resolveAuthoritativeTaxAmount/);
    // Must not retain the pre-cutover trust-client pattern as the primary path
    expect(sales).not.toMatch(
      /Use provided tax if available, otherwise default to 0/,
    );
  });

  it('server tax wins even when client preview is higher', () => {
    const amt = resolveAuthoritativeTaxAmount(0, 18000, { saleHint: 'why-stopped' });
    expect(amt.toNumber()).toBe(0);
  });

  it('deploy proof names DocumentTax cutover SHA', () => {
    const proof = readRel('../PROOF_DOCUMENT_TAX_DEPLOYED.md');
    expect(proof).toMatch(/4e2b03c97add/);
    expect(proof).toMatch(/DocumentTax is live on production/);
  });

  it('incomplete TIN is NOT a tax-zero gate', () => {
    const bpedLike = {
      vatRegistered: true,
      taxProfile: 'VAT_REGISTERED' as const,
      tin: null as string | null,
      defaultVatRate: null as number | null,
    };
    expect(isIncompleteVatRegistration(bpedLike)).toBe(true);
    // Registered (even incomplete TIN) passes the registered-customer gate
    expect(
      resolveCustomerTaxGate({
        vatOutputRequiresRegisteredCustomer: true,
        customerProfile: bpedLike,
      }),
    ).toBeNull();

    // With product bridge fields, tax still applies
    const tax = previewPosCartTax(
      [{ productId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', subtotal: 100_000, isTaxable: true, taxRate: 18 }],
      {
        vatOutputRequiresRegisteredCustomer: true,
        customerProfile: bpedLike,
      },
    );
    expect(tax).toBe(18_000);
  });

  it('policy ON + non-registered customer → 0 (sudden stop if policy flipped)', () => {
    const tax = previewPosCartTax(
      [{ subtotal: 100_000, isTaxable: true, taxRate: 18 }],
      {
        vatOutputRequiresRegisteredCustomer: true,
        customerProfile: { vatRegistered: false, taxProfile: 'STANDARD' },
      },
    );
    expect(tax).toBe(0);
  });

  it('product with no mapping/bridge + empty customer default rate → 0 (UI used to send tax anyway)', () => {
    // Before cutover the client could POST taxAmount; after, server sees this determination=NONE
    const tax = previewPosCartTax(
      [
        {
          productId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          subtotal: 100_000,
          // missing isTaxable / taxRate → like DB product not taxable
        },
      ],
      {
        vatOutputRequiresRegisteredCustomer: false,
        customerProfile: {
          vatRegistered: true,
          taxProfile: 'VAT_REGISTERED',
          defaultVatRate: null,
        },
        productMappings: new Map(),
      },
    );
    expect(tax).toBe(0);
  });

  it('customer defaultVatRate rescues unresolved product only when VAT-registered', () => {
    const withDefault = previewPosCartTax(
      [{ productId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', subtotal: 100_000 }],
      {
        customerProfile: {
          vatRegistered: true,
          taxProfile: 'VAT_REGISTERED',
          defaultVatRate: 18,
        },
      },
    );
    expect(withDefault).toBe(18_000);

    // BPED-style: registered but no default rate → still 0 without product tax
    const incompleteRate = previewPosCartTax(
      [{ productId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', subtotal: 100_000 }],
      {
        customerProfile: {
          vatRegistered: true,
          taxProfile: 'VAT_REGISTERED',
          defaultVatRate: null,
        },
      },
    );
    expect(incompleteRate).toBe(0);
  });

  it('future taxEffectiveFrom deactivates registered status for the gate', () => {
    expect(
      resolveCustomerTaxGate({
        vatOutputRequiresRegisteredCustomer: true,
        documentDate: '2026-08-03',
        customerProfile: {
          vatRegistered: true,
          taxProfile: 'VAT_REGISTERED',
          taxEffectiveFrom: '2026-12-01',
        },
      }),
    ).toBe('NONE');
  });
});
