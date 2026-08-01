/**
 * Commercial packaging integrity proof (Phases 1–4).
 * Exit 0 = PASS. Does not require Inno/dotnet — verifies source contracts + helper compile.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const failures = [];
const warnings = [];

function ok(msg) {
  console.log(`  PASS  ${msg}`);
}
function fail(msg) {
  failures.push(msg);
  console.log(`  FAIL  ${msg}`);
}
function warn(msg) {
  warnings.push(msg);
  console.log(`  WARN  ${msg}`);
}

function mustExist(rel) {
  const p = path.join(repoRoot, rel);
  if (existsSync(p)) ok(rel);
  else fail(`missing ${rel}`);
  return existsSync(p);
}

function mustMatch(rel, re, label) {
  const p = path.join(repoRoot, rel);
  if (!existsSync(p)) {
    fail(`missing ${rel} (${label})`);
    return;
  }
  const text = readFileSync(p, 'utf8');
  if (re.test(text)) ok(`${rel} :: ${label}`);
  else fail(`${rel} missing pattern for ${label}: ${re}`);
}

console.log('=== SMART-ERP-POS commercial integrity proof ===\n');

console.log('Phase 1 — Print Service');
mustExist('smart-print-agent/src/index.ts');
mustExist('smart-print-agent/public/setup/index.html');
mustExist('installer/print-service/build-bundle.ps1');
mustExist('installer/SMART-ERP-POS-PrintService.iss');
mustMatch('smart-print-agent/src/server.ts', /\/setup/, 'setup wizard routes');

console.log('\nPhase 2 — Product + Helper + Update');
mustExist('installer/build-product.ps1');
mustExist('installer/SMART-ERP-POS-Setup.iss');
mustExist('installer/service-helper/src/index.ts');
mustMatch('installer/service-helper/src/server.ts', /\/print-service\/start/, 'start service');
mustMatch('installer/service-helper/src/server.ts', /\/update\/apply/, 'apply update');
mustExist('samplepos.client/src/lib/serviceHelper.ts');
mustMatch(
  'samplepos.client/src/pages/restaurant/RestaurantPrinterDiagnosticsPage.tsx',
  /Start Service/,
  'Start Service UI',
);

console.log('\nPhase 3 — ERP URL + SPA + CI');
mustExist('installer/service-helper/public/erp-setup/index.html');
mustExist('installer/Open-ERP-Setup.vbs');
mustMatch('installer/Open-SMART-ERP.vbs', /SMART ERP\.exe|erp-setup/, 'launcher gate');
mustExist('SamplePOS.Server/src/middleware/serveFrontend.ts');
mustMatch('SamplePOS.Server/src/server.ts', /mountFrontendSpa/, 'SPA mount');
mustExist('.github/workflows/commercial-setup.yml');
mustExist('installer/scripts/codesign.ps1');
mustExist('installer/SOAK-CHECKLIST.md');

console.log('\nPhase 4 — Desktop shell + CDN channel');
mustExist('installer/smart-erp-shell/Program.cs');
mustExist('installer/smart-erp-shell/SmartErp.Shell.csproj');
mustExist('installer/smart-erp-shell/build.ps1');
mustExist('installer/config/update-channel.example.json');
mustMatch('installer/service-helper/src/serviceControl.ts', /readUpdateChannel|resolveManifestUrl/, 'CDN channel');
mustMatch('installer/service-helper/src/server.ts', /\/update\/channel/, 'channel API');
mustMatch('installer/build-product.ps1', /smart-erp-shell|SMART ERP\.exe/, 'shell in product bundle');

console.log('\nCompile Service Helper');
const helperDir = path.join(repoRoot, 'installer/service-helper');
const build = spawnSync('npm', ['run', 'build'], {
  cwd: helperDir,
  shell: true,
  encoding: 'utf8',
});
if (build.status === 0 && existsSync(path.join(helperDir, 'dist/index.js'))) {
  ok('service-helper npm run build');
} else {
  fail(`service-helper build failed: ${build.stderr || build.stdout || build.status}`);
}

console.log('\nEvidence tests (vitest)');
const clientDir = path.join(repoRoot, 'samplepos.client');
const vitest = spawnSync(
  'npx',
  [
    'vitest',
    'run',
    'src/__tests__/product-installer-phase2.evidence.test.ts',
    'src/__tests__/product-installer-phase3.evidence.test.ts',
    'src/__tests__/product-installer-phase4.evidence.test.ts',
    'src/__tests__/smart-print-agent.evidence.test.ts',
  ],
  { cwd: clientDir, shell: true, encoding: 'utf8' },
);
if (vitest.status === 0) ok('installer evidence vitest suite');
else fail(`vitest failed:\n${vitest.stdout}\n${vitest.stderr}`);

console.log('\nOptional: SMART ERP.exe publish');
const shellBuild = spawnSync(
  'powershell',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(repoRoot, 'installer/smart-erp-shell/build.ps1')],
  { cwd: repoRoot, shell: true, encoding: 'utf8' },
);
const shellExe = path.join(repoRoot, 'installer/smart-erp-shell/dist/SMART ERP.exe');
if (existsSync(shellExe)) ok('SMART ERP.exe built');
else warn('SMART ERP.exe not built (dotnet SDK may be absent) — VBS launcher still valid');

console.log('\n=== Summary ===');
console.log(`Failures: ${failures.length}`);
console.log(`Warnings: ${warnings.length}`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('VERDICT: PASS');
process.exit(0);
