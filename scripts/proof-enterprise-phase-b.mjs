#!/usr/bin/env node
/**
 * Phase B enterprise hygiene proofs (no live API required):
 * - Customer smart-statement service balance math
 * - Invoice OVERDUE server-side filter SQL
 * - PO list hides CANCELLED by default
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(root, 'SamplePOS.Server');

const tests = [
  'src/modules/reports/cnDnReportService.smartCustomer.test.ts',
  'src/modules/reports/cnDnReportRepository.customerScope.test.ts',
  'src/modules/invoices/invoiceListFilters.test.ts',
  'src/modules/purchase-orders/purchaseOrderListFilters.test.ts',
  'src/modules/customers/__tests__/customerStatement.test.ts',
];

console.log('proof-enterprise-phase-b: running Jest proofs…\n');

const result = spawnSync(
  'node',
  [
    '--experimental-vm-modules',
    './node_modules/jest/bin/jest.js',
    ...tests,
    '--runInBand',
  ],
  { cwd: serverDir, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (result.status !== 0) {
  console.error('\nproof-enterprise-phase-b: FAILED');
  process.exit(result.status ?? 1);
}

console.log('\nproof-enterprise-phase-b: PASS');
