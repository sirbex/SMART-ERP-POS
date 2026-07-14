import { describe, expect, it } from '@jest/globals';
import {
  assertWhtAppliesTo,
  defaultWhtAccountForSide,
  resolveWhtGlAccountCode,
} from './whtService.js';

describe('assertWhtAppliesTo', () => {
  it('allows BOTH for either side', () => {
    expect(() => assertWhtAppliesTo('SUPPLIER', 'BOTH')).not.toThrow();
    expect(() => assertWhtAppliesTo('CUSTOMER', 'BOTH')).not.toThrow();
  });

  it('allows matching side', () => {
    expect(() => assertWhtAppliesTo('SUPPLIER', 'SUPPLIER', 'WHT-S')).not.toThrow();
    expect(() => assertWhtAppliesTo('CUSTOMER', 'CUSTOMER', 'WHT-C')).not.toThrow();
  });

  it('rejects wrong-side type', () => {
    expect(() => assertWhtAppliesTo('CUSTOMER', 'SUPPLIER', 'WHT-S')).toThrow(
      /applies to SUPPLIER, not CUSTOMER/,
    );
    expect(() => assertWhtAppliesTo('SUPPLIER', 'CUSTOMER', 'WHT-C')).toThrow(/not SUPPLIER/);
  });
});

describe('resolveWhtGlAccountCode', () => {
  it('defaults by side when account_code empty', () => {
    expect(resolveWhtGlAccountCode('CUSTOMER', { appliesTo: 'CUSTOMER', accountCode: '' })).toBe('1250');
    expect(resolveWhtGlAccountCode('SUPPLIER', { appliesTo: 'SUPPLIER', accountCode: '' })).toBe('2350');
  });

  it('honors configured account_code on single-side types', () => {
    expect(
      resolveWhtGlAccountCode('SUPPLIER', { appliesTo: 'SUPPLIER', accountCode: '2355' }),
    ).toBe('2355');
    expect(
      resolveWhtGlAccountCode('CUSTOMER', { appliesTo: 'CUSTOMER', accountCode: '1255' }),
    ).toBe('1255');
  });

  it('maps BOTH + legacy opposite defaults to side-correct accounts', () => {
    expect(
      resolveWhtGlAccountCode('CUSTOMER', { appliesTo: 'BOTH', accountCode: '2350' }),
    ).toBe('1250');
    expect(
      resolveWhtGlAccountCode('SUPPLIER', { appliesTo: 'BOTH', accountCode: '1250' }),
    ).toBe('2350');
  });

  it('honors custom BOTH account_code when not a crossed default', () => {
    expect(
      resolveWhtGlAccountCode('CUSTOMER', { appliesTo: 'BOTH', accountCode: '1260' }),
    ).toBe('1260');
  });

  it('exposes side defaults', () => {
    expect(defaultWhtAccountForSide('CUSTOMER')).toBe('1250');
    expect(defaultWhtAccountForSide('SUPPLIER')).toBe('2350');
  });
});
