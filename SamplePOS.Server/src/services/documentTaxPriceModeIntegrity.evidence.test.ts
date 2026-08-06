/**
 * EVIDENCE — DocumentTax price-mode integrity (enterprise contract)
 *
 * Locks the determination + arithmetic contract that eliminates inclusive/exclusive
 * inconsistency (regression: SALE-2026-0179 — Abchlor, mapping+bridge set, tax_inclusive,
 * line stamped DISABLED / tax_amount=0).
 *
 * Contract:
 *   - Exclusive  → add % VAT; charge = net + tax; determination MAPPING|BRIDGE|…
 *   - Inclusive  → extract % VAT from shelf; charge = shelf; still MAPPING|BRIDGE (never DISABLED)
 *   - DISABLED   → restaurant path only (applyTenantDefault + taxEnabled=false)
 *   - Mapping    → wins over product bridge rate
 *   - createSale → server stamps tax; inclusive does not double-add to total
 *
 * Run:
 *   npm test -- --runInBand src/services/documentTaxPriceModeIntegrity.evidence.test.ts
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Decimal from 'decimal.js';
import {
  previewDocumentTax,
  taxesForPriceMode,
  type TaxDefinitionLike,
} from '../../../shared/utils/documentTaxPreview.js';
import { computeTaxes } from '../../../shared/utils/taxCompute.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = path.resolve(serverRoot, '..');

function readServer(rel: string): string {
  return readFileSync(path.join(serverRoot, rel), 'utf8');
}
function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

const VAT18: TaxDefinitionLike = {
  id: 'vat-18-def',
  code: 'VAT18',
  name: 'VAT 18%',
  type: 'PERCENTAGE',
  rate: 18,
  isInclusive: false,
  isCompound: false,
  sequence: 10,
  scope: 'BOTH',
  isActive: true,
  taxPayableAccountCode: '2300',
};

const PID_ABCHLOR = '0ab7c565-ed01-41d4-a173-5536cb382a8a';

/** Shelf price P, rate r% inclusive → tax extracted (enterprise half-up money). */
function extractedVat(shelf: number, ratePct: number): number {
  const rate = new Decimal(ratePct).div(100);
  const base = new Decimal(shelf).div(rate.plus(1)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return new Decimal(shelf).minus(base).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

// ── Structural SSOT (cannot regress to “inclusive = no tax”) ─────────────────

describe('EVIDENCE — price-mode structural SSOT', () => {
  it('shared SSOT exports taxesForPriceMode and documents extract semantics', () => {
    const src = readRepo('shared/utils/documentTaxPreview.ts');
    expect(src).toMatch(/export function taxesForPriceMode/);
    expect(src).toMatch(/extracts? VAT|extract VAT/i);
    expect(src).toMatch(/tax_inclusive no longer zeroes|never block retail|price mode/i);
  });

  it('taxesForPriceMode marks percentage taxes inclusive under inclusive mode', () => {
    const out = taxesForPriceMode([VAT18], true);
    expect(out[0].isInclusive).toBe(true);
    expect(out[0].rate).toBe(18);
    const exclusive = taxesForPriceMode([VAT18], false);
    expect(exclusive[0].isInclusive).toBe(false);
  });

  it('server DocumentTaxService routes inclusive through taxesForPriceMode (not DISABLED)', () => {
    const src = readServer('src/services/documentTaxService.ts');
    expect(src).toMatch(/taxesForPriceMode/);
    expect(src).toMatch(/taxInclusive extracts VAT|does not add exclusive/i);
    // Restaurant gate: DISABLED only with !taxEnabled under applyTenantDefault
    expect(src).toMatch(/applyTenantDefault && !taxEnabled/);
    // Must not re-introduce “inclusive alone disables tax”
    expect(src).not.toMatch(/if\s*\(\s*taxInclusive\s*\)[\s\S]{0,80}DISABLED/);
    expect(src).not.toMatch(/taxInclusive[\s\S]{0,40}determination:\s*['"]DISABLED['"]/);
  });

  it('createSale does not add extracted tax onto total when inclusive', () => {
    const src = readServer('src/modules/sales/salesService.ts');
    // Header charge SSOT: resolveSaleHeaderTotal — inclusive keeps shelf (never + extracted VAT)
    expect(src).toMatch(/resolveSaleHeaderTotal\s*\(/);
    expect(src).toMatch(/taxInclusive:\s*taxDoc\.taxInclusive\s*===\s*true/);
    expect(src).toMatch(/DocumentTaxService\.computeForLines/);
    expect(src).toMatch(/taxDetermination/);
    expect(src).not.toMatch(/taxAddedToTotal\s*=\s*taxAmount/);
  });

  it('Money.toNumber preserves explicit 2dp tax rounding (UGX no silent wipe)', () => {
    // Structural seal: historical bug Money.toNumber → Money.round(UGX 0dp)
    const money = readServer('src/utils/money.ts');
    expect(money).toMatch(/Does \*\*not\*\* apply currency rounding|does not apply currency rounding/i);
    expect(money).toMatch(/static toNumber[\s\S]{0,200}Money\.parse\(value\)\.toNumber\(\)/);
    expect(money).not.toMatch(
      /static toNumber[\s\S]{0,120}return Money\.round\(value\)\.toNumber\(\)/,
    );
  });
});

// ── Pure determination + arithmetic matrix ───────────────────────────────────

describe('EVIDENCE — price-mode determination matrix (pure SSOT)', () => {
  it('exclusive bridge: adds 18% on net', () => {
    const r = previewDocumentTax(
      [{ lineNetAmount: 100_000, isTaxable: true, taxRate: 18 }],
      { taxInclusive: false, applyTenantDefaultWhenUnresolved: false },
    );
    expect(r.lineResults[0].determination).toBe('BRIDGE');
    expect(r.totalTax).toBe(18_000);
    expect(r.totalAmount).toBe(118_000);
  });

  it('exclusive mapping wins over bridge rate', () => {
    const maps = new Map<string, TaxDefinitionLike[]>([[PID_ABCHLOR, [VAT18]]]);
    const r = previewDocumentTax(
      [
        {
          productId: PID_ABCHLOR,
          lineNetAmount: 100_000,
          isTaxable: true,
          taxRate: 10, // would be wrong if bridge won
        },
      ],
      {
        taxInclusive: false,
        productMappings: maps,
        taxCatalog: [VAT18],
        applyTenantDefaultWhenUnresolved: false,
      },
    );
    expect(r.lineResults[0].determination).toBe('MAPPING');
    expect(r.totalTax).toBe(18_000);
    expect(r.totalAmount).toBe(118_000);
  });

  it('inclusive bridge: extracts VAT, charge stays shelf, never DISABLED', () => {
    const shelf = 100_000;
    const r = previewDocumentTax(
      [{ lineNetAmount: shelf, isTaxable: true, taxRate: 18 }],
      { taxInclusive: true, applyTenantDefaultWhenUnresolved: false },
    );
    expect(r.lineResults[0].determination).toBe('BRIDGE');
    expect(r.lineResults[0].determination).not.toBe('DISABLED');
    expect(r.totalTax).toBe(extractedVat(shelf, 18));
    expect(r.totalAmount).toBe(shelf);
    expect(r.lineResults[0].taxes[0]?.isInclusive).toBe(true);
  });

  it('inclusive mapping: same extract contract, MAPPING determination', () => {
    const shelf = 4_200; // SALE-2026-0179 Abchlor unit
    const maps = new Map<string, TaxDefinitionLike[]>([[PID_ABCHLOR, [VAT18]]]);
    const r = previewDocumentTax(
      [
        {
          productId: PID_ABCHLOR,
          lineNetAmount: shelf,
          isTaxable: true,
          taxRate: 18,
        },
      ],
      {
        taxInclusive: true,
        productMappings: maps,
        taxCatalog: [VAT18],
        applyTenantDefaultWhenUnresolved: false,
        vatOutputRequiresRegisteredCustomer: false,
      },
    );
    expect(r.lineResults[0].determination).toBe('MAPPING');
    expect(r.totalTax).toBe(extractedVat(shelf, 18));
    expect(r.totalTax).toBe(640.68);
    expect(r.totalAmount).toBe(4_200);
  });

  it('SALE-2026-0179 fixture: pre-fix bug was DISABLED@0; contract forbids that under inclusive', () => {
    // Stored bug snapshot: tax_determination=DISABLED, tax_amount=0 while product mapped+taxable
    // Correct recompute with same commercial facts:
    const maps = new Map([[PID_ABCHLOR, [VAT18]]]);
    const r = previewDocumentTax(
      [{ productId: PID_ABCHLOR, lineNetAmount: 4_200, isTaxable: true, taxRate: 18 }],
      {
        taxInclusive: true,
        productMappings: maps,
        applyTenantDefaultWhenUnresolved: false,
      },
    );
    expect(r.lineResults[0].determination).not.toBe('DISABLED');
    expect(r.totalTax).toBeGreaterThan(0);
    expect(r.totalAmount).toBe(4_200);
  });

  it('DISABLED only when restaurant master off (tenant-default path)', () => {
    const r = previewDocumentTax(
      [{ lineNetAmount: 4_200, isTaxable: true, taxRate: 18 }],
      {
        taxInclusive: true,
        taxEnabled: false,
        applyTenantDefaultWhenUnresolved: true,
      },
    );
    expect(r.lineResults[0].determination).toBe('DISABLED');
    expect(r.totalTax).toBe(0);
  });

  it('retail path: taxEnabled false does NOT disable product tax (inclusive extract still works)', () => {
    const r = previewDocumentTax(
      [{ lineNetAmount: 4_200, isTaxable: true, taxRate: 18 }],
      {
        taxInclusive: true,
        taxEnabled: false,
        applyTenantDefaultWhenUnresolved: false,
      },
    );
    expect(r.lineResults[0].determination).toBe('BRIDGE');
    expect(r.totalTax).toBe(640.68);
  });

  it('policy ON + walk-in: zero tax even if product mapped', () => {
    const maps = new Map([[PID_ABCHLOR, [VAT18]]]);
    const r = previewDocumentTax(
      [{ productId: PID_ABCHLOR, lineNetAmount: 4_200, isTaxable: true, taxRate: 18 }],
      {
        taxInclusive: false,
        productMappings: maps,
        vatOutputRequiresRegisteredCustomer: true,
        customerProfile: null,
      },
    );
    expect(r.totalTax).toBe(0);
    expect(['NONE', 'EXEMPT']).toContain(r.lineResults[0].determination);
  });

  it('taxCompute extract parity with exclusive add for exact 118k shelf', () => {
    const exclusive = computeTaxes(100_000, [VAT18], 1, true);
    const inclusiveDefs = taxesForPriceMode([VAT18], true) as typeof VAT18[];
    const inclusive = computeTaxes(118_000, inclusiveDefs, 1, true);
    expect(exclusive.totalTax).toBe(18_000);
    expect(inclusive.totalTax).toBe(18_000);
    expect(inclusive.totalAmount).toBe(118_000);
  });
});

// ── Server authority (mocked loaders) — inclusive + mapping ──────────────────

const mockGetSettings = jest.fn();
const mockIsExempt = jest.fn();
const mockLoadDefs = jest.fn();
const mockLoadMappings = jest.fn();
const mockLoadBridge = jest.fn();
const mockLoadCustomerProfile = jest.fn();

jest.unstable_mockModule('../modules/system-settings/systemSettingsRepository.js', () => ({
  systemSettingsRepository: { getSettings: (...args: unknown[]) => mockGetSettings(...args) },
}));

jest.unstable_mockModule('./documentTaxRepository.js', () => ({
  isCustomerTaxExempt: (...args: unknown[]) => mockIsExempt(...args),
  loadActiveTaxDefinitions: (...args: unknown[]) => mockLoadDefs(...args),
  loadProductTaxMappings: (...args: unknown[]) => mockLoadMappings(...args),
  loadProductTaxBridge: (...args: unknown[]) => mockLoadBridge(...args),
  loadCustomerTaxProfile: (...args: unknown[]) => mockLoadCustomerProfile(...args),
}));

const { DocumentTaxService } = await import('./documentTaxService.js');

const PID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('EVIDENCE — server price-mode authority (mocked DocumentTaxService)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsExempt.mockResolvedValue(false);
    mockLoadCustomerProfile.mockResolvedValue(null);
    mockLoadDefs.mockResolvedValue([VAT18]);
    mockLoadMappings.mockResolvedValue(new Map());
    mockLoadBridge.mockResolvedValue(new Map());
  });

  it('inclusive + mapping + walk-in: MAPPING, tax extracted, total = shelf', async () => {
    mockGetSettings.mockResolvedValue({
      taxEnabled: true,
      taxInclusive: true,
      defaultTaxRate: 18,
      vatOutputRequiresRegisteredCustomer: false,
    });
    mockLoadMappings.mockResolvedValue(new Map([[PID_A, [VAT18]]]));
    mockLoadBridge.mockResolvedValue(
      new Map([[PID_A, { id: PID_A, isTaxable: true, taxRate: 18 }]]),
    );

    const shelf = 4_200;
    const result = await DocumentTaxService.computeForLines({} as never, {
      applyTenantDefaultWhenUnresolved: false,
      lines: [
        {
          lineIndex: 0,
          productId: PID_A,
          lineNetAmount: shelf,
          quantity: 1,
          isTaxable: false,
          taxRate: 0, // client understatement
        },
      ],
    });

    expect(result.taxInclusive).toBe(true);
    expect(result.lineResults[0].determination).toBe('MAPPING');
    expect(result.lineResults[0].determination).not.toBe('DISABLED');
    expect(result.documentTotals.totalTax).toBe(640.68);
    expect(result.documentTotals.totalAmount).toBe(4_200);
  });

  it('priceDocumentLines inclusive: totalAmount equals sum of shelf nets', async () => {
    mockGetSettings.mockResolvedValue({
      taxEnabled: true,
      taxInclusive: true,
      defaultTaxRate: 18,
      vatOutputRequiresRegisteredCustomer: false,
    });
    mockLoadBridge.mockResolvedValue(
      new Map([[PID_A, { id: PID_A, isTaxable: true, taxRate: 18 }]]),
    );

    const priced = await DocumentTaxService.priceDocumentLines({} as never, {
      applyTenantDefaultWhenUnresolved: false,
      lines: [
        {
          productId: PID_A,
          quantity: 1,
          unitPrice: 4_200,
          lineNetAmount: 4_200,
        },
      ],
    });

    expect(priced.taxAmount).toBe(640.68);
    expect(priced.totalAmount).toBe(4_200);
    expect(priced.lines[0].lineTotal).toBe(4_200);
    expect(priced.lines[0].determination).toBe('BRIDGE');
  });

  it('exclusive still adds VAT and increases total', async () => {
    mockGetSettings.mockResolvedValue({
      taxEnabled: true,
      taxInclusive: false,
      defaultTaxRate: 18,
      vatOutputRequiresRegisteredCustomer: false,
    });
    mockLoadBridge.mockResolvedValue(
      new Map([[PID_A, { id: PID_A, isTaxable: true, taxRate: 18 }]]),
    );

    const result = await DocumentTaxService.computeForLines({} as never, {
      applyTenantDefaultWhenUnresolved: false,
      lines: [
        {
          lineIndex: 0,
          productId: PID_A,
          lineNetAmount: 4_200,
          quantity: 1,
        },
      ],
    });

    expect(result.taxInclusive).toBe(false);
    expect(result.documentTotals.totalTax).toBe(756); // 4200 * 0.18
    expect(result.documentTotals.totalAmount).toBe(4_956);
  });
});
