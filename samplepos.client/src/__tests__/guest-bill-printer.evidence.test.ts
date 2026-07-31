/**
 * Evidence: guest bill has a default printer allocation (SSOT) and routes
 * through the same named bridge path as KOT (X-Printer-Name).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');

function readClient(rel: string): string {
  return readFileSync(resolve(here, '..', rel), 'utf8');
}

describe('Guest bill default printer SSOT', () => {
  it('schema + types persist guestBillPrinterName', () => {
    const sql = readFileSync(resolve(root, 'shared/sql/579_guest_bill_printer.sql'), 'utf8');
    expect(sql).toMatch(/guest_bill_printer_name/);
    const ver = readFileSync(
      resolve(root, 'SamplePOS.Server/src/constants/schemaVersion.ts'),
      'utf8',
    );
    expect(ver).toMatch(/CURRENT_SCHEMA_VERSION\s*=\s*579/);
    const types = readFileSync(resolve(root, 'shared/types/systemSettings.ts'), 'utf8');
    expect(types).toMatch(/guestBillPrinterName/);
  });

  it('restaurant API exposes get/set guest bill printer', () => {
    const routes = readFileSync(
      resolve(root, 'SamplePOS.Server/src/modules/restaurant/restaurantRoutes.ts'),
      'utf8',
    );
    expect(routes).toMatch(/\/guest-bill-printer/);
    expect(routes).toMatch(/guestBillPrinterName/);
    const api = readClient('utils/api.ts');
    expect(api).toContain('getGuestBillPrinter');
    expect(api).toContain('setGuestBillPrinter');
  });

  it('printRestaurantBill passes printerName through printHtml (named bridge)', () => {
    const print = readClient('lib/printRestaurant.ts');
    expect(print).toMatch(/printerName\?:\s*string\s*\|\s*null/);
    expect(print).toContain('resolveStationPrinterName');
    expect(print).toContain('X-Printer-Name');
    expect(print).toContain('LOCAL_PRINT_BRIDGE_ORIGINS');
    // Named bridge → default bridge → browser so KOT still prints if agent is down
    expect(print).toMatch(/postToPrintBridge[\s\S]*printHtmlDocument/);
    expect(print).toMatch(/Waiters never choose a printer|waiters never choose/i);
  });

  it('Stations page maps guest bill printer; POS resolves it on Bill', () => {
    const stations = readClient('pages/restaurant/RestaurantStationsPage.tsx');
    expect(stations).toContain('Guest bill printer');
    expect(stations).toContain('setGuestBillPrinter');
    expect(stations).toContain('getGuestBillPrinter');
    expect(stations).toMatch(/never pick a printer|Waiters only press/i);
    const pos = readClient('pages/restaurant/RestaurantPosPage.tsx');
    expect(pos).toContain('getGuestBillPrinter');
    expect(pos).toContain('printerName: guestBillPrinterName');
  });
});
