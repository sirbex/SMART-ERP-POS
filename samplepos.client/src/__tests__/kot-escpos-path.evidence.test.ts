/**
 * Evidence: KOT/Bill use canonical Ticket → EscPosRenderer (no Chromium on hot path).
 * HTML renderer remains as fallback for agents < 1.3.0.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildKotThermalTicket } from '../../../shared/printing/buildKotTicket';
import { renderThermalTicketEscPos } from '../../../shared/printing/escposRenderer';
import { renderThermalTicketHtml } from '../../../shared/printing/htmlRenderer';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');

function readRepo(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf8');
}

describe('KOT ESC/POS dual-path architecture', () => {
  const sample = buildKotThermalTicket({
    kotNumber: 'KOT-42',
    station: 'KITCHEN',
    tableLabel: 'TABLE 7',
    sentByName: 'Alex',
    serverName: 'Alex',
    firedAt: '2026-07-31 12:00',
    ticketKind: 'FIRE',
    items: [
      { productName: 'Burger', quantity: 2, lineNotes: 'no onions' },
      { productName: 'Fries', quantity: 1 },
    ],
  });

  it('builds canonical ticket without prices', () => {
    expect(sample.kind).toBe('KOT_FIRE');
    expect(sample.title).toBe('KITCHEN ORDER');
    expect(sample.stewardName).toBe('Alex');
    expect(sample.serverName).toBeNull();
    expect(sample.items[0]?.note).toBe('no onions');
    expect(JSON.stringify(sample)).not.toMatch(/unitPrice|lineTotal|subtotal/);
  });

  it('EscPosRenderer emits init + cut and is fast', () => {
    const t0 = performance.now();
    const raw = renderThermalTicketEscPos(sample);
    const ms = performance.now() - t0;
    expect(raw[0]).toBe(0x1b);
    expect(raw[1]).toBe(0x40); // ESC @
    expect(raw.length).toBeGreaterThan(40);
    // GS V 0 cut near end
    const last = [...raw].slice(-8);
    expect(last).toContain(0x1d);
    expect(ms).toBeLessThan(20);
    const text = new TextDecoder('latin1').decode(raw);
    expect(text).toContain('TABLE 7');
    expect(text).toContain('Burger');
    expect(text).toContain('NO PRICES');
    expect(text).not.toMatch(/\$|KES|\d+\.\d{2}/);
  });

  it('HtmlRenderer consumes the same ticket model', () => {
    const html = renderThermalTicketHtml(sample, '/* css */');
    expect(html).toContain('TABLE 7');
    expect(html).toContain('2');
    expect(html).toContain('Burger');
    expect(html).toContain('NO PRICES');
  });

  it('VOID ticket marks stop', () => {
    const voidTicket = buildKotThermalTicket({
      kotNumber: 'KOT-9',
      station: 'BAR',
      tableLabel: 'BAR 1',
      firedAt: 'now',
      ticketKind: 'VOID',
      voidReason: 'guest left',
      items: [{ productName: 'Lager', quantity: 1 }],
    });
    expect(voidTicket.kind).toBe('KOT_VOID');
    const raw = new TextDecoder('latin1').decode(renderThermalTicketEscPos(voidTicket));
    expect(raw).toContain('VOID');
    expect(raw).toContain('STOP /');
    expect(raw).toContain('DO NOT PREPARE');
    expect(raw).toContain('guest left');
    // Feed-then-cut so footer clears the blade (GS V 65 n)
    const bytes = renderThermalTicketEscPos(voidTicket);
    let foundFeedCut = false;
    for (let i = 0; i < bytes.length - 3; i++) {
      if (bytes[i] === 0x1d && bytes[i + 1] === 0x56 && bytes[i + 2] === 0x41) {
        foundFeedCut = true;
        break;
      }
    }
    expect(foundFeedCut).toBe(true);
  });

  it('guest bill EscPos spans 80mm columns (not 58mm)', () => {
    const billTicket = {
      kind: 'GUEST_BILL' as const,
      title: 'GUEST BILL',
      documentNumber: 'ORD-1',
      tableLabel: 'T1',
      firedAt: 'now',
      metaRows: [
        { label: 'Table', value: 'T1' },
        { label: 'Order', value: 'ORD-1' },
      ],
      items: [{ name: 'Burger', quantity: 2, unitPrice: 10, lineTotal: 20 }],
      subtotal: 20,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: 20,
      footerLines: ['Pay at cashier', 'Thank you'],
    };
    const t0 = performance.now();
    const raw = renderThermalTicketEscPos(billTicket);
    expect(performance.now() - t0).toBeLessThan(20);
    const text = new TextDecoder('latin1').decode(raw);
    expect(text).toContain('GUEST BILL');
    expect(text).toContain('TOTAL');
    expect(text).toContain('20.00');
    expect(text).toContain('Pay at cashier');
    // 80mm Font A = 42 dashes; 58mm mistake was 32.
    expect(text).toContain('-'.repeat(42));
    expect(text).not.toContain(`\n${'-'.repeat(32)}\n`);
  });

  it('EVIDENCE: FOH prefers ESC/POS for KOT and bill; agent accepts RAW', () => {
    const restaurant = readRepo('samplepos.client/src/lib/printRestaurant.ts');
    expect(restaurant).toMatch(/renderThermalTicketEscPos/);
    expect(restaurant).toMatch(/postEscPosToPrintBridge/);
    expect(restaurant).toMatch(/printRestaurantBill/);
    expect(restaurant).toMatch(/guestDocumentToThermalTicket/);
    expect(restaurant).toMatch(/try origins sequentially/);
    expect(restaurant).toMatch(/buildThermalPrintCss/);

    const server = readRepo('smart-print-agent/src/server.ts');
    expect(server).toMatch(/formats: \['html', 'escpos'\]/);
    expect(server).toMatch(/format: 'escpos'/);
    expect(server).toMatch(/X-Print-Format/);

    const queue = readRepo('smart-print-agent/src/printQueue.ts');
    expect(queue).toMatch(/writeRawToPrinter/);
    expect(queue).toMatch(/format === 'escpos'/);

    const config = readRepo('smart-print-agent/src/config.ts');
    expect(config).toMatch(/1\.3\.0/);
  });
});
