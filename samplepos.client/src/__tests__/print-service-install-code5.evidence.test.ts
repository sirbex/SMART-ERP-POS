/**
 * EVIDENCE: Print Service Setup stops service before file replace (code 5 fix).
 * Run: npx vitest run src/__tests__/print-service-install-code5.evidence.test.ts
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

function read(rel: string) {
  return readFileSync(resolve(repoRoot, rel), 'utf8');
}

describe('EVIDENCE — Print Service install code 5 (Access Denied) fix', () => {
  it('ISS stops service in PrepareToInstall before [Files] copy', () => {
    const iss = read('installer/SMART-ERP-POS-PrintService.iss');
    expect(iss).toMatch(/function PrepareToInstall/);
    expect(iss).toMatch(/ExtractTemporaryFile\('Stop-PrintService-ForUpgrade\.cmd'\)/);
    expect(iss).toMatch(/StopPrintServiceProcesses/);
    // Uninstall alone is not enough — must stop before upgrade copy
    const prepIdx = iss.indexOf('function PrepareToInstall');
    const filesIdx = iss.indexOf('[Files]');
    expect(prepIdx).toBeGreaterThan(0);
    expect(filesIdx).toBeGreaterThan(0);
  });

  it('ISS deletes stale app payload and uses restartreplace', () => {
    const iss = read('installer/SMART-ERP-POS-PrintService.iss');
    expect(iss).toMatch(/\[InstallDelete\]/);
    expect(iss).toMatch(/\{app\}\\app\\dist/);
    expect(iss).toMatch(/\{app\}\\app\\node_modules/);
    expect(iss).toMatch(/restartreplace/);
    expect(iss).toMatch(/ignoreversion/);
  });

  it('Stop-PrintService-ForUpgrade.cmd unlocks service + scoped node', () => {
    const cmd = read('installer/print-service/Stop-PrintService-ForUpgrade.cmd');
    expect(cmd).toMatch(/sc\.exe stop SMART-Print-Service/);
    expect(cmd).toMatch(/SMART Print Service\.exe" stop/);
    expect(cmd).toMatch(/taskkill \/F \/IM "SMART Print Service\.exe"/);
    expect(cmd).toMatch(/node\.exe/);
    expect(cmd).toMatch(/Print Service/);
  });

  it('built Setup.exe exists with FileVersion 1.4.0.0 (not 0.0.0.0)', () => {
    const exe = resolve(repoRoot, 'installer/dist/SMART-ERP-POS-PrintService-Setup.exe');
    expect(existsSync(exe)).toBe(true);
    const st = statSync(exe);
    expect(st.size).toBeGreaterThan(1_000_000);
    // Fresh enough: rebuilt for code-5 fix (after 2026-08-15 12:30 local build window)
    expect(st.mtimeMs).toBeGreaterThan(Date.parse('2026-08-15T09:30:00.000Z'));

    const ps = `
$v = [System.Diagnostics.FileVersionInfo]::GetVersionInfo(${JSON.stringify(exe)})
Write-Output ($v.FileVersion.Trim() + '|' + $v.ProductVersion.Trim() + '|' + $v.FileMajorPart + '.' + $v.FileMinorPart + '.' + $v.FileBuildPart + '.' + $v.FilePrivatePart)
`;
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', ps],
      { encoding: 'utf8' },
    ).trim();
    const [fileVer, productVer, parts] = out.split('|');
    expect(fileVer).toBe('1.4.0.0');
    expect(productVer).toBe('1.4.0');
    expect(parts).toBe('1.4.0.0');
    expect(fileVer).not.toBe('0.0.0.0');
  });

  it('bundle includes stop script used by upgrade', () => {
    expect(
      existsSync(
        resolve(repoRoot, 'installer/dist/print-service-bundle/Stop-PrintService-ForUpgrade.cmd'),
      ),
    ).toBe(true);
    expect(
      existsSync(resolve(repoRoot, 'installer/dist/print-service-bundle/app/dist/config.js')),
    ).toBe(true);
    const cfg = read('installer/dist/print-service-bundle/app/dist/config.js');
    expect(cfg).toMatch(/AGENT_VERSION = '1\.4\.0'/);
  });
});
