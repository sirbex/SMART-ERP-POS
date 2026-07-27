/**
 * EVIDENCE: product_type = service must never raise quantity/stock issues
 * for the service parent itself (createSale validate + deduct paths).
 *
 * Ingredients of a service+recipe dish may still be stock-checked — that is
 * intentional. The service SKU / menu dish parent must never be.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planSaleStockDeduction } from '../../../../shared/utils/productTypeRules.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

type StockCall = { kind: 'parent' | 'ingredient'; productId: string; qty: number };

/**
 * Mirrors createSale stock-gate branching (salesService.ts BR-INV-001):
 * skip → no validators; ingredients → only components; parent → parent SKU.
 */
function runCreateSaleStockGate(input: {
  productId: string;
  productType: string;
  hasRecipeLines: boolean;
  parentAvailable: number;
  requestedQty: number;
  ingredientAvailable?: number;
  ingredientId?: string;
  ingredientQty?: number;
}): { ok: true; calls: StockCall[] } {
  const plan = planSaleStockDeduction(input.productType, input.hasRecipeLines);
  const calls: StockCall[] = [];

  if (plan.kind === 'skip') {
    return { ok: true, calls };
  }

  if (plan.kind === 'ingredients') {
    const ingredientId = input.ingredientId ?? 'ing-1';
    const need = input.ingredientQty ?? input.requestedQty;
    calls.push({ kind: 'ingredient', productId: ingredientId, qty: need });
    const avail = input.ingredientAvailable ?? 0;
    if (avail < need) {
      throw new Error(
        `Insufficient stock at selling store. Available: ${avail}, Requested: ${need}.`,
      );
    }
    return { ok: true, calls };
  }

  calls.push({ kind: 'parent', productId: input.productId, qty: input.requestedQty });
  if (input.parentAvailable < input.requestedQty) {
    throw new Error(
      `Insufficient stock at selling store. Available: ${input.parentAvailable}, Requested: ${input.requestedQty}.`,
    );
  }
  return { ok: true, calls };
}

describe('EVIDENCE — service product never calls for quantity issues (parent)', () => {
  it('pure service at zero stock never invokes stock validators and never throws', () => {
    const result = runCreateSaleStockGate({
      productId: 'svc-matooke',
      productType: 'service',
      hasRecipeLines: false,
      parentAvailable: 0,
      requestedQty: 6,
    });
    expect(result.ok).toBe(true);
    expect(result.calls).toEqual([]);
  });

  it('inventory at zero stock still throws Insufficient (control)', () => {
    expect(() =>
      runCreateSaleStockGate({
        productId: 'inv-water',
        productType: 'inventory',
        hasRecipeLines: false,
        parentAvailable: 0,
        requestedQty: 1,
      }),
    ).toThrow(/Insufficient stock/i);
  });

  it('service + recipe never validates the service parent — only ingredients', () => {
    const result = runCreateSaleStockGate({
      productId: 'svc-pizza',
      productType: 'service',
      hasRecipeLines: true,
      parentAvailable: 0,
      requestedQty: 2,
      ingredientId: 'flour',
      ingredientQty: 0.5,
      ingredientAvailable: 10,
    });
    expect(result.calls).toEqual([{ kind: 'ingredient', productId: 'flour', qty: 0.5 }]);
    expect(result.calls.some((c) => c.productId === 'svc-pizza')).toBe(false);
  });

  it('service + recipe may fail on ingredient qty — never on the service parent SKU', () => {
    expect(() =>
      runCreateSaleStockGate({
        productId: 'svc-pizza',
        productType: 'service',
        hasRecipeLines: true,
        parentAvailable: 0,
        requestedQty: 2,
        ingredientId: 'flour',
        ingredientQty: 1,
        ingredientAvailable: 0,
      }),
    ).toThrow(/Insufficient stock/i);

    try {
      runCreateSaleStockGate({
        productId: 'svc-pizza',
        productType: 'service',
        hasRecipeLines: true,
        parentAvailable: 0,
        requestedQty: 2,
        ingredientId: 'flour',
        ingredientQty: 1,
        ingredientAvailable: 0,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).not.toMatch(/svc-pizza/);
      expect(msg).toMatch(/Requested: 1/);
    }
  });

  it('createSale skip branch never calls quantity validators', () => {
    const sales = readRepo('SamplePOS.Server/src/modules/sales/salesService.ts');
    const validateIdx = sales.indexOf('// BR-INV-001: Validate stock availability');
    expect(validateIdx).toBeGreaterThan(0);
    const deductIdx = sales.indexOf('Skipping inventory deduction for service item');
    expect(deductIdx).toBeGreaterThan(validateIdx);

    const stockPlanBlock = sales.slice(
      validateIdx,
      sales.indexOf('const expiryRuleRes = await client.query', validateIdx),
    );
    expect(stockPlanBlock).toMatch(/stockPlan\.kind === 'skip'/);
    // Pure-service arm must be empty of validators (comment-only / no await validate*).
    const skipArm = stockPlanBlock.slice(
      stockPlanBlock.indexOf("stockPlan.kind === 'skip'"),
      stockPlanBlock.indexOf("stockPlan.kind === 'ingredients'"),
    );
    expect(skipArm).not.toMatch(/validateSellableAtStore/);
    expect(skipArm).not.toMatch(/validateStockAvailability/);

    const deductSkip = sales.slice(
      sales.indexOf("deductPlan.kind === 'skip'"),
      sales.indexOf('type DeductTarget'),
    );
    expect(deductSkip).toMatch(/Skipping inventory deduction for service item/);
    expect(deductSkip).toMatch(/continue/);
    expect(deductSkip).not.toMatch(/validateSellableAtStore/);
    expect(deductSkip).not.toMatch(/allocateAndConsume/);
  });

  it('offline restaurant pay skips service parent stock (source gate)', () => {
    const offline = readRepo('samplepos.client/src/lib/restaurantOfflineOps.ts');
    const payBlock = offline.slice(
      offline.indexOf('export function payRestaurantCheckOffline'),
      offline.indexOf('export function cancelRestaurantCheckOffline'),
    );
    expect(payBlock).toMatch(/isServiceProductType\(productType\)/);
    expect(payBlock).toMatch(/continue/);
    expect(payBlock).toMatch(/Insufficient offline stock/);
  });

  it('POS offline sale + catalog search exempt service from stock qty', () => {
    const offlineMode = readRepo('samplepos.client/src/hooks/useOfflineMode.ts');
    expect(offlineMode).toMatch(/isServiceProductType\(productType\)/);
    expect(offlineMode).toMatch(/continue/);

    const catalog = readRepo('samplepos.client/src/services/offlineCatalogService.ts');
    expect(catalog).toMatch(/productType === 'service' \|\| stock > 0/);

    const pos = readRepo('samplepos.client/src/pages/pos/POSPage.tsx');
    const addBlock = pos.slice(
      pos.indexOf('const handleAddProduct = useCallback'),
      pos.indexOf('// Use computeUomPrices'),
    );
    expect(addBlock).toMatch(/product\.productType === 'service'/);
    expect(addBlock).toMatch(/out of stock/);
  });

  it('restaurant menu includes service even without shop-store visibility/stock', () => {
    const repo = readRepo('SamplePOS.Server/src/modules/restaurant/restaurantRepository.ts');
    expect(repo).toMatch(/COALESCE\(p\.product_type, 'inventory'\) = 'service'/);
    expect(repo).toMatch(/productPosVisibleAtStoreSql/);
  });
});
