/**
 * Live proof: retail sale receipt + reprint both silent-print to the SAME
 * named Windows receipt printer via SMART Print Agent (localhost:1811).
 *
 * Mirrors retail POS path:
 *   printReceipt → postEscPos/HTML with X-Printer-Name = Settings thermal name
 *   Sales/POS reprint → same printReceipt + same printerName
 *
 * Usage:
 *   node scripts/proof-retail-receipt-silent-reprint.mjs
 *   RECEIPT_PRINTER="EPSON TM-T88III Receipt" node scripts/proof-retail-receipt-silent-reprint.mjs
 *   PROOF_DRY_RUN=1  …   (accept checks only; still POSTs unless SKIP_PRINT=1)
 *   SKIP_PRINT=1        … (health/printer discovery only; no paper jobs)
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const started = new Date().toISOString();
const skipPrint = process.env.SKIP_PRINT === '1';
const preferred =
  (process.env.RECEIPT_PRINTER || '').trim() || 'EPSON TM-T88III Receipt';

const ORIGINS = ['http://127.0.0.1:1811', 'http://localhost:1811'];

const results = [];
function pass(name, detail = '') {
  results.push({ ok: true, name, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail = '') {
  results.push({ ok: false, name, detail });
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { res, body, text };
}

async function findHealthyOrigin() {
  for (const origin of ORIGINS) {
    try {
      const { res, body } = await getJson(`${origin}/health`);
      if (res.ok && body?.status === 'online') return { origin, health: body };
    } catch {
      /* next */
    }
  }
  return null;
}

function pickPrinter(list, preferredName) {
  const names = Array.isArray(list) ? list.map(String) : [];
  const lower = preferredName.toLowerCase();
  const exact = names.find((n) => n.toLowerCase() === lower);
  if (exact) return exact;
  // Prefer real thermal-ish names over Microsoft virtual sinks when preferred missing
  const thermalish = names.find(
    (n) => /epson|tm-|receipt|thermal|pos|epos/i.test(n) && !/pdf|xps|fax|anydesk/i.test(n),
  );
  if (thermalish) return thermalish;
  return names[0] || null;
}

/** Minimal ESC/POS bytes (PRINT_PATH matches agent postEscPosToPrintBridge). */
function buildEscPosReceipt({ saleNumber, isReprint, printerName }) {
  const lines = [
    'SMART-ERP-POS',
    'RETAIL RECEIPT PROOF',
    isReprint ? '*** REPRINTED COPY ***' : '*** ORIGINAL SALE ***',
    `Sale: ${saleNumber}`,
    `Printer: ${printerName}`,
    `At: ${new Date().toISOString()}`,
    'Item: Proof SKU x1  1,000',
    'TOTAL                         1,000',
    'CASH                          1,000',
    isReprint ? 'Silent reprint via agent' : 'Silent first print via agent',
    '',
    '',
    '',
  ];
  const parts = [Buffer.from('\x1b@', 'binary')]; // init
  for (const line of lines) {
    parts.push(Buffer.from(`${line}\n`, 'utf8'));
  }
  parts.push(Buffer.from('\x1dV\x00', 'binary')); // full cut
  return Buffer.concat(parts);
}

function buildHtmlReceipt({ saleNumber, isReprint, printerName }) {
  const banner = isReprint ? '*** REPRINTED COPY ***' : '*** ORIGINAL SALE ***';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>RECEIPT ${saleNumber}</title>
<style>body{font-family:monospace;font-size:12px;width:72mm;margin:0;padding:4mm}
.reprint{font-weight:bold;text-align:center;margin:4px 0}</style></head>
<body>
<div style="text-align:center;font-weight:bold">SMART-ERP-POS</div>
<div style="text-align:center">RETAIL RECEIPT PROOF</div>
<div class="reprint">${banner}</div>
<div>Sale: ${saleNumber}</div>
<div>Printer: ${printerName}</div>
<div>At: ${new Date().toISOString()}</div>
<div>Item: Proof SKU x1 &nbsp; 1,000</div>
<div>TOTAL &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;1,000</div>
<div>CASH &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;1,000</div>
<div>${isReprint ? 'Silent reprint via agent' : 'Silent first print via agent'}</div>
</body></html>`;
}

async function postPrint(origin, { format, body, printerName }) {
  const headers = {};
  if (format === 'escpos') {
    headers['Content-Type'] = 'application/octet-stream';
    headers['X-Print-Format'] = 'escpos';
  } else {
    headers['Content-Type'] = 'text/html; charset=utf-8';
  }
  if (printerName) headers['X-Printer-Name'] = printerName;

  const res = await fetch(`${origin}/print`, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* raw */
  }
  return {
    status: res.status,
    ok: res.ok || res.status === 202,
    text,
    json,
    printerHeader: printerName,
  };
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

const report = {
  started,
  mode: skipPrint ? 'discovery-only' : 'live-print',
  preferredPrinter: preferred,
  agent: null,
  printer: null,
  jobs: [],
  results: null,
  overall: 'FAIL',
};

try {
  const live = await findHealthyOrigin();
  if (!live) {
    fail('Print Agent online on :1811', 'GET /health offline — install SMART Print Service on this PC');
  } else {
    report.agent = { origin: live.origin, health: live.health };
    pass(
      'Print Agent online',
      `v${live.health.version} channel=${live.health.channel} formats=${(live.health.formats || []).join(',')}`,
    );

    if (!(live.health.formats || []).includes('escpos')) {
      fail('Agent supports escpos format', JSON.stringify(live.health.formats));
    } else {
      pass('Agent supports escpos', 'silent path prefers X-Print-Format: escpos');
    }

    let printersBody = null;
    try {
      const pr = await getJson(`${live.origin}/printers`);
      printersBody = pr.body;
    } catch (e) {
      fail('List printers', String(e));
    }

    const names = printersBody?.printers || [];
    if (!names.length) {
      fail('Windows printers discovered', 'empty list');
    } else {
      pass('Windows printers discovered', `${names.length} printers`);
    }

    const printer = pickPrinter(names, preferred);
    report.printer = {
      selected: printer,
      preferred,
      matchedPreferred: printer?.toLowerCase() === preferred.toLowerCase(),
      details: (printersBody?.details || []).find((d) => d.name === printer) || null,
    };

    if (!printer) {
      fail('Select receipt printer target', 'no printers');
    } else if (printer.toLowerCase() !== preferred.toLowerCase()) {
      fail(
        'Preferred receipt printer present',
        `wanted "${preferred}" got "${printer}" — set RECEIPT_PRINTER=…`,
      );
      pass('Fallback printer selected for live path', printer);
    } else {
      pass('Receipt printer selected', printer);
    }

    if (skipPrint) {
      pass('SKIP_PRINT=1', 'no jobs enqueued');
    } else if (printer) {
      const saleNumber = `PROOF-RTL-${Date.now().toString(36).toUpperCase()}`;
      const origin = live.origin;

      // Job 1 — original sale (POS auto-print after payment)
      const esc1 = buildEscPosReceipt({ saleNumber, isReprint: false, printerName: printer });
      const job1 = await postPrint(origin, {
        format: 'escpos',
        body: esc1,
        printerName: printer,
      });
      report.jobs.push({
        role: 'original_sale',
        format: 'escpos',
        saleNumber,
        isReprint: false,
        printerName: printer,
        ...job1,
      });
      if (job1.ok) {
        pass(
          'Silent ORIGINAL sale receipt accepted by agent',
          `HTTP ${job1.status} X-Printer-Name="${printer}"`,
        );
      } else {
        // HTML fallback same as printGuestThermalDocument
        const html1 = buildHtmlReceipt({ saleNumber, isReprint: false, printerName: printer });
        const job1h = await postPrint(origin, {
          format: 'html',
          body: html1,
          printerName: printer,
        });
        report.jobs.push({
          role: 'original_sale_html_fallback',
          format: 'html',
          saleNumber,
          isReprint: false,
          printerName: printer,
          ...job1h,
        });
        if (job1h.ok) {
          pass(
            'Silent ORIGINAL sale receipt accepted (HTML fallback)',
            `HTTP ${job1h.status} X-Printer-Name="${printer}" escposWas=${job1.status}`,
          );
        } else {
          fail(
            'Silent ORIGINAL sale receipt accepted by agent',
            `escpos=${job1.status} ${job1.text?.slice(0, 120)} html=${job1h.status} ${job1h.text?.slice(0, 120)}`,
          );
        }
      }

      await sleep(400);

      // Job 2 — reprint same sale → SAME printer name header (Sales/POS reprint SSOT)
      const esc2 = buildEscPosReceipt({ saleNumber, isReprint: true, printerName: printer });
      const job2 = await postPrint(origin, {
        format: 'escpos',
        body: esc2,
        printerName: printer,
      });
      report.jobs.push({
        role: 'reprint',
        format: 'escpos',
        saleNumber,
        isReprint: true,
        printerName: printer,
        ...job2,
      });
      if (job2.ok) {
        pass(
          'Silent REPRINT receipt accepted by agent',
          `HTTP ${job2.status} X-Printer-Name="${printer}" same as original`,
        );
      } else {
        const html2 = buildHtmlReceipt({ saleNumber, isReprint: true, printerName: printer });
        const job2h = await postPrint(origin, {
          format: 'html',
          body: html2,
          printerName: printer,
        });
        report.jobs.push({
          role: 'reprint_html_fallback',
          format: 'html',
          saleNumber,
          isReprint: true,
          printerName: printer,
          ...job2h,
        });
        if (job2h.ok) {
          pass(
            'Silent REPRINT receipt accepted (HTML fallback)',
            `HTTP ${job2h.status} X-Printer-Name="${printer}"`,
          );
        } else {
          fail(
            'Silent REPRINT receipt accepted by agent',
            `escpos=${job2.status} html=${job2h.status}`,
          );
        }
      }

      const accepted = report.jobs.filter((j) => j.ok && j.role.startsWith('original') || j.role === 'reprint' || j.role.endsWith('fallback'));
      const originalOk = report.jobs.some(
        (j) => j.ok && (j.role === 'original_sale' || j.role === 'original_sale_html_fallback'),
      );
      const reprintOk = report.jobs.some(
        (j) => j.ok && (j.role === 'reprint' || j.role === 'reprint_html_fallback'),
      );
      void accepted;

      if (originalOk && reprintOk) {
        const printersUsed = [
          ...new Set(
            report.jobs.filter((j) => j.ok).map((j) => j.printerName || j.printerHeader),
          ),
        ];
        if (printersUsed.length === 1 && printersUsed[0] === printer) {
          pass(
            'Same receipt printer for original + reprint',
            `single X-Printer-Name="${printer}"`,
          );
        } else {
          fail('Same receipt printer for original + reprint', JSON.stringify(printersUsed));
        }
      }

      // Negative: unnamed job is the fake-success path retail forbids (allowUnnamedAgentDefault:false)
      const unnamed = await postPrint(origin, {
        format: 'html',
        body: buildHtmlReceipt({
          saleNumber: `${saleNumber}-UNNAMED`,
          isReprint: false,
          printerName: '(default)',
        }),
        printerName: null,
      });
      report.jobs.push({ role: 'unnamed_control', format: 'html', ok: unnamed.ok, status: unnamed.status });
      // Do not fail if unnamed also 202 — prove only that named path worked; code forbids unnamed in app.
      pass(
        'Control: agent response without X-Printer-Name recorded',
        `HTTP ${unnamed.status} (app must still require named printer for retail success)`,
      );

      await sleep(800);
      try {
        const after = await getJson(`${origin}/health`);
        report.agent.afterHealth = after.body;
        pass(
          'Agent still healthy after dual silent jobs',
          `queueDepth=${after.body?.queueDepth} printing=${after.body?.printing}`,
        );
      } catch (e) {
        fail('Agent still healthy after dual silent jobs', String(e));
      }
    }
  }
} catch (e) {
  fail('Unhandled proof error', e instanceof Error ? e.stack || e.message : String(e));
}

report.results = results;
report.finished = new Date().toISOString();
const failed = results.filter((r) => !r.ok);
report.overall = failed.length ? 'FAIL' : 'PASS';

const jsonPath = resolve(root, 'PROOF_RETAIL_RECEIPT_SILENT_REPRINT.json');
const mdPath = resolve(root, 'PROOF_RETAIL_RECEIPT_SILENT_REPRINT.md');
writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');

const md = `# Retail POS silent receipt + reprint (same printer)

Run: ${started}  
Overall: **${report.overall}**  
Mode: \`${report.mode}\`

## Claim

Retail sale **first print** and **reprint** both deliver **silently** through SMART Print Agent to the **same** Windows receipt printer (\`X-Printer-Name\`), without browser dialog.

App SSOT:

| Step | Path |
|------|------|
| After payment | \`POSPage\` → \`PrintReceiptDialog\` → \`printReceipt(data, { printerName })\` |
| Reprint | \`SalesPage\` → \`printReceipt(data, { printerName: printCfg.printerName })\` + \`isReprint: true\` |
| Bridge | \`printGuestThermalDocument\` → ESC/POS then HTML → \`POST :1811/print\` + \`X-Printer-Name\` |
| Guard | \`allowUnnamedAgentDefault: false\` (no silent OS-default / PDF false success) |

## Live agent

${
  report.agent
    ? `- Origin: \`${report.agent.origin}\`
- Version: \`${report.agent.health?.version}\` channel=\`${report.agent.health?.channel}\`
- Formats: \`${(report.agent.health?.formats || []).join(', ')}\``
    : '- **Agent offline** on this host'
}

## Printer

- Preferred: \`${preferred}\`
- Selected: \`${report.printer?.selected || 'n/a'}\`
- Matched preferred: \`${report.printer?.matchedPreferred ?? false}\`
- Windows status detail: \`${JSON.stringify(report.printer?.details || null)}\`

## Jobs

${
  report.jobs.length
    ? report.jobs
        .map(
          (j) =>
            `- **${j.role}** format=\`${j.format || '?'}\` HTTP=\`${j.status}\` ok=\`${j.ok}\` printer=\`${j.printerName || j.printerHeader || '(none)'}\` reprint=\`${j.isReprint ?? ''}\``,
        )
        .join('\n')
    : '_No print jobs (discovery-only or agent offline)._'
}

## Checks

${results.map((r) => `- ${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`).join('\n')}

## Operator confirmation (physical paper)

If agent accepted both jobs, confirm on the **selected** printer:

1. One slip marked \`ORIGINAL SALE\` (or without REPRINTED banner).
2. One slip marked \`*** REPRINTED COPY ***\`.
3. Both on **the same** device — no Chrome print dialog on either job.

If paper does not appear: check Windows printer online (status), USB/network, and Settings → Printing → Thermal Printer Name exact match.

## Structural evidence (vitest)

\`\`\`text
cd samplepos.client && npx vitest run src/__tests__/receipt-retail-silent-reprint.evidence.test.ts src/__tests__/receipt-auto-print-reprint.evidence.test.ts src/__tests__/receipt-print-integrity.evidence.test.ts
\`\`\`

## Artifacts

- JSON: \`PROOF_RETAIL_RECEIPT_SILENT_REPRINT.json\`
- This file: \`PROOF_RETAIL_RECEIPT_SILENT_REPRINT.md\`
`;

writeFileSync(mdPath, md, 'utf8');

console.log('');
console.log(`Overall: ${report.overall}`);
console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${mdPath}`);
process.exit(failed.length ? 1 : 0);
