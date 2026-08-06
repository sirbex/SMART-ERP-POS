/**
 * DocumentTaxService determination + TaxEngine.compute integration (unit).
 * DB is mocked — no live PostgreSQL required.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { TaxEngine } from './taxEngine.js';

const mockGetSettings = jest.fn();
const mockIsExempt = jest.fn();
const mockLoadDefs = jest.fn();
const mockLoadMappings = jest.fn();
const mockLoadBridge = jest.fn();

jest.unstable_mockModule('../modules/system-settings/systemSettingsRepository.js', () => ({
  systemSettingsRepository: { getSettings: (...args: unknown[]) => mockGetSettings(...args) },
}));

const mockLoadCustomerProfile = jest.fn();

jest.unstable_mockModule('./documentTaxRepository.js', () => ({
  isCustomerTaxExempt: (...args: unknown[]) => mockIsExempt(...args),
  loadActiveTaxDefinitions: (...args: unknown[]) => mockLoadDefs(...args),
  loadProductTaxMappings: (...args: unknown[]) => mockLoadMappings(...args),
  loadProductTaxBridge: (...args: unknown[]) => mockLoadBridge(...args),
  loadCustomerTaxProfile: (...args: unknown[]) => mockLoadCustomerProfile(...args),
}));

const { DocumentTaxService, resolveAuthoritativeTaxAmount } = await import(
  './documentTaxService.js'
);

const VAT18 = {
  id: 'vat18-id',
  code: 'VAT18',
  name: 'VAT 18%',
  type: 'PERCENTAGE' as const,
  rate: 18,
  isInclusive: false,
  isCompound: false,
  sequence: 10,
  scope: 'BOTH' as const,
  taxPayableAccountCode: '2300',
  taxReceivableAccountCode: '2300',
  isActive: true,
};

const fakeConn = {} as never;

describe('TaxEngine.compute (pure arithmetic SSOT)', () => {
  it('computes exclusive percentage VAT', () => {
    const r = TaxEngine.compute(100_000, [VAT18], 1, true);
    expect(r.totalTax).toBe(18_000);
    expect(r.totalAmount).toBe(118_000);
    expect(r.untaxedAmount).toBe(100_000);
  });

  it('returns zero tax when no definitions', () => {
    const r = TaxEngine.compute(100_000, [], 1, true);
    expect(r.totalTax).toBe(0);
    expect(r.totalAmount).toBe(100_000);
  });
});

describe('DocumentTaxService determination hierarchy', () => {
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
    mockLoadMappings.mockResolvedValue(new Map());
    mockLoadBridge.mockResolvedValue(new Map());
  });

  it('EXEMPT customer → no tax on all lines', async () => {
    mockIsExempt.mockResolvedValue(true);
    const result = await DocumentTaxService.computeForLines(fakeConn, {
      customerId: 'cust-1',
      applyTenantDefaultWhenUnresolved: false,
      lines: [
        {
          lineIndex: 0,
          productId: '11111111-1111-1111-1111-111111111111',
          lineNetAmount: 100_000,
          quantity: 1,
        },
      ],
    });
    expect(result.customerExempt).toBe(true);
    expect(result.documentTotals.totalTax).toBe(0);
    expect(result.lineResults[0].determination).toBe('EXEMPT');
  });

  it('RETAIL: product VAT unticked (is_taxable false) → tax 0 even with mapping + client tax stamp', async () => {
    const pid = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    // Enterprise mapping still present; DB product liability off
    mockLoadMappings.mockResolvedValue(new Map([[pid, [VAT18]]]));
    mockLoadBridge.mockResolvedValue(
      new Map([[pid, { id: pid, isTaxable: false, taxRate: 18 }]]),
    );
    const result = await DocumentTaxService.computeForLines(fakeConn, {
      applyTenantDefaultWhenUnresolved: false, // createSale / retail POS
      lines: [
        {
          lineIndex: 0,
          productId: pid,
          lineNetAmount: 4_200,
          quantity: 1,
          // Client cart may still send stale preview stamps
          isTaxable: true,
          taxRate: 18,
        },
      ],
    });
    expect(result.lineResults[0].determination).toBe('NONE');
    expect(result.documentTotals.totalTax).toBe(0);
    expect(result.lineResults[0].taxes).toHaveLength(0);
  });

  it('RETAIL: product VAT ticked + rate → BRIDGE tax', async () => {
    const pid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    mockLoadBridge.mockResolvedValue(
      new Map([[pid, { id: pid, isTaxable: true, taxRate: 18 }]]),
    );
    const result = await DocumentTaxService.computeForLines(fakeConn, {
      applyTenantDefaultWhenUnresolved: false,
      lines: [{ lineIndex: 0, productId: pid, lineNetAmount: 4_200, quantity: 1 }],
    });
    expect(result.lineResults[0].determination).toBe('BRIDGE');
    expect(result.documentTotals.totalTax).toBe(756);
  });

  it('MAPPING wins over product bridge', async () => {
    const pid = '11111111-1111-1111-1111-111111111111';
    mockLoadMappings.mockResolvedValue(new Map([[pid, [VAT18]]]));
    mockLoadBridge.mockResolvedValue(
      new Map([[pid, { id: pid, isTaxable: true, taxRate: 10 }]]),
    );
    const result = await DocumentTaxService.computeForLines(fakeConn, {
      applyTenantDefaultWhenUnresolved: false,
      lines: [{ lineIndex: 0, productId: pid, lineNetAmount: 100_000, quantity: 1 }],
    });
    expect(result.lineResults[0].determination).toBe('MAPPING');
    expect(result.documentTotals.totalTax).toBe(18_000);
  });

  it('BRIDGE uses is_taxable + tax_rate without requiring taxEnabled', async () => {
    mockGetSettings.mockResolvedValue({
      taxEnabled: false,
      taxInclusive: false,
      defaultTaxRate: 18,
    });
    const pid = '11111111-1111-1111-1111-111111111111';
    mockLoadBridge.mockResolvedValue(
      new Map([[pid, { id: pid, isTaxable: true, taxRate: 18 }]]),
    );
    const result = await DocumentTaxService.computeForLines(fakeConn, {
      applyTenantDefaultWhenUnresolved: false,
      lines: [{ lineIndex: 0, productId: pid, lineNetAmount: 100_000, quantity: 1 }],
    });
    expect(result.lineResults[0].determination).toBe('BRIDGE');
    expect(result.documentTotals.totalTax).toBe(18_000);
  });

  it('POS unresolved (no mapping/bridge) → NONE, not all active taxes', async () => {
    const pid = '11111111-1111-1111-1111-111111111111';
    mockLoadBridge.mockResolvedValue(
      new Map([[pid, { id: pid, isTaxable: false, taxRate: 0 }]]),
    );
    const result = await DocumentTaxService.computeForLines(fakeConn, {
      applyTenantDefaultWhenUnresolved: false,
      lines: [{ lineIndex: 0, productId: pid, lineNetAmount: 100_000, quantity: 1 }],
    });
    expect(result.lineResults[0].determination).toBe('NONE');
    expect(result.documentTotals.totalTax).toBe(0);
  });

  it('Restaurant tenant default when liability unresolved (not is_taxable=false)', async () => {
    const pid = '11111111-1111-1111-1111-111111111111';
    // No product bridge (or product missing) → isTaxable unset → tenant default for FOH
    mockLoadBridge.mockResolvedValue(new Map());
    const result = await DocumentTaxService.computeForLines(fakeConn, {
      applyTenantDefaultWhenUnresolved: true,
      lines: [{ lineIndex: 0, productId: pid, lineNetAmount: 100_000, quantity: 1 }],
    });
    expect(result.lineResults[0].determination).toBe('TENANT_DEFAULT');
    expect(result.documentTotals.totalTax).toBe(18_000);
  });

  it('Restaurant settle: product is_taxable=false → tax 0 (not tenant default)', async () => {
    const pid = '6fec0d12-4349-4a43-a5c0-48e449d36356';
    mockLoadBridge.mockResolvedValue(
      new Map([[pid, { id: pid, isTaxable: false, taxRate: 0 }]]),
    );
    const result = await DocumentTaxService.computeForLines(fakeConn, {
      applyTenantDefaultWhenUnresolved: true,
      lines: [
        {
          lineIndex: 0,
          productId: pid,
          lineNetAmount: 6_000,
          quantity: 1,
        },
      ],
    });
    expect(result.lineResults[0].determination).toBe('NONE');
    expect(result.documentTotals.totalTax).toBe(0);
  });

  it('Restaurant DISABLED when taxEnabled false', async () => {
    mockGetSettings.mockResolvedValue({
      taxEnabled: false,
      taxInclusive: false,
      defaultTaxRate: 18,
    });
    const result = await DocumentTaxService.computeForLines(fakeConn, {
      applyTenantDefaultWhenUnresolved: true,
      lines: [
        {
          lineIndex: 0,
          productId: '11111111-1111-1111-1111-111111111111',
          lineNetAmount: 100_000,
          quantity: 1,
        },
      ],
    });
    expect(result.lineResults[0].determination).toBe('DISABLED');
    expect(result.documentTotals.totalTax).toBe(0);
  });

  it('custom line override bridge', async () => {
    const result = await DocumentTaxService.computeForLines(fakeConn, {
      applyTenantDefaultWhenUnresolved: false,
      lines: [
        {
          lineIndex: 0,
          productId: 'custom_svc_1',
          lineNetAmount: 50_000,
          quantity: 1,
          isTaxable: true,
          taxRate: 18,
        },
      ],
    });
    expect(result.lineResults[0].determination).toBe('BRIDGE');
    expect(result.documentTotals.totalTax).toBe(9_000);
  });

  it('preferLineTaxOverrides: line rate wins over product bridge', async () => {
    const pid = '11111111-1111-1111-1111-111111111111';
    mockLoadBridge.mockResolvedValue(
      new Map([[pid, { id: pid, isTaxable: true, taxRate: 10 }]]),
    );
    const result = await DocumentTaxService.computeForLines(fakeConn, {
      preferLineTaxOverrides: true,
      applyTenantDefaultWhenUnresolved: false,
      lines: [
        {
          lineIndex: 0,
          productId: pid,
          lineNetAmount: 100_000,
          quantity: 1,
          isTaxable: true,
          taxRate: 18,
        },
      ],
    });
    expect(result.lineResults[0].determination).toBe('BRIDGE');
    expect(result.documentTotals.totalTax).toBe(18_000);
  });

  it('preferLineTaxOverrides: explicit non-taxable → NONE', async () => {
    const pid = '11111111-1111-1111-1111-111111111111';
    mockLoadBridge.mockResolvedValue(
      new Map([[pid, { id: pid, isTaxable: true, taxRate: 18 }]]),
    );
    const result = await DocumentTaxService.computeForLines(fakeConn, {
      preferLineTaxOverrides: true,
      applyTenantDefaultWhenUnresolved: false,
      lines: [
        {
          lineIndex: 0,
          productId: pid,
          lineNetAmount: 100_000,
          quantity: 1,
          isTaxable: false,
          taxRate: 18,
        },
      ],
    });
    expect(result.lineResults[0].determination).toBe('NONE');
    expect(result.documentTotals.totalTax).toBe(0);
  });

  it('priceDocumentLines aggregates subtotal + tax', async () => {
    const pid = '11111111-1111-1111-1111-111111111111';
    mockLoadBridge.mockResolvedValue(
      new Map([[pid, { id: pid, isTaxable: true, taxRate: 18 }]]),
    );
    const priced = await DocumentTaxService.priceDocumentLines(fakeConn, {
      preferLineTaxOverrides: false,
      lines: [{ productId: pid, quantity: 2, unitPrice: 50_000, discountAmount: 0 }],
    });
    expect(priced.subtotal).toBe(100_000);
    expect(priced.taxAmount).toBe(18_000);
    expect(priced.totalAmount).toBe(118_000);
    expect(priced.lines[0].taxAmount).toBe(18_000);
  });
});

describe('resolveAuthoritativeTaxAmount', () => {
  it('prefers server when client drifts', () => {
    const amt = resolveAuthoritativeTaxAmount(18000, 17000, { saleHint: 'test' });
    expect(amt.toNumber()).toBe(18000);
  });
});
