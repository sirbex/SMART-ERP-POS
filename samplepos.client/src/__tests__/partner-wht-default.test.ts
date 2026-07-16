/**
 * Unit proof: partner WHT default resolution for payment screens.
 */
import { describe, it, expect } from 'vitest';
import { resolvePartnerWhtDefault } from '../../../shared/wht/partnerWhtDefault';

const types = [
  { id: 't-sup', appliesTo: 'SUPPLIER', isActive: true },
  { id: 't-cust', appliesTo: 'CUSTOMER', isActive: true },
  { id: 't-both', appliesTo: 'BOTH', isActive: true },
  { id: 't-dead', appliesTo: 'SUPPLIER', isActive: false },
];

describe('resolvePartnerWhtDefault', () => {
  it('returns no WHT when partner is not liable', () => {
    const r = resolvePartnerWhtDefault(
      { whtLiable: false, defaultWhtTypeId: 't-sup' },
      types,
      'SUPPLIER',
    );
    expect(r.liable).toBe(false);
    expect(r.whtTypeId).toBeUndefined();
    expect(r.hint).toBeNull();
  });

  it('auto-selects default type when liable and type matches side', () => {
    const r = resolvePartnerWhtDefault(
      { whtLiable: true, defaultWhtTypeId: 't-sup' },
      types,
      'SUPPLIER',
    );
    expect(r.liable).toBe(true);
    expect(r.whtTypeId).toBe('t-sup');
    expect(r.hint).toMatch(/partner master/i);
  });

  it('accepts BOTH types for either side', () => {
    const r = resolvePartnerWhtDefault(
      { whtLiable: true, defaultWhtTypeId: 't-both' },
      types,
      'CUSTOMER',
    );
    expect(r.whtTypeId).toBe('t-both');
  });

  it('hints when liable but default missing or wrong side', () => {
    const missing = resolvePartnerWhtDefault({ whtLiable: true }, types, 'SUPPLIER');
    expect(missing.whtTypeId).toBeUndefined();
    expect(missing.hint).toMatch(/marked for withholding/i);

    const wrong = resolvePartnerWhtDefault(
      { whtLiable: true, defaultWhtTypeId: 't-cust' },
      types,
      'SUPPLIER',
    );
    expect(wrong.whtTypeId).toBeUndefined();
  });
});
