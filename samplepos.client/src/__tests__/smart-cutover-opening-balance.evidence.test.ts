/**
 * Evidence: compact cutover panel — icon modes + dual metrics (no wall of text).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '../../..');
const panel = readFileSync(
  join(root, 'samplepos.client/src/components/accounting/OpeningBalancePanel.tsx'),
  'utf8',
);
const api = readFileSync(join(root, 'samplepos.client/src/utils/api.ts'), 'utf8');
const routes = readFileSync(
  join(root, 'SamplePOS.Server/src/modules/customers/customerRoutes.ts'),
  'utf8',
);
const service = readFileSync(
  join(root, 'SamplePOS.Server/src/modules/customers/customerService.ts'),
  'utf8',
);
const customerZod = readFileSync(join(root, 'shared/zod/customerOpeningBalance.ts'), 'utf8');

describe('smart cutover — compact UI evidence', () => {
  it('uses icon metrics for outstanding vs cutover doc', () => {
    expect(panel).toMatch(/Outstanding/);
    expect(panel).toMatch(/Cutover doc/);
    expect(panel).toMatch(/MetricTile/);
    expect(panel).toMatch(/CircleDollarSign/);
    expect(panel).toMatch(/do not type this into cutover/i);
  });

  it('exposes three icon modes: Post / Increase / Rewrite', () => {
    expect(panel).toMatch(/ModeIconBtn/);
    expect(panel).toMatch(/label="Post"/);
    expect(panel).toMatch(/label="Increase"/);
    expect(panel).toMatch(/label="Rewrite"/);
    expect(panel).toMatch(/mode === 'increase'/);
    expect(panel).toMatch(/mode === 'rewrite'/);
  });

  it('keeps increase delta semantics and rewrite guard', () => {
    expect(panel).toMatch(/Add amount only/);
    expect(panel).toMatch(/matches today's outstanding|matches today’s outstanding/);
    expect(panel).toMatch(/increaseOpeningBalance/);
  });

  it('does not dump long guidance lists in primary JSX', () => {
    // guidance may still exist on summary type, but not map-rendered as bullets
    expect(panel).not.toMatch(/summary\.guidance\.map/);
    expect(panel).not.toMatch(/What you are looking at/);
    expect(panel).not.toMatch(/Go-live cutover \(legacy debt\)/);
  });
});

describe('smart cutover — API contracts still present', () => {
  it('client + server increase/summary', () => {
    expect(api).toMatch(/increaseOpeningBalance/);
    expect(api).toMatch(/getOpeningBalanceSummary/);
    expect(routes).toMatch(/opening-balance\/increase/);
    expect(routes).toMatch(/opening-balance\/summary/);
    expect(service).toMatch(/increaseCustomerOpeningBalance/);
    expect(customerZod).toMatch(/CustomerOpeningBalanceIncreaseSchema/);
  });
});
