/**
 * documentTaxIntegrity — fail-loud SSOT guards
 */
import {
  assertLineTaxEqualsHeader,
  assertTaxRestatementDeltaPolicy,
  assertPostedTaxTriplet,
  isUuidProductId,
  money2,
} from './documentTaxIntegrity.js';

describe('documentTaxIntegrity', () => {
  it('assertLineTaxEqualsHeader passes within 2 cents', () => {
    expect(() => assertLineTaxEqualsHeader(18, 18, 't')).not.toThrow();
    expect(() => assertLineTaxEqualsHeader(18.01, 18, 't')).not.toThrow();
  });

  it('assertLineTaxEqualsHeader throws on real drift', () => {
    expect(() => assertLineTaxEqualsHeader(18, 36, 't')).toThrow(/diverges/);
  });

  it('assertTaxRestatementDeltaPolicy increase only', () => {
    expect(assertTaxRestatementDeltaPolicy(0, 100).taxDelta).toBe(100);
    expect(() => assertTaxRestatementDeltaPolicy(100, 100)).toThrow(/matches posted/);
    expect(() => assertTaxRestatementDeltaPolicy(100, 50)).toThrow(/credit notes/);
  });

  it('assertPostedTaxTriplet enforces sale/line/invoice', () => {
    expect(() =>
      assertPostedTaxTriplet({ saleTax: 10, lineTaxSum: 10, invoiceTax: 10, context: 't' }),
    ).not.toThrow();
    expect(() =>
      assertPostedTaxTriplet({ saleTax: 10, lineTaxSum: 20, invoiceTax: 10, context: 't' }),
    ).toThrow(/line tax sum/);
    expect(() =>
      assertPostedTaxTriplet({ saleTax: 10, lineTaxSum: 10, invoiceTax: 20, context: 't' }),
    ).toThrow(/invoice tax/);
  });

  it('isUuidProductId rejects custom lines', () => {
    expect(isUuidProductId('a0530882-bd1b-4917-b562-9ab1bd751665')).toBe(true);
    expect(isUuidProductId('custom_1')).toBe(false);
    expect(isUuidProductId(null)).toBe(false);
  });

  it('money2 rounds half-up decimal', () => {
    expect(money2(1.005)).toBe(1.01);
  });
});
