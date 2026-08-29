/**
 * PROOF (integrity): MUoM lifecycle — stock/factor/rebase guards.
 *
 * Emits (repo root):
 *   PROOF_MUOM_LIFECYCLE_STOCK_GUARDS.md
 *   PROOF_MUOM_LIFECYCLE_STOCK_GUARDS.json
 *
 * Re-run:
 *   npm run proof:muom-lifecycle-stock-guards
 *
 * Scope is only what these gates assert. No unverified claims.
 */
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import {
  canChangeConversionFactor,
  hasMaterialStockOnHand,
  isBaseUomIdentityChange,
  isMeaningfulFactorChange,
  MUOM_LIFECYCLE_MESSAGES,
  rebaseBlockedReason,
  residualFactorChangeBlockedReason,
} from '../../../../shared/domain/muomLifecycleSsot.js';

type MockFn = jest.Mock<(...args: unknown[]) => unknown>;
type Gate = { id: string; ok: boolean; detail: string };

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repoRoot = path.resolve(serverRoot, '..');
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string): void {
  gates.push({ id, ok, detail });
  if (!ok) {
    expect({ id, ok, detail }).toEqual({ id, ok: true, detail });
  }
}

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

function fileHas(rel: string, re: RegExp | string): boolean {
  const p = path.join(repoRoot, rel);
  if (!existsSync(p)) return false;
  const src = readFileSync(p, 'utf8');
  return typeof re === 'string' ? src.includes(re) : re.test(src);
}

const mockRepo = {
  getUomById: jest.fn<MockFn>(),
  getProductBaseUomId: jest.fn<MockFn>(),
  listProductUoms: jest.fn<MockFn>(),
  setProductUomAsBase: jest.fn<MockFn>(),
  unsetDefaultForProduct: jest.fn<MockFn>(),
  createProductUom: jest.fn<MockFn>(),
  updateProductUom: jest.fn<MockFn>(),
  getProductUomById: jest.fn<MockFn>(),
  deleteItemUomConversionBySource: jest.fn<MockFn>(),
  deleteAllItemUomConversionsForProduct: jest.fn<MockFn>(),
  upsertItemUomConversion: jest.fn<MockFn>(),
  listItemUomConversions: jest.fn<MockFn>(),
  setProductBaseUomId: jest.fn<MockFn>(),
  setProductPurchaseUomId: jest.fn<MockFn>(),
  getProductPurchaseUomContext: jest.fn<MockFn>(),
  getProductOnHandBase: jest.fn<MockFn>(),
  getProductSummary: jest.fn<MockFn>(),
  listUoms: jest.fn<MockFn>(),
  createUom: jest.fn<MockFn>(),
  getProductLegacyUnitOfMeasure: jest.fn<MockFn>(),
  getProductName: jest.fn<MockFn>(),
};

jest.unstable_mockModule('./uomRepository.js', () => mockRepo);
jest.unstable_mockModule('../audit/auditService.js', () => ({
  logUomPriceOverride: jest.fn<MockFn>(),
}));
jest.unstable_mockModule('../../db/unitOfWork.js', () => ({
  UnitOfWork: {
    run: async (_pool: unknown, fn: (client: unknown) => Promise<unknown>) =>
      fn({
        query: jest
          .fn<MockFn>()
          .mockResolvedValue({ rows: [{ cost_price: '100', selling_price: '150' }] }),
      }),
    runOrJoin: async (_handle: unknown, fn: (client: unknown) => Promise<unknown>) =>
      fn({
        query: jest
          .fn<MockFn>()
          .mockResolvedValue({ rows: [{ cost_price: '100', selling_price: '150' }] }),
      }),
    isPool: (handle: unknown) => typeof (handle as Pool).totalCount === 'number',
  },
}));

const { updateProductUom } = await import('./uomService.js');
const mockPool = { totalCount: 1 } as Pool;

const productId = '099172ce-f327-4e1f-8ce4-b10e61d5bc50';
const boxUomId = 'b0000000-0000-4000-8000-000000000002';
const pcUomId = 'c0000000-0000-4000-8000-000000000003';
const packUomId = 'd0000000-0000-4000-8000-000000000004';
const boxPuId = 'e0000000-0000-4000-8000-000000000005';
const packPuId = 'f0000000-0000-4000-8000-000000000006';

describe('PROOF: schema columns used by on-hand gate', () => {
  it('locks product_inventory + inventory_batches columns from migrations', () => {
    gate(
      'SCHEMA_PRODUCT_INVENTORY',
      fileHas('shared/sql/410_product_vertical_partition.sql', 'CREATE TABLE IF NOT EXISTS product_inventory') &&
        fileHas('shared/sql/410_product_vertical_partition.sql', 'quantity_on_hand'),
      'product_inventory.quantity_on_hand exists in migration 410',
    );
    gate(
      'SCHEMA_INVENTORY_BATCHES',
      fileHas('shared/sql/001_initial_schema.sql', 'CREATE TABLE inventory_batches') &&
        fileHas('shared/sql/001_initial_schema.sql', 'remaining_quantity') &&
        fileHas('shared/sql/001_initial_schema.sql', 'product_id'),
      'inventory_batches.remaining_quantity + product_id exist in 001',
    );
    gate(
      'SCHEMA_SNAPSHOT_COLS',
      fileHas('shared/sql/415_sap_uom_snapshot_columns.sql', 'conversion_factor') &&
        fileHas('shared/sql/415_sap_uom_snapshot_columns.sql', 'History must NEVER depend on current master data'),
      'transaction snapshot invariant documented in 415',
    );
  });
});

describe('PROOF: source wiring', () => {
  it('service + repository call SSOT and on-hand measurement', () => {
    const svc = readRepo('SamplePOS.Server/src/modules/products/uomService.ts');
    const repo = readRepo('SamplePOS.Server/src/modules/products/uomRepository.ts');
    const ssot = readRepo('shared/domain/muomLifecycleSsot.ts');

    gate('WIRE_SSOT_FILE', existsSync(path.join(repoRoot, 'shared/domain/muomLifecycleSsot.ts')), 'SSOT file present');
    gate(
      'WIRE_SVC_IMPORTS_SSOT',
      svc.includes('muomLifecycleSsot') &&
        svc.includes('rebaseBlockedReason') &&
        svc.includes('residualFactorChangeBlockedReason') &&
        svc.includes('isMeaningfulFactorChange'),
      'uomService imports lifecycle SSOT',
    );
    gate(
      'WIRE_SVC_CALLS_ONHAND',
      /updateProductUom[\s\S]*getProductOnHandBase/.test(svc),
      'updateProductUom measures on-hand before factor change',
    );
    gate(
      'WIRE_SVC_NO_SILENT_REBASE',
      !svc.includes('pendingBaseUomId') && svc.includes('rebaseBlockedReason'),
      'pendingBaseUomId rebase path absent; rebaseBlockedReason present',
    );
    gate(
      'WIRE_REPO_ONHAND_SQL',
      repo.includes('getProductOnHandBase') &&
        repo.includes('product_inventory') &&
        repo.includes('inventory_batches') &&
        repo.includes('remaining_quantity') &&
        repo.includes('GREATEST'),
      'on-hand SQL uses inventory cache + batch remaining',
    );
    gate(
      'WIRE_SSOT_MESSAGES',
      ssot.includes(MUOM_LIFECYCLE_MESSAGES.rebaseBlocked) &&
        ssot.includes(MUOM_LIFECYCLE_MESSAGES.factorChangeWithStock),
      'SSOT message constants stable',
    );
    gate(
      'WIRE_NPM_SCRIPT',
      fileHas('SamplePOS.Server/package.json', 'proof:muom-lifecycle-stock-guards') &&
        fileHas('package.json', 'proof:muom-lifecycle-stock-guards'),
      'npm proof scripts registered',
    );
  });
});

describe('PROOF: domain SSOT pure functions', () => {
  it('stock + factor + rebase predicates', () => {
    gate('STOCK_DETECT', hasMaterialStockOnHand(10) && !hasMaterialStockOnHand(0), 'on-hand detect');
    gate(
      'FACTOR_GATE',
      canChangeConversionFactor(0) && !canChangeConversionFactor(2.5),
      'factor only when stock ~0',
    );
    gate(
      'FACTOR_MSG',
      residualFactorChangeBlockedReason(5) === MUOM_LIFECYCLE_MESSAGES.factorChangeWithStock,
      'factor block message SSOT',
    );
    gate(
      'FACTOR_MEANINGFUL',
      isMeaningfulFactorChange(12, 10) && !isMeaningfulFactorChange(12, 12),
      'meaningful factor delta',
    );
    gate(
      'REBASE_DETECT',
      isBaseUomIdentityChange({
        uomIdChanging: true,
        isDefaultRow: true,
        rowUomId: boxUomId,
        baseUomId: boxUomId,
      }) &&
        !isBaseUomIdentityChange({
          uomIdChanging: true,
          isDefaultRow: false,
          rowUomId: packUomId,
          baseUomId: boxUomId,
        }),
      'base row identity change is rebase; pack rename is not',
    );
    gate(
      'REBASE_MSG',
      rebaseBlockedReason({
        uomIdChanging: true,
        isDefaultRow: true,
        rowUomId: boxUomId,
        baseUomId: boxUomId,
      }) === MUOM_LIFECYCLE_MESSAGES.rebaseBlocked,
      'rebase message SSOT',
    );
  });
});

describe('PROOF: updateProductUom behavioral guards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRepo.getProductBaseUomId.mockResolvedValue(boxUomId);
    mockRepo.getProductOnHandBase.mockResolvedValue(0);
    mockRepo.getProductSummary.mockResolvedValue({ name: 'Demo SKU', sku: 'DEMO-1' });
    mockRepo.listProductUoms.mockResolvedValue([
      {
        id: boxPuId,
        productId,
        uomId: boxUomId,
        uomName: 'BOX',
        conversionFactor: '1',
        isDefault: true,
      },
      {
        id: packPuId,
        productId,
        uomId: packUomId,
        uomName: 'PACK',
        conversionFactor: '12',
        isDefault: false,
      },
    ]);
    mockRepo.listItemUomConversions.mockResolvedValue([
      {
        itemId: productId,
        fromUomId: packUomId,
        toUomId: boxUomId,
        factor: 12,
        isCanonical: true,
      },
    ]);
    mockRepo.getProductPurchaseUomContext.mockResolvedValue({
      purchaseUomId: boxUomId,
      conversionFactor: 1,
      baseUomId: boxUomId,
    });
    mockRepo.getUomById.mockImplementation(async (id: unknown) => {
      if (id === boxUomId) return { id, name: 'BOX' };
      if (id === packUomId) return { id, name: 'PACK' };
      if (id === pcUomId) return { id, name: 'PC' };
      return null;
    });
  });

  it('blocks conversion factor change when on-hand > 0', async () => {
    mockRepo.getProductUomById.mockResolvedValue({
      id: packPuId,
      productId,
      uomId: packUomId,
      conversionFactor: '12',
      isDefault: false,
    });
    mockRepo.getProductOnHandBase.mockResolvedValue(10);

    let threw = false;
    try {
      await updateProductUom(packPuId, { conversionFactor: 10 }, undefined, mockPool);
    } catch (e) {
      threw = e instanceof Error && e.message.includes('stock remains on hand');
    }
    gate('BEH_FACTOR_BLOCK', threw && mockRepo.updateProductUom.mock.calls.length === 0, 'no DB write on factor block');
  });

  it('allows conversion factor change when on-hand is 0', async () => {
    mockRepo.getProductUomById.mockResolvedValue({
      id: packPuId,
      productId,
      uomId: packUomId,
      conversionFactor: '12',
      isDefault: false,
    });
    mockRepo.getProductOnHandBase.mockResolvedValue(0);
    mockRepo.updateProductUom.mockResolvedValue({
      id: packPuId,
      productId,
      uomId: packUomId,
      conversionFactor: '10',
      isDefault: false,
    });

    await updateProductUom(packPuId, { conversionFactor: 10 }, undefined, mockPool);
    gate('BEH_FACTOR_OK_ZERO', mockRepo.updateProductUom.mock.calls.length === 1, 'factor edit at zero stock');
  });

  it('blocks base UoM identity change via product_uom uomId rename', async () => {
    mockRepo.getProductUomById.mockResolvedValue({
      id: boxPuId,
      productId,
      uomId: boxUomId,
      conversionFactor: '1',
      isDefault: true,
    });

    let threw = false;
    try {
      await updateProductUom(boxPuId, { uomId: pcUomId }, undefined, mockPool);
    } catch (e) {
      threw = e instanceof Error && e.message.includes('Create a new item instead');
    }
    gate(
      'BEH_REBASE_BLOCK',
      threw &&
        mockRepo.setProductBaseUomId.mock.calls.length === 0 &&
        mockRepo.updateProductUom.mock.calls.length === 0,
      'no silent rebase via rename',
    );
  });

  it('allows non-base UoM rename when stock exists and factor unchanged', async () => {
    mockRepo.getProductUomById.mockResolvedValue({
      id: packPuId,
      productId,
      uomId: packUomId,
      conversionFactor: '12',
      isDefault: false,
    });
    mockRepo.getProductOnHandBase.mockResolvedValue(25);
    mockRepo.updateProductUom.mockResolvedValue({
      id: packPuId,
      productId,
      uomId: pcUomId,
      conversionFactor: '12',
      isDefault: false,
    });

    await updateProductUom(packPuId, { uomId: pcUomId }, undefined, mockPool);
    gate(
      'BEH_PACK_RENAME_OK',
      mockRepo.updateProductUom.mock.calls.length === 1,
      'non-base rename with stock + unchanged factor',
    );
  });

  it('allows price override with stock when factor unchanged', async () => {
    mockRepo.getProductUomById.mockResolvedValue({
      id: packPuId,
      productId,
      uomId: packUomId,
      conversionFactor: '12',
      isDefault: false,
    });
    mockRepo.getProductOnHandBase.mockResolvedValue(8);
    mockRepo.updateProductUom.mockResolvedValue({
      id: packPuId,
      productId,
      uomId: packUomId,
      conversionFactor: '12',
      isDefault: false,
      priceOverride: '5000',
    });

    await updateProductUom(packPuId, { priceOverride: 5000 }, undefined, mockPool);
    gate('BEH_PRICE_OK', mockRepo.updateProductUom.mock.calls.length >= 1, 'price override with stock');
  });
});

afterAll(() => {
  const pass = gates.filter((g) => g.ok).length;
  const fail = gates.filter((g) => !g.ok).length;
  const verdict = fail === 0 ? 'PASS' : 'FAIL';
  const at = new Date().toISOString();
  const evidence = {
    at,
    feature: 'MUOM_LIFECYCLE_STOCK_GUARDS',
    summary: { pass, fail, total: gates.length, verdict },
    scope:
      'Proven only: schema columns for on-hand, SSOT wiring, rebase block, factor block with on-hand, pack rename + price override with stock',
    outOfScope: [
      'Multi-UOM enable wizard UI',
      'SKU migrate/split workflow',
      'Live tenant DB mutation proof',
      'Industry product marketing claims',
    ],
    gates,
  };

  writeFileSync(
    path.join(repoRoot, 'PROOF_MUOM_LIFECYCLE_STOCK_GUARDS.json'),
    JSON.stringify(evidence, null, 2),
  );
  writeFileSync(
    path.join(repoRoot, 'PROOF_MUOM_LIFECYCLE_STOCK_GUARDS.md'),
    `# PROOF — MUoM lifecycle stock guards

**Generated:** ${at}  
**Verdict:** **${verdict}** (${pass}/${gates.length} gates)  
**Scope:** ${evidence.scope}

## Out of scope (not claimed)

${evidence.outOfScope.map((x) => `- ${x}`).join('\n')}

## Gates

| Gate | Result | Detail |
|------|--------|--------|
${gates.map((g) => `| \`${g.id}\` | ${g.ok ? 'PASS' : 'FAIL'} | ${g.detail.replace(/\|/g, '\\|')} |`).join('\n')}
`,
  );

  expect(fail).toBe(0);
});
