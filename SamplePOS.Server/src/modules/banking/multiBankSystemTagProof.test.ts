/**
 * PROOF: multi-bank SystemAccountTag=BANK must not hit uidx_accounts_system_tag.
 *
 * Prod symptom: Create Bank Account → Create & use this GL fails with
 *   duplicate key value violates unique constraint "uidx_accounts_system_tag"
 * because 1030 already carries BANK (migration 543) while bankLiquidity create
 * inserts a second BANK-tagged GL.
 *
 * Run: npm test -- --testPathPattern=multiBankSystemTagProof --no-coverage
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from '@jest/globals';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

function readRepo(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

describe('Multi-bank BANK system tag — unique index proof', () => {
  it('E-01 migration 558 drops blanket unique and keeps singleton-only unique', () => {
    const sql = readRepo('shared/sql/558_accounts_system_tag_multi_bank.sql');
    expect(sql).toMatch(/DROP INDEX IF EXISTS uidx_accounts_system_tag/);
    expect(sql).toMatch(/uidx_accounts_system_tag_singleton/);
    expect(sql).toMatch(/UNDEPOSITED_FUNDS/);
    expect(sql).toMatch(/OPENING_BALANCE_EQUITY/);
    expect(sql).toMatch(/ACCOUNTS_RECEIVABLE/);
    // Liquidity multi-instance tags must NOT be in the singleton list
    expect(sql).not.toMatch(/'BANK'/);
    expect(sql).not.toMatch(/'CASH'/);
    expect(sql).not.toMatch(/'MOBILE_MONEY'/);
    expect(sql).not.toMatch(/'PETTY_CASH'/);
    expect(sql).not.toMatch(/'CARD_CLEARING'/);
    expect(sql).toMatch(/schema_version \(version\) VALUES \(558\)/);
  });

  it('E-02 schema version bumped to 558', () => {
    const ver = readRepo('SamplePOS.Server/src/constants/schemaVersion.ts');
    expect(ver).toMatch(/CURRENT_SCHEMA_VERSION\s*=\s*558/);
  });

  it('E-03 Create & use this GL still requests bankLiquidity BANK stamp', () => {
    const tab = readRepo('samplepos.client/src/components/banking/BankAccountsTab.tsx');
    const routes = readRepo('SamplePOS.Server/src/modules/accounting/accountingRoutes.ts');
    expect(tab).toMatch(/bankLiquidity:\s*true/);
    expect(routes).toMatch(/systemAccountTag:\s*bankLiquidity\s*\?\s*'BANK'/);
  });

  it('E-04 ensureBankGlLiquidityTag still stamps BANK (now allowed on many GLs)', () => {
    const src = readRepo('SamplePOS.Server/src/modules/banking/ensureBankGlLiquidityTag.ts');
    expect(src).toMatch(/SystemAccountTag" = 'BANK'/);
    expect(src).toMatch(/Multiple GLs may share BANK/);
  });

  it('E-05 createAccount maps legacy uidx violation to actionable message', () => {
    const repo = readRepo('SamplePOS.Server/src/repositories/accountingRepository.ts');
    expect(repo).toMatch(/uidx_accounts_system_tag/);
    expect(repo).toMatch(/migration 558/);
  });
});
