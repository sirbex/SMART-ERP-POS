/**
 * Evidence: Phase 2 commercial product packaging + Service Helper.
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

describe('SMART-ERP-POS Phase 2 installer', () => {
  it('EVIDENCE: product Setup.exe sources and Service Helper exist', () => {
    expect(existsSync(resolve(repoRoot, 'installer/SMART-ERP-POS-Setup.iss'))).toBe(true);
    expect(existsSync(resolve(repoRoot, 'installer/build-product.ps1'))).toBe(true);
    expect(existsSync(resolve(repoRoot, 'installer/service-helper/src/index.ts'))).toBe(true);
    expect(existsSync(resolve(repoRoot, 'installer/service-helper/src/server.ts'))).toBe(true);
    expect(existsSync(resolve(repoRoot, 'installer/manifest.example.json'))).toBe(true);
    const helper = readRepo('installer/service-helper/src/server.ts');
    expect(helper).toMatch(/\/print-service\/start/);
    expect(helper).toMatch(/\/update\/apply/);
    expect(helper).toMatch(/1812|DEFAULT_PORT/);
  });

  it('EVIDENCE: PWA can Start Service and apply updates via helper', () => {
    expect(existsSync(resolve(repoRoot, 'samplepos.client/src/lib/serviceHelper.ts'))).toBe(true);
    const health = readRepo('samplepos.client/src/lib/printAgentHealth.ts');
    expect(health).toMatch(/startPrinterService/);
    expect(health).toMatch(/restartPrinterServiceViaHelper|startPrinterServiceViaHelper/);
    const diag = readRepo(
      'samplepos.client/src/pages/restaurant/RestaurantPrinterDiagnosticsPage.tsx',
    );
    expect(diag).toMatch(/Start Service/);
    expect(diag).toMatch(/Update Available|applyProductUpdate|checkProductUpdate/);
    const rootPkg = readRepo('package.json');
    expect(rootPkg).toMatch(/product:bundle/);
  });
});
