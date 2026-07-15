/**
 * Phase 4B — Bad Debt posting proofs (BD-INV-1/2/4/5/9 structural)
 */

import {
  assertWriteoffCeiling,
  assertBadDebtExpenseAccount,
  assertWriteoffJournalShape,
  assertArWriteoffPostingSource,
  BAD_DEBT_EXPENSE_ACCOUNT,
  AR_CONTROL_ACCOUNT,
} from '@shared/bad-debt/index.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('Bad Debt posting proof (Phase 4B)', () => {
  it('BD-INV-1 remittance shape debits 5210 and credits 1200', () => {
    expect(() =>
      assertWriteoffJournalShape({
        lines: [
          { accountCode: BAD_DEBT_EXPENSE_ACCOUNT, debitAmount: 250, creditAmount: 0 },
          { accountCode: AR_CONTROL_ACCOUNT, debitAmount: 0, creditAmount: 250 },
        ],
      }),
    ).not.toThrow();
  });

  it('BD-INV-2 over-write-off rejected; exact residual allowed', () => {
    expect(() =>
      assertWriteoffCeiling({ writeoffAmount: 100, openResidual: 40 }),
    ).toThrow(/BD-INV-2/);
    expect(() =>
      assertWriteoffCeiling({ writeoffAmount: 40, openResidual: 40 }),
    ).not.toThrow();
  });

  it('BD-INV-4/9 reject CN and inventory accounts', () => {
    expect(() => assertBadDebtExpenseAccount({ expenseAccountCode: '4010' })).toThrow();
    expect(() => assertBadDebtExpenseAccount({ expenseAccountCode: '5120' })).toThrow();
    expect(() => assertArWriteoffPostingSource('SALES_REFUND')).toThrow(/BD-INV-4/);
  });

  it('service + routes + settlement SQL exist', () => {
    const svc = readFileSync(
      path.join(repoRoot, 'SamplePOS.Server/src/modules/bad-debt/badDebtService.ts'),
      'utf8',
    );
    expect(svc).toMatch(/createAndPostWriteoff/);
    expect(svc).toMatch(/reverseWriteoff/);
    expect(svc).toMatch(/syncCustomerBalanceFromInvoices/);
    expect(svc).toMatch(/source: 'AR_WRITEOFF'/);

    const settlement = readFileSync(
      path.join(repoRoot, 'SamplePOS.Server/src/modules/invoices/invoiceRepository.ts'),
      'utf8',
    );
    expect(settlement).toMatch(/ar_writeoff_lines/);
    expect(settlement).toMatch(/writeoff_amount/);

    const sql = readFileSync(
      path.join(repoRoot, 'shared/sql/551_bad_debt_writeoff_documents.sql'),
      'utf8',
    );
    expect(sql).toMatch(/ar_writeoff_documents/);
    expect(sql).toMatch(/551/);
  });

  it('BD10 touchpoint is MIGRATED', () => {
    const reg = readFileSync(
      path.join(repoRoot, 'SamplePOS.Server/src/modules/bad-debt/badDebtTouchpointRegistry.ts'),
      'utf8',
    );
    expect(reg).toMatch(/id: 'BD10'/);
    expect(reg).toMatch(/status: 'MIGRATED'/);
  });
});
