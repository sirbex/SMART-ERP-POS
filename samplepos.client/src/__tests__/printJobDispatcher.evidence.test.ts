/**
 * EVIDENCE: re-login must not re-paper tickets already delivered on this terminal.
 * Run: npx vitest run src/__tests__/printJobDispatcher.evidence.test.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const store = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, String(v));
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => {
    store.clear();
  },
  key: () => null,
  get length() {
    return store.size;
  },
});

function readSrc(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('EVIDENCE — print job delivered cache + logout race', () => {
  beforeEach(() => {
    store.clear();
    vi.resetModules();
  });

  it('source: local delivered cache + awaitStatusSync + keepalive PATCH', () => {
    const dispatcher = readSrc('lib/printJobDispatcher.ts');
    expect(dispatcher).toMatch(/pos\.printJobs\.delivered\.v1/);
    expect(dispatcher).toMatch(/rememberPrintJobDelivered/);
    expect(dispatcher).toMatch(/wasPrintJobDeliveredLocally/);
    expect(dispatcher).toMatch(/awaitStatusSync/);
    expect(dispatcher).toMatch(/keepalive:\s*true/);
    expect(dispatcher).toMatch(/silentErrorToast:\s*true/);
    expect(dispatcher).toMatch(/wasPrintJobDeliveredLocally\(j\.id\)/);
  });

  it('source: FOH awaits spool confirm; flush once per online session', () => {
    const pos = readSrc('pages/restaurant/RestaurantPosPage.tsx');
    expect(pos).toMatch(/printFlushOnceRef/);
    expect(pos).toMatch(/awaitPrint:\s*true/);
    expect(pos).toMatch(/awaitStatusSync:\s*true/);
    expect(pos).toMatch(/decideRestaurantFohAutoLogout/);
    expect(pos).toMatch(/silentForbidden:\s*true/);
  });

  it('runtime: delivered cache skips re-dispatch of same job id', async () => {
    vi.doMock('../lib/printRestaurant', () => ({
      printKitchenTicket: vi.fn(async () => undefined),
      printRestaurantBill: vi.fn(async () => undefined),
    }));
    vi.doMock('../utils/api', () => ({
      api: {
        printJobs: {
          updateStatus: vi.fn(async () => ({ data: { success: true } })),
          listPending: vi.fn(async () => ({ data: { data: [] } })),
        },
      },
    }));

    const {
      rememberPrintJobDelivered,
      wasPrintJobDeliveredLocally,
      normalizePrintJob,
      dispatchPrintJobs,
    } = await import('../lib/printJobDispatcher');

    const job = normalizePrintJob({
      id: 'job-abc',
      documentType: 'KOT',
      targetPrinter: 'Kitchen',
      payloadJson: {
        items: [{ productName: 'Steak', quantity: 1 }],
        kotNumber: 'K1',
        station: 'KITCHEN',
        tableLabel: 'T1',
      },
      offline: true,
    });
    expect(job).not.toBeNull();
    rememberPrintJobDelivered(job!.id);
    expect(wasPrintJobDeliveredLocally(job!.id)).toBe(true);

    const result = await dispatchPrintJobs([job!]);
    expect(result.delivered).toBe(0);
    expect(result.failures).toBe(0);
  }, 15_000);

  it('ownership 403 keeps waiter-specific message', async () => {
    const { friendlyHttpErrorMessage } = await import('../utils/errorHandler');
    const owned =
      'This table belongs to another waiter. Ask a manager to reassign, or use a role with Edit others / Pay.';
    expect(friendlyHttpErrorMessage(403, owned)).toBe(owned);
    expect(friendlyHttpErrorMessage(403, 'Insufficient permissions')).toMatch(/permission/i);
  });
});
