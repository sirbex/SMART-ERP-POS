/**
 * Evidence: Phase 4 — SMART ERP.exe shell + CDN update channel.
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

describe('SMART-ERP-POS Phase 4', () => {
  it('EVIDENCE: SMART ERP.exe shell sources + launcher prefers exe', () => {
    expect(existsSync(resolve(repoRoot, 'installer/smart-erp-shell/Program.cs'))).toBe(true);
    expect(existsSync(resolve(repoRoot, 'installer/smart-erp-shell/SmartErp.Shell.csproj'))).toBe(
      true,
    );
    expect(existsSync(resolve(repoRoot, 'installer/smart-erp-shell/build.ps1'))).toBe(true);
    const program = readRepo('installer/smart-erp-shell/Program.cs');
    expect(program).toMatch(/--app=/);
    expect(program).toMatch(/erp-url\.txt/);
    expect(program).toMatch(/1812\/erp-setup/);
    expect(readRepo('installer/Open-SMART-ERP.vbs')).toMatch(/SMART ERP\.exe/);
    expect(readRepo('installer/build-product.ps1')).toMatch(/smart-erp-shell/);
  });

  it('EVIDENCE: CDN update channel + integrity proof script', () => {
    expect(existsSync(resolve(repoRoot, 'installer/config/update-channel.example.json'))).toBe(
      true,
    );
    const control = readRepo('installer/service-helper/src/serviceControl.ts');
    expect(control).toMatch(/readUpdateChannel/);
    expect(control).toMatch(/resolveManifestUrl/);
    const server = readRepo('installer/service-helper/src/server.ts');
    expect(server).toMatch(/\/update\/channel/);
    expect(server).toMatch(/updateChannel/);
    expect(existsSync(resolve(repoRoot, 'installer/scripts/proof-commercial-integrity.mjs'))).toBe(
      true,
    );
    const rootPkg = readRepo('package.json');
    expect(rootPkg).toMatch(/proof:commercial/);
  });
});
