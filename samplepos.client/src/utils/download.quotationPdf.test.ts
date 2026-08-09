/**
 * downloadFile — quotation PDF contract test.
 *
 * Pins the URL + filename shape used by the "Download PDF" button on
 * QuoteDetailPage. The endpoint is the central document dispatcher
 * (GET /api/documents/QUOTATION/:id), called via native fetch() with an
 * Authorization header. The server response MUST be a real PDF
 * (Content-Type contains "pdf") or the utility throws.
 *
 * Runs in Node.js default Vitest environment (no jsdom dependency needed).
 * window.URL, document, and fetch are stubbed via vi.stubGlobal so the
 * module-under-test behaves as-if in a browser. Mirrors the no-jsdom
 * convention already used by src/__tests__/sunmi-print.spec.ts.
 *
 * Together with the backend coverage of `renderQuotation` (already wired
 * in documentRenderer.ts) this gives a top-to-bottom proof that a user
 * can export a quotation as a PDF.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// getAccessToken must be hoisted so the mock factory can reference it.
const getAccessTokenMock = vi.hoisted(() => vi.fn(() => 'test-token'));
const refreshAccessTokenDedupedMock = vi.hoisted(() =>
  vi.fn().mockRejectedValue(new Error('no refresh')),
);
const forceLogoutRedirectMock = vi.hoisted(() => vi.fn());

vi.mock('../hooks/useTokenRefresh', () => ({
  getAccessToken: getAccessTokenMock,
  refreshAccessTokenDeduped: refreshAccessTokenDedupedMock,
  forceLogoutRedirect: forceLogoutRedirectMock,
}));

// ---------------------------------------------------------------------------
// Browser shims — built fresh per test so assertions stay isolated.
// ---------------------------------------------------------------------------
type AnchorStub = {
  href: string;
  download: string;
  click: ReturnType<typeof vi.fn>;
};

// fetchMock replaces globalThis.fetch — the implementation under test uses
// native fetch() NOT axios, so we stub at the global level.
const fetchMock = vi.hoisted(() => vi.fn());

function installBrowserShims() {
  const anchor: AnchorStub = { href: '', download: '', click: vi.fn() };
  const createObjectURL = vi.fn(() => 'blob:fake-url');
  const revokeObjectURL = vi.fn();
  const appendChild = vi.fn();
  const removeChild = vi.fn();

  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('window', { URL: { createObjectURL, revokeObjectURL } });
  vi.stubGlobal('document', {
    createElement: vi.fn((tag: string) => {
      if (tag === 'a') return anchor as unknown as HTMLAnchorElement;
      return {} as HTMLElement;
    }),
    body: { appendChild, removeChild },
  });

  return { anchor, createObjectURL, revokeObjectURL, appendChild, removeChild };
}

beforeEach(() => {
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

import { downloadFile } from './download';

describe('downloadFile — quotation PDF contract', () => {
  it('issues GET /api/documents/QUOTATION/:id with Authorization header', async () => {
    installBrowserShims();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: { get: (h: string) => h === 'content-type' ? 'application/pdf' : null },
      blob: async () => new Blob(['%PDF-1.7 test'], { type: 'application/pdf' }),
    });

    await downloadFile(
      '/documents/QUOTATION/quote-uuid-1',
      'quotation-Q-2026-0001.pdf',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, config] = fetchMock.mock.calls[0];
    // URL is env-prefixed (VITE_API_URL) — assert only the meaningful path suffix.
    expect(url as string).toContain('/api/documents/QUOTATION/quote-uuid-1');
    expect((config as RequestInit).headers).toEqual({ Authorization: 'Bearer test-token' });
  });

  it('triggers an <a download="…"> click with the requested filename', async () => {
    const { anchor, createObjectURL, revokeObjectURL } = installBrowserShims();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: { get: (h: string) => h === 'content-type' ? 'application/pdf' : null },
      blob: async () => new Blob(['%PDF-1.7 test'], { type: 'application/pdf' }),
    });

    await downloadFile('/documents/QUOTATION/q-1', 'quotation-Q-2026-0007.pdf');

    expect(anchor.download).toBe('quotation-Q-2026-0007.pdf');
    expect(anchor.href).toBe('blob:fake-url');
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
  });

  it('throws a descriptive error if the server did not return a PDF', async () => {
    installBrowserShims();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: { get: (h: string) => h === 'content-type' ? 'text/html' : null },
      clone: () => ({
        arrayBuffer: async () => new TextEncoder().encode('<html>Forbidden</html>').buffer,
      }),
      blob: vi.fn(),
    });

    await expect(
      downloadFile('/documents/QUOTATION/q-bad', 'quotation-bad.pdf'),
    ).rejects.toThrow(/did not return a PDF/i);
  });

  it('accepts PDF bytes when Content-Type header is missing', async () => {
    const { anchor } = installBrowserShims();
    const pdfBytes = new TextEncoder().encode('%PDF-1.7 quotation-test');
    fetchMock.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
      clone: () => ({
        arrayBuffer: async () => pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength),
      }),
      blob: async () => new Blob([pdfBytes], { type: 'application/pdf' }),
    });

    await downloadFile('/documents/QUOTATION/q-1', 'quotation-Q-2026-0007.pdf');
    expect(anchor.click).toHaveBeenCalledTimes(1);
  });

  it('throws when server returns a non-2xx status', async () => {
    installBrowserShims();
    vi.stubGlobal('navigator', { onLine: true });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => '{"error":"Unauthorized"}',
    });

    await expect(
      downloadFile('/documents/QUOTATION/missing', 'quotation-missing.pdf'),
    ).rejects.toThrow(/Session expired|401|Unauthorized/i);
    expect(forceLogoutRedirectMock).toHaveBeenCalled();
  });

  it('propagates network errors', async () => {
    installBrowserShims();
    fetchMock.mockRejectedValueOnce(new Error('Request failed with status code 404'));

    await expect(
      downloadFile('/documents/QUOTATION/missing', 'quotation-missing.pdf'),
    ).rejects.toThrow(/404/);
  });
});
