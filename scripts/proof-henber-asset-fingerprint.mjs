#!/usr/bin/env node
/** Read-only: fingerprint henber served HTML/JS (no login). */
const BASE = process.env.BASE_URL || 'https://henber.wizarddigital-inv.com';
const needles = ['customer-invoice-adjustments', '/customer-invoice-adjustments/'];

const htmlRes = await fetch(`${BASE}/`);
const html = await htmlRes.text();
console.log(`GET / → ${htmlRes.status}`);
console.log(`  cache-control: ${htmlRes.headers.get('cache-control') || '(none)'}`);
console.log(`  date: ${htmlRes.headers.get('date') || '(none)'}`);

const assets = [...html.matchAll(/\/assets\/([^"]+\.js)/g)].map((m) => m[1]);
console.log(`  entry JS chunks in HTML: ${assets.length}`);
for (const a of assets) console.log(`    - ${a}`);

let hit = null;
for (const file of assets) {
  const jsRes = await fetch(`${BASE}/assets/${file}`);
  const js = await jsRes.text();
  if (needles.some((n) => js.includes(n))) hit = file;
}
if (hit) console.log(`\nAdjust API path found in: assets/${hit}`);
else console.log('\nAdjust API path NOT in any entry chunk scanned.');

const localIndex = 'dist/index.html';
try {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'samplepos.client');
  const localHtml = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8');
  const localAssets = [...localHtml.matchAll(/\/assets\/([^"]+\.js)/g)].map((m) => m[1]);
  console.log('\nLocal dist/index.html entry chunks (after proof:adjust-button:bundle):');
  for (const a of localAssets.slice(0, 8)) console.log(`    - ${a}`);
  const localHit = localAssets.find((f) => {
    const t = fs.readFileSync(path.join(root, 'dist', 'assets', f), 'utf8');
    return needles.some((n) => t.includes(n));
  });
  console.log(localHit ? `  Local adjust path in: assets/${localHit}` : '  Local adjust path: run npm run proof:adjust-button:bundle first');
} catch (e) {
  console.log('\nLocal dist: not built or missing —', e.message);
}

process.exit(hit ? 0 : 1);
