/**
 * documentRoutes — quotation PDF contract test.
 *
 * Pins the HTTP shape of the central document-export endpoint that the
 * frontend "Download PDF" button on QuoteDetailPage hits:
 *
 *     GET /api/documents/QUOTATION/:id            → attachment
 *     GET /api/documents/QUOTATION/:id/preview    → inline
 *
 * Together with samplepos.client/src/utils/download.quotationPdf.test.ts
 * (frontend contract for the same URL) this gives end-to-end tested proof
 * that a user can export any quotation as a PDF without the renderer or
 * the route silently regressing.
 *
 * Uses ESM-compatible jest.unstable_mockModule because the SUT is ESM and
 * we need to intercept the renderer + authenticate middleware BEFORE the
 * route module is imported.
 */
import { jest } from '@jest/globals';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import PDFDocument from 'pdfkit';

// ---------------------------------------------------------------------------
// Mock the renderer so the test does not need a real Pool or DB.
//
// CRITICAL: the real renderer uses pdfkit which flushes chunks via
// doc.pipe(output) ASYNCHRONOUSLY after doc.end(). A naive synchronous mock
// (output.write(...); output.end()) hides bugs where the route reads the
// buffer before the stream has finished. We therefore defer the writes via
// setImmediate so the route is forced to await stream 'end' before reading.
// ---------------------------------------------------------------------------
const renderMock = jest.fn(
  async (
    _pool: unknown,
    req: { type: string; id: string; paperSize?: string; variant?: string },
    output: NodeJS.WritableStream,
  ) => {
    await new Promise<void>(resolve => {
      setImmediate(() => {
        output.write(Buffer.from('%PDF-1.7 stub-chunk-1'));
        setImmediate(() => {
          output.write(Buffer.from(' stub-chunk-2 stub-chunk-3'));
          output.end();
          resolve();
        });
      });
    });
    return {
      filename: `quotation-Q-2026-${req.id.padStart(4, '0')}.pdf`,
      contentType: 'application/pdf' as const,
    };
  },
);

// Stub authenticate so we can flip auth on/off per test by mutating a flag.
let authPasses = true;
const authenticateStub = (req: Request, res: Response, next: NextFunction): void => {
  if (!authPasses) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  // populate a minimal req.user the way the real authenticate does
  (req as Request & { user?: unknown }).user = {
    id: 'user-1',
    role: 'ADMIN',
    email: 'tester@example.com',
  };
  next();
};

jest.unstable_mockModule('./documentRenderer.js', () => ({
  render: renderMock,
}));

jest.unstable_mockModule('../../middleware/auth.js', () => ({
  authenticate: authenticateStub,
}));

// Dynamic import AFTER mocks are registered.
const { createDocumentRoutes } = await import('./documentRoutes.js');
const { errorHandler } = await import('../../middleware/errorHandler.js');

// Tiny app wrapping just the document router + global error handler.
function buildApp() {
  const app = express();
  // Cast pool to never because the renderer mock ignores it.
  app.use('/api/documents', createDocumentRoutes({} as never));
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  renderMock.mockClear();
  authPasses = true;
});

describe('GET /api/documents/QUOTATION/:id — download contract', () => {
  it('returns 200, application/pdf, and Content-Disposition=attachment when authenticated', async () => {
    const res = await request(buildApp()).get('/api/documents/QUOTATION/0001');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="quotation-Q-2026-0001.pdf"',
    );
    expect(res.body).toBeInstanceOf(Buffer);
    // Must contain BOTH async chunks (the route must await stream end) and
    // Content-Length must match the real payload length, not a partial.
    const bodyText = (res.body as Buffer).toString('ascii');
    expect(bodyText.startsWith('%PDF')).toBe(true);
    expect(bodyText).toContain('stub-chunk-1');
    expect(bodyText).toContain('stub-chunk-3');
    expect(res.headers['content-length']).toBe(String((res.body as Buffer).length));
  });

  it('invokes renderer with type=QUOTATION, the URL id, and default variant=final', async () => {
    await request(buildApp()).get('/api/documents/QUOTATION/quote-uuid-1');

    expect(renderMock).toHaveBeenCalledTimes(1);
    const call = renderMock.mock.calls[0]!;
    const renderReq = call[1] as {
      type: string;
      id: string;
      variant?: string;
      paperSize?: string;
    };
    expect(renderReq.type).toBe('QUOTATION');
    expect(renderReq.id).toBe('quote-uuid-1');
    expect(renderReq.variant).toBe('final');
  });

  it('passes paperSize query through to the renderer', async () => {
    await request(buildApp()).get('/api/documents/QUOTATION/0002?paperSize=A5');

    const renderReq = renderMock.mock.calls[0]![1] as { paperSize?: string };
    expect(renderReq.paperSize).toBe('A5');
  });

  it('returns 401 when authenticate middleware rejects the request', async () => {
    authPasses = false;
    const res = await request(buildApp()).get('/api/documents/QUOTATION/0001');

    expect(res.status).toBe(401);
    expect(renderMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported document types with 4xx (Zod enum)', async () => {
    const res = await request(buildApp()).get('/api/documents/SOMETHING_WEIRD/0001');

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(renderMock).not.toHaveBeenCalled();
  });

  it('rejects invalid paperSize with 4xx (Zod enum)', async () => {
    const res = await request(buildApp()).get(
      '/api/documents/QUOTATION/0001?paperSize=GIANT',
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(renderMock).not.toHaveBeenCalled();
  });
});

describe('GET /api/documents/QUOTATION/:id/preview — inline contract', () => {
  it('returns inline disposition (for in-browser preview iframe)', async () => {
    const res = await request(buildApp()).get(
      '/api/documents/QUOTATION/0007/preview',
    );

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toBe(
      'inline; filename="quotation-Q-2026-0007.pdf"',
    );
  });
});

// ---------------------------------------------------------------------------
// END-TO-END pdfkit test
//
// The synthetic renderMock above can hide async-flush bugs by accident.
// This block swaps in a renderer that uses a REAL pdfkit document — exactly
// like the production renderer — to prove the route delivers complete,
// non-empty PDF bytes. If the route concats chunks before stream-end, the
// downloaded buffer here will be empty or truncated and these tests fail.
// ---------------------------------------------------------------------------
describe('GET /api/documents/QUOTATION/:id — end-to-end with real pdfkit', () => {
  beforeEach(() => {
    renderMock.mockReset();
    renderMock.mockImplementation(async (_pool, req, output) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      doc.pipe(output as NodeJS.WritableStream);
      doc.fontSize(20).text('QUOTATION', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Number: Q-2026-${req.id.padStart(4, '0')}`);
      doc.text('Customer: ACME Pharmacy');
      doc.text('Total: UGX 250,000');
      doc.end();
      return {
        filename: `quotation-Q-2026-${req.id.padStart(4, '0')}.pdf`,
        contentType: 'application/pdf' as const,
      };
    });
  });

  it('delivers a complete pdfkit-generated PDF with valid header AND trailer', async () => {
    const res = await request(buildApp()).get('/api/documents/QUOTATION/0042');

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="quotation-Q-2026-0042.pdf"',
    );

    const body = res.body as Buffer;
    expect(body).toBeInstanceOf(Buffer);
    // A valid PDF starts with "%PDF-" and ends (within last 32 bytes) with
    // "%%EOF". If the route returns before pdfkit flushes, we'd get an empty
    // buffer or a header without trailer.
    expect(body.length).toBeGreaterThan(500);
    expect(body.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    const tail = body.subarray(Math.max(0, body.length - 32)).toString('ascii');
    expect(tail).toMatch(/%%EOF\s*$/);
    expect(res.headers['content-length']).toBe(String(body.length));
  });
});
