import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { consolidatePricedLines } from '../../../shared/utils/consolidatePricedLines';
import { formatCurrency } from '../utils/currency';
import {
  buildRestaurantBillHtml,
  formatBillMoney,
} from '../lib/printRestaurant';
import {
  buildThermalGuestDocumentHtml,
  billToThermalGuestDocument,
  receiptToThermalGuestDocument,
} from '../lib/thermalGuestDocument';

const here = dirname(fileURLToPath(import.meta.url));

describe('Bill + receipt guest document SSOT', () => {
  it('sums identical product+price; keeps different products separate (Neutromax bill case)', () => {
    const out = consolidatePricedLines([
      { productName: 'Durex Pleasure me', quantity: 1, unitPrice: 10000, lineTotal: 10000 },
      { productName: 'Durex Pleasure me', quantity: 1, unitPrice: 10000, lineTotal: 10000 },
      { productName: 'Neutromax 300ug/1ml', quantity: 1, unitPrice: 100000, lineTotal: 100000 },
      { productName: 'Neutromax 300ug/1ml', quantity: 1, unitPrice: 100000, lineTotal: 100000 },
      { productName: 'Neutromax 300ug/1ml', quantity: 1, unitPrice: 100000, lineTotal: 100000 },
      { productName: 'Neutromax 300ug/1ml', quantity: 1, unitPrice: 100000, lineTotal: 100000 },
      { productName: 'Neutromax 300ug/1ml', quantity: 1, unitPrice: 100000, lineTotal: 100000 },
      { productName: 'Durex extra safe', quantity: 1, unitPrice: 10000, lineTotal: 10000 },
    ]);
    const byName = Object.fromEntries(out.map((r) => [r.productName, r]));
    expect(byName['Durex Pleasure me']?.quantity).toBe(2);
    expect(byName['Neutromax 300ug/1ml']?.quantity).toBe(5);
    expect(out).toHaveLength(3);
  });

  it('formatBillMoney delegates to formatCurrency SSOT (spaced symbol)', () => {
    const viaBill = formatBillMoney(1500000, 'UGX');
    const viaCurrency = formatCurrency(1500000);
    expect(viaBill).toBe(viaCurrency);
    expect(viaBill).toMatch(/^UGX /);
    expect(viaBill).not.toMatch(/^UGX\d/);
  });

  it('EVIDENCE bill and receipt HTML share buildThermalGuestDocumentHtml SSOT', () => {
    const billHtml = buildRestaurantBillHtml({
      companyName: 'SMART ERP',
      companyAddress: 'Kampala, Uganda',
      companyPhone: '+256 700 000 000',
      orderNumber: 'ORD-2026-0047',
      tableLabel: 'VIP',
      waiterName: 'System Administrator',
      printedAt: 'Jul 28, 2026, 11:14:00 PM',
      items: [
        {
          productName: 'Abchlor eye droped',
          quantity: 1,
          unitPrice: 4200,
          lineTotal: 4200,
          lineNotes: 'Spicy',
        },
        {
          productName: 'OZEMPIC',
          quantity: 1,
          unitPrice: 1500000,
          lineTotal: 1500000,
          lineNotes: 'Room temp',
        },
      ],
      subtotal: 1504200,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 1504200,
    });

    const receiptHtml = buildThermalGuestDocumentHtml(
      receiptToThermalGuestDocument({
        companyName: 'SMART ERP',
        companyAddress: 'Kampala, Uganda',
        companyPhone: '+256 700 000 000',
        saleNumber: 'SALE-1',
        saleDate: 'Jul 28, 2026, 11:14:00 PM',
        items: [
          { name: 'OZEMPIC', quantity: 1, unitPrice: 1500000, subtotal: 1500000 },
        ],
        subtotal: 1500000,
        totalAmount: 1500000,
        paymentMethod: 'CASH',
        amountPaid: 1500000,
      }),
    );

    // Same layout primitives
    for (const html of [billHtml, receiptHtml]) {
      expect(html).toContain('class="line"');
      expect(html).toContain('class="meta-row"');
      expect(html).toContain('Date');
      expect(html).toContain('Jul 28, 2026, 11:14:00 PM');
      expect(html).toContain(formatCurrency(1500000));
      expect(html).not.toMatch(/UGX\d/);
      expect(html).not.toMatch(/<thead>.*Qty.*Price/s);
    }

    expect(billHtml).toContain('GUEST BILL');
    expect(billHtml).toContain('* Spicy');
    expect(receiptHtml).toContain('RECEIPT');
    expect(billToThermalGuestDocument({
      orderNumber: 'O1',
      tableLabel: 'T1',
      printedAt: 'now',
      items: [],
      subtotal: 0,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 0,
    }).kind).toBe('BILL');
  });

  it('wiring: print.ts + printRestaurant.ts consume thermalGuestDocument', () => {
    const print = readFileSync(resolve(here, '../lib/print.ts'), 'utf8');
    const rest = readFileSync(resolve(here, '../lib/printRestaurant.ts'), 'utf8');
    const guest = readFileSync(resolve(here, '../lib/thermalGuestDocument.ts'), 'utf8');
    expect(guest).toContain('buildThermalGuestDocumentHtml');
    expect(print).toContain('receiptToThermalGuestDocument');
    expect(print).toContain('buildThermalGuestDocumentHtml');
    expect(rest).toContain('billToThermalGuestDocument');
    expect(rest).toContain('buildThermalGuestDocumentHtml');
    expect(rest).toContain('printHtmlDocument');
  });
});
