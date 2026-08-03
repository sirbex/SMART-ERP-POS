/**
 * EVIDENCE: enterprise unlimited customer credit (migration 585).
 * Finite limits enforce BR-SAL-003; unlimited_credit skips the hard ceiling.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateCustomerCreditLimit,
  creditAvailable,
} from '../../../../shared/utils/customerCreditLimit.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repoRoot = path.resolve(serverRoot, '..');

function readServer(rel: string): string {
  return readFileSync(path.join(serverRoot, rel), 'utf8');
}

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('EVIDENCE — unlimited customer credit (enterprise)', () => {
  it('evaluateCustomerCreditLimit allows unlimited above any projected AR', () => {
    const r = evaluateCustomerCreditLimit({
      unlimitedCredit: true,
      creditLimit: 0,
      currentBalance: 9_000_000,
      additionalCredit: 5_000_000,
    });
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.unlimited).toBe(true);
  });

  it('evaluateCustomerCreditLimit rejects when finite limit exceeded', () => {
    const r = evaluateCustomerCreditLimit({
      unlimitedCredit: false,
      creditLimit: 100_000,
      currentBalance: 80_000,
      additionalCredit: 30_000,
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe('CREDIT_LIMIT_EXCEEDED');
  });

  it('creditAvailable is null for unlimited, residual for finite', () => {
    expect(creditAvailable(true, 0, 50_000)).toBeNull();
    expect(creditAvailable(false, 100_000, 40_000)).toBe(60_000);
  });

  it('migration 585 and schema pin unlimited_credit', () => {
    const mig = readRepo('shared/sql/585_customer_unlimited_credit.sql');
    expect(mig).toMatch(/unlimited_credit BOOLEAN NOT NULL DEFAULT false/);
    const schema = readServer('src/constants/schemaVersion.ts');
    expect(schema).toMatch(/CURRENT_SCHEMA_VERSION\s*=\s*585/);
  });

  it('validateCreditSale uses shared evaluator and unlimited_credit column', () => {
    const src = readServer('src/middleware/businessRules.ts');
    expect(src).toMatch(/evaluateCustomerCreditLimit/);
    expect(src).toMatch(/unlimited_credit/);
    expect(src).toMatch(/CREDIT_LIMIT_EXCEEDED/);
  });

  it('customer repository persists unlimited_credit on create/update', () => {
    const src = readServer('src/modules/customers/customerRepository.ts');
    expect(src).toMatch(/unlimited_credit/);
    expect(src).toMatch(/unlimitedCredit/);
    expect(src).toMatch(/creditAvailable = unlimitedCredit \? null/);
  });
});
