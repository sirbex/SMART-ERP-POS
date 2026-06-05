#!/usr/bin/env node
/**
 * Proof: sortable column headers (Customer/Inventory/Sales/Suppliers)
 *        + accounting modules on axios auth (no raw fetch logout risk).
 *
 * Run: npm run proof:sortable-tables
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientDir = path.join(root, 'samplepos.client');

let failed = 0;
function pass(msg) {
  console.log(`PASS ${msg}`);
}
function fail(msg) {
  console.error(`FAIL ${msg}`);
  failed++;
}

console.log('\n' + '═'.repeat(60));
console.log(' proof — table-sort-accounting-auth.spec.ts');
console.log('═'.repeat(60));

const vitest = spawnSync(
  'npm',
  ['test', '--', '--run', 'table-sort-accounting-auth'],
  { cwd: clientDir, stdio: 'inherit', shell: true },
);
if (vitest.status !== 0) fail('table-sort-accounting-auth unit + source checks');
else pass('table-sort-accounting-auth unit + source checks');

console.log('\n' + '═'.repeat(60));
console.log(' proof — Client production build');
console.log('═'.repeat(60));

const build = spawnSync('npm', ['run', 'build'], {
  cwd: clientDir,
  stdio: 'inherit',
  shell: true,
});
if (build.status !== 0) fail('TypeScript + Vite production build');
else pass('TypeScript + Vite production build');

console.log('\n' + '═'.repeat(60));
if (failed > 0) {
  console.error(`proof-sortable-tables-accounting: ${failed} CHECK(S) FAILED`);
  process.exit(1);
}

console.log('proof-sortable-tables-accounting: ALL CHECKS PASSED');
console.log('');
console.log('Verified:');
console.log('  • tableSortUtils ascending/descending sort');
console.log('  • SortableTableHeader on Suppliers/Customers/Sales/Inventory');
console.log('  • useExpenses, JournalEntries, ExpenseCategories, AssetAccounting → api axios');
console.log('  • Production client build');
console.log('═'.repeat(60));
process.exit(0);
