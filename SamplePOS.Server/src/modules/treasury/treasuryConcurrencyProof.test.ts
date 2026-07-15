/**
 * Gate C / D structural + concurrency proofs — Treasury Document (Phase 1E)
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertSettlementCeiling,
  assertDepositConsumesUnsettled,
  assertLiquidityAccountsOnly,
  TreasuryInvariantError,
} from '@shared/treasury/index.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('Treasury operations proof (Gate C)', () => {
  it('C-03 over-apply rejected (TD-INV-4)', () => {
    expect(() =>
      assertSettlementCeiling({ applyAmount: 100.01, residualAmount: 100 }),
    ).toThrow(TreasuryInvariantError);
  });

  it('C-02 / C-05 partial residual + liquidity-only transfer invariant', () => {
    expect(() =>
      assertDepositConsumesUnsettled({
        settlementStatus: 'PARTIALLY_SETTLED',
        residualAmount: 25,
      }),
    ).not.toThrow();
    expect(() =>
      assertLiquidityAccountsOnly([
        { accountCode: '1010' },
        { accountCode: '1030' },
      ]),
    ).not.toThrow();
    expect(() =>
      assertLiquidityAccountsOnly([{ accountCode: '1200' }]),
    ).toThrow(TreasuryInvariantError);
  });

  it('C-06 petty cash posts to 1012 not 1015', () => {
    const petty = readRepo('SamplePOS.Server/src/modules/treasury/pettyCashService.ts');
    expect(petty).toMatch(/1012/);
    expect(petty).not.toMatch(/accountCode:\s*['"]1015['"]/);
  });

  it('C-07 reversal creates TREASURY_REVERSAL', () => {
    const svc = readRepo('SamplePOS.Server/src/modules/treasury/treasuryService.ts');
    expect(svc).toMatch(/TREASURY_REVERSAL/);
    expect(svc).toMatch(/reverse/);
  });
});

describe('Treasury concurrency proof (Gate D structural)', () => {
  it('D settlement rows lock with FOR UPDATE', () => {
    const repo = readRepo(
      'SamplePOS.Server/src/modules/treasury/receiptSettlementRepository.ts',
    );
    const locks = (repo.match(/FOR UPDATE/g) ?? []).length;
    expect(locks).toBeGreaterThanOrEqual(2);
  });

  it('D double-settle: sequential over-apply rejects after first consumes residual', () => {
    // Simulates two concurrent attempts racing on the same residual after one wins.
    let residual = 500;
    const attempt = (apply: number) => {
      assertSettlementCeiling({ applyAmount: apply, residualAmount: residual });
      residual = Math.round((residual - apply) * 100) / 100;
    };
    attempt(500);
    expect(residual).toBe(0);
    expect(() => attempt(1)).toThrow(TreasuryInvariantError);
  });

  it('D treasury documents use row_version for optimistic concurrency', () => {
    const repo = readRepo('SamplePOS.Server/src/modules/treasury/treasuryRepository.ts');
    expect(repo).toMatch(/row_version/);
  });
});
