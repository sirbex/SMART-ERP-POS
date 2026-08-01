/**
 * One-shot KOT latency probe — measures accept RTT + waits for agent stage logs.
 * Usage: node --import tsx scripts/probe-kot-latency.mts [printerName]
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.join(__dirname, '..', 'logs', 'agent.log');
const printer = process.argv[2] || 'EPSON TM-T88III Receipt';

const kotHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
@page { size: 80mm 297mm; margin: 0; }
body { font-family: 'Courier New', monospace; font-size: 16px; font-weight: 700; width: 72mm; padding: 8px; }
h1 { font-size: 22px; text-align: center; font-weight: 900; }
</style></head><body>
<h1>KITCHEN ORDER</h1>
<div><strong>TABLE 19</strong></div>
<div>Station: KITCHEN</div>
<div>KOT: PROBE-1</div>
<div>Steward: Probe</div>
<div>Time: ${new Date().toLocaleString()}</div>
<hr/>
<div><strong>2</strong> × Burger</div>
<div><strong>1</strong> × Fries</div>
<div style="padding-left:8px">* no onions</div>
<hr/>
<div style="text-align:center;font-weight:900">NO PRICES</div>
</body></html>`;

const tinyHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>@page{size:80mm 297mm;margin:0}body{font-family:Arial;font-size:14px;font-weight:700}</style>
</head><body><div>TEST</div><div>${new Date().toISOString()}</div></body></html>`;

function logLen() {
  if (!existsSync(LOG)) return 0;
  return readFileSync(LOG, 'utf8').length;
}

function readNew(from: number): string {
  if (!existsSync(LOG)) return '';
  const raw = readFileSync(LOG, 'utf8');
  return raw.slice(from);
}

async function runJob(label: string, html: string, named: boolean) {
  const before = logLen();
  const t0 = Date.now();
  const headers: Record<string, string> = { 'Content-Type': 'text/html; charset=utf-8' };
  if (named) headers['X-Printer-Name'] = printer;
  const res = await fetch('http://127.0.0.1:1811/print', { method: 'POST', headers, body: html });
  const acceptMs = Date.now() - t0;
  const body = await res.json();
  console.log(
    JSON.stringify({
      label,
      httpStatus: res.status,
      acceptRttMs: acceptMs,
      acceptMsField: body.acceptMs ?? null,
      id: body.id,
      versionProbe: true,
    }),
  );

  // Wait for matching ok line; take last stages line before it
  const deadline = Date.now() + 90_000;
  let stages = null as string | null;
  let ok = null as string | null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    const chunk = readNew(before);
    const lines = chunk.split(/\r?\n/).filter(Boolean);
    const okLine = lines.find((l) => l.includes(`[print] ok id=${body.id}`));
    if (okLine) {
      ok = okLine;
      const beforeOk = lines.slice(0, lines.indexOf(okLine) + 1);
      stages = [...beforeOk].reverse().find((l) => l.includes('[print] stages')) || null;
      break;
    }
  }
  console.log(JSON.stringify({ label, stages, ok, wallMs: Date.now() - t0 }));
}

const health = await (await fetch('http://127.0.0.1:1811/health')).json();
console.log(JSON.stringify({ healthVersion: health.version, printers: health.printers }));

await runJob('tiny_named', tinyHtml, true);
await runJob('kot_like_named', kotHtml, true);
await runJob('kot_like_default', kotHtml, false);
