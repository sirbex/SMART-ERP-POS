/**
 * PRE-INSTALL ACCEPTANCE — SMART Print Agent 1.4.0
 * Expert gate before shipping Setup.exe to tenants.
 * Run: npx vitest run
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const rolesState = {
  receipt: null as string | null,
  kitchen: null as string | null,
  bar: null as string | null,
};

vi.mock('./printHtml.js', () => ({
  printHtmlDocument: vi.fn(async () => undefined),
  printTestPage: vi.fn(async () => undefined),
}));

vi.mock('./rawPrint.js', () => ({
  writeRawToPrinter: vi.fn(async () => ({ assertMs: 1, spoolMs: 2 })),
  warmRawPrintWorker: vi.fn(),
}));

vi.mock('./printers.js', () => ({
  listInstalledPrinters: vi.fn(async () => [
    { name: 'KitchenPrinter', isDefault: false },
    { name: 'ReceiptPrinter', isDefault: true },
  ]),
  warmPrinterCache: vi.fn(),
  assertPrinterExists: vi.fn(async () => undefined),
}));

vi.mock('./printerRoles.js', () => ({
  isSetupComplete: () => true,
  markSetupComplete: vi.fn(),
  readInstallMeta: () => ({ channel: 'commercial', bundledNode: true }),
  readPrinterRoles: () => ({ ...rolesState }),
  writePrinterRoles: vi.fn((x: { receipt?: string | null; kitchen?: string | null; bar?: string | null }) => {
    rolesState.receipt = x.receipt ?? null;
    rolesState.kitchen = x.kitchen ?? null;
    rolesState.bar = x.bar ?? null;
    return { ...rolesState };
  }),
}));

vi.mock('./lifecycle.js', () => ({
  agentUptimeSeconds: () => 42,
  appendAgentLog: vi.fn(),
  getLogFilePath: () => '/tmp/agent.log',
  readAgentLogTail: () => 'boot ok',
  scheduleSelfRestart: vi.fn(),
  ensureLogDir: vi.fn(),
}));

vi.mock('./cashdrawer.js', () => ({
  openCashDrawer: vi.fn(async () => undefined),
}));

describe('PRE-INSTALL — version / package consistency', () => {
  it('config, package.json, and installer ISS share 1.4.0', () => {
    const config = readFileSync(resolve(here, 'config.ts'), 'utf8');
    const pkg = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8')) as {
      version: string;
    };
    const iss = readFileSync(
      resolve(here, '../../installer/SMART-ERP-POS-PrintService.iss'),
      'utf8',
    );
    expect(config).toMatch(/AGENT_VERSION = '1\.4\.0'/);
    expect(pkg.version).toBe('1.4.0');
    expect(iss).toMatch(/MyAppVersion "1\.4\.0"/);
  });

  it('RAW path asserts full WritePrinter byte count (no silent partial)', () => {
    const src = readFileSync(resolve(here, 'rawPrint.ts'), 'utf8');
    expect(src).toMatch(/WritePrinter partial write/);
    expect(src).toMatch(/\$written -ne \$bytes\.Length/);
  });
});

describe('PRE-INSTALL — agent HTTP + spool integrity', () => {
  let server: Server | null = null;
  let baseUrl = '';

  beforeEach(async () => {
    vi.resetModules();
    rolesState.receipt = null;
    rolesState.kitchen = null;
    rolesState.bar = null;

    const { writeRawToPrinter } = await import('./rawPrint.js');
    const { printHtmlDocument } = await import('./printHtml.js');
    vi.mocked(writeRawToPrinter).mockReset();
    vi.mocked(writeRawToPrinter).mockResolvedValue({ assertMs: 1, spoolMs: 2 });
    vi.mocked(printHtmlDocument).mockReset();
    vi.mocked(printHtmlDocument).mockResolvedValue(undefined);

    const { createAgentApp } = await import('./server.js');
    const app = createAgentApp();
    await new Promise<void>((resolveListen) => {
      server = app.listen(0, '127.0.0.1', () => resolveListen());
    });
    const addr = server!.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolveClose, reject) => {
        server!.close((err) => (err ? reject(err) : resolveClose()));
      });
      server = null;
    }
  });

  it('health online + version 1.4.0 + escpos format', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      version: string;
      formats: string[];
      name: string;
    };
    expect(body.status).toBe('online');
    expect(body.version).toBe('1.4.0');
    expect(body.formats).toEqual(expect.arrayContaining(['html', 'escpos']));
    expect(body.name).toMatch(/Print Agent/i);
  });

  it('reject unnamed ESC/POS (ghost PDF path closed)', async () => {
    const res = await fetch(`${baseUrl}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Print-Format': 'escpos' },
      body: Buffer.from([0x1b, 0x40]),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/Named printer required/i);
  });

  it('reject unnamed HTML', async () => {
    const res = await fetch(`${baseUrl}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: '<html><body>bill</body></html>',
    });
    expect(res.status).toBe(400);
  });

  it('reject empty ESC/POS body', async () => {
    const res = await fetch(`${baseUrl}/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Print-Format': 'escpos',
        'X-Printer-Name': 'KitchenPrinter',
      },
      body: Buffer.alloc(0),
    });
    expect(res.status).toBe(400);
  });

  it('reject empty HTML body', async () => {
    const res = await fetch(`${baseUrl}/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/html',
        'X-Printer-Name': 'ReceiptPrinter',
      },
      body: '   ',
    });
    expect(res.status).toBe(400);
  });

  it('wizard kitchen role satisfies name when header omitted', async () => {
    rolesState.kitchen = 'KitchenPrinter';
    const res = await fetch(`${baseUrl}/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Print-Format': 'escpos',
        'X-Print-Wait': 'spool',
      },
      body: Buffer.from([0x1b, 0x40]),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { spooled: boolean; printerName: string };
    expect(body.spooled).toBe(true);
    expect(body.printerName).toBe('KitchenPrinter');
  });

  it('X-Print-Wait spool → 200 + SPOOL_OK job record', async () => {
    const res = await fetch(`${baseUrl}/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Print-Format': 'escpos',
        'X-Printer-Name': 'KitchenPrinter',
        'X-Print-Wait': 'spool',
      },
      body: Buffer.from([0x1b, 0x40, 0x0a]),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      spooled: boolean;
      id: string;
      status: string;
    };
    expect(body.success).toBe(true);
    expect(body.spooled).toBe(true);
    expect(body.status).toBe('SPOOL_OK');

    const jobRes = await fetch(`${baseUrl}/print/jobs/${body.id}`);
    expect(jobRes.status).toBe(200);
    const jobBody = (await jobRes.json()) as { job: { status: string; printerName: string } };
    expect(jobBody.job.status).toBe('SPOOL_OK');
    expect(jobBody.job.printerName).toBe('KitchenPrinter');
  });

  it('HTML wait spool → 200 spooled', async () => {
    const { printHtmlDocument } = await import('./printHtml.js');
    const res = await fetch(`${baseUrl}/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Printer-Name': 'ReceiptPrinter',
        'X-Print-Wait': 'spool',
      },
      body: '<html><body>GUEST BILL</body></html>',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { spooled: boolean; format: string };
    expect(body.spooled).toBe(true);
    expect(body.format).toBe('html');
    expect(printHtmlDocument).toHaveBeenCalled();
  });

  it('spool failure → 502 (never success:true)', async () => {
    const { writeRawToPrinter } = await import('./rawPrint.js');
    vi.mocked(writeRawToPrinter).mockRejectedValueOnce(new Error('WritePrinter failed'));

    const res = await fetch(`${baseUrl}/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Print-Format': 'escpos',
        'X-Printer-Name': 'KitchenPrinter',
        'X-Print-Wait': 'spool',
      },
      body: Buffer.from([0x1b, 0x40]),
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { success: boolean; spooled: boolean };
    expect(body.success).toBe(false);
    expect(body.spooled).toBe(false);
  });

  it('legacy 202 accept then job reaches SPOOL_OK (poll path)', async () => {
    const res = await fetch(`${baseUrl}/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Print-Format': 'escpos',
        'X-Printer-Name': 'KitchenPrinter',
      },
      body: Buffer.from([0x1b, 0x40]),
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { id: string; spooled: boolean; accepted: boolean };
    expect(body.accepted).toBe(true);
    expect(body.spooled).toBe(false);

    let status = '';
    for (let i = 0; i < 40; i++) {
      const jobRes = await fetch(`${baseUrl}/print/jobs/${body.id}`);
      const jobBody = (await jobRes.json()) as { job: { status: string } };
      status = jobBody.job.status;
      if (status === 'SPOOL_OK') break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(status).toBe('SPOOL_OK');
  });

  it('unknown job id → 404', async () => {
    const res = await fetch(`${baseUrl}/print/jobs/does-not-exist`);
    expect(res.status).toBe(404);
  });

  it('concurrent spool waits both succeed (no cross-talk)', async () => {
    const payloads = [Buffer.from([0x1b, 0x40, 0x01]), Buffer.from([0x1b, 0x40, 0x02])];
    const results = await Promise.all(
      payloads.map((body) =>
        fetch(`${baseUrl}/print`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Print-Format': 'escpos',
            'X-Printer-Name': 'KitchenPrinter',
            'X-Print-Wait': 'spool',
          },
          body,
        }).then(async (res) => ({
          status: res.status,
          json: (await res.json()) as { id: string; spooled: boolean },
        })),
      ),
    );
    expect(results.every((r) => r.status === 200 && r.json.spooled)).toBe(true);
    expect(results[0]!.json.id).not.toBe(results[1]!.json.id);
  });

  it('CORS allows X-Print-Wait preflight', async () => {
    const res = await fetch(`${baseUrl}/print`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://wizarddigital-inv.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type,x-printer-name,x-print-format,x-print-wait',
      },
    });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    const allow = (res.headers.get('access-control-allow-headers') || '').toLowerCase();
    expect(allow).toMatch(/x-print-wait/);
  });

  it('setup wizard route responds', async () => {
    const res = await fetch(`${baseUrl}/setup/`);
    expect(res.status).toBe(200);
  });

  it('list printers endpoint responds', async () => {
    const res = await fetch(`${baseUrl}/printers`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { printers: string[] };
    expect(body.printers).toContain('KitchenPrinter');
  });
});
