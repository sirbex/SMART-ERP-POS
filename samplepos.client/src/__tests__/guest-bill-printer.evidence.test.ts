/**
 * Evidence: restaurant KOT/Bill print silently via local agent (no browser dialog
 * unless emergency fallback is enabled on this terminal).
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isRestaurantBrowserPrintFallbackEnabled,
  setRestaurantBrowserPrintFallbackEnabled,
  silentPrintFailureMessage,
  kotPrintPartialSuccessMessage,
} from '../lib/restaurantPrintPolicy';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');

function readClient(rel: string): string {
  return readFileSync(resolve(here, '..', rel), 'utf8');
}

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  });
}

describe('Restaurant silent print SSOT', () => {
  beforeEach(() => installMemoryLocalStorage());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('browser fallback is off by default and toggleable per terminal', () => {
    expect(isRestaurantBrowserPrintFallbackEnabled()).toBe(false);
    setRestaurantBrowserPrintFallbackEnabled(true);
    expect(isRestaurantBrowserPrintFallbackEnabled()).toBe(true);
    setRestaurantBrowserPrintFallbackEnabled(false);
    expect(isRestaurantBrowserPrintFallbackEnabled()).toBe(false);
  });

  it('failure message names the mapped printer and points to Stations + KDS', () => {
    expect(silentPrintFailureMessage('Kitchen EPSON')).toMatch(/Kitchen EPSON/);
    expect(silentPrintFailureMessage('Kitchen EPSON')).toMatch(/KDS|Stations|Printers/i);
    expect(silentPrintFailureMessage(null)).toMatch(
      /Stations|Printer Service|map printers|KDS/i,
    );
    expect(kotPrintPartialSuccessMessage(2, 2)).toMatch(/KOT recorded \(2\)/);
    expect(kotPrintPartialSuccessMessage(2, 2)).not.toMatch(/:1811/);
  });

  it('printRestaurant uses silent bridge first; browser only via policy', () => {
    const print = readClient('lib/printRestaurant.ts');
    expect(print).toContain('isRestaurantBrowserPrintFallbackEnabled');
    expect(print).toContain('silentPrintFailureMessage');
    expect(print).toContain('X-Printer-Name');
    expect(print).toMatch(/if \(allowBrowser\) return printHtmlDocument/);
    expect(print).toMatch(/never send a kitchen ticket to the wrong default printer/i);
  });

  it('Stations exposes silent policy + emergency browser toggle', () => {
    const stations = readClient('pages/restaurant/RestaurantStationsPage.tsx');
    expect(stations).toMatch(/Printer Service|Silent print/);
    expect(stations).toContain('setRestaurantBrowserPrintFallbackEnabled');
    expect(stations).toContain('listLocalPrintBridgePrinters');
    expect(stations).toMatch(/silently|silent/i);
  });

  it('guest bill + schema SSOT still present', () => {
    const sql = readFileSync(resolve(root, 'shared/sql/579_guest_bill_printer.sql'), 'utf8');
    expect(sql).toMatch(/guest_bill_printer_name/);
    const api = readClient('utils/api.ts');
    expect(api).toContain('getGuestBillPrinter');
  });
});
