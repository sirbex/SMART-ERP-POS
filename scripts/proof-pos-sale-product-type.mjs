/**
 * EVIDENCE: restaurant-enabled retail POS must accept lineItems.productType.
 *
 * Regression: Zod .strict() POSSaleLineItemSchema rejected productType with
 * unrecognized_keys → "VALIDATION STOPPED SALE" on restaurant-enabled tenants.
 *
 * Structure gate (this script) + behavioral gate:
 *   npx vitest run src/__tests__/shared-schemas.spec.ts src/__tests__/pos-integration.spec.ts
 *
 * Run: node scripts/proof-pos-sale-product-type.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const checks = [];
function assert(name, ok, detail = '') {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const posSale = readFileSync(path.join(repoRoot, 'shared/zod/pos-sale.ts'), 'utf8');
const offlineSync = readFileSync(
  path.join(repoRoot, 'SamplePOS.Server/src/modules/pos/offlineSyncRoutes.ts'),
  'utf8',
);
const schemaSpec = readFileSync(
  path.join(repoRoot, 'samplepos.client/src/__tests__/shared-schemas.spec.ts'),
  'utf8',
);
const posPage = readFileSync(
  path.join(repoRoot, 'samplepos.client/src/pages/pos/POSPage.tsx'),
  'utf8',
);

assert(
  'POSSaleLineItemSchema declares optional productType',
  /productType:\s*z\.enum\(\['inventory',\s*'consumable',\s*'service'\]\)\.optional\(\)/.test(
    posSale,
  ),
);

assert(
  'POSSaleLineItemSchema remains .strict() (unknown keys still rejected)',
  /POSSaleLineItemSchema[\s\S]*?\.strict\(\)/.test(posSale),
);

assert(
  'offline sync saleData.lineItems accepts productType',
  /productType:\s*z\.enum\(\['inventory',\s*'consumable',\s*'service'\]\)\.optional\(\)/.test(
    offlineSync,
  ),
);

assert(
  'EVIDENCE vitest case exists for full POSSaleSchema + productType',
  schemaSpec.includes(
    'EVIDENCE restaurant-enabled retail POSSaleSchema accepts lineItems.productType',
  ),
);

assert(
  'EVIDENCE vitest case exists for line-item productType',
  schemaSpec.includes(
    'EVIDENCE line item accepts productType (strict schema no longer unrecognized_keys)',
  ),
);

assert(
  'Retail POS still stamps productType on sale lineItems (source of prior failure)',
  /productType:\s*item\.productType\s*\|\|\s*'inventory'/.test(posPage),
);

const failed = checks.filter((c) => !c.ok);
console.log('');
console.log(`Evidence summary: ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  process.exitCode = 1;
  console.error('PROOF FAILED');
} else {
  console.log('PROOF PASSED — structure gate for retail productType sale validation');
}
