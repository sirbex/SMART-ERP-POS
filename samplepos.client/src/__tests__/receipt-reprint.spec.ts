import { describe, it, expect } from 'vitest';
import {
  buildReceiptDataFromSale,
  formatReceiptDateTime,
  invoiceSettingsToReceiptBranding,
} from '../lib/receiptFromSale';

describe('receipt reprint parity', () => {
  it('formatReceiptDateTime uses business timezone formatting', () => {
    const formatted = formatReceiptDateTime(new Date('2026-06-02T09:30:00.000Z'));
    expect(formatted).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{1,2}:\d{2} (AM|PM)$/);
  });

  it('invoiceSettingsToReceiptBranding includes company and active receipt payment accounts', () => {
    const branding = invoiceSettingsToReceiptBranding({
      companyName: 'Henber Pharmacy',
      companyAddress: 'Kampala Rd',
      companyPhone: '+256700000000',
      customReceiptNote: 'Thank you for shopping',
      paymentAccounts: [
        {
          type: 'MOBILE_MONEY',
          provider: 'MTN',
          accountName: 'Henber',
          accountNumber: '0700000000',
          isActive: true,
          showOnReceipt: true,
        },
        {
          type: 'BANK',
          provider: 'Stanbic',
          accountName: 'Hidden',
          accountNumber: '123',
          isActive: true,
          showOnReceipt: false,
        },
      ],
    });

    expect(branding.companyName).toBe('Henber Pharmacy');
    expect(branding.companyAddress).toBe('Kampala Rd');
    expect(branding.companyPhone).toBe('+256700000000');
    expect(branding.customReceiptNote).toBe('Thank you for shopping');
    expect(branding.paymentAccounts).toHaveLength(1);
    expect(branding.paymentAccounts?.[0].provider).toBe('MTN');
  });

  it('buildReceiptDataFromSale matches original receipt fields for reprint', () => {
    const receipt = buildReceiptDataFromSale(
      {
        saleNumber: 'SALE-2026-0100',
        createdAt: '2026-06-02T12:00:00.000Z',
        totalAmount: 50000,
        subtotal: 50000,
        taxAmount: 0,
        cashierName: 'Jane Cashier',
        customerName: 'John Customer',
        paymentMethod: 'CASH',
        amountPaid: 60000,
        changeAmount: 10000,
        items: [
          {
            productName: 'Paracetamol',
            quantity: 2,
            unitPrice: 25000,
            totalPrice: 50000,
          },
        ],
        paymentLines: [{ paymentMethod: 'CASH', amount: 60000 }],
      },
      {
        companyName: 'Henber Pharmacy',
        companyAddress: 'Main Street',
        companyPhone: '+256700000000',
        customReceiptNote: 'No refunds without receipt',
        paymentAccounts: [
          {
            type: 'MOBILE_MONEY',
            provider: 'Airtel',
            accountName: 'Henber',
            accountNumber: '0700111222',
            isActive: true,
            showOnReceipt: true,
          },
        ],
      },
      { isReprint: true }
    );

    expect(receipt.isReprint).toBe(true);
    expect(receipt.saleNumber).toBe('SALE-2026-0100');
    expect(receipt.customerName).toBe('John Customer');
    expect(receipt.cashierName).toBe('Jane Cashier');
    expect(receipt.companyName).toBe('Henber Pharmacy');
    expect(receipt.companyAddress).toBe('Main Street');
    expect(receipt.companyPhone).toBe('+256700000000');
    expect(receipt.customReceiptNote).toBe('No refunds without receipt');
    expect(receipt.paymentAccounts).toHaveLength(1);
    expect(receipt.changeGiven).toBe(10000);
    expect(receipt.saleDate).toMatch(/^\d{2}\/\d{2}\/\d{4}/);
  });

  it('omits customer line label when no customer on sale', () => {
    const receipt = buildReceiptDataFromSale(
      {
        saleNumber: 'SALE-2026-0101',
        createdAt: '2026-06-02T12:00:00.000Z',
        totalAmount: 1000,
      },
      null,
      { isReprint: true }
    );

    expect(receipt.customerName).toBeUndefined();
  });
});
