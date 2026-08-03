/**
 * Evidence: auto-print after payment + reprint path.
 * Master enable is enforced via shouldAutoPrintAfterSale (see receipt-print-integrity suite).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  shouldAutoPrintAfterSale,
  DEFAULT_RECEIPT_PRINT_CONFIG,
} from '../lib/receiptPrintConfig';
import { buildReceiptDataFromSale } from '../lib/receiptFromSale';

const here = dirname(fileURLToPath(import.meta.url));

function readClient(rel: string): string {
  return readFileSync(resolve(here, '..', rel), 'utf8');
}

function readServer(rel: string): string {
  return readFileSync(resolve(here, '../../../SamplePOS.Server', rel), 'utf8');
}

describe('EVIDENCE — auto-print after payment + reprint', () => {
  it('shouldAutoPrintAfterSale only when enabled AND autoPrint=true', () => {
    expect(shouldAutoPrintAfterSale({ enabled: true, autoPrint: true })).toBe(true);
    expect(shouldAutoPrintAfterSale({ enabled: false, autoPrint: true })).toBe(false);
    expect(shouldAutoPrintAfterSale({ enabled: true, autoPrint: false })).toBe(false);
    expect(shouldAutoPrintAfterSale(DEFAULT_RECEIPT_PRINT_CONFIG)).toBe(false);
    expect(shouldAutoPrintAfterSale(null)).toBe(false);
  });

  it('reprint builds isReprint payload with lines and branding', () => {
    const receipt = buildReceiptDataFromSale(
      {
        saleNumber: 'SALE-R-1',
        createdAt: '2026-06-02T12:00:00.000Z',
        totalAmount: 15000,
        items: [{ productName: 'Juice', quantity: 1, unitPrice: 15000, totalPrice: 15000 }],
        paymentLines: [{ paymentMethod: 'CASH', amount: 15000 }],
        cashierName: 'Ada',
      },
      {
        companyName: 'Cafe',
        customReceiptNote: 'Note',
        paymentAccounts: [
          {
            type: 'MOBILE_MONEY',
            provider: 'MTN',
            accountName: 'Cafe',
            accountNumber: '0700',
            isActive: true,
            showOnReceipt: true,
          },
        ],
      },
      { isReprint: true },
    );
    expect(receipt.isReprint).toBe(true);
    expect(receipt.items?.length).toBe(1);
    expect(receipt.customReceiptNote).toBe('Note');
    expect(receipt.paymentAccounts).toHaveLength(1);
  });

  it('STRUCT: PrintReceiptDialog auto-prints when autoPrint prop set', () => {
    const dialog = readClient('components/pos/PrintReceiptDialog.tsx');
    expect(dialog).toMatch(/autoPrint\s*\?/);
    expect(dialog).toMatch(/autoPrintFiredRef/);
    expect(dialog).toMatch(/void handlePrint\(\)/);
  });

  it('STRUCT: POS loads receipt print config and presents auto-print after sale', () => {
    const pos = readClient('pages/pos/POSPage.tsx');
    expect(pos).toMatch(/fetchReceiptPrintConfig/);
    expect(pos).toMatch(/shouldAutoPrintAfterSale|presentSaleReceipt/);
    expect(pos).toMatch(/autoPrint=\{shouldAutoPrintAfterSale|autoPrint=\{receiptAutoPrint\}/);
    expect(pos).toMatch(/printerName=\{receiptPrinterName\}/);
    expect(pos).toMatch(/presentSaleReceipt\(/);
  });

  it('STRUCT: Sales reprint awaits printReceipt and refetches thin detail', () => {
    const sales = readClient('pages/SalesPage.tsx');
    expect(sales).toMatch(
      /await printReceipt\(receiptData(?:,\s*\{\s*printerName:\s*printCfg\.printerName\s*\})?\)/,
    );
    expect(sales).toMatch(/printerName:\s*printCfg\.printerName/);
    expect(sales).toMatch(/isReprint:\s*true/);
    expect(sales).toMatch(/api\.sales\.getById/);
    expect(sales).toMatch(/Receipt sent to printer|isReprinting/);
    expect(sales).toMatch(/isReceiptPrintingEnabled/);
  });

  it('STRUCT: receipt print config GET allows authenticated cashiers (no system.read only)', () => {
    const routes = readServer('src/modules/system-settings/systemSettingsRoutes.ts');
    expect(routes).toMatch(/printing\/receipt/);
    // Must not gate FOH/POS cashiers behind system.read for autoPrint
    const line = routes
      .split('\n')
      .find((l) => l.includes("'/printing/receipt'") || l.includes('"/printing/receipt"'));
    expect(line).toBeTruthy();
    expect(line).not.toMatch(/system\.read/);
  });
});
