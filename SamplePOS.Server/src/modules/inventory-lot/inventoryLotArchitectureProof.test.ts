/**
 * Architecture proof — ADR-002 §11 touchpoint audit (static + registry).
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PENDING_ARCHITECTURAL_DEBT,
  LOT_TOUCHPOINT_REGISTRY,
  LOT_WRITE_GATEWAY,
} from './inventoryLotTouchpointRegistry.js';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function src(rel: string): string {
  return readFileSync(resolve(serverRoot, rel), 'utf8');
}

function rel(path: string): string {
  return path.replace(/\\/g, '/');
}

describe('Inventory lot architecture proof', () => {
  it('registry documents every ADR §11.1 workflow with proof reference', () => {
    expect(LOT_TOUCHPOINT_REGISTRY.length).toBeGreaterThanOrEqual(20);
    for (const row of LOT_TOUCHPOINT_REGISTRY) {
      expect(row.id).toMatch(/^W\d+$/);
      expect(row.proof.length).toBeGreaterThan(0);
      expect(['MIGRATED', 'PARTIAL', 'EXCEPTION', 'DEFERRED', 'NOT_STARTED']).toContain(row.status);
    }
  });

  it('migrated hot paths do not contain direct inventory_batches mutation SQL', () => {
    const migratedFiles = [
      'src/modules/goods-receipts/goodsReceiptService.ts',
      'src/utils/fefoDeduction.ts',
      'src/utils/customerReturnInventory.ts',
      'src/modules/inventory/warehouse/warehouseReturnInventoryService.ts',
      'src/modules/inventory/warehouse/warehouseSaleDeductionService.ts',
      'src/modules/inventory/warehouse/warehouseSupplierReturnDeductionService.ts',
      'src/modules/inventory/warehouse/warehouseSaleVoidRestoreService.ts',
    ];
    const batchMutate = /UPDATE\s+inventory_batches[\s\S]{0,80}?remaining_quantity/i;
    for (const file of migratedFiles) {
      const text = src(file);
      expect(text).not.toMatch(batchMutate);
    }
  });

  it('salesService has zero direct inventory_batches writes', () => {
    const sales = src('src/modules/sales/salesService.ts');
    expect(sales).not.toMatch(/UPDATE\s+inventory_batches/i);
    expect(sales).not.toMatch(/INSERT\s+INTO\s+inventory_batches/i);
  });

  it('every pending architectural debt file exists when debt is non-empty', () => {
    if (PENDING_ARCHITECTURAL_DEBT.length === 0) return;
    for (const ex of PENDING_ARCHITECTURAL_DEBT) {
      const path = resolve(serverRoot, ex.file.replace(/^SamplePOS\.Server\//, ''));
      expect(existsSync(path)).toBe(true);
    }
  });

  it('no new undocumented batch writes outside gateway and debt list', () => {
    const gatewayMarker = 'modules/inventory-lot/';
    const debtSuffixes = PENDING_ARCHITECTURAL_DEBT.map((e) =>
      e.file.replace(/^SamplePOS\.Server\//, '').replace(/\\/g, '/'),
    );
    const allowTest = (p: string) => p.includes('.test.') || p.includes('__tests__');

    const offenders: string[] = [];
    const scanRoots = [
      'src/modules',
      'src/utils',
      'src/services',
    ];

    for (const root of scanRoots) {
      const fullRoot = resolve(serverRoot, root);
      walk(fullRoot, (file) => {
        const r = rel(file);
        if (!r.endsWith('.ts')) return;
        if (allowTest(r)) return;
        if (r.includes(gatewayMarker)) return;

        const normalized = r.replace(/\\/g, '/');
        const relFromServer = normalized.includes('SamplePOS.Server/')
          ? normalized.split('SamplePOS.Server/')[1]!
          : normalized.replace(/^.*SamplePOS\.Server[/\\]/, '');
        if (debtSuffixes.includes(relFromServer)) return;

        const text = readFileSync(file, 'utf8');
        if (/UPDATE\s+inventory_batches\s+SET\s+remaining_quantity/i.test(text)) {
          offenders.push(`${r} — remaining_quantity UPDATE`);
        }
        if (/INSERT\s+INTO\s+inventory_batches/i.test(text)) {
          offenders.push(`${r} — batch INSERT`);
        }
        if (/UPDATE\s+inventory_batches\s+SET\s+expiry_date/i.test(text)) {
          offenders.push(`${r} — expiry_date UPDATE`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  it('CI guardrails script exists and references lot module', () => {
    const script = readFileSync(resolve(serverRoot, '..', 'scripts', 'ci-inventory-lot-guardrails.mjs'), 'utf8');
    expect(script).toContain('inventory-lot');
    expect(script).toContain('LOT-EXP');
  });

  it('write gateway module is the only expiry mutator in production code', () => {
    const repo = src('src/modules/inventory-lot/postgresLotRepository.ts');
    expect(repo).toContain('UPDATE inventory_batches SET expiry_date');
    expect(repo).toContain('UPDATE product_lots SET expiry_date');
  });
});

function walk(dir: string, visit: (file: string) => void) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = resolve(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, visit);
    else visit(full);
  }
}

describe('Inventory lot architecture proof — migrated count', () => {
  it('hot-path workflows are migrated or explicitly deferred', () => {
    const hot = LOT_TOUCHPOINT_REGISTRY.filter((r) =>
      ['W01', 'W02', 'W03', 'W06', 'W07', 'W09', 'W10', 'W11', 'W12', 'W13'].includes(r.id),
    );
    for (const row of hot) {
      expect(row.status).toBe('MIGRATED');
    }
  });

  it('not-started touchpoints are tracked as architectural debt when present', () => {
    const pending = LOT_TOUCHPOINT_REGISTRY.filter((r) => r.status === 'NOT_STARTED');
    if (pending.length === 0) return;
    const debtFiles = PENDING_ARCHITECTURAL_DEBT.map((e) =>
      e.file.split('/').pop()!.replace('.ts', ''),
    );
    for (const row of pending) {
      const base = row.entryFile.replace('.ts', '');
      expect(debtFiles.some((f) => f === base || row.entryFile.includes(f))).toBe(true);
    }
  });
});
