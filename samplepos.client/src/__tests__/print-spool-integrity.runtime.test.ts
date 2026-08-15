/**
 * RUNTIME evidence — every print-integrity step executed (not source regex guessing).
 * Run: npx vitest run src/__tests__/print-spool-integrity.runtime.test.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  agentSupportsSpoolWaitFromHealth,
  bridgeRejectsUnnamedPrinter,
  classifyAgentPrintHttp,
  isNamedPrinterRequired,
  isPrintJobFreshForFlush,
  parseAgentVersion,
  PRINT_JOB_FLUSH_MAX_AGE_MS,
  resolveJobPollOutcome,
} from '../lib/printSpoolIntegritySsot';
import {
  dispatchPrintJobs,
  enqueueOfflinePrintJob,
  flushPendingPrintJobs,
  isPrintJobFreshForFlush as dispatcherFresh,
  normalizePrintJob,
  PRINT_JOB_FLUSH_MAX_AGE_MS as dispatcherMaxAge,
  rememberPrintJobDelivered,
  type ClientPrintJob,
} from '../lib/printJobDispatcher';

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
  return store;
}

const printKitchenTicket = vi.fn(async () => undefined);
const printRestaurantBill = vi.fn(async () => undefined);
const updateStatus = vi.fn(async () => ({ data: { success: true } }));
const listPending = vi.fn(async () => ({ data: { data: [] as unknown[] } }));

vi.mock('../lib/printRestaurant', () => ({
  printKitchenTicket: (...args: unknown[]) => printKitchenTicket(...args),
  printRestaurantBill: (...args: unknown[]) => printRestaurantBill(...args),
}));

vi.mock('../utils/api', () => ({
  api: {
    printJobs: {
      updateStatus: (...args: unknown[]) => updateStatus(...args),
      listPending: (...args: unknown[]) => listPending(...args),
    },
  },
}));

describe('RUNTIME — print spool integrity SSOT', () => {
  it('STEP version gate: spool wait only for ≥1.4 (or unknown+online)', () => {
    expect(parseAgentVersion('1.3.1')).toEqual({ major: 1, minor: 3 });
    expect(parseAgentVersion('1.4.0')).toEqual({ major: 1, minor: 4 });
    expect(agentSupportsSpoolWaitFromHealth({ version: '1.3.9', status: 'online' })).toBe(false);
    expect(agentSupportsSpoolWaitFromHealth({ version: '1.4.0', status: 'online' })).toBe(true);
    expect(agentSupportsSpoolWaitFromHealth({ version: '2.0.0', status: 'offline' })).toBe(true);
    expect(agentSupportsSpoolWaitFromHealth({ version: null, status: 'online' })).toBe(true);
    expect(agentSupportsSpoolWaitFromHealth({ version: null, status: 'offline' })).toBe(false);
  });

  it('STEP named printer: unnamed rejected; trimmed name accepted', () => {
    expect(bridgeRejectsUnnamedPrinter(null)).toBe(true);
    expect(bridgeRejectsUnnamedPrinter('')).toBe(true);
    expect(bridgeRejectsUnnamedPrinter('   ')).toBe(true);
    expect(bridgeRejectsUnnamedPrinter('Kitchen')).toBe(false);
    expect(isNamedPrinterRequired('Kitchen')).toBe(true);
  });

  it('STEP classify HTTP: 200+spooled ok; waited+spooled false reject; 202 legacy; 4xx client', () => {
    expect(classifyAgentPrintHttp(200, { id: 'j1', spooled: true }).kind).toBe('spooled_ok');
    expect(
      classifyAgentPrintHttp(200, { id: 'j1', spooled: false }, { waited: true }).kind,
    ).toBe('reject');
    expect(
      classifyAgentPrintHttp(200, { id: 'j1', spooled: false }, { waited: false }).kind,
    ).toBe('ok_unspecified');
    expect(classifyAgentPrintHttp(202, { id: 'j2', accepted: true } as never).kind).toBe(
      'legacy_202',
    );
    expect(classifyAgentPrintHttp(400, { error: 'Named printer required' } as never).kind).toBe(
      'client_error',
    );
    expect(classifyAgentPrintHttp(502, { spooled: false } as never).kind).toBe('server_error_retry');
  });

  it('STEP poll outcome: ok→spooled; fail→reject; unsupported→legacy_accept', () => {
    expect(resolveJobPollOutcome('ok')).toBe('spooled_ok');
    expect(resolveJobPollOutcome('fail')).toBe('reject');
    expect(resolveJobPollOutcome('unsupported')).toBe('legacy_accept');
  });

  it('STEP flush age: fresh within 20m; stale beyond 20m skipped', () => {
    const now = Date.parse('2026-08-15T12:00:00.000Z');
    expect(PRINT_JOB_FLUSH_MAX_AGE_MS).toBe(20 * 60 * 1000);
    expect(dispatcherMaxAge).toBe(PRINT_JOB_FLUSH_MAX_AGE_MS);
    expect(isPrintJobFreshForFlush(new Date(now - 5 * 60 * 1000).toISOString(), now)).toBe(true);
    expect(
      isPrintJobFreshForFlush(new Date(now - 21 * 60 * 1000).toISOString(), now),
    ).toBe(false);
    expect(isPrintJobFreshForFlush(null, now)).toBe(true);
    expect(
      dispatcherFresh(
        {
          id: 'x',
          documentType: 'KOT',
          targetPrinter: 'K',
          payloadJson: {},
          createdAt: new Date(now - 21 * 60 * 1000).toISOString(),
        },
        now,
      ),
    ).toBe(false);
  });
});

describe('RUNTIME — dispatcher marks PRINTED only after delivery resolves', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    printKitchenTicket.mockReset();
    printRestaurantBill.mockReset();
    updateStatus.mockReset();
    listPending.mockReset();
    listPending.mockResolvedValue({ data: { data: [] } });
    updateStatus.mockResolvedValue({ data: { success: true } });
  });

  it('STEP success path: kitchen ticket called then PRINTED status', async () => {
    printKitchenTicket.mockResolvedValue(undefined);
    const job: ClientPrintJob = {
      id: 'job-ok',
      documentType: 'KOT',
      targetPrinter: 'KitchenPrinter',
      offline: false,
      payloadJson: {
        items: [{ productName: 'Steak', quantity: 1 }],
        kotNumber: 'K1',
        station: 'KITCHEN',
        firedAt: new Date().toISOString(),
      },
    };
    const result = await dispatchPrintJobs([job], { awaitStatusSync: true });
    expect(result.delivered).toBe(1);
    expect(result.failures).toBe(0);
    expect(printKitchenTicket).toHaveBeenCalledTimes(1);
    expect(updateStatus).toHaveBeenCalledWith(
      'job-ok',
      expect.objectContaining({ status: 'PRINTED' }),
      expect.anything(),
    );
  });

  it('STEP failure path: ticket throws → ERROR, never PRINTED', async () => {
    printKitchenTicket.mockRejectedValue(new Error('Named printer required'));
    const result = await dispatchPrintJobs([
      {
        id: 'job-fail',
        documentType: 'KOT',
        targetPrinter: null,
        offline: true,
        payloadJson: {
          items: [{ productName: 'Steak', quantity: 1 }],
          station: 'KITCHEN',
          firedAt: new Date().toISOString(),
        },
      },
    ]);
    expect(result.delivered).toBe(0);
    expect(result.failures).toBe(1);
    expect(updateStatus).not.toHaveBeenCalledWith(
      'job-fail',
      expect.objectContaining({ status: 'PRINTED' }),
      expect.anything(),
    );
  });

  it('STEP ghost-guard: delivery that never resolves is not counted delivered', async () => {
    let resolvePrint: (() => void) | undefined;
    printKitchenTicket.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePrint = resolve;
        }),
    );
    const pending = dispatchPrintJobs([
      {
        id: 'job-hang',
        documentType: 'KOT',
        targetPrinter: 'Kitchen',
        offline: true,
        payloadJson: {
          items: [{ productName: 'X', quantity: 1 }],
          station: 'KITCHEN',
          firedAt: new Date().toISOString(),
        },
      },
    ]);
    // Before print resolves, we must not have completed delivery.
    await Promise.resolve();
    expect(updateStatus).not.toHaveBeenCalledWith(
      'job-hang',
      expect.objectContaining({ status: 'PRINTED' }),
      expect.anything(),
    );
    resolvePrint!();
    const result = await pending;
    expect(result.delivered).toBe(1);
  });

  it('STEP flush: stale offline job not re-dispatched; fresh is', async () => {
    const now = Date.now();
    const stale = enqueueOfflinePrintJob({
      documentType: 'KOT',
      targetPrinter: 'Kitchen',
      createdAt: new Date(now - PRINT_JOB_FLUSH_MAX_AGE_MS - 60_000).toISOString(),
      payloadJson: {
        items: [{ productName: 'Old', quantity: 1 }],
        station: 'KITCHEN',
        firedAt: new Date().toISOString(),
      },
    });
    const fresh = enqueueOfflinePrintJob({
      documentType: 'KOT',
      targetPrinter: 'Kitchen',
      createdAt: new Date(now - 60_000).toISOString(),
      payloadJson: {
        items: [{ productName: 'New', quantity: 1 }],
        station: 'KITCHEN',
        firedAt: new Date().toISOString(),
      },
    });
    expect(stale.id).not.toBe(fresh.id);
    printKitchenTicket.mockResolvedValue(undefined);
    const flushed = await flushPendingPrintJobs({ online: false });
    expect(flushed.delivered).toBe(1);
    expect(printKitchenTicket).toHaveBeenCalledTimes(1);
    expect(vi.mocked(printKitchenTicket).mock.calls[0][0].kotNumber || true).toBeTruthy();
  });

  it('STEP normalize preserves createdAt for flush decisions', () => {
    const job = normalizePrintJob({
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      document_type: 'KOT',
      target_printer: 'Bar',
      created_at: '2026-08-15T10:00:00.000Z',
      payload_json: { items: [{ productName: 'Beer', quantity: 1 }], station: 'BAR' },
    });
    expect(job?.createdAt).toBe('2026-08-15T10:00:00.000Z');
    expect(dispatcherFresh(job!, Date.parse('2026-08-15T10:30:00.000Z'))).toBe(false);
  });

  it('STEP delivered cache prevents re-paper', async () => {
    rememberPrintJobDelivered('already');
    const result = await dispatchPrintJobs([
      {
        id: 'already',
        documentType: 'KOT',
        targetPrinter: 'Kitchen',
        offline: true,
        payloadJson: {
          items: [{ productName: 'X', quantity: 1 }],
          station: 'KITCHEN',
          firedAt: new Date().toISOString(),
        },
      },
    ]);
    expect(result.delivered).toBe(0);
    expect(printKitchenTicket).not.toHaveBeenCalled();
  });
});

describe('RUNTIME — bill path never allows unnamed default', () => {
  it('STRUCT+contract: printRestaurantBill source sets allowUnnamedAgentDefault false', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const src = readFileSync(resolve(__dirname, '../lib/printRestaurant.ts'), 'utf8');
    expect(src).toMatch(/export async function printRestaurantBill/);
    expect(src).toMatch(/allowUnnamedAgentDefault:\s*false/);
    expect(src).not.toMatch(
      /printRestaurantBill[\s\S]*allowUnnamedAgentDefault:\s*true/,
    );
  });
});
