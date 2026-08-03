/**
 * Evidence: paid receipts print Custom Receipt Note, Footer Text, payment accounts, and company TIN.
 * Behavioral (checkout → thermal HTML) + structural (wire paths after payment).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReceiptDataFromCheckout } from '../lib/receiptFromSale';
import { buildThermalGuestDocumentHtml, receiptToThermalGuestDocument } from '../lib/thermalGuestDocument';

const here = dirname(fileURLToPath(import.meta.url));

function readClient(rel: string): string {
  return readFileSync(resolve(here, '..', rel), 'utf8');
}

describe('EVIDENCE — receipt branding after payment', () => {
  it('HTML includes custom note, footer, payment accounts, and TIN from invoice settings', () => {
    const receipt = buildReceiptDataFromCheckout({
      saleNumber: 'SALE-NOTE-1',
      saleDate: '30/07/2026 11:00 AM',
      totalAmount: 25000,
      subtotal: 25000,
      paymentMethod: 'CASH',
      amountPaid: 25000,
      items: [{ name: 'Tea', quantity: 1, unitPrice: 25000, subtotal: 25000 }],
      invoiceSettings: {
        companyName: 'Blis Cafe',
        companyAddress: 'Kampala',
        companyPhone: '+256700000000',
        companyTin: '1000123456',
        footerText: 'Visit again · Free WiFi',
        customReceiptNote: 'MoMo: 0770 111 222 (Blis)\nAirtel: 0750 111 222',
        paymentAccounts: [
          {
            type: 'MOBILE_MONEY',
            provider: 'MTN MoMo',
            accountName: 'Blis Cafe',
            accountNumber: '0770111222',
            isActive: true,
            showOnReceipt: true,
            sortOrder: 0,
          },
          {
            type: 'BANK',
            provider: 'Stanbic',
            accountName: 'Hidden Bank',
            accountNumber: '999',
            isActive: true,
            showOnReceipt: false,
            sortOrder: 1,
          },
        ],
      },
    });

    expect(receipt.customReceiptNote).toContain('MoMo: 0770 111 222');
    expect(receipt.footerText).toBe('Visit again · Free WiFi');
    expect(receipt.companyTin).toBe('1000123456');
    expect(receipt.paymentAccounts).toHaveLength(1);
    expect(receipt.paymentAccounts?.[0].accountNumber).toBe('0770111222');

    const doc = receiptToThermalGuestDocument(receipt);
    expect(doc.customNote).toContain('MoMo: 0770 111 222');
    expect(doc.footerLines).toContain('Visit again · Free WiFi');
    expect(doc.companyTin).toBe('1000123456');
    expect(doc.paymentAccounts).toHaveLength(1);

    const html = buildThermalGuestDocumentHtml(doc);
    expect(html).toContain('custom-note');
    expect(html).toContain('MoMo: 0770 111 222');
    expect(html).toContain('Payment Details');
    expect(html).toContain('0770111222');
    expect(html).toContain('Visit again · Free WiFi');
    expect(html).toContain('TIN: 1000123456');
    expect(html).not.toContain('Hidden Bank');
  });

  it('falls back to default thank-you when footerText empty', () => {
    const doc = receiptToThermalGuestDocument({
      saleNumber: 'S-2',
      saleDate: 'now',
      totalAmount: 1000,
      items: [{ name: 'X', quantity: 1, unitPrice: 1000, subtotal: 1000 }],
      paymentMethod: 'CASH',
      customReceiptNote: 'Keep receipt for returns',
    });
    expect(doc.footerLines).toEqual(['Thank you for your business!']);
    expect(doc.customNote).toBe('Keep receipt for returns');
    const html = buildThermalGuestDocumentHtml(doc);
    expect(html).toContain('Keep receipt for returns');
    expect(html).toContain('Thank you for your business!');
  });

  it('STRUCT: printReceipt uses thermal guest SSOT (note + accounts in HTML path)', () => {
    const printSrc = readClient('lib/print.ts');
    expect(printSrc).toMatch(/export async function printReceipt/);
    expect(printSrc).toMatch(/receiptToThermalGuestDocument/);
    expect(printSrc).toMatch(/buildThermalGuestDocumentHtml/);
    expect(printSrc).toMatch(/customReceiptNote/);
    expect(printSrc).toMatch(/footerText/);
    expect(printSrc).toMatch(/paymentAccounts/);

    const guest = readClient('lib/thermalGuestDocument.ts');
    expect(guest).toMatch(/customNote: data\.customReceiptNote/);
    expect(guest).toMatch(/footerText/);
    expect(guest).toMatch(/class="custom-note"/);
    expect(guest).toMatch(/Payment Details/);
  });

  it('STRUCT: POS + order pay + restaurant offline wire invoice branding (no note clobber)', () => {
    const pos = readClient('pages/pos/POSPage.tsx');
    expect(pos).toMatch(/customReceiptNote: settingsData\.customReceiptNote/);
    expect(pos).toMatch(/footerText: settingsData\.footerText/);
    expect(pos).toMatch(/makePosReceiptData/);
    expect(pos).toMatch(/invoiceSettings/);

    const orderPay = readClient('pages/orders/OrderPaymentPage.tsx');
    expect(orderPay).toMatch(/fetchInvoiceSettingsForReceipt/);
    expect(orderPay).toMatch(/buildReceiptDataFromCheckout/);
    expect(orderPay).toMatch(/printRestaurantSettlementReceipt|printReceipt/);
    expect(orderPay).toMatch(/invoiceSettings/);

    const rest = readClient('pages/restaurant/RestaurantPosPage.tsx');
    expect(rest).toMatch(/invoiceBranding\?\.customReceiptNote/);
    expect(rest).toMatch(/invoiceBranding\?\.paymentAccounts/);
    expect(rest).toMatch(/invoiceBranding\?\.footerText/);
    // Regression: offline pay must not replace settings note with table/order meta
    expect(rest).not.toMatch(/customReceiptNote:\s*`\$\{tableLabel\}/);
    expect(rest).not.toMatch(/\(offline-first\)/);
  });

  it('STRUCT: Invoice Settings UI persists custom note + account showOnReceipt', () => {
    const tab = readClient('pages/settings/tabs/InvoiceSettingsTab.tsx');
    expect(tab).toMatch(/Custom Receipt Note/);
    expect(tab).toMatch(/name="customReceiptNote"/);
    expect(tab).toMatch(/customReceiptNote: getFormValue\('customReceiptNote'\)/);
    expect(tab).toMatch(/showOnReceipt/);
    expect(tab).toMatch(/name="footerText"/);
  });

  it('STRUCT: branding filters payment accounts for receipt (hide showOnReceipt=false)', () => {
    const branding = readClient('lib/receiptFromSale.ts');
    expect(branding).toMatch(/function invoiceSettingsToReceiptBranding/);
    expect(branding).toMatch(/showOnReceipt/);
    expect(branding).toMatch(/customReceiptNote/);
    expect(branding).toMatch(/footerText/);
    expect(branding).toMatch(/companyTin/);
  });
});
