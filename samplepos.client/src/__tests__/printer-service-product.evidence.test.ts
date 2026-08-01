/**
 * Evidence: Printer Service is an installed background component — cashiers never use npm/terminal.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

function readRepo(rel: string) {
  return readFileSync(resolve(repoRoot, rel), 'utf8');
}

describe('Printer Service product experience', () => {
  it('EVIDENCE: agent health includes uptime/printers; restart + logs APIs exist', () => {
    const server = readRepo('smart-print-agent/src/server.ts');
    expect(server).toMatch(/uptime/);
    expect(server).toMatch(/printers/);
    expect(server).toMatch(/\/restart/);
    expect(server).toMatch(/\/logs/);
    expect(server).toMatch(/formats: \['html', 'escpos'\]/);
    // Assert moved off /print hot path into RAW/HTML workers.
    expect(readRepo('smart-print-agent/src/printers.ts')).toMatch(/assertPrinterExists/);
    expect(readRepo('smart-print-agent/src/printQueue.ts')).toMatch(/MAX_ATTEMPTS|BACKOFF/);
    expect(readRepo('smart-print-agent/src/printQueue.ts')).toMatch(/format === 'escpos'/);
    expect(
      existsSync(resolve(repoRoot, 'smart-print-agent/scripts/install-print-service.ps1')),
    ).toBe(true);
    expect(existsSync(resolve(repoRoot, 'smart-print-agent/scripts/run-watchdog.ps1'))).toBe(true);
  });

  it('EVIDENCE: FOH shows Printer Service status; diagnostics page for managers', () => {
    const chip = readRepo(
      'samplepos.client/src/components/restaurant/PrinterServiceStatusChip.tsx',
    );
    expect(chip).toMatch(/Printer Service Online|printerServiceStatusLabel/);
    expect(chip).not.toMatch(/npm run print-agent/);
    const health = readRepo('samplepos.client/src/lib/printAgentHealth.ts');
    expect(health).toMatch(/12_000|HEARTBEAT/);
    expect(health).toMatch(/restartPrinterService/);
    const pos = readRepo('samplepos.client/src/pages/restaurant/RestaurantPosPage.tsx');
    expect(pos).toMatch(/PrinterServiceStatusChip/);
    const app = readRepo('samplepos.client/src/App.tsx');
    expect(app).toMatch(/printer-diagnostics/);
    expect(app).toMatch(/RestaurantPrinterDiagnosticsPage/);
    const diag = readRepo(
      'samplepos.client/src/pages/restaurant/RestaurantPrinterDiagnosticsPage.tsx',
    );
    expect(diag).toMatch(/Restart Service/);
    expect(diag).toMatch(/Test Print/);
    expect(diag).not.toMatch(/npm run/);
  });

  it('EVIDENCE: root package exposes print-agent:setup (installer), not only npm start', () => {
    const pkg = readRepo('package.json');
    expect(pkg).toMatch(/print-agent:setup/);
    expect(pkg).toMatch(/install-print-service\.ps1/);
  });
});
