import { describe, expect, it } from 'vitest';

import {
  CUSTOMER_PAYMENT_METHODS,
  DEPOSIT_METHODS,
  SUPPLIER_PAYMENT_METHODS,
} from '../constants/paymentMethods';
import { PAYMENT_METHOD } from '../utils/constants';

describe('Airtel Money payment method consistency', () => {
  it('exports AIRTEL_MONEY in the shared payment method constants', () => {
    expect(PAYMENT_METHOD.AIRTEL_MONEY).toBe('AIRTEL_MONEY');
  });

  it('offers Airtel Money in every shared payment-method picker list', () => {
    for (const methods of [
      CUSTOMER_PAYMENT_METHODS,
      SUPPLIER_PAYMENT_METHODS,
      DEPOSIT_METHODS,
    ]) {
      expect(methods).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: 'AIRTEL_MONEY',
            label: 'Airtel Money',
          }),
        ]),
      );
    }
  });

  it('keeps MTN Mobile Money distinct from Airtel Money', () => {
    expect(CUSTOMER_PAYMENT_METHODS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: 'MOBILE_MONEY',
          label: 'MTN Mobile Money',
        }),
        expect.objectContaining({
          value: 'AIRTEL_MONEY',
          label: 'Airtel Money',
        }),
      ]),
    );
  });
});
