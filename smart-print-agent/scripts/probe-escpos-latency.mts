/**
 * ESC/POS KOT latency probe — measures accept RTT + agent RAW spool (no Chromium).
 * Usage: node --import tsx scripts/probe-escpos-latency.mts [printerName]
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildKotThermalTicket } from '../../shared/printing/buildKotTicket.ts';
import { renderThermalTicketEscPos } from '../../shared/printing/escposRenderer.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG = path.join(__dirname, '..', 'logs', 'agent.log');
const printer = process.argv[2] || 'EPSON TM-T88III Receipt';

const ticket = buildKotThermalTicket({
  kotNumber: 'PROBE-ESC-1',
  station: 'KITCHEN',
  tableLabel: 'TABLE 19',
  sentByName: 'Probe',
  firedAt: new Date().toLocaleString(),
  ticketKind: 'FIRE',
  items: [
    { productName: 'Burger', quantity: 2, lineNotes: 'no onions' },
    { productName: 'Fries', quantity: 1 },
  ],
});

function logLen() {
  if (!existsSync(LOG)) return 0;
  return readFileSync(LOG, 'utf8').length;
}

function readNew(from: number): string {
  if (!existsSync(LOG)) return '';
  return readFileSync(LOG, 'utf8').slice(from);
}

async function main() {
  const health = await fetch('http://127.0.0.1:1811/health').then((r) => r.json());
  console.log(JSON.stringify({ healthVersion: health.version, formats: health.formats }));

  const r0 = performance.now();
  const raw = renderThermalTicketEscPos(ticket);
  const renderMs = performance.now() - r0;

  const before = logLen();
  const t0 = Date.now();
  const res = await fetch('http://127.0.0.1:1811/print', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Print-Format': 'escpos',
      'X-Printer-Name': printer,
    },
    body: Buffer.from(raw),
  });
  const acceptRttMs = Date.now() - t0;
  const body = await res.json();
  console.log(
    JSON.stringify({
      label: 'escpos-kot',
      httpStatus: res.status,
      renderMs: Number(renderMs.toFixed(2)),
      acceptRttMs,
      acceptMsField: body.acceptMs ?? null,
      format: body.format,
      id: body.id,
      bytes: raw.length,
    }),
  );

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    const chunk = readNew(before);
    const lines = chunk.split(/\r?\n/).filter(Boolean);
    const okLine = lines.find((l) => l.includes(`[print] ok id=${body.id}`));
    if (okLine) {
      const stages = [...lines].reverse().find((l) => l.includes('[print] stages')) || null;
      console.log(JSON.stringify({ ok: okLine, stages }));
      return;
    }
  }
  console.error('timeout waiting for agent ok log');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
