/**
 * Integrity certification: sale receipts (bridge) independent of KOT / guest bills,
 * master enable + auto-print, and paid-receipt payment method rows.
 *
 * NEVER break:
 * - printKitchenTicket / sendKot / KOT jobs
 * - printRestaurantBill / guest bill / requestBill
 * - Guest bill pre-pay (no tender methods on BILL document)
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_RECEIPT_PRINT_CONFIG,
  isReceiptPrintingEnabled,
  shouldAutoPrintAfterSale,
  shouldPrintReceiptOnSettlement,
} from '../lib/receiptPrintConfig';
import {
  billToThermalGuestDocument,
  buildThermalGuestDocumentHtml,
  receiptToThermalGuestDocument,
} from '../lib/thermalGuestDocument';
import { buildReceiptDataFromCheckout, buildReceiptDataFromSale } from '../lib/receiptFromSale';

const here = dirname(fileURLToPath(import.meta.url));

function readClient(rel: string): string {
  return readFileSync(resolve(here, '..', rel), 'utf8');
}

function readServer(rel: string): string {
  return readFileSync(resolve(here, '../../../SamplePOS.Server', rel), 'utf8');
}

describe('EVIDENCE — receipt integrity (enable independent of KOT/bill)', () => {
  it('master enable + auto-print gates (behavioral)', () => {
    expect(isReceiptPrintingEnabled({ enabled: true, autoPrint: false })).toBe(true);
    expect(isReceiptPrintingEnabled({ enabled: false, autoPrint: true })).toBe(false);
    expect(isReceiptPrintingEnabled(null)).toBe(true);
    expect(isReceiptPrintingEnabled(DEFAULT_RECEIPT_PRINT_CONFIG)).toBe(true);

    // Auto-print requires BOTH flags
    expect(shouldAutoPrintAfterSale({ enabled: true, autoPrint: true })).toBe(true);
    expect(shouldAutoPrintAfterSale({ enabled: false, autoPrint: true })).toBe(false);
    expect(shouldAutoPrintAfterSale({ enabled: true, autoPrint: false })).toBe(false);
    expect(shouldAutoPrintAfterSale(DEFAULT_RECEIPT_PRINT_CONFIG)).toBe(false);
    expect(shouldAutoPrintAfterSale(null)).toBe(false);

    // Settlement (order pay / FOH offline cash) follows master enable only
    expect(shouldPrintReceiptOnSettlement({ enabled: true, autoPrint: false })).toBe(true);
    expect(shouldPrintReceiptOnSettlement({ enabled: false, autoPrint: true })).toBe(false);
    expect(shouldPrintReceiptOnSettlement(null)).toBe(true);
  });

  it('paid RECEIPT always carries tendered payment method lines when ticked path has data', () => {
    const split = receiptToThermalGuestDocument({
      saleNumber: 'SALE-PAY-1',
      saleDate: '2026-08-03 12:00',
      totalAmount: 30000,
      subtotal: 30000,
      payments: [
        { method: 'CASH', amount: 20000 },
        { method: 'MOBILE_MONEY', amount: 10000, reference: 'MTN-1' },
      ],
      changeGiven: 0,
      items: [{ name: 'Lunch', quantity: 1, unitPrice: 30000, subtotal: 30000 }],
    });
    expect(split.kind).toBe('RECEIPT');
    expect(split.paymentRows?.length).toBeGreaterThanOrEqual(2);
    expect(split.paymentRows?.some((r) => /Cash Given|CASH/i.test(r.label))).toBe(true);
    expect(split.paymentRows?.some((r) => /MOBILE_MONEY|MTN/i.test(r.label))).toBe(true);

    const html = buildThermalGuestDocumentHtml(split);
    expect(html).toMatch(/Cash Given|CASH/i);
    expect(html).toMatch(/MOBILE_MONEY|MTN/i);
    // Not a guest bill
    expect(split.title).toBe('RECEIPT');
    expect(html).not.toContain('Pay at cashier');

    const single = receiptToThermalGuestDocument({
      saleNumber: 'SALE-PAY-2',
      saleDate: 'now',
      totalAmount: 5000,
      paymentMethod: 'CARD',
      amountPaid: 5000,
      items: [{ name: 'Coffee', quantity: 1, unitPrice: 5000, subtotal: 5000 }],
    });
    expect(single.paymentRows?.some((r) => r.label === 'Payment' && r.value === 'CARD')).toBe(
      true,
    );

    // Checkout builder → payment lines on paid sale/reprint
    const fromSale = buildReceiptDataFromSale(
      {
        saleNumber: 'SALE-PAY-3',
        createdAt: '2026-08-03T10:00:00.000Z',
        totalAmount: 12000,
        items: [{ productName: 'Soup', quantity: 1, unitPrice: 12000, totalPrice: 12000 }],
        paymentLines: [
          { paymentMethod: 'CASH', amount: 7000 },
          { paymentMethod: 'CARD', amount: 5000 },
        ],
      },
      { companyName: 'Cafe' },
    );
    const fromSaleDoc = receiptToThermalGuestDocument(fromSale);
    expect(fromSaleDoc.paymentRows?.length).toBeGreaterThanOrEqual(2);

    const checkout = buildReceiptDataFromCheckout({
      saleNumber: 'SALE-PAY-4',
      saleDate: 'now',
      totalAmount: 9000,
      paymentMethod: 'CASH',
      amountPaid: 10000,
      changeGiven: 1000,
      payments: [{ method: 'CASH', amount: 10000 }],
      items: [{ name: 'Juice', quantity: 1, unitPrice: 9000, subtotal: 9000 }],
    });
    const checkoutDoc = receiptToThermalGuestDocument(checkout);
    expect(checkoutDoc.paymentRows?.some((r) => /Cash Given|CASH|Payment/i.test(r.label))).toBe(
      true,
    );
    expect(checkoutDoc.paymentRows?.some((r) => r.label === 'Change')).toBe(true);
  });

  it('guest BILL never renders tendered payment methods (pre-pay integrity)', () => {
    const bill = billToThermalGuestDocument({
      tableLabel: 'T1',
      orderNumber: 'R-100',
      companyName: 'Cafe',
      items: [{ productName: 'Steak', quantity: 1, unitPrice: 25000, lineTotal: 25000 }],
      subtotal: 25000,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 25000,
    });
    expect(bill.kind).toBe('BILL');
    expect(bill.paymentRows == null || bill.paymentRows.length === 0).toBe(true);
    expect(bill.footerLines).toContain('Pay at cashier');
    const billHtml = buildThermalGuestDocumentHtml(bill);
    expect(billHtml).toContain('Pay at cashier');
    expect(billHtml).not.toMatch(/Cash Given|CARD|MOBILE_MONEY/);
  });

  it('STRUCT: auto-print/settlement use enable gates; KOT/bill stay independent', () => {
    const cfg = readClient('lib/receiptPrintConfig.ts');
    expect(cfg).toMatch(/export function isReceiptPrintingEnabled/);
    expect(cfg).toMatch(/export function shouldAutoPrintAfterSale/);
    expect(cfg).toMatch(/export function shouldPrintReceiptOnSettlement/);
    expect(cfg).toMatch(/isReceiptPrintingEnabled\(config\)\s*&&\s*config\?\.autoPrint\s*===\s*true/);

    const pos = readClient('pages/pos/POSPage.tsx');
    expect(pos).toMatch(/shouldAutoPrintAfterSale/);
    expect(pos).toMatch(/fetchReceiptPrintConfig/);

    const orderPay = readClient('pages/orders/OrderPaymentPage.tsx');
    expect(orderPay).toMatch(/shouldPrintReceiptOnSettlement/);
    expect(orderPay).toMatch(/fetchReceiptPrintConfig/);
    expect(orderPay).not.toMatch(/void printCfg/);

    const foh = readClient('pages/restaurant/RestaurantPosPage.tsx');
    expect(foh).toMatch(/shouldPrintReceiptOnSettlement/);
    expect(foh).toMatch(/fetchReceiptPrintConfig/);
    // Offline cash receipt is gated; KOT path must remain
    expect(foh).toMatch(/printKitchenTicket|fireRestaurantKot|dispatchPrintJobs|printRestaurantBill|requestBill/);

    const sales = readClient('pages/SalesPage.tsx');
    expect(sales).toMatch(/isReceiptPrintingEnabled/);
    expect(sales).toMatch(/Receipt printing is disabled/);

    // print job dispatcher: KOT never routed through receipt enable
    const dispatcher = readClient('lib/printJobDispatcher.ts');
    expect(dispatcher).toMatch(/printKitchenTicket/);
    expect(dispatcher).toMatch(/printRestaurantBill/);
    expect(dispatcher).not.toMatch(/shouldAutoPrintAfterSale|isReceiptPrintingEnabled|receiptPrintConfig/);

    const printRestaurant = readClient('lib/printRestaurant.ts');
    expect(printRestaurant).toMatch(/export async function printKitchenTicket/);
    expect(printRestaurant).toMatch(/export async function printRestaurantBill/);
    expect(printRestaurant).not.toMatch(/receiptPrintConfig|shouldAutoPrintAfterSale/);

    const guestBill = readClient('lib/guestBillPrinter.ts');
    expect(guestBill).not.toMatch(/receiptPrintConfig|shouldAutoPrintAfterSale/);
  });

  it('STRUCT: settings UI explains receipts are independent of KOT/bill', () => {
    const ui = readClient('pages/settings/tabs/ReceiptPrintingSettings.tsx');
    expect(ui).toMatch(/receiptPrinterEnabled/);
    expect(ui).toMatch(/receiptAutoPrint/);
    expect(ui).toMatch(/KOT|guest bill/i);
  });

  it('STRUCT: receipt config GET remains cashier-accessible (no system.read only)', () => {
    const routes = readServer('src/modules/system-settings/systemSettingsRoutes.ts');
    const line = routes
      .split('\n')
      .find((l) => l.includes("'/printing/receipt'") || l.includes('"/printing/receipt"'));
    expect(line).toBeTruthy();
    expect(line).not.toMatch(/system\.read/);

    const svc = readServer('src/modules/system-settings/systemSettingsService.ts');
    expect(svc).toMatch(/getReceiptPrintConfig/);
    expect(svc).toMatch(/receiptPrinterEnabled/);
    expect(svc).toMatch(/receiptAutoPrint/);
  });

  it('STRUCT: PrintReceiptDialog still auto-fires only when autoPrint prop set', () => {
    const dialog = readClient('components/pos/PrintReceiptDialog.tsx');
    expect(dialog).toMatch(/autoPrint\s*\?/);
    expect(dialog).toMatch(/autoPrintFiredRef/);
    expect(dialog).toMatch(/void handlePrint\(\)/);
    expect(dialog).toMatch(/Payment Methods|paymentMethod/);
  });

  it('STRUCT: reprint builds isReprint payload with payment data path intact', () => {
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
    const doc = receiptToThermalGuestDocument(receipt);
    expect(doc.paymentRows?.length).toBeGreaterThan(0);
  });
});
