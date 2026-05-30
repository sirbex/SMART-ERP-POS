import { describe, expect, it } from '@jest/globals';
import {
  CustomerOpeningBalanceCancelSchema,
  CustomerOpeningBalanceReplaceSchema,
  CustomerOpeningBalanceSchema,
} from '@shared/zod/customerOpeningBalance';
import {
  SupplierOpeningBalanceCancelSchema,
  SupplierOpeningBalanceReplaceSchema,
  SupplierOpeningBalanceSchema,
} from '@shared/zod/supplierOpeningBalance';

const validCustomerOb = {
  customerId: '11111111-1111-1111-1111-111111111111',
  amount: 1000,
  asOfDate: '2026-01-15',
  postReason: 'Legacy AR cutover from prior ERP',
};

const validSupplierOb = {
  supplierId: '22222222-2222-2222-2222-222222222222',
  amount: 500,
  asOfDate: '2026-01-15',
  postReason: 'Legacy AP cutover from prior ERP',
};

describe('Customer opening balance Zod schemas', () => {
  it('accepts valid import body', () => {
    const r = CustomerOpeningBalanceSchema.parse(validCustomerOb);
    expect(r.amount).toBe(1000);
  });

  it('accepts amount as numeric string', () => {
    const r = CustomerOpeningBalanceSchema.parse({
      ...validCustomerOb,
      amount: '2500.5',
    });
    expect(r.amount).toBe(2500.5);
  });

  it('rejects NaN and non-numeric amount strings', () => {
    expect(() =>
      CustomerOpeningBalanceSchema.parse({
        ...validCustomerOb,
        amount: 'not-a-number',
      }),
    ).toThrow();

    expect(() =>
      CustomerOpeningBalanceSchema.parse({
        ...validCustomerOb,
        amount: Number.NaN,
      }),
    ).toThrow();
  });

  it('import requires postReason length >= 5', () => {
    expect(() =>
      CustomerOpeningBalanceSchema.parse({
        ...validCustomerOb,
        postReason: 'ab',
      }),
    ).toThrow();
  });

  it('replace requires replaceReason length >= 5 (postReason not required)', () => {
    expect(() =>
      CustomerOpeningBalanceReplaceSchema.parse({
        customerId: validCustomerOb.customerId,
        amount: 1000,
        asOfDate: '2026-01-15',
        replaceReason: 'ab',
      }),
    ).toThrow();

    const ok = CustomerOpeningBalanceReplaceSchema.parse({
      customerId: validCustomerOb.customerId,
      amount: 1000,
      asOfDate: '2026-01-15',
      replaceReason: 'Wrong legacy figure',
    });
    expect(ok.replaceReason).toBe('Wrong legacy figure');
  });

  it('cancel requires invoiceId and reason', () => {
    expect(() =>
      CustomerOpeningBalanceCancelSchema.parse({
        invoiceId: 'not-a-uuid',
        reason: 'x'.repeat(5),
      }),
    ).toThrow();

    const ok = CustomerOpeningBalanceCancelSchema.parse({
      invoiceId: '33333333-3333-3333-3333-333333333333',
      reason: 'Duplicate OB posted',
    });
    expect(ok.invoiceId).toBe('33333333-3333-3333-3333-333333333333');
  });
});

describe('Supplier opening balance Zod schemas', () => {
  it('accepts valid import body', () => {
    const r = SupplierOpeningBalanceSchema.parse(validSupplierOb);
    expect(r.amount).toBe(500);
  });

  it('replace requires replaceReason length >= 5 (postReason not required)', () => {
    expect(() =>
      SupplierOpeningBalanceReplaceSchema.parse({
        supplierId: validSupplierOb.supplierId,
        amount: 500,
        asOfDate: '2026-01-15',
        replaceReason: 'no',
      }),
    ).toThrow();

    const ok = SupplierOpeningBalanceReplaceSchema.parse({
      supplierId: validSupplierOb.supplierId,
      amount: 500,
      asOfDate: '2026-01-15',
      replaceReason: 'Corrected migration total',
    });
    expect(ok.replaceReason).toBe('Corrected migration total');
  });

  it('rejects NaN amount on supplier replace', () => {
    expect(() =>
      SupplierOpeningBalanceReplaceSchema.parse({
        supplierId: validSupplierOb.supplierId,
        amount: Number.NaN,
        asOfDate: '2026-01-15',
        replaceReason: 'Corrected amount',
      }),
    ).toThrow();
  });

  it('cancel validates uuid and reason', () => {
    const ok = SupplierOpeningBalanceCancelSchema.parse({
      invoiceId: '44444444-4444-4444-4444-444444444444',
      reason: 'Void wrong OB',
    });
    expect(ok.reason).toBe('Void wrong OB');
  });
});
