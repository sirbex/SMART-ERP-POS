/**
 * Client proof: Move money (Treasury Transfer) UI + Banking merge contract.
 * Run: npx vitest run src/__tests__/treasury-transfer-flow-proof.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');

function readSrc(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('Treasury Transfer flow — UI / API contract proof', () => {
  it('Move money page posts via createTransfer with from/to/amount', () => {
    const page = readSrc('pages/accounting/TreasuryTransferPage.tsx');
    expect(page).toContain('Move money');
    expect(page).toContain('From account');
    expect(page).toContain('To account');
    expect(page).toContain('createTransfer');
    expect(page).toContain('postImmediately: true');
    expect(page).toContain('fromAccountCode');
    expect(page).toContain('toAccountCode');
    expect(page).toMatch(/listLiquidityAccounts/);
  });

  it('Banking hosts Move money (no separate Advanced nav item)', () => {
    const layout = readSrc('components/AccountingLayout.tsx');
    expect(layout).not.toContain('Treasury Transfer');
    expect(layout).not.toContain('/accounting/treasury-transfer');

    const banking = readSrc('pages/accounting/BankingPage.tsx');
    expect(banking).toContain('move-money');
    expect(banking).toContain('TreasuryTransferPage');
  });

  it('client API matches transfer posting contract', () => {
    const api = readSrc('utils/api.ts');
    expect(api).toContain("'treasury/transfers'");
    expect(api).toContain('fromAccountCode');
    expect(api).toContain('toAccountCode');
    expect(api).toContain('TREASURY_TRANSFER');
    expect(api).toContain("treasury/documents/${id}/reverse");
  });
});
