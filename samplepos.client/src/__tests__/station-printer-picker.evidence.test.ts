import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listLocalPrintBridgePrinters,
  mergePrinterOptions,
  readCachedBridgePrinters,
  writeCachedBridgePrinters,
} from '../lib/localPrintBridge';

const here = dirname(fileURLToPath(import.meta.url));

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

describe('Station printer select (bridge discovery)', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mergePrinterOptions unions discovered + saved names', () => {
    expect(
      mergePrinterOptions(['EPSON TM-T20', 'Bar'], [null, 'KitchenPrinter', 'EPSON TM-T20', '']),
    ).toEqual(['Bar', 'EPSON TM-T20', 'KitchenPrinter']);
  });

  it('listLocalPrintBridgePrinters parses bridge JSON array and caches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        expect(String(url)).toMatch(/:1811\/(printers|api\/printers|list-printers)/);
        return {
          ok: true,
          headers: { get: () => 'application/json' },
          json: async () => ['KitchenPrinter', 'BarPrinter'],
          text: async () => '',
        };
      }),
    );
    const res = await listLocalPrintBridgePrinters({ timeoutMs: 500 });
    expect(res.bridgeOnline).toBe(true);
    expect(res.printers).toEqual(['BarPrinter', 'KitchenPrinter']);
    expect(readCachedBridgePrinters()).toEqual(['BarPrinter', 'KitchenPrinter']);
  });

  it('listLocalPrintBridgePrinters soft-fails when bridge offline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Failed to fetch');
      }),
    );
    const res = await listLocalPrintBridgePrinters({ timeoutMs: 200 });
    expect(res.bridgeOnline).toBe(false);
    expect(res.printers).toEqual([]);
    expect(res.source).toBe('none');
  });

  it('offline discovery returns cached printers so mapping stays usable', async () => {
    writeCachedBridgePrinters(['KitchenPrinter', 'BarPrinter']);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Failed to fetch');
      }),
    );
    const res = await listLocalPrintBridgePrinters({ timeoutMs: 200 });
    expect(res.bridgeOnline).toBe(false);
    expect(res.fromCache).toBe(true);
    expect(res.source).toBe('cache');
    expect(res.printers).toEqual(['BarPrinter', 'KitchenPrinter']);
  });

  it('Stations page wires StationPrinterPicker (not free-text only)', () => {
    const page = readFileSync(
      resolve(here, '../pages/restaurant/RestaurantStationsPage.tsx'),
      'utf8',
    );
    const picker = readFileSync(
      resolve(here, '../components/restaurant/StationPrinterPicker.tsx'),
      'utf8',
    );
    expect(page).toContain('StationPrinterPicker');
    expect(page).toContain('knownPrinters');
    expect(page).toContain('Menu → station routing');
    expect(page).toMatch(/mapping still|type each station|does not require bridge/i);
    expect(picker).toContain('listLocalPrintBridgePrinters');
    expect(picker).toContain('<select');
    expect(picker).toContain('None (default bridge printer)');
    // Select stays usable while refresh runs (only the ↻ button may load)
    expect(picker).toMatch(
      /<select\s*\n\s*className="[^"]+"\s*\n\s*disabled=\{disabled\}/,
    );
    expect(picker).toContain('Save');
  });
});
