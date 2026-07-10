#!/usr/bin/env node
/**
 * Gate J — architecture fitness (see scripts/ci-inventory-lot-fitness.mjs).
 * Re-exported constants for documentation / tests.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const ARCHITECTURAL_AUXILIARY_PATHS = [
  'SamplePOS.Server/src/utils/inventorySync.ts',
  'SamplePOS.Server/src/services/warehouseInventoryCoupling.ts',
  'SamplePOS.Server/src/modules/goods-receipts/goodsReceiptRepository.ts',
];

export const FEFO_READ_SELECTION_ALLOWLIST = [
  'SamplePOS.Server/src/modules/inventory-lot/postgresLotSelector.ts',
  'SamplePOS.Server/src/modules/inventory/warehouse/warehouseAdjustmentService.ts',
  'SamplePOS.Server/src/modules/inventory/warehouse/productStoreDistributionService.ts',
  'SamplePOS.Server/src/modules/inventory/stockCountRepository.ts',
  'SamplePOS.Server/src/modules/reports/reportsRepository.ts',
  'SamplePOS.Server/src/modules/return-grn/returnGrnValidation.ts',
  'SamplePOS.Server/src/middleware/businessRules.ts',
  'SamplePOS.Server/src/modules/delivery-notes/deliveryNoteService.ts',
  'SamplePOS.Server/src/modules/inventory/inventoryRepository.ts',
  'SamplePOS.Server/src/modules/inventory/stockCountService.ts',
  'SamplePOS.Server/src/modules/inventory/warehouse/expiryAutomationService.ts',
  'SamplePOS.Server/src/modules/inventory/warehouse/posAllocationLockRepository.ts',
  'SamplePOS.Server/src/modules/inventory/warehouse/productLotRepository.ts',
  'SamplePOS.Server/src/modules/pricing/atCostIssuePrice.ts',
];

export function countPendingDebt() {
  const policyPath = path.join(ROOT, 'SamplePOS.Server/src/modules/inventory-lot/inventoryLotArchitecturalPolicy.ts');
  const src = readFileSync(policyPath, 'utf8');
  const m = src.match(/export const PENDING_ARCHITECTURAL_DEBT[\s\S]*?=\s*\[([\s\S]*?)\];/);
  if (!m) return -1;
  return (m[1].match(/\{\s*file:/g) ?? []).length;
}

export function isAuxiliaryPath(relPath) {
  const n = relPath.replace(/\\/g, '/');
  return ARCHITECTURAL_AUXILIARY_PATHS.some((p) => n === p || n.endsWith(p.replace(/^SamplePOS\.Server\//, '')));
}
