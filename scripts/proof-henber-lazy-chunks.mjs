#!/usr/bin/env node
const BASE = process.env.BASE_URL || 'https://henber.wizarddigital-inv.com';
const needle = 'customer-invoice-adjustments';

const indexRes = await fetch(`${BASE}/`);
const html = await indexRes.text();
const indexFile = html.match(/\/assets\/(index-[^"]+\.js)/)?.[1];
if (!indexFile) {
  console.error('No index chunk in HTML');
  process.exit(1);
}
console.log(`Henber index: ${indexFile}`);
const indexJs = await (await fetch(`${BASE}/assets/${indexFile}`)).text();
const lazy = [...new Set([...indexJs.matchAll(/assets\/([A-Za-z0-9_-]+-[A-Za-z0-9_-]+\.js)/g)].map((m) => m[1]))];
console.log(`Lazy chunks referenced from index: ${lazy.length}`);
const targets = lazy.filter((f) => /Customer|customer|Invoice|invoice/i.test(f));
console.log(`Customer/invoice-related lazy chunks: ${targets.join(', ') || '(none by name)'}`);

let found = null;
for (const file of [...targets, ...lazy.filter((f) => f.includes('Customer'))]) {
  const js = await (await fetch(`${BASE}/assets/${file}`)).text();
  if (js.includes(needle)) {
    found = file;
    break;
  }
}
if (!found) {
  for (const file of lazy.slice(0, 40)) {
    const js = await (await fetch(`${BASE}/assets/${file}`)).text();
    if (js.includes(needle)) {
      found = file;
      break;
    }
  }
}
console.log(found ? `PASS adjust API in lazy chunk: ${found}` : 'FAIL adjust API not in index or first 40 lazy chunks');
process.exit(found ? 0 : 1);
