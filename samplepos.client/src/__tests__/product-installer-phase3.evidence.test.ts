/**
 * Evidence: Phase 3 — ERP URL wizard, SPA from API, CI Setup.exe pipeline.
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

describe('SMART-ERP-POS Phase 3', () => {
  it('EVIDENCE: first-run ERP connection wizard + Open-SMART-ERP gate', () => {
    expect(existsSync(resolve(repoRoot, 'installer/service-helper/public/erp-setup/index.html'))).toBe(
      true,
    );
    expect(existsSync(resolve(repoRoot, 'installer/Open-ERP-Setup.vbs'))).toBe(true);
    const openErp = readRepo('installer/Open-SMART-ERP.vbs');
    expect(openErp).toMatch(/erp-setup/);
    expect(openErp).toMatch(/erp-url\.txt/);
    const helper = readRepo('installer/service-helper/src/server.ts');
    expect(helper).toMatch(/\/erp-setup\/url/);
  });

  it('EVIDENCE: backend can serve frontend SPA + CI/codesign/soak exist', () => {
    expect(existsSync(resolve(repoRoot, 'SamplePOS.Server/src/middleware/serveFrontend.ts'))).toBe(
      true,
    );
    expect(readRepo('SamplePOS.Server/src/server.ts')).toMatch(/mountFrontendSpa/);
    expect(existsSync(resolve(repoRoot, '.github/workflows/commercial-setup.yml'))).toBe(true);
    expect(existsSync(resolve(repoRoot, 'installer/scripts/codesign.ps1'))).toBe(true);
    expect(existsSync(resolve(repoRoot, 'installer/SOAK-CHECKLIST.md'))).toBe(true);
    expect(readRepo('installer/build-product.ps1')).toMatch(/SERVE_FRONTEND|CLIENT_DIST_PATH|client-dist/);
  });
});
