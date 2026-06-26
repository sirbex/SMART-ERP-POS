#!/usr/bin/env node
/** Read-only: scan production frontend bundles for deploy feature markers (no login). */
const tenants = (process.env.TENANT_URLS ||
  'https://henber.wizarddigital-inv.com,https://bliss-interior-ltd.wizarddigital-inv.com,https://dynamics.wizarddigital-inv.com,https://blis.wizarddigital-inv.com')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const needles = [
  'invoiceAuthorisedByName',
  'Quotation Authorised By',
  'Invoice Authorised By',
  'InvoiceSourceQuotationPanel',
];

let pass = 0;
let fail = 0;

for (const base of tenants) {
  console.log(`\n── ${base} ──`);
  const healthRes = await fetch(`${base}/api/health`);
  const health = healthRes.ok ? await healthRes.json() : null;
  console.log(`  health: ${healthRes.status} uptime=${health?.data?.uptime?.toFixed?.(0) ?? '?'}s`);

  const htmlRes = await fetch(`${base}/`);
  const html = await htmlRes.text();
  const assets = [...html.matchAll(/\/assets\/([^"']+\.js)/g)].map((m) => m[1]);
  console.log(`  JS chunks in HTML: ${assets.length}`);

  const hits = {};
  for (const file of assets) {
    const jsRes = await fetch(`${base}/assets/${file}`);
    const js = await jsRes.text();
    for (const n of needles) {
      if (js.includes(n)) hits[n] = file;
    }
  }

  for (const n of needles) {
    const found = !!hits[n];
    console.log(`  ${found ? 'PASS' : 'FAIL'}  ${n}${hits[n] ? ` (${hits[n]})` : ''}`);
    if (found) pass += 1;
    else fail += 1;
  }
}

console.log(`\nFingerprint: ${pass} markers found, ${fail} missing`);
process.exit(fail > 0 ? 1 : 0);
