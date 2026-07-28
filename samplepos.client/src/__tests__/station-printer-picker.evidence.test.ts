import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listLocalPrintBridgePrinters,
  mergePrinterOptions,
} from '../lib/localPrintBridge';

const here = dirname(fileURLToPath(import.meta.url));

describe('Station printer select (bridge discovery)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('mergePrinterOptions unions discovered + saved names', () => {
    expect(
      mergePrinterOptions(['EPSON TM-T20', 'Bar'], [null, 'KitchenPrinter', 'EPSON TM-T20', '']),
    ).toEqual(['Bar', 'EPSON TM-T20', 'KitchenPrinter']);
  });

  it('listLocalPrintBridgePrinters parses bridge JSON array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        expect(String(url)).toContain('localhost:1811/printers');
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
    expect(picker).toContain('listLocalPrintBridgePrinters');
    expect(picker).toContain('<select');
    expect(picker).toContain('None (default bridge printer)');
  });
});
