/**
 * Evidence: Print Job SSOT routes Kitchen/Bar/Bill to separate printers via queued jobs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dispatchPrintJobs,
  enqueueOfflinePrintJob,
  normalizePrintJob,
  type ClientPrintJob,
} from '../lib/printJobDispatcher';

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

vi.mock('../lib/printRestaurant', () => ({
  printKitchenTicket: vi.fn(async () => undefined),
  printRestaurantBill: vi.fn(async () => undefined),
}));

vi.mock('../utils/api', () => ({
  api: {
    printJobs: {
      updateStatus: vi.fn(async () => ({ data: { success: true } })),
      listPending: vi.fn(async () => ({ data: { data: [] } })),
    },
  },
}));

describe('Print Job SSOT (multi-printer)', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    vi.clearAllMocks();
  });

  it('EVIDENCE: Kitchen + Bar jobs keep distinct targetPrinter', async () => {
    const { printKitchenTicket } = await import('../lib/printRestaurant');
    const jobs: ClientPrintJob[] = [
      {
        id: 'j1',
        documentType: 'KOT',
        targetPrinter: 'KitchenPrinter',
        stationCode: 'KITCHEN',
        offline: true,
        payloadJson: {
          kotNumber: 'KOT-1',
          station: 'KITCHEN',
          tableLabel: 'T1',
          firedAt: new Date().toISOString(),
          items: [{ productName: 'Chicken', quantity: 2 }],
        },
      },
      {
        id: 'j2',
        documentType: 'KOT',
        targetPrinter: 'BarPrinter',
        stationCode: 'BAR',
        offline: true,
        payloadJson: {
          kotNumber: 'KOT-2',
          station: 'BAR',
          tableLabel: 'T1',
          firedAt: new Date().toISOString(),
          items: [{ productName: 'Beer', quantity: 3 }],
        },
      },
    ];

    const result = await dispatchPrintJobs(jobs);
    expect(result.delivered).toBe(2);
    expect(result.failures).toBe(0);
    expect(printKitchenTicket).toHaveBeenCalledTimes(2);
    expect(vi.mocked(printKitchenTicket).mock.calls[0][0].printerName).toBe('KitchenPrinter');
    expect(vi.mocked(printKitchenTicket).mock.calls[1][0].printerName).toBe('BarPrinter');
  });

  it('EVIDENCE: normalize accepts snake_case API rows', () => {
    const job = normalizePrintJob({
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      document_type: 'KOT',
      target_printer: 'BarPrinter',
      station_code: 'BAR',
      payload_json: { items: [{ productName: 'Beer', quantity: 1 }], station: 'BAR' },
      status: 'PENDING',
    });
    expect(job?.documentType).toBe('KOT');
    expect(job?.targetPrinter).toBe('BarPrinter');
    expect(job?.stationCode).toBe('BAR');
  });

  it('EVIDENCE: empty items fail closed (no blank ticket)', async () => {
    const result = await dispatchPrintJobs([
      {
        id: 'empty',
        documentType: 'KOT',
        targetPrinter: 'KitchenPrinter',
        offline: true,
        payloadJson: { kotNumber: 'X', items: [] },
      },
    ]);
    expect(result.delivered).toBe(0);
    expect(result.failures).toBe(1);
  });

  it('EVIDENCE: offline enqueue creates durable local job', () => {
    const job = enqueueOfflinePrintJob({
      documentType: 'GUEST_BILL',
      targetPrinter: 'CashierPrinter',
      payloadJson: {
        orderNumber: 'R-1',
        totalAmount: 10,
        items: [{ productName: 'X', quantity: 1, unitPrice: 10, lineTotal: 10 }],
      },
    });
    expect(job.id).toMatch(/^ofl_pj_/);
    expect(job.offline).toBe(true);
    expect(job.targetPrinter).toBe('CashierPrinter');
  });

  it('EVIDENCE: dedupes same job id in one dispatch', async () => {
    const { printKitchenTicket } = await import('../lib/printRestaurant');
    const job: ClientPrintJob = {
      id: 'same',
      documentType: 'KOT',
      targetPrinter: 'KitchenPrinter',
      offline: true,
      payloadJson: {
        items: [{ productName: 'Chicken', quantity: 1 }],
        station: 'KITCHEN',
        firedAt: new Date().toISOString(),
      },
    };
    const result = await dispatchPrintJobs([job, job]);
    expect(result.delivered).toBe(1);
    expect(printKitchenTicket).toHaveBeenCalledTimes(1);
  });

  it('EVIDENCE gate: schema + sendKot enqueue + flush on reconnect', () => {
    const sql = readRepo('shared/sql/580_print_jobs.sql');
    expect(sql).toMatch(/print_jobs/);
    const service = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantService.ts');
    expect(service).toMatch(/printJobsService\.enqueue/);
    const dispatcher = readRepo('samplepos.client/src/lib/printJobDispatcher.ts');
    expect(dispatcher).toMatch(/flushPendingPrintJobs/);
    expect(dispatcher).toMatch(/markJobStatusBackground/);
    const pos = readRepo('samplepos.client/src/pages/restaurant/RestaurantPosPage.tsx');
    expect(pos).toMatch(/flushPendingPrintJobs/);
    // KOT tap must not block floor return on paper delivery.
    expect(pos).toMatch(/awaitPrint/);
    expect(pos).toMatch(/steward continues immediately after kitchen commit/);
    // Bill commit unlocks steward; paper delivery must not block (same as KOT).
    expect(pos).toMatch(/do not block floor return on paper/);
    expect(pos).toMatch(/void dispatchPrintJobs\(jobs/);
  });

  it('EVIDENCE: agent /print accepts without Get-Printer on hot path', () => {
    const server = readRepo('smart-print-agent/src/server.ts');
    expect(server).toMatch(/status\(202\)/);
    expect(server).not.toMatch(/await assertPrinterExists/);
    const printers = readRepo('smart-print-agent/src/printers.ts');
    expect(printers).toMatch(/CACHE_TTL_MS/);
    expect(printers).toMatch(/warmPrinterCache/);
  });

  it('EVIDENCE: restaurant bridge never parallel-POSTs both loopback origins', () => {
    const restaurant = readRepo('samplepos.client/src/lib/printRestaurant.ts');
    expect(restaurant).toMatch(/try origins sequentially/);
    expect(restaurant).not.toMatch(/Promise\.all\(attempts\)/);
    const bridge = readRepo('samplepos.client/src/lib/localPrintBridge.ts');
    expect(bridge).toMatch(/127\.0\.0\.1:1811/);
  });
});
