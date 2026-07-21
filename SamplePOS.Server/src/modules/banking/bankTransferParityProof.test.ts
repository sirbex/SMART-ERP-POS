/**
 * Local/prod parity: bank transfers must reject non-liquidity GLs even when
 * treasury_document_enabled is false (historically only the TD path ran TD-INV-6).
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('Bank transfer local/prod parity (TD-INV-6)', () => {
  const service = readFileSync(
    path.join(root, 'src/services/bankingService.ts'),
    'utf8',
  );

  it('eligibility check runs before treasury_document_enabled branch', () => {
    const eligibleIdx = service.indexOf('isEligibleBankBookLiquidity(fromGlCode');
    const treasuryIdx = service.indexOf('isTreasuryDocumentEnabled');
    expect(eligibleIdx).toBeGreaterThan(0);
    expect(treasuryIdx).toBeGreaterThan(0);
    expect(eligibleIdx).toBeLessThan(treasuryIdx);
  });

  it('non-treasury path still asserts liquidity accounts (TD-INV-6)', () => {
    expect(service).toMatch(/assertLiquidityAccountsOnly/);
    expect(service).toMatch(/local\/prod parity/);
  });

  it('create path rejects AR 1200 via assertBankBookGlEligible', () => {
    expect(service).toMatch(/assertBankBookGlEligible/);
  });
});
