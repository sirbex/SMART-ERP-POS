/**
 * Client evidence: unlimited credit is mapped; enforcement uses shared evaluator.
 * Structural wire: validation, POS selector, edit UI, shared SSOT.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapApiCustomer } from '../lib/offlineMappers';
import { validateCreditLimit } from '../utils/validation';
import { evaluateCustomerCreditLimit } from '@shared/utils/customerCreditLimit';

const here = dirname(fileURLToPath(import.meta.url));

function readRel(...parts: string[]): string {
  return readFileSync(resolve(here, ...parts), 'utf8');
}

describe('EVIDENCE — unlimited customer credit (client)', () => {
  it('mapApiCustomer preserves unlimitedCredit from API camelCase and snake_case', () => {
    expect(
      mapApiCustomer({
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Enterprise Co',
        balance: '0',
        creditLimit: '0',
        unlimitedCredit: true,
        isActive: true,
      }).unlimitedCredit,
    ).toBe(true);

    expect(
      mapApiCustomer({
        id: '11111111-1111-1111-1111-111111111112',
        name: 'Retail Co',
        balance: '0',
        credit_limit: '500000',
        unlimited_credit: false,
        isActive: true,
      }).unlimitedCredit,
    ).toBe(false);
  });

  it('validateCreditLimit allows large AR when unlimitedCredit=true', () => {
    const ok = validateCreditLimit(9_000_000, 0, 1_000_000, true);
    expect(ok.valid).toBe(true);

    const blocked = validateCreditLimit(80_000, 100_000, 30_000, false);
    expect(blocked.valid).toBe(false);
    expect(blocked.code).toBe('CREDIT_LIMIT_EXCEEDED');
  });

  it('shared evaluator is the single policy source', () => {
    const r = evaluateCustomerCreditLimit({
      unlimitedCredit: true,
      creditLimit: 1,
      currentBalance: 1,
      additionalCredit: 1,
    });
    expect(r.allowed).toBe(true);
  });

  it('STRUCT: client credit UI and validation call sites use unlimitedCredit', () => {
    const validation = readRel('../utils/validation.ts');
    expect(validation).toMatch(/evaluateCustomerCreditLimit/);
    expect(validation).toMatch(/unlimitedCredit/);

    const selector = readRel('../components/pos/CustomerSelector.tsx');
    expect(selector).toMatch(/unlimitedCredit/);
    expect(selector).toMatch(/Unlimited/);

    const detailModal = readRel('../components/customers/CustomerDetailModal.tsx');
    expect(detailModal).toMatch(/editUnlimitedCredit|unlimitedCredit/);
    expect(detailModal).toMatch(/Unlimited credit/i);

    const shared = readFileSync(
      resolve(here, '../../../shared/utils/customerCreditLimit.ts'),
      'utf8',
    );
    expect(shared).toMatch(/export function evaluateCustomerCreditLimit/);
    expect(shared).toMatch(/isUnlimitedCustomerCredit/);
  });
});
