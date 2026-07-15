/**
 * Gate A architecture proof — Bad Debt (ADR-006 Phase 4A)
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BAD_DEBT_TOUCHPOINT_REGISTRY,
  countBadDebtTouchpointsByStatus,
  BAD_DEBT_WRITE_GATEWAY,
} from './badDebtTouchpointRegistry.js';
import {
  assertWriteoffCeiling,
  assertBadDebtExpenseAccount,
  assertWriteoffJournalShape,
  assertArWriteoffPostingSource,
  BadDebtInvariantError,
  BAD_DEBT_EXPENSE_ACCOUNT,
  AR_CONTROL_ACCOUNT,
} from '@shared/bad-debt/index.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('Bad Debt architecture proof (Gate A partial — 4A)', () => {
  it('A-01 ADR-006 freeze statement exists and is Accepted', () => {
    const adr = readRepo('docs/architecture/BAD_DEBT_ADR.md');
    expect(adr).toMatch(/Freeze AR uncollectible recognition/i);
    expect(adr).toMatch(/\*\*Status:\*\* Accepted/i);
  });

  it('A-02 registry lists AR clear paths + write-off gateway', () => {
    const ids = new Set(BAD_DEBT_TOUCHPOINT_REGISTRY.map((t) => t.id));
    for (const id of ['BD03', 'BD06', 'BD08', 'BD09', 'BD10', 'BD11', 'BD12', 'BD13', 'BD14', 'BD15', 'BD16']) {
      expect(ids.has(id)).toBe(true);
    }
    expect(countBadDebtTouchpointsByStatus('NOT_STARTED')).toBe(0);
    expect(BAD_DEBT_WRITE_GATEWAY).toContain('modules/bad-debt');
  });

  it('A-03 every touchpoint has status + owner + proof', () => {
    for (const t of BAD_DEBT_TOUCHPOINT_REGISTRY) {
      expect(t.owner.length).toBeGreaterThan(0);
      expect(t.proof.length).toBeGreaterThan(0);
    }
  });

  it('schema 550 and shared classifiers exist', () => {
    expect(existsSync(path.join(repoRoot, 'shared/sql/550_bad_debt_foundation.sql'))).toBe(true);
    expect(existsSync(path.join(repoRoot, 'shared/bad-debt/index.ts'))).toBe(true);
    const sql = readRepo('shared/sql/550_bad_debt_foundation.sql');
    expect(sql).toMatch(/bad_debt_writeoff_enabled/);
    expect(sql).toMatch(/'5210'/);
    expect(sql).toMatch(/AR_WRITEOFF/);
  });

  it('CURRENT_SCHEMA_VERSION is 550+', () => {
    const schema = readRepo('SamplePOS.Server/src/constants/schemaVersion.ts');
    expect(schema).toMatch(/CURRENT_SCHEMA_VERSION\s*=\s*(550|551)\b/);
  });

  it('AccountCodes.BAD_DEBT_EXPENSE is 5210', () => {
    const gl = readRepo('SamplePOS.Server/src/services/glEntryService.ts');
    expect(gl).toMatch(/BAD_DEBT_EXPENSE:\s*'5210'/);
  });

  it('PostingSource includes AR_WRITEOFF family', () => {
    const gov = readRepo('SamplePOS.Server/src/services/postingGovernanceService.ts');
    expect(gov).toMatch(/'AR_WRITEOFF'/);
    expect(gov).toMatch(/'AR_WRITEOFF_REVERSAL'/);
  });

  it('BD-INV-2 rejects over-allocate', () => {
    expect(() =>
      assertWriteoffCeiling({ writeoffAmount: 100, openResidual: 50 }),
    ).toThrow(BadDebtInvariantError);
    expect(() =>
      assertWriteoffCeiling({ writeoffAmount: 50, openResidual: 50 }),
    ).not.toThrow();
  });

  it('BD-INV-9 rejects 4010 and 6900 and inventory loss', () => {
    expect(() => assertBadDebtExpenseAccount({ expenseAccountCode: '4010' })).toThrow(
      /BD-INV-4\/9|BD-INV-9/,
    );
    expect(() => assertBadDebtExpenseAccount({ expenseAccountCode: '6900' })).toThrow(/BD-INV-9/);
    expect(() => assertBadDebtExpenseAccount({ expenseAccountCode: '5110' })).toThrow(/BD-INV-5/);
    expect(() =>
      assertBadDebtExpenseAccount({ expenseAccountCode: BAD_DEBT_EXPENSE_ACCOUNT }),
    ).not.toThrow();
  });

  it('BD-INV-1 requires CR 1200 and DR 5210', () => {
    expect(() =>
      assertWriteoffJournalShape({
        lines: [
          { accountCode: AR_CONTROL_ACCOUNT, debitAmount: 100, creditAmount: 0 },
          { accountCode: BAD_DEBT_EXPENSE_ACCOUNT, debitAmount: 0, creditAmount: 100 },
        ],
      }),
    ).toThrow(/BD-INV-1/);

    expect(() =>
      assertWriteoffJournalShape({
        lines: [
          { accountCode: BAD_DEBT_EXPENSE_ACCOUNT, debitAmount: 100, creditAmount: 0 },
          { accountCode: AR_CONTROL_ACCOUNT, debitAmount: 0, creditAmount: 100 },
        ],
      }),
    ).not.toThrow();
  });

  it('BD-INV-4 rejects wrong posting source', () => {
    expect(() => assertArWriteoffPostingSource('SALES_REFUND')).toThrow(/BD-INV-4/);
    expect(() => assertArWriteoffPostingSource('AR_WRITEOFF')).not.toThrow();
  });
});
