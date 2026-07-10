import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { selectLots } from '../../shared/inventory-lot/index.js';
import type { SelectableLot } from '../../shared/inventory-lot/lotSelection.js';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(serverRoot, '..');
const OUT = process.env.PROOF_OUT || resolve(repoRoot, 'PROOF_INVENTORY_LOT_SCALE_RUN.md');
const BUSINESS_DATE = '2026-07-07';
const RUN_1M = process.env.LOT_SCALE_1M === '1';

function makeLots(count: number): SelectableLot[] {
  return Array.from({ length: count }, (_, i) => ({
    lotId: `scale-${i}`,
    lotNumber: `S-${String(i).padStart(7, '0')}`,
    productId: 'scale-product',
    remainingQuantity: 1 + (i % 20),
    costPrice: 10 + (i % 100),
    expiryDate: i % 17 === 0 ? null : `2027-${String((i % 12) + 1).padStart(2, '0')}-15`,
    receivedDate: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
  }));
}

function benchmark(count: number, quantity: number) {
  const lots = makeLots(count);
  const start = performance.now();
  const result = selectLots({
    policy: 'FEFO',
    lots,
    quantity,
    businessDate: BUSINESS_DATE,
  });
  const elapsedMs = Math.round(performance.now() - start);
  return { count, quantity, elapsedMs, shortfall: result.shortfall, totalAllocated: result.totalAllocated };
}

const lines: string[] = [
  '# Inventory Lot — Scale Proof\n',
  `Run: ${new Date().toISOString()}\n`,
];

const results = [
  benchmark(100_000, 25_000),
  benchmark(250_000, 50_000),
];

if (RUN_1M) {
  results.push(benchmark(1_000_000, 100_000));
} else {
  lines.push('- **SKIP** 1M benchmark not run by default — set `LOT_SCALE_1M=1` for full run\n');
}

for (const r of results) {
  lines.push(`- Lots=${r.count.toLocaleString()} qty=${r.quantity.toLocaleString()} elapsed=${r.elapsedMs}ms allocated=${r.totalAllocated} shortfall=${r.shortfall}`);
}

const pass100k = results[0].elapsedMs < 2000 && results[0].shortfall === 0;
lines.push(`\n## Result\n`);
lines.push(`- 100k gate: **${pass100k ? 'PASS' : 'FAIL'}** (< 2000ms)`);
lines.push(`- 250k benchmark: **RECORDED**`);
lines.push(`- 1M benchmark: **${RUN_1M ? 'RECORDED' : 'PENDING'}**`);

const status = pass100k ? (RUN_1M ? 'PASS' : 'PARTIAL') : 'FAIL';

writeFileSync(OUT, lines.join('\n') + '\n');
console.log(lines.join('\n'));
console.log(`STATUS: ${status}`);
process.exit(pass100k ? 0 : 1);
