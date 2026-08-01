/**
 * Post-install consistency checks for a SMART-ERP-POS install directory.
 * Usage: node installer/scripts/verify-install-tree.mjs <installRoot>
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = process.argv[2];
if (!root) {
  console.error('Usage: node verify-install-tree.mjs <installRoot>');
  process.exit(2);
}

const fails = [];
const warns = [];
function pass(m) {
  console.log(`  PASS  ${m}`);
}
function fail(m) {
  fails.push(m);
  console.log(`  FAIL  ${m}`);
}
function warn(m) {
  warns.push(m);
  console.log(`  WARN  ${m}`);
}

function mustFile(rel, minBytes = 1) {
  const p = path.join(root, rel);
  if (!existsSync(p)) {
    fail(`missing ${rel}`);
    return null;
  }
  const n = statSync(p).size;
  if (n < minBytes) fail(`${rel} too small (${n} bytes)`);
  else pass(`${rel} (${n} bytes)`);
  return p;
}

function mustDir(rel) {
  const p = path.join(root, rel);
  if (!existsSync(p) || !statSync(p).isDirectory()) fail(`missing dir ${rel}`);
  else pass(`dir ${rel}`);
  return p;
}

console.log(`=== Verify install tree ===\nRoot: ${root}\n`);

mustDir('.');
mustFile('SMART ERP.exe', 50_000);
mustFile('Open-SMART-ERP.vbs');
mustFile('Open-ERP-Setup.vbs');
mustFile('Open-Printer-Setup.vbs');
mustFile('Start-PrintService.vbs');
mustFile('version.json');
mustDir('Print Service');
mustDir('Service Helper');
mustDir('config');
mustDir('updates');
mustFile('Print Service/SMART Print Service.exe', 100_000);
mustFile('Print Service/runtime/node.exe', 1_000_000);
mustFile('Print Service/app/dist/index.js');
mustFile('Print Service/app/public/setup/index.html');
mustFile('Service Helper/SMART Service Helper.exe', 100_000);
mustFile('Service Helper/runtime/node.exe', 1_000_000);
mustFile('Service Helper/app/dist/index.js');
mustFile('Service Helper/app/public/erp-setup/index.html');
mustFile('config/update-channel.json');

let version = {};
try {
  const raw = readFileSync(path.join(root, 'version.json'), 'utf8').replace(/^\uFEFF/, '');
  version = JSON.parse(raw);
  pass(`version.json product=${version.productVersion} print=${version.printServiceVersion}`);
  if (version.productVersion !== '2.0.0') warn(`productVersion expected 2.0.0 got ${version.productVersion}`);
  if (version.printServiceVersion !== '1.3.1')
    warn(`printServiceVersion expected 1.3.1 got ${version.printServiceVersion}`);
  if (version.hasSmartErpExe !== true) fail('hasSmartErpExe !== true');
  else pass('hasSmartErpExe true');
} catch (e) {
  fail(`version.json parse: ${e.message}`);
}

// WinSW XML consistency
for (const [rel, id] of [
  ['Print Service/SMART Print Service.xml', 'SMART-Print-Service'],
  ['Service Helper/SMART Service Helper.xml', 'SMART-Service-Helper'],
]) {
  const p = path.join(root, rel);
  if (!existsSync(p)) {
    fail(`missing ${rel}`);
    continue;
  }
  const xml = readFileSync(p, 'utf8');
  if (xml.includes(`<id>${id}</id>`)) pass(`${rel} id=${id}`);
  else fail(`${rel} missing id ${id}`);
}

// Open-SMART-ERP.vbs prefers exe
const vbs = readFileSync(path.join(root, 'Open-SMART-ERP.vbs'), 'utf8');
if (vbs.includes('SMART ERP.exe')) pass('Open-SMART-ERP.vbs prefers SMART ERP.exe');
else fail('Open-SMART-ERP.vbs does not reference SMART ERP.exe');

console.log('\n=== Runtime smoke ===');
const printNode = path.join(root, 'Print Service', 'runtime', 'node.exe');
const printEntry = path.join(root, 'Print Service', 'app', 'dist', 'index.js');
const printCwd = path.join(root, 'Print Service', 'app');
const helperNode = path.join(root, 'Service Helper', 'runtime', 'node.exe');
const helperEntry = path.join(root, 'Service Helper', 'app', 'dist', 'index.js');
const helperCwd = path.join(root, 'Service Helper', 'app');

const preferLive = process.argv.includes('--live');

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function probeLive() {
  try {
    const ph = await getJson('http://127.0.0.1:1811/health');
    const hh = await getJson('http://127.0.0.1:1812/health');
    if (ph?.status === 'online' && hh?.status === 'online') {
      return { printPort: 1811, helperPort: 1812, spawned: false };
    }
  } catch {
    /* fall through to isolated spawn */
  }
  return null;
}

function startNode(nodeExe, entry, cwd, env) {
  const child = spawn(nodeExe, [entry], {
    cwd,
    env: { ...process.env, ...env },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    shell: false,
  });
  child._stderrBuf = '';
  child.stderr?.on('data', (d) => {
    child._stderrBuf += String(d);
  });
  child.on('error', (err) => {
    child._stderrBuf += `spawn error: ${err.message}`;
  });
  return child;
}

async function smokeAgainst(printPort, helperPort) {
  const ph = await getJson(`http://127.0.0.1:${printPort}/health`);
  if (ph.status === 'online' && ph.version === '1.3.1') {
    pass(`print /health online v${ph.version} channel=${ph.channel} port=${printPort}`);
  } else fail(`print /health unexpected ${JSON.stringify(ph)}`);
  if (!Array.isArray(ph.formats) || !ph.formats.includes('escpos')) fail('print formats missing escpos');
  else pass(`print formats ${ph.formats.join(',')}`);
  if (ph.channel !== 'commercial') warn(`print channel expected commercial got ${ph.channel}`);

  const setupHtml = await fetch(`http://127.0.0.1:${printPort}/setup/`, {
    signal: AbortSignal.timeout(5000),
  });
  if (setupHtml.ok) pass('print /setup/ wizard HTTP 200');
  else fail(`print /setup/ HTTP ${setupHtml.status}`);

  const hh = await getJson(`http://127.0.0.1:${helperPort}/health`);
  if (hh.status === 'online') pass(`helper /health online v${hh.version} port=${helperPort}`);
  else fail(`helper /health ${JSON.stringify(hh)}`);
  if (hh.productVersion !== version.productVersion) {
    warn(`helper productVersion ${hh.productVersion} vs version.json ${version.productVersion}`);
  } else pass(`helper productVersion ${hh.productVersion}`);
  if (hh.printService && hh.printService.running === false && printPort === 1811) {
    fail('helper reports printService.running=false while testing live 1811');
  }

  const erp = await fetch(`http://127.0.0.1:${helperPort}/erp-setup/`, {
    signal: AbortSignal.timeout(5000),
  });
  if (erp.ok) pass('helper /erp-setup/ HTTP 200');
  else fail(`helper /erp-setup/ HTTP ${erp.status}`);

  // Save + read ERP URL (isolated only — avoid clobbering live install config)
  if (helperPort !== 1812) {
    const save = await fetch(`http://127.0.0.1:${helperPort}/erp-setup/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://127.0.0.1:3001' }),
      signal: AbortSignal.timeout(5000),
    });
    const saveBody = await save.json();
    if (save.ok && saveBody?.data?.url === 'http://127.0.0.1:3001') pass('erp-setup/url POST');
    else fail(`erp-setup/url POST ${JSON.stringify(saveBody)}`);

    const erpFile = path.join(root, 'config', 'erp-url.txt');
    if (existsSync(erpFile) && readFileSync(erpFile, 'utf8').includes('127.0.0.1:3001')) {
      pass('config/erp-url.txt written');
    } else fail('config/erp-url.txt not written');
  } else {
    pass('skipped erp-url write on live helper (preserve install config)');
  }

  const ch = await getJson(`http://127.0.0.1:${helperPort}/update/channel`);
  if (ch.success && ch.data) pass(`update/channel channel=${ch.data.channel}`);
  else fail(`update/channel ${JSON.stringify(ch)}`);

  const chk = await getJson(`http://127.0.0.1:${helperPort}/update/check`);
  if (chk.success) pass(`update/check available=${chk.data?.updateAvailable}`);
  else fail(`update/check ${JSON.stringify(chk)}`);
}

const kids = [];
try {
  let printPort = 1821;
  let helperPort = 1822;
  const live = await probeLive();
  if (preferLive && !live) {
    throw new Error('--live requested but :1811/:1812 not healthy');
  }
  if (live) {
    printPort = live.printPort;
    helperPort = live.helperPort;
    pass(`using live services :${printPort}/:${helperPort}`);
    await smokeAgainst(printPort, helperPort);
  } else {
    console.log('  (spawning isolated instances on :1821 / :1822)');
    const printChild = startNode(printNode, printEntry, printCwd, {
      SMART_PRINT_CHANNEL: 'commercial',
      SMART_PRINT_PORT: String(printPort),
      SMART_PRINT_HOST: '127.0.0.1',
    });
    const helperChild = startNode(helperNode, helperEntry, helperCwd, {
      SMART_HELPER_PORT: String(helperPort),
      SMART_HELPER_HOST: '127.0.0.1',
      SMART_PRODUCT_ROOT: root,
      SMART_PRINT_SERVICE_DIR: path.join(root, 'Print Service'),
    });
    kids.push(printChild, helperChild);

    let ready = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        await getJson(`http://127.0.0.1:${printPort}/health`);
        await getJson(`http://127.0.0.1:${helperPort}/health`);
        ready = true;
        break;
      } catch {
        /* retry */
      }
      if (printChild.exitCode != null || helperChild.exitCode != null) break;
    }
    if (!ready) {
      const bits = [];
      if (printChild.exitCode != null) bits.push(`print exited ${printChild.exitCode}: ${printChild._stderrBuf || '(no stderr)'}`);
      if (helperChild.exitCode != null)
        bits.push(`helper exited ${helperChild.exitCode}: ${helperChild._stderrBuf || '(no stderr)'}`);
      if (!bits.length) bits.push('timed out waiting for :1821/:1822');
      throw new Error(bits.join(' | '));
    }
    await smokeAgainst(printPort, helperPort);
  }
} catch (e) {
  fail(`runtime smoke: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  for (const c of kids) {
    try {
      c.kill();
    } catch {
      /* ignore */
    }
  }
}

console.log('\n=== Summary ===');
console.log(`Failures: ${fails.length}`);
console.log(`Warnings: ${warns.length}`);
if (fails.length) {
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('VERDICT: INSTALL TREE PASS');
process.exit(0);
