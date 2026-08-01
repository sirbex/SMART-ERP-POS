import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { assertPrinterExists } from './printers.js';

const execFileAsync = promisify(execFile);

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

async function htmlToPdf(html: string, pdfPath: string): Promise<void> {
  const dir = path.dirname(pdfPath);
  const htmlPath = path.join(dir, `job-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  // Keep SSOT page box (default 80×297mm). Short/auto heights made Chrome shrink text.
  const normalized = normalizeThermalHtmlPageSize(html);
  await fs.writeFile(htmlPath, normalized, 'utf8');
  const browser = await findBrowser();
  const fileUrl = pathToFileURL(htmlPath).href;
  try {
    await execFileAsync(
      browser,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-pdf-header-footer',
        `--print-to-pdf=${pdfPath}`,
        fileUrl,
      ],
      { windowsHide: true, timeout: 45_000 },
    );
    await fs.access(pdfPath);
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

async function printPdf(pdfPath: string, printerName?: string | null): Promise<{
  assertMs: number;
  spoolMs: number;
}> {
  const { print } = await import('pdf-to-printer');
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
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smart-print-'));
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

export async function printTestPage(printerName?: string | null): Promise<void> {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<style>
  @page { size: 80mm auto; margin: 4mm; }
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
  await printHtmlDocument(html, printerName);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
