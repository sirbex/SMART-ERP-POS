#!/usr/bin/env node
const BASE = process.env.BASE_URL || 'https://henber.wizarddigital-inv.com';
const indexRes = await fetch(`${BASE}/`);
const html = await indexRes.text();
const indexFile = html.match(/\/assets\/(index-[^"]+\.js)/)?.[1];
const indexJs = await (await fetch(`${BASE}/assets/${indexFile}`)).text();
const chunk = indexJs.match(/CustomersPage-[^"']+\.js/)?.[0];
if (!chunk) {
  console.error('CustomersPage chunk not found in index');
  process.exit(1);
}
const js = await (await fetch(`${BASE}/assets/${chunk}`)).text();
const checks = [
  ['customer-invoice-adjustments', js.includes('customer-invoice-adjustments')],
  ['customers.adjust permission key', js.includes('customers.adjust')],
  ['Adjust button label', /Adjust/.test(js) && js.includes('invoice')],
  ['isAdjustableCustomerInvoice or outstanding', js.includes('isAdjustable') || js.includes('outstanding') || js.includes('amount_due')],
  ['AdjustCustomerInvoiceModal', js.includes('AdjustCustomerInvoice') || js.includes('adjustInvoiceOpen')],
];
console.log(`Henber ${chunk} (${js.length} bytes)\n`);
let fail = 0;
for (const [name, ok] of checks) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) fail++;
}
process.exit(fail ? 1 : 0);
