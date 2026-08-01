import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { assertPrinterExists } from './printers.js';

const execFileAsync = promisify(execFile);
const AGENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function browserCandidates(): string[] {
  if (os.platform() !== 'win32') {
    return [
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];
  }
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA || '';
  return [
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
}

async function findBrowser(): Promise<string> {
  for (const candidate of browserCandidates()) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }
  throw new Error(
    'No Chrome/Edge found for HTML→PDF. Install Microsoft Edge or Google Chrome on this POS PC.',
  );
}

/** WinSW LocalSystem has no Desktop folder — Edge/Chrome headless crashes without it. */
async function ensureWindowsServiceBrowserDirs(): Promise<void> {
  if (os.platform() !== 'win32') return;
  const desks = [
    'C:\\Windows\\System32\\config\\systemprofile\\Desktop',
    'C:\\Windows\\SysWOW64\\config\\systemprofile\\Desktop',
  ];
  for (const d of desks) {
    await fs.mkdir(d, { recursive: true }).catch(() => undefined);
  }
}

function agentTempRoot(): string {
  if (process.env.SMART_PRINT_TEMP) return process.env.SMART_PRINT_TEMP;
  // Prefer ProgramData — LocalSystem can write here; Program Files profile dirs often fail.
  if (os.platform() === 'win32') {
    return path.join(
      process.env.ProgramData || 'C:\\ProgramData',
      'SMART-ERP-POS',
      'print-service',
      'temp',
    );
  }
  return path.join(AGENT_ROOT, 'temp');
}

function browserProfileDir(): string {
  if (process.env.SMART_PRINT_BROWSER_PROFILE) return process.env.SMART_PRINT_BROWSER_PROFILE;
  if (os.platform() === 'win32') {
    return path.join(
      process.env.ProgramData || 'C:\\ProgramData',
      'SMART-ERP-POS',
      'print-service',
      'browser-profile',
    );
  }
  return path.join(AGENT_ROOT, 'data', 'browser-profile');
}

/**
 * HTML → PDF via Edge/Chrome headless.
 * Hardened for Windows Service (LocalSystem): dedicated user-data-dir, no-sandbox,
 * service Desktop folders, and treat a written PDF as success even if the browser
 * exits non-zero (common under SYSTEM).
 */
async function htmlToPdf(html: string, pdfPath: string): Promise<void> {
  const dir = path.dirname(pdfPath);
  const htmlPath = path.join(dir, `job-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  const normalized = normalizeThermalHtmlPageSize(html);
  await fs.writeFile(htmlPath, normalized, 'utf8');
  await ensureWindowsServiceBrowserDirs();
  const profileDir = browserProfileDir();
  await fs.mkdir(profileDir, { recursive: true });
  const browser = await findBrowser();
  const fileUrl = pathToFileURL(htmlPath).href;
  // Try modern headless first, then legacy — LocalSystem often kills --headless=new (exit 1002).
  const headlessFlags = ['--headless=new', '--headless'];
  let lastDetail = '';
  try {
    for (const headless of headlessFlags) {
      await fs.unlink(pdfPath).catch(() => undefined);
      const args = [
        headless,
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-sync',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-features=RendererCodeIntegrity',
        '--no-pdf-header-footer',
        `--user-data-dir=${profileDir}`,
        `--print-to-pdf=${pdfPath}`,
        fileUrl,
      ];
      let stderr = '';
      let stdout = '';
      let exitCode: number | null = null;
      try {
        const result = await execFileAsync(browser, args, {
          windowsHide: true,
          // Keep short — LocalSystem Edge often hang-crashes; fall back quickly.
          timeout: 15_000,
          maxBuffer: 2 * 1024 * 1024,
          env: {
            ...process.env,
            TMP: dir,
            TEMP: dir,
            TMPDIR: dir,
          },
        });
        stdout = String(result.stdout || '');
        stderr = String(result.stderr || '');
        exitCode = 0;
      } catch (err: unknown) {
        const e = err as { code?: number; stdout?: string; stderr?: string };
        stdout = String(e.stdout || '');
        stderr = String(e.stderr || '');
        exitCode = typeof e.code === 'number' ? e.code : null;
      }
      try {
        await fs.access(pdfPath);
        const st = await fs.stat(pdfPath);
        if (st.size > 0) return;
      } catch {
        /* try next headless mode */
      }
      lastDetail = [stderr, stdout].filter(Boolean).join('\n').trim().slice(0, 800);
      if (!lastDetail) lastDetail = `exit=${exitCode ?? 'unknown'} ${headless}`;
    }
    throw new Error(
      `Edge/Chrome HTML→PDF failed under the Print Service account. ` +
        `Profile: ${profileDir}. ${lastDetail || 'No browser output.'} ` +
        `Kitchen ESC/POS still works; for HTML bills set the service Log On to the POS Windows user, or keep using Test Print (spooler fallback).`,
    );
  } finally {
    await fs.unlink(htmlPath).catch(() => undefined);
  }
}

/** Default roll height — keep in sync with samplepos.client thermalPrintCss THERMAL_ROLL_HEIGHT_MM. */
const THERMAL_PAGE_HEIGHT_MM = 297;

/** Force a stable @page box so --print-to-pdf does not scale fonts to tiny. */
function normalizeThermalHtmlPageSize(html: string): string {
  const src = String(html || '');
  const target = `size: 80mm ${THERMAL_PAGE_HEIGHT_MM}mm`;
  if (/size:\s*\d+mm\s+(?:auto|\d+mm)/i.test(src)) {
    return src.replace(/size:\s*\d+mm\s+(?:auto|\d+mm)/gi, target);
  }
  if (/@page\s*\{/i.test(src)) {
    return src.replace(/@page\s*\{/i, `@page { ${target}; `);
  }
  return src;
}

/**
 * Minimal single-page PDF (no browser) — used for setup Test Print under LocalSystem
 * when Edge headless is unavailable.
 */
function buildMinimalTestPdf(lines: string[]): Buffer {
  const safe = lines.map((l) =>
    String(l || '')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)'),
  );
  const contentParts = ['BT', '/F1 14 Tf', '40 780 Td'];
  safe.forEach((line, i) => {
    if (i === 0) contentParts.push(`(${line}) Tj`);
    else contentParts.push(`0 -22 Td (${line}) Tj`);
  });
  contentParts.push('ET');
  const stream = contentParts.join('\n');
  const objects: string[] = [];
  objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n');
  objects.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n');
  objects.push(
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 226 842] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n',
  );
  objects.push(
    `4 0 obj<< /Length ${Buffer.byteLength(stream, 'utf8')} >>stream\n${stream}\nendstream\nendobj\n`,
  );
  objects.push('5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>endobj\n');

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

async function printPdf(
  pdfPath: string,
  printerName?: string | null,
): Promise<{
  assertMs: number;
  spoolMs: number;
}> {
  const mod = (await import('pdf-to-printer')) as {
    print?: (file: string, opts?: object) => Promise<void>;
    default?: { print?: (file: string, opts?: object) => Promise<void> };
  };
  const print = mod.print || mod.default?.print;
  if (typeof print !== 'function') {
    throw new Error('pdf-to-printer print() unavailable in this runtime');
  }
  const options: { printer?: string; silent?: boolean } = { silent: true };
  const name = printerName?.trim();
  let assertMs = 0;
  if (name) {
    const a0 = Date.now();
    await assertPrinterExists(name);
    assertMs = Date.now() - a0;
    options.printer = name;
  }
  const s0 = Date.now();
  await print(pdfPath, options);
  return { assertMs, spoolMs: Date.now() - s0 };
}

/**
 * Silent print HTML (KOT/bill from PWA) via OS spooler.
 * Browser never talks to USB/LAN — only this agent does.
 */
export async function printHtmlDocument(
  html: string,
  printerName?: string | null,
): Promise<{ ok: true; printer: string | null }> {
  if (!html || !html.trim()) {
    throw new Error('Empty HTML print payload');
  }
  const t0 = Date.now();
  const root = agentTempRoot();
  await fs.mkdir(root, { recursive: true });
  const tmpDir = await fs.mkdtemp(path.join(root, 'smart-print-'));
  const pdfPath = path.join(tmpDir, 'ticket.pdf');
  try {
    const p0 = Date.now();
    await htmlToPdf(html, pdfPath);
    const pdfMs = Date.now() - p0;
    const { assertMs, spoolMs } = await printPdf(pdfPath, printerName);
    const totalMs = Date.now() - t0;
    const line =
      `[print] stages printer=${printerName || '(default)'} ` +
      `pdfMs=${pdfMs} assertMs=${assertMs} spoolMs=${spoolMs} totalMs=${totalMs}`;
    console.info(line);
    const { appendAgentLog } = await import('./lifecycle.js');
    appendAgentLog(line);
    return { ok: true, printer: printerName?.trim() || null };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Setup wizard Test Print — prefer Edge HTML path; fall back to a minimal PDF
 * so LocalSystem installs still prove the Windows spooler + printer mapping.
 */
export async function printTestPage(printerName?: string | null): Promise<void> {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<style>
  @page { size: 80mm ${THERMAL_PAGE_HEIGHT_MM}mm; margin: 4mm; }
  body { font-family: Arial, sans-serif; font-size: 14px; font-weight: 700; }
</style></head>
<body>
  <div style="text-align:center">SMART Print Agent</div>
  <div style="text-align:center">TEST PRINT</div>
  <hr/>
  <div>Printer: ${escapeHtml(printerName || '(default)')}</div>
  <div>Time: ${escapeHtml(new Date().toLocaleString())}</div>
  <hr/>
  <div style="text-align:center">OK</div>
</body></html>`;
  try {
    await printHtmlDocument(html, printerName);
    return;
  } catch (htmlErr) {
    const { appendAgentLog } = await import('./lifecycle.js');
    appendAgentLog(
      `[print] HTML test failed — falling back to minimal PDF: ${
        htmlErr instanceof Error ? htmlErr.message : String(htmlErr)
      }`,
    );
  }

  const root = agentTempRoot();
  await fs.mkdir(root, { recursive: true });
  const tmpDir = await fs.mkdtemp(path.join(root, 'smart-print-'));
  const pdfPath = path.join(tmpDir, 'ticket.pdf');
  try {
    const pdf = buildMinimalTestPdf([
      'SMART Print Agent',
      'TEST PRINT',
      `Printer: ${printerName || '(default)'}`,
      `Time: ${new Date().toLocaleString()}`,
      'OK',
    ]);
    await fs.writeFile(pdfPath, pdf);
    await printPdf(pdfPath, printerName);
    const { appendAgentLog } = await import('./lifecycle.js');
    appendAgentLog(`[print] ok test (minimal-pdf fallback) printer=${printerName || '(default)'}`);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
