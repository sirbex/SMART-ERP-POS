/**
 * Evidence: official SMART Print Agent is a platform component on :1811.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

function readRepo(rel: string) {
  return readFileSync(resolve(repoRoot, rel), 'utf8');
}

describe('SMART Print Agent (platform component)', () => {
  it('EVIDENCE: agent package exposes health/printers/print/cashdrawer/test-print', () => {
    expect(existsSync(resolve(repoRoot, 'smart-print-agent/src/index.ts'))).toBe(true);
    const server = readRepo('smart-print-agent/src/server.ts');
    expect(server).toMatch(/\/health/);
    expect(server).toMatch(/\/printers/);
    expect(server).toMatch(/\/print/);
    expect(server).toMatch(/\/cashdrawer/);
    expect(server).toMatch(/\/test-print/);
    expect(server).toMatch(/x-printer-name/);
    expect(server).toMatch(/X-Print-Format|escpos/);
    expect(server).toMatch(/\/restart/);
    expect(server).toMatch(/uptime/);
    expect(server).toMatch(/formats: \['html', 'escpos'\]/);
    // Printer assert is worker-side (never blocks /print accept).
    expect(readRepo('smart-print-agent/src/printers.ts')).toMatch(/assertPrinterExists/);
    expect(readRepo('smart-print-agent/src/rawPrint.ts')).toMatch(/assertPrinterExists/);
    expect(readRepo('smart-print-agent/src/config.ts')).toMatch(/DEFAULT_PORT = 1811/);
    expect(readRepo('smart-print-agent/src/config.ts')).toMatch(/1\.3\.0/);
  });

  it('EVIDENCE: cashiers never need npm — installer + FOH status', () => {
    expect(existsSync(resolve(repoRoot, 'smart-print-agent/scripts/start-agent.ps1'))).toBe(true);
    expect(existsSync(resolve(repoRoot, 'smart-print-agent/scripts/install-print-service.ps1'))).toBe(
      true,
    );
    const rootPkg = readRepo('package.json');
    expect(rootPkg).toMatch(/"print-agent"/);
    expect(rootPkg).toMatch(/print-agent:setup/);
    expect(rootPkg).toMatch(/print-agent:bundle/);
    expect(existsSync(resolve(repoRoot, 'installer/SMART-ERP-POS-PrintService.iss'))).toBe(true);
    expect(existsSync(resolve(repoRoot, 'installer/print-service/build-bundle.ps1'))).toBe(true);
    expect(existsSync(resolve(repoRoot, 'smart-print-agent/public/setup/index.html'))).toBe(true);
    expect(readRepo('smart-print-agent/src/server.ts')).toMatch(/\/setup/);
    expect(readRepo('smart-print-agent/src/server.ts')).toMatch(/windowsService/);
    const stations = readRepo('samplepos.client/src/pages/restaurant/RestaurantStationsPage.tsx');
    expect(stations).toMatch(/Printer Service/);
    expect(stations).toMatch(/printAgentHealth|subscribePrinterServiceHealth|fetchPrinterServiceHealth/);
    const settings = readRepo('samplepos.client/src/pages/settings/SettingsPage.tsx');
    expect(settings).toMatch(/PrintingSettingsTab|tab.*printing|value=\"printing\"/);
    expect(
      existsSync(resolve(repoRoot, 'samplepos.client/src/pages/settings/tabs/PrintingSettingsTab.tsx')),
    ).toBe(true);
    // Receipt config on Settings → Printing; restaurant stations stay in restaurant module.
    const printingTab = readRepo(
      'samplepos.client/src/pages/settings/tabs/PrintingSettingsTab.tsx',
    );
    expect(printingTab).toMatch(/ReceiptPrintingSettings/);
    expect(printingTab).not.toMatch(/RestaurantStationsPage/);
    expect(
      existsSync(
        resolve(repoRoot, 'samplepos.client/src/pages/settings/tabs/ReceiptPrintingSettings.tsx'),
      ),
    ).toBe(true);
    const receipt = readRepo(
      'samplepos.client/src/pages/settings/tabs/ReceiptPrintingSettings.tsx',
    );
    expect(receipt).toMatch(/Receipt Printing Configuration/);
    expect(receipt).toMatch(/Enable Receipt Printing/);
    expect(receipt).toMatch(/Save Receipt Settings/);
    const app = readRepo('samplepos.client/src/App.tsx');
    expect(app).toMatch(/path=\"\/restaurant\/stations\"/);
    expect(app).toMatch(/RestaurantStationsPage/);
    expect(app).not.toMatch(/Navigate to=\"\/settings\?tab=printing\"/);
  });
});
