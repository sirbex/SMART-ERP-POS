import { describe, expect, it } from 'vitest';
import {
  isAdjustableCustomerInvoice,
  isListableCustomerInvoice,
} from '../utils/customerInvoiceListFilters';

describe('customerInvoiceListFilters', () => {
  it('lists paid invoices (tab must not go empty after settlement)', () => {
    expect(
      isListableCustomerInvoice({
        invoiceNumber: 'INV-1',
        documentType: 'INVOICE',
        status: 'PAID',
        totalAmount: 1000,
        amountPaid: 1000,
        balance: 0,
      }),
    ).toBe(true);
  });

  it('does not list credit notes on Invoices tab', () => {
    expect(
      isListableCustomerInvoice({
        invoiceNumber: 'CN-1',
        documentType: 'CREDIT_NOTE',
        status: 'POSTED',
        balance: 500,
      }),
    ).toBe(false);
  });

  it('lists opening balances', () => {
    expect(
      isListableCustomerInvoice({
        invoiceNumber: 'OB-1',
        documentType: 'OPENING_BALANCE',
        status: 'UNPAID',
        balance: 100,
      }),
    ).toBe(true);
  });

  it('Adjust only when outstanding AR remains', () => {
    expect(
      isAdjustableCustomerInvoice({
        invoiceNumber: 'INV-1',
        documentType: 'INVOICE',
        status: 'PAID',
        balance: 0,
      }),
    ).toBe(false);
    expect(
      isAdjustableCustomerInvoice({
        invoiceNumber: 'INV-2',
        documentType: 'INVOICE',
        status: 'UNPAID',
        balance: 500,
      }),
    ).toBe(true);
  });
});
