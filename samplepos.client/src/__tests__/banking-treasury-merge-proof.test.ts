/**
 * Client proof: liquidity UX merged into Banking (no duplicate Advanced nav pages).
 * Run: npx vitest run src/__tests__/banking-treasury-merge-proof.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');

function readSrc(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('Banking ↔ Treasury merge — UX proof', () => {
  it('Advanced Accounting nav does not list duplicate treasury pages', () => {
    const layout = readSrc('components/AccountingLayout.tsx');
    expect(layout).not.toContain("path: '/accounting/deposit-worksheet'");
    expect(layout).not.toContain("path: '/accounting/treasury-transfer'");
    expect(layout).not.toContain("path: '/accounting/petty-cash'");
    expect(layout).not.toContain("path: '/accounting/treasury'");
    expect(layout).toContain("path: '/accounting/banking'");
    expect(layout).toContain("name: 'Banking & Liquidity'");
    expect(layout).toMatch(/undeposited receipts|move money/i);
  });

  it('Banking hosts undeposited / move-money / petty-cash / documents tabs when treasury on', () => {
    const banking = readSrc('pages/accounting/BankingPage.tsx');
    expect(banking).toContain('Banking & Liquidity');
    expect(banking).toContain('useTreasuryEnabled');
    expect(banking).toContain('value="undeposited"');
    expect(banking).toContain('value="move-money"');
    expect(banking).toContain('value="petty-cash"');
    expect(banking).toContain('value="documents"');
    expect(banking).toContain('<DepositWorksheetPage embedded');
    expect(banking).toContain('<TreasuryTransferPage embedded');
    expect(banking).toContain('<PettyCashPage embedded');
    expect(banking).toContain('<TreasuryDocumentsPage embedded');
  });

  it('legacy treasury routes redirect into Banking tabs', () => {
    const app = readSrc('App.tsx');
    expect(app).toContain('/accounting/banking?tab=undeposited');
    expect(app).toContain('/accounting/banking?tab=move-money');
    expect(app).toContain('/accounting/banking?tab=petty-cash');
    expect(app).toContain('/accounting/banking?tab=documents');
    expect(app).toMatch(/path="\/accounting\/deposit-worksheet"/);
    expect(app).toMatch(/Navigate to="\/accounting\/banking\?tab=undeposited"/);
  });

  it('operator copy avoids raw flag names on liquidity pages', () => {
    for (const rel of [
      'pages/accounting/DepositWorksheetPage.tsx',
      'pages/accounting/TreasuryTransferPage.tsx',
      'pages/accounting/PettyCashPage.tsx',
      'pages/accounting/TreasuryDocumentsPage.tsx',
    ]) {
      const src = readSrc(rel);
      expect(src).not.toContain('treasury_document_enabled');
      expect(src).toContain('TreasuryFeatureDisabledNotice');
    }
  });

  it('Bank Transfer modal explains relationship to Move money when treasury on', () => {
    const tab = readSrc('components/banking/BankTransactionsTab.tsx');
    expect(tab).toContain('useTreasuryEnabled');
    expect(tab).toContain('liquidity document');
    expect(tab).toContain('Move money');
  });
});
