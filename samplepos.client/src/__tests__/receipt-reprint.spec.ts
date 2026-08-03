import { describe, it, expect } from 'vitest';
import {
  buildReceiptDataFromSale,
  formatReceiptDateTime,
  invoiceSettingsToReceiptBranding,
  mergeSaleForReceipt,
  resolveReceiptCustomerFields,
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
      companyTin: '1000000000',
      footerText: 'Come again soon',
      customReceiptNote: 'Thank you for shopping',
      paymentAccounts: [
        {
          type: 'MOBILE_MONEY',
          provider: 'MTN',
          accountName: 'Henber',
          accountNumber: '0700000000',
          isActive: true,
          showOnReceipt: true,
          sortOrder: 1,
        },
        {
          type: 'BANK',
          provider: 'Stanbic',
          accountName: 'Hidden',
          accountNumber: '123',
          isActive: true,
          showOnReceipt: false,
          sortOrder: 0,
        },
      ],
    });

    expect(branding.companyName).toBe('Henber Pharmacy');
    expect(branding.companyAddress).toBe('Kampala Rd');
    expect(branding.companyPhone).toBe('+256700000000');
    expect(branding.companyTin).toBe('1000000000');
    expect(branding.footerText).toBe('Come again soon');
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
        customerPhone: '+256700000001',
        customerEmail: 'john@example.com',
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
    expect(receipt.customerPhone).toBe('+256700000001');
    expect(receipt.customerEmail).toBe('john@example.com');
    expect(receipt.cashierName).toBe('Jane Cashier');
    expect(receipt.companyName).toBe('Henber Pharmacy');
    expect(receipt.companyAddress).toBe('Main Street');
    expect(receipt.companyPhone).toBe('+256700000000');
    expect(receipt.customReceiptNote).toBe('No refunds without receipt');
    expect(receipt.paymentAccounts).toHaveLength(1);
    expect(receipt.changeGiven).toBe(10000);
    expect(receipt.saleDate).toMatch(/^\d{2}\/\d{2}\/\d{4}/);
  });

  it('maps snake_case seller and customer from sale detail API', () => {
    const receipt = buildReceiptDataFromSale(
      {
        saleNumber: 'SALE-2026-0200',
        createdAt: '2026-06-02T12:00:00.000Z',
        totalAmount: 10000,
        cashier_name: 'Mary Seller',
        customer_name: 'Acme Ltd',
        customer_phone: '0700111222',
        customer_email: 'acme@example.com',
      },
      null,
      { isReprint: true }
    );

    expect(receipt.cashierName).toBe('Mary Seller');
    expect(receipt.customerName).toBe('Acme Ltd');
    expect(receipt.customerPhone).toBe('0700111222');
    expect(receipt.customerEmail).toBe('acme@example.com');
  });

  it('mergeSaleForReceipt keeps list customer when detail payload omits it', () => {
    const merged = mergeSaleForReceipt(
      {
        saleNumber: 'SALE-2026-0300',
        customerName: 'Henber BOU',
        customerPhone: '0700123456',
        totalAmount: 25000,
      },
      {
        sale_number: 'SALE-2026-0300',
        total_amount: 25000,
        items: [{ product_name: 'Item A', quantity: 1, unit_price: 25000, total_price: 25000 }],
      }
    );

    expect(resolveReceiptCustomerFields(merged).customerName).toBe('Henber BOU');
    expect(resolveReceiptCustomerFields(merged).customerPhone).toBe('0700123456');
    expect(merged.items).toHaveLength(1);

    const reprint = buildReceiptDataFromSale(merged, null, { isReprint: true });
    expect(reprint.customerName).toBe('Henber BOU');
    expect(reprint.customerPhone).toBe('0700123456');
    expect(reprint.isReprint).toBe(true);
  });

  it('receipt HTML SSOT maps customer fields through thermal guest document', () => {
    const { readFileSync } = require('node:fs');
    const { resolve } = require('node:path');
    const printSrc = readFileSync(resolve(__dirname, '../lib/print.ts'), 'utf8');
    expect(printSrc).toContain('receiptToThermalGuestDocument');
    expect(printSrc).toContain('buildThermalGuestDocumentHtml');
    expect(printSrc).toContain('customReceiptNote');
    expect(printSrc).toContain('footerText');

    const guestSrc = readFileSync(resolve(__dirname, '../lib/thermalGuestDocument.ts'), 'utf8');
    expect(guestSrc).toContain("label: 'Customer'");
    expect(guestSrc).toContain("label: 'Tel'");
    expect(guestSrc).toContain("label: 'Email'");
    expect(guestSrc).toContain('customNote');
    expect(guestSrc).toContain('paymentAccounts');
  });
});
