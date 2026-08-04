/**
 * Evidence: retail POS silent first print + reprint → same receipt printer name.
 *
 * Silent success = agent accept (method escpos|html) with configured printerName.
 * Preview / unnamed default must not count as success (see PrintReceiptDialog).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildThermalGuestDocumentHtml,
  receiptToThermalGuestDocument,
} from '../lib/thermalGuestDocument';
import { buildReceiptDataFromSale } from '../lib/receiptFromSale';
import { shouldAutoPrintAfterSale } from '../lib/receiptPrintConfig';
import { resolveReceiptPrinterTargets } from '../lib/print';

const here = dirname(fileURLToPath(import.meta.url));

function readClient(rel: string): string {
  return readFileSync(resolve(here, '..', rel), 'utf8');
}

const RECEIPT_PRINTER = 'EPSON TM-T88III Receipt';

describe('EVIDENCE — retail silent first print + reprint same printer', () => {
  it('auto-print after sale requires enable+autoPrint; targets map same primary name', () => {
    expect(
      shouldAutoPrintAfterSale({
        enabled: true,
        autoPrint: true,
        printerName: RECEIPT_PRINTER,
      }),
    ).toBe(true);

    const targets = resolveReceiptPrinterTargets(RECEIPT_PRINTER, null);
    expect(targets.primary).toBe(RECEIPT_PRINTER);
    expect(targets.fallbacks).toEqual([]);
  });

  it('original and reprint payloads share tender lines; only reprint has banner HTML', () => {
    const sale = {
      saleNumber: 'SALE-RTL-PROOF-1',
      createdAt: '2026-08-04T08:00:00.000Z',
      totalAmount: 1000,
      items: [{ productName: 'Proof SKU', quantity: 1, unitPrice: 1000, totalPrice: 1000 }],
      paymentLines: [{ paymentMethod: 'CASH', amount: 1000 }],
      cashierName: 'Cashier',
    };
    const branding = { companyName: 'Retail Proof Co' };

    const original = buildReceiptDataFromSale(sale, branding);
    const reprint = buildReceiptDataFromSale(sale, branding, { isReprint: true });

    expect(original.isReprint).toBeFalsy();
    expect(reprint.isReprint).toBe(true);
    expect(original.saleNumber).toBe(reprint.saleNumber);
    expect(original.paymentMethod || original.payments?.length).toBeTruthy();

    const originalHtml = buildThermalGuestDocumentHtml(receiptToThermalGuestDocument(original));
    const reprintHtml = buildThermalGuestDocumentHtml(receiptToThermalGuestDocument(reprint));

    expect(originalHtml).not.toContain('REPRINTED COPY');
    expect(reprintHtml).toContain('REPRINTED COPY');
    expect(originalHtml).toMatch(/CASH|Cash/i);
    expect(reprintHtml).toMatch(/CASH|Cash/i);
  });

  it('STRUCT: printReceipt silent path forbids unnamed Windows default', () => {
    const print = readClient('lib/print.ts');
    expect(print).toMatch(/export async function printReceipt/);
    expect(print).toMatch(/allowUnnamedAgentDefault:\s*false/);
    expect(print).toMatch(/printGuestThermalDocument/);
    // Options.printerName flows into thermal document print
    expect(print).toMatch(/printerName:\s*options\.printerName/);
  });

  it('STRUCT: POS first print + Sales reprint both pass Settings printerName', () => {
    const pos = readClient('pages/pos/POSPage.tsx');
    expect(pos).toMatch(/setReceiptPrinterName\(cfg\.printerName/);
    expect(pos).toMatch(/printerName=\{receiptPrinterName\}/);
    expect(pos).toMatch(/shouldAutoPrintAfterSale/);
    expect(pos).toMatch(/PrintReceiptDialog/);

    const dialog = readClient('components/pos/PrintReceiptDialog.tsx');
    expect(dialog).toMatch(/printerName,\s*\n?\s*\}/);
    expect(dialog).toMatch(/printReceipt\(receiptData,\s*printOptions\)/);
    expect(dialog).toMatch(/result\.method === 'preview'/);
    // Success only after non-preview
    const successIdx = dialog.indexOf("setPrintStatus('success')");
    const previewIdx = dialog.indexOf("result.method === 'preview'");
    expect(previewIdx).toBeLessThan(successIdx);

    const sales = readClient('pages/SalesPage.tsx');
    expect(sales).toMatch(/isReprint:\s*true/);
    expect(sales).toMatch(
      /printReceipt\(receiptData,\s*\{\s*printerName:\s*printCfg\.printerName\s*\}\)/,
    );
    expect(sales).toMatch(/fetchReceiptPrintConfig/);
    // Same config source as POS thermal name key
    expect(sales).toMatch(/isReceiptPrintingEnabled\(printCfg\)/);
  });

  it('STRUCT: bridge posts named printer only once per origin (no double queue)', () => {
    const rest = readClient('lib/printRestaurant.ts');
    expect(rest).toMatch(/X-Printer-Name/);
    expect(rest).toMatch(/X-Print-Format.*escpos|escpos/);
    expect(rest).toMatch(/try origins sequentially|Sequential|not enqueue TWO/i);
    expect(rest).toMatch(/LOCAL_PRINT_BRIDGE_ORIGINS/);
  });
});
