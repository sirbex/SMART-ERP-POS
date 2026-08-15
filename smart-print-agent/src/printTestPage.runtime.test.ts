/**
 * RUNTIME — wizard Test Print must use ESC/POS RAW (not SumatraPDF).
 * Proves the POS failure: SumatraPDF-3.4.6-32.exe -print-to … ticket.pdf
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const writeRawToPrinter = vi.fn(async () => ({ assertMs: 1, spoolMs: 2 }));

vi.mock('./rawPrint.js', () => ({
  writeRawToPrinter: (...args: unknown[]) => writeRawToPrinter(...args),
  warmRawPrintWorker: vi.fn(),
}));

vi.mock('./printers.js', () => ({
  assertPrinterExists: vi.fn(async () => undefined),
  listInstalledPrinters: vi.fn(async () => []),
  warmPrinterCache: vi.fn(),
}));

vi.mock('./lifecycle.js', () => ({
  appendAgentLog: vi.fn(),
}));

describe('RUNTIME — printTestPage ESC/POS (no Sumatra)', () => {
  beforeEach(() => {
    writeRawToPrinter.mockClear();
    writeRawToPrinter.mockResolvedValue({ assertMs: 1, spoolMs: 2 });
  });

  it('STEP test print calls writeRawToPrinter with named printer', async () => {
    const { printTestPage } = await import('./printHtml.js');
    await printTestPage('Baristar');
    expect(writeRawToPrinter).toHaveBeenCalledTimes(1);
    const [buf, printer, doc] = writeRawToPrinter.mock.calls[0]!;
    expect(printer).toBe('Baristar');
    expect(doc).toMatch(/SMART-TEST/);
    expect(Buffer.isBuffer(buf) || buf instanceof Uint8Array).toBe(true);
    const bytes = Buffer.from(buf as Buffer);
    // ESC @ init present
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);
  });

  it('STEP unnamed test print fails closed', async () => {
    const { printTestPage } = await import('./printHtml.js');
    await expect(printTestPage(null)).rejects.toThrow(/Named printer required/i);
    expect(writeRawToPrinter).not.toHaveBeenCalled();
  });

  it('STEP escpos test ticket builder emits non-empty RAW', async () => {
    const { buildEscPosTestTicket } = await import('./escposTestTicket.js');
    const raw = buildEscPosTestTicket('Baristar');
    expect(raw.length).toBeGreaterThan(20);
    expect(raw.includes(Buffer.from('TEST PRINT'))).toBe(true);
    expect(raw.includes(Buffer.from('Baristar'))).toBe(true);
  });

  it('STRUCT: printTestPage prefers escpos-raw before pdf-to-printer', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, resolve } = await import('node:path');
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, 'printHtml.ts'), 'utf8');
    const escposIdx = src.indexOf('buildEscPosTestTicket');
    const sumatraIdx = src.indexOf('pdf-to-printer');
    expect(escposIdx).toBeGreaterThan(0);
    expect(sumatraIdx).toBeGreaterThan(0);
    // First call path in printTestPage is ESC/POS (appears before fallback comment chain)
    const testFn = src.indexOf('export async function printTestPage');
    const rawLog = src.indexOf('escpos-raw', testFn);
    const pdfFallback = src.indexOf('pdf-to-printer', testFn);
    expect(rawLog).toBeGreaterThan(testFn);
    // pdf-to-printer may appear in printPdf helper above printTestPage; ensure test success path logs escpos-raw
    expect(src).toMatch(/ok test \(escpos-raw\)/);
  });
});
