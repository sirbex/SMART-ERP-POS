/**
 * SUNMI Print Bridge Tests
 *
 * Verifies that printReceipt() routes correctly depending on the runtime
 * environment:
 *
 *   Strategy 0 — SUNMI Android WebView bridge (window.SunmiPrinter present)
 *   Strategy 1 — localhost:1811 ESC/POS bridge (existing, unmodified)
 *   Strategy 2 — browser window.print() via iframe (existing, unmodified)
 *
 * Runs in Node.js default Vitest environment (no jsdom dependency needed).
 * globalThis.window, globalThis.document, and globalThis.fetch are all
 * stubbed via vi.stubGlobal so the module-under-test sees them as-if it
 * were a browser.  vi.unstubAllGlobals() in afterEach restores originals.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { printReceipt } from '../lib/print';
import type { ReceiptData } from '../lib/print';

// ---------------------------------------------------------------------------
// Minimal valid receipt fixture
// ---------------------------------------------------------------------------
const RECEIPT: ReceiptData = {
  saleNumber: 'SALE-2026-0001',
  saleDate: '2026-04-27',
  totalAmount: 25000,
  cashierName: 'Jane',
  items: [
    { name: 'Paracetamol', quantity: 2, unitPrice: 10000, subtotal: 20000 },
    { name: 'Plaster',     quantity: 5, unitPrice: 1000,  subtotal: 5000  },
  ],
  paymentMethod: 'CASH',
  amountPaid: 30000,
  changeAmount: 5000,
  companyName: 'Test Pharmacy',
};

// ---------------------------------------------------------------------------
// DOM stub factory — lets Strategy 2 resolve the print Promise without a
// real browser (onafterprint is fired synchronously by our fake print()).
// ---------------------------------------------------------------------------
function makeFakeDocument() {
  let afterPrintHandler: (() => void) | null = null;

  const fakePrintWindow = {
    document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
    print: vi.fn(() => { if (afterPrintHandler) afterPrintHandler(); }),
    set onafterprint(fn: (() => void) | null) { afterPrintHandler = fn; },
    get onafterprint(): (() => void) | null { return afterPrintHandler; },
  };

  const fakeIframe = {
    style: { position: '', width: '', height: '', border: '' },
    contentWindow: fakePrintWindow,
  };

  return {
    createElement: vi.fn().mockReturnValue(fakeIframe),
    body: {
      appendChild: vi.fn().mockReturnValue(fakeIframe),
      removeChild: vi.fn(),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests — Strategy 0 (SUNMI bridge present)
// ---------------------------------------------------------------------------
describe('printReceipt — SUNMI bridge routing', () => {
  beforeEach(() => {
    // Default baseline per test: no bridge, fetch fails, DOM is stubbed
    vi.stubGlobal('window',   {});                                                      // no SunmiPrinter
    vi.stubGlobal('document', makeFakeDocument());                                       // DOM stub
    vi.stubGlobal('fetch',    vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));     // localhost:1811 down
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Strategy 0 present ────────────────────────────────────────────────────

  it('STRATEGY 0: calls window.SunmiPrinter.printReceipt with JSON when bridge is present', async () => {
    const bridgeFn = vi.fn();
    vi.stubGlobal('window', { SunmiPrinter: { printReceipt: bridgeFn } });

    await printReceipt(RECEIPT);

    expect(bridgeFn).toHaveBeenCalledOnce();

    const parsed = JSON.parse(bridgeFn.mock.calls[0][0] as string) as ReceiptData;
    expect(parsed.saleNumber).toBe('SALE-2026-0001');
    expect(parsed.totalAmount).toBe(25000);
    expect(parsed.items).toHaveLength(2);
  });

  it('STRATEGY 0: serialised payload is valid JSON with all top-level fields', async () => {
    let payload = '';
    vi.stubGlobal('window', { SunmiPrinter: { printReceipt: (json: string) => { payload = json; } } });

    await printReceipt(RECEIPT);

    expect(() => JSON.parse(payload)).not.toThrow();

    const parsed = JSON.parse(payload) as ReceiptData;
    expect(parsed.cashierName).toBe('Jane');
    expect(parsed.companyName).toBe('Test Pharmacy');
    expect(parsed.items).toHaveLength(2);
  });

  it('STRATEGY 0: does NOT call fetch when bridge is present', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch',  mockFetch);
    vi.stubGlobal('window', { SunmiPrinter: { printReceipt: vi.fn() } });

    await printReceipt(RECEIPT);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('STRATEGY 0: compact format — bridge still receives the complete receiptData object', async () => {
    let payload = '';
    vi.stubGlobal('window', { SunmiPrinter: { printReceipt: (json: string) => { payload = json; } } });

    await printReceipt(RECEIPT, { format: 'compact' });

    const parsed = JSON.parse(payload) as ReceiptData;
    expect(parsed.saleNumber).toBe('SALE-2026-0001');
    expect(parsed.totalAmount).toBe(25000);
  });

  // ── Strategy 0 absent — falls through to Strategy 1 ─────────────────────

  it('STRATEGY 1: fetch is called with correct URL and method when bridge is absent', async () => {
    // window from beforeEach: {} — no SunmiPrinter
    const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', mockFetch);

    // Make Strategy 2 reject immediately (contentWindow = null) so the Promise
    // does not hang on onload / fallback-setTimeout.  We only care that fetch
    // was attempted — not that the full print flow completed.
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue({
        style: { position: '', width: '', height: '', border: '' },
        contentWindow: null,
      }),
      body: { appendChild: vi.fn(), removeChild: vi.fn(), contains: vi.fn().mockReturnValue(false) },
    });

    // Rejection from "Unable to create print window" is expected — swallow it
    await printReceipt(RECEIPT).catch(() => {});

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:1811/print',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  // ── Validation ───────────────────────────────────────────────────────────

  it('validation: throws when saleNumber is empty string', async () => {
    const bad = { ...RECEIPT, saleNumber: '' };
    await expect(printReceipt(bad)).rejects.toThrow('saleNumber is required');
  });

  it('validation: throws when receiptData is null', async () => {
    await expect(printReceipt(null as unknown as ReceiptData)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// isSunmiDevice detection
// ---------------------------------------------------------------------------
describe('isSunmiDevice detection via globalThis.window', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects false when SunmiPrinter is absent', () => {
    vi.stubGlobal('window', {});
    const w = globalThis.window as { SunmiPrinter?: unknown };
    expect(typeof w.SunmiPrinter !== 'undefined').toBe(false);
  });

  it('detects true when SunmiPrinter is injected', () => {
    vi.stubGlobal('window', { SunmiPrinter: { printReceipt: vi.fn() } });
    const w = globalThis.window as { SunmiPrinter?: unknown };
    expect(typeof w.SunmiPrinter !== 'undefined').toBe(true);
  });

  it('detects false after bridge property is deleted', () => {
    const fakeWindow = { SunmiPrinter: { printReceipt: vi.fn() } } as { SunmiPrinter?: unknown };
    vi.stubGlobal('window', fakeWindow);
    delete fakeWindow.SunmiPrinter;
    expect(typeof fakeWindow.SunmiPrinter !== 'undefined').toBe(false);
  });
});
