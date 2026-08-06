/**
 * EVIDENCE — Product VAT untick integrity (retail POS / createSale)
 *
 * Operator contract:
 *   Untick "VAT liable" on product master → is_taxable = false in DB
 *   → DocumentTax retail (applyTenantDefault=false) must post tax = 0
 *   even if a Tax Engine product_tax_mappings row remains.
 *   Client cart stamps must not resurrect tax (server DB bridge SSOT).
 *
 * Failures of this suite = operator checkbox is a lie (exactly the live bug).
 *
 * Run:
 *   npm test -- --runInBand src/services/documentTaxProductVatUntick.evidence.test.ts
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  previewDocumentTax,
  previewPosCartTax,
  resolvePreviewLineTaxes,
  saleChargeTotal,
} from '../../../shared/utils/documentTaxPreview.js';
import { resolveSaleHeaderTotal } from '../modules/sales/saleIntegrity.js';
import Decimal from 'decimal.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = path.resolve(serverRoot, '..');

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}
function readServer(rel: string): string {
  return readFileSync(path.join(serverRoot, rel), 'utf8');
}

const VAT18 = {
  id: 'vat18',
  code: 'VAT18',
  name: 'VAT 18%',
  type: 'PERCENTAGE' as const,
  rate: 18,
  isInclusive: false,
  isCompound: false,
  sequence: 10,
  isActive: true,
  taxPayableAccountCode: '2300',
};

const PID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SHELF = 4_200;

const mockGetSettings = jest.fn();
const mockIsExempt = jest.fn();
const mockLoadDefs = jest.fn();
const mockLoadMappings = jest.fn();
const mockLoadBridge = jest.fn();
const mockLoadCustomerProfile = jest.fn();

jest.unstable_mockModule('../modules/system-settings/systemSettingsRepository.js', () => ({
  systemSettingsRepository: { getSettings: (...a: unknown[]) => mockGetSettings(...a) },
}));
jest.unstable_mockModule('./documentTaxRepository.js', () => ({
  isCustomerTaxExempt: (...a: unknown[]) => mockIsExempt(...a),
  loadActiveTaxDefinitions: (...a: unknown[]) => mockLoadDefs(...a),
  loadProductTaxMappings: (...a: unknown[]) => mockLoadMappings(...a),
  loadProductTaxBridge: (...a: unknown[]) => mockLoadBridge(...a),
  loadCustomerTaxProfile: (...a: unknown[]) => mockLoadCustomerProfile(...a),
}));

const { DocumentTaxService } = await import('./documentTaxService.js');
const fakeConn = {} as never;

describe('EVIDENCE — structural SSOT product VAT untick', () => {
  it('shared hierarchy documents is_taxable false before mapping on retail', () => {
    const src = readRepo('shared/utils/documentTaxPreview.ts');
    expect(src).toMatch(/is_taxable === false|isTaxable === false/);
    expect(src).toMatch(/mappings cannot resurrect|must not re-apply tax|explicitlyNonTaxable/i);
  });

  it('server createSale uses DocumentTaxService.computeForLines (retail applyTenantDefault false)', () => {
    const sales = readServer('src/modules/sales/salesService.ts');
    expect(sales).toMatch(/DocumentTaxService\.computeForLines/);
    expect(sales).toMatch(/applyTenantDefaultWhenUnresolved/);
    // Restaurant only when order is a restaurant check
    expect(sales).toMatch(/isRestaurantCheck/);
  });

  it('resolveLineTaxes uses DB product bridge as SSOT for UUID products', () => {
    const src = readServer('src/services/documentTaxService.ts');
    expect(src).toMatch(/loadProductTaxBridge|bridges\.get/);
    expect(src).toMatch(/isTaxable = bridge\.isTaxable/);
  });
});

describe('EVIDENCE — pure SSOT: untick beats leftover mapping', () => {
  it('preview: isTaxable false + mapping → tax 0, determination NONE', () => {
    const r = previewDocumentTax(
      [{ productId: PID, lineNetAmount: SHELF, isTaxable: false, taxRate: 18 }],
      {
        productMappings: new Map([[PID, [VAT18]]]),
        taxCatalog: [VAT18],
        applyTenantDefaultWhenUnresolved: false,
        taxInclusive: false,
      },
    );
    expect(r.totalTax).toBe(0);
    expect(r.lineResults[0].determination).toBe('NONE');
    expect(saleChargeTotal(SHELF, r.totalTax, false)).toBe(SHELF);
  });

  it('POS cart preview: same contract', () => {
    const tax = previewPosCartTax(
      [{ productId: PID, subtotal: SHELF, isTaxable: false, taxRate: 18, quantity: 1 }],
      {
        productMappings: new Map([[PID, [VAT18]]]),
        taxCatalog: [VAT18],
        taxInclusive: false,
      },
    );
    expect(tax).toBe(0);
  });

  it('isTaxable true + same mapping → tax > 0 (control)', () => {
    const r = resolvePreviewLineTaxes(
      { productId: PID, lineNetAmount: SHELF, isTaxable: true, taxRate: 10 },
      {
        productMappings: new Map([[PID, [VAT18]]]),
        taxCatalog: [VAT18],
        applyTenantDefaultWhenUnresolved: false,
      },
    );
    expect(r.determination).toBe('MAPPING');
    expect(r.taxes[0].rate).toBe(18);
  });
});

describe('EVIDENCE — DocumentTaxService + createSale chain (mocked DB)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSettings.mockResolvedValue({
      taxEnabled: true,
      taxInclusive: false,
      defaultTaxRate: 18,
      vatOutputRequiresRegisteredCustomer: false,
    });
    mockIsExempt.mockResolvedValue(false);
    mockLoadCustomerProfile.mockResolvedValue(null);
    mockLoadDefs.mockResolvedValue([VAT18]);
  });

  it('e2e: DB is_taxable false + mapping + client says taxable → server tax 0', async () => {
    mockLoadMappings.mockResolvedValue(new Map([[PID, [VAT18]]]));
    mockLoadBridge.mockResolvedValue(
      new Map([[PID, { id: PID, isTaxable: false, taxRate: 18 }]]),
    );
    const taxDoc = await DocumentTaxService.computeForLines(fakeConn, {
      scope: 'SALE',
      applyTenantDefaultWhenUnresolved: false,
      lines: [
        {
          lineIndex: 0,
          productId: PID,
          lineNetAmount: SHELF,
          quantity: 1,
          isTaxable: true,
          taxRate: 18,
        },
      ],
    });
    expect(taxDoc.lineResults[0].determination).toBe('NONE');
    expect(taxDoc.documentTotals.totalTax).toBe(0);

    // createSale header charge under exclusive: lines only (no tax add)
    const pricedLines = new Decimal(SHELF);
    const taxAmount = new Decimal(taxDoc.documentTotals.totalTax);
    const header = resolveSaleHeaderTotal({
      providedTotal: SHELF,
      pricedLinesAfterDiscount: pricedLines,
      taxAmount,
      taxInclusive: false,
    });
    expect(header.finalTotal.toNumber()).toBe(SHELF);
  });

  it('e2e inclusive price mode: unticked still tax 0, charge = shelf', async () => {
    mockGetSettings.mockResolvedValue({
      taxEnabled: true,
      taxInclusive: true,
      defaultTaxRate: 18,
      vatOutputRequiresRegisteredCustomer: false,
    });
    mockLoadMappings.mockResolvedValue(new Map([[PID, [VAT18]]]));
    mockLoadBridge.mockResolvedValue(
      new Map([[PID, { id: PID, isTaxable: false, taxRate: 18 }]]),
    );
    const taxDoc = await DocumentTaxService.computeForLines(fakeConn, {
      applyTenantDefaultWhenUnresolved: false,
      lines: [{ lineIndex: 0, productId: PID, lineNetAmount: SHELF, quantity: 1 }],
    });
    expect(taxDoc.taxInclusive).toBe(true);
    expect(taxDoc.documentTotals.totalTax).toBe(0);
    expect(saleChargeTotal(SHELF, taxDoc.documentTotals.totalTax, true)).toBe(SHELF);
  });

  it('e2e control: DB is_taxable true → mapping taxes again', async () => {
    mockLoadMappings.mockResolvedValue(new Map([[PID, [VAT18]]]));
    mockLoadBridge.mockResolvedValue(
      new Map([[PID, { id: PID, isTaxable: true, taxRate: 10 }]]),
    );
    const taxDoc = await DocumentTaxService.computeForLines(fakeConn, {
      applyTenantDefaultWhenUnresolved: false,
      lines: [{ lineIndex: 0, productId: PID, lineNetAmount: SHELF, quantity: 1 }],
    });
    expect(taxDoc.lineResults[0].determination).toBe('MAPPING');
    expect(taxDoc.documentTotals.totalTax).toBe(756);
  });
});
