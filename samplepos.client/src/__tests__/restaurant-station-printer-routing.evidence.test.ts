/**
 * Evidence: menu→station→printer routing must not collapse onto one default printer.
 * BAR/PIZZA stations keep their own X-Printer-Name even when a station has no printer set.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveStationPrinterName } from '../lib/printRestaurant';
import { cacheRestaurantStations } from '../lib/restaurantOfflineCache';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

function readRepo(rel: string) {
  return readFileSync(resolve(repoRoot, rel), 'utf8');
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
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  });
}

describe('Station printer routing (no default collapse)', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    cacheRestaurantStations([
      {
        id: 's-kitchen',
        code: 'KITCHEN',
        name: 'Kitchen',
        printerName: 'KitchenPrinter',
        sortOrder: 10,
        isActive: true,
        isDefault: true,
      },
      {
        id: 's-bar',
        code: 'BAR',
        name: 'Bar',
        printerName: 'BarPrinter',
        sortOrder: 20,
        isActive: true,
        isDefault: false,
      },
      {
        id: 's-pizza',
        code: 'PIZZA',
        name: 'Pizza',
        printerName: null,
        sortOrder: 30,
        isActive: true,
        isDefault: false,
      },
    ]);
  });

  it('EVIDENCE: BAR resolves to BarPrinter, not KitchenPrinter', () => {
    expect(resolveStationPrinterName('BAR')).toBe('BarPrinter');
    expect(resolveStationPrinterName('KITCHEN')).toBe('KitchenPrinter');
  });

  it('EVIDENCE: matched station with null printer does not steal default', () => {
    expect(resolveStationPrinterName('PIZZA')).toBeNull();
  });

  it('EVIDENCE: unknown/empty station falls back to default printer', () => {
    expect(resolveStationPrinterName(null)).toBe('KitchenPrinter');
    expect(resolveStationPrinterName('')).toBe('KitchenPrinter');
    expect(resolveStationPrinterName('UNKNOWN')).toBe('KitchenPrinter');
  });

  it('EVIDENCE gate: sendKot heals + stamps per-station printerName', () => {
    const service = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantService.ts');
    const sendKot = service.slice(
      service.indexOf('async sendKot('),
      service.indexOf('async voidCheckItems('),
    );
    expect(sendKot).toMatch(/healUnsentLineKitchenStations/);
    expect(sendKot).toMatch(/kot\.printerName = station\.printerName/);
    expect(sendKot).toMatch(/printJobsService\.enqueue/);
    expect(sendKot).toMatch(/targetPrinter: station\.printerName/);

    const voidFn = service.slice(service.indexOf('async voidCheckItems('));
    expect(voidFn).toMatch(/resolveStationForVoidItem/);
    expect(voidFn).toMatch(/targetPrinter: station\.printerName/);

    const repo = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantRepository.ts');
    expect(repo).toMatch(/COALESCE\(\s*NULLIF\(BTRIM\(oi\.kitchen_station\)/);
    expect(repo).toMatch(/healUnsentLineKitchenStations/);
    expect(repo).toMatch(/resolveStationForVoidItem/);

    const pos = readRepo('samplepos.client/src/pages/restaurant/RestaurantPosPage.tsx');
    expect(pos).toMatch(/kitchenStation: menuProduct\?\.kitchenStation/);
    expect(pos).toMatch(/dispatchPrintJobs/);

    const ops = readRepo('samplepos.client/src/lib/restaurantOfflineOps.ts');
    expect(ops).toMatch(/emitVoidKotTicketsOffline/);
    expect(ops).toMatch(/resolveOfflineKotStation/);
    expect(ops).toMatch(/station: bucket\.station/);
  });
});
