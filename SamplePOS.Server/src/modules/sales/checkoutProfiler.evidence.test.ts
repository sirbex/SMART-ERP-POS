/**
 * P4 evidence: checkout profiler SSOT + createSale phase marks.
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregateCheckoutProfiles,
  createCheckoutProfiler,
  isCheckoutProfileEnabled,
} from './checkoutProfiler.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');

function readRepo(rel: string): string {
  return readFileSync(resolve(root, rel), 'utf8');
}

describe('checkoutProfiler (pure)', () => {
  it('disabled profiler returns undefined snapshot and ignores marks', () => {
    const p = createCheckoutProfiler(false);
    p.mark('a');
    expect(p.snapshot()).toBeUndefined();
  });

  it('enabled profiler ranks hottest phase', () => {
    const p = createCheckoutProfiler(true);
    p.mark('begin');
    const start = Date.now();
    while (Date.now() - start < 5) {
      /* spin */
    }
    p.mark('slow');
    p.mark('fast');
    const snap = p.snapshot()!;
    expect(snap.phases.map((x) => x.phase)).toEqual(['begin', 'slow', 'fast']);
    expect(snap.ranked[0].phase).toBe('slow');
    expect(snap.totalMs).toBeGreaterThan(0);
  });

  it('aggregateCheckoutProfiles computes p95 ranking', () => {
    const snaps = [1, 2, 3].map((n) => ({
      totalMs: 100 * n,
      phases: [
        { phase: 'gl_posting', ms: 40 * n },
        { phase: 'fefo_stock', ms: 10 * n },
      ],
      ranked: [],
    }));
    const agg = aggregateCheckoutProfiles(snaps);
    expect(agg.n).toBe(3);
    expect(agg.phasesByP95[0].phase).toBe('gl_posting');
    expect(agg.totalMs.p95).toBe(300);
  });

  it('isCheckoutProfileEnabled respects flag and env', () => {
    const prev = process.env.CHECKOUT_PROFILE;
    delete process.env.CHECKOUT_PROFILE;
    expect(isCheckoutProfileEnabled(false)).toBe(false);
    expect(isCheckoutProfileEnabled(true)).toBe(true);
    process.env.CHECKOUT_PROFILE = '1';
    expect(isCheckoutProfileEnabled(false)).toBe(true);
    if (prev === undefined) delete process.env.CHECKOUT_PROFILE;
    else process.env.CHECKOUT_PROFILE = prev;
  });
});

describe('checkout profile SSOT gates', () => {
  it('EVIDENCE: createSale marks major phases', () => {
    const sales = readRepo('SamplePOS.Server/src/modules/sales/salesService.ts');
    for (const phase of [
      'order_lock',
      'product_prefetch',
      'uom_resolve',
      'recipe_explode',
      'pricing_engine',
      'document_tax',
      'line_prep',
      'fefo_stock',
      'gl_posting',
      'payments_ar',
      'commit',
      'post_commit',
    ]) {
      expect(sales).toContain(`profiler.mark('${phase}')`);
    }
    expect(sales).not.toContain("profiler.mark('pricing')");
    expect(sales).toContain('checkoutProfile: profiler.snapshot()');
  });

  it('EVIDENCE: sale UoM resolve does not repair conversions (P5)', () => {
    const uom = readRepo('SamplePOS.Server/src/modules/products/uomService.ts');
    const resolveFn = uom.slice(
      uom.indexOf('export async function resolveCanonicalProductUom'),
      uom.indexOf('export async function listMasterUoms'),
    );
    expect(resolveFn).toContain('buildMergedCanonicalConversions');
    expect(resolveFn).not.toContain('repairCanonicalConversionsFromProductUoms');
  });

  it('EVIDENCE: complete route wires X-Checkout-Profile', () => {
    const routes = readRepo('SamplePOS.Server/src/modules/orders/ordersRoutes.ts');
    expect(routes).toContain("x-checkout-profile");
    expect(routes).toContain('checkoutProfile');
    expect(routes).toContain('profileCheckout');
  });

  it('EVIDENCE: HTTP profile harness exists', () => {
    const script = readRepo('scripts/proof-checkout-profile.mjs');
    expect(script).toContain('/orders/');
    expect(script).toContain('complete');
    expect(script).toContain('X-Checkout-Profile');
    expect(script).toContain('Inventory drop');
    expect(script).toContain('GL balanced');
    expect(script).toContain('pg_stat_activity');
  });
});
