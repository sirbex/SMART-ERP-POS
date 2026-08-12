/**
 * CONSOLIDATED ACCEPTANCE PROOF — HR salary + staff advances (sole SSOT).
 *
 * This is the only proof that may accept the payroll/advance loop.
 * Partial / string-only proofs are insufficient: every known defect class
 * must have a fail-loud gate here.
 *
 * Emits (repo root):
 *   PROOF_HR_SALARY_ADVANCES_CONSOLIDATED.md
 *   PROOF_HR_SALARY_ADVANCES_CONSOLIDATED.json
 *   PROOF_HR_PAYROLL_INTEGRITY.md/.json  (pointer → consolidated; kept for old links)
 *
 * Re-run:
 *   cd SamplePOS.Server
 *   npm test -- --runInBand src/modules/hr/hrSalaryAdvancesConsolidated.evidence.test.ts
 */
import { afterAll, describe, expect, it } from '@jest/globals';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Decimal from 'decimal.js';
import {
  assertJournalBalanced,
  assertJournalMatchesExpected,
} from '@shared/financial-accuracy/index.js';
import {
  allocateFifoRecovery,
  assertPayrollIdentity,
  buildCashShortageChargeJournal,
  buildEmployeeAdvanceJournal,
  buildPayrollAccrualJournal,
  buildPayrollPaymentJournal,
  computePayrollAmounts,
  money2,
  money2Number,
  PAYROLL_EXPENSE_ACCOUNT,
  TILL_CASH_ACCOUNT,
} from '@shared/hr/payrollMath.js';
import {
  assertHrDisbursementAccount,
  isForbiddenHrDisbursementAccount,
  pickHrDisbursementAccount,
  HR_TILL_CASH_ACCOUNT,
  HR_PETTY_CASH_ACCOUNT,
} from '@shared/hr/hrDisbursementAccount.js';
import {
  assertPayrollCsvConsistent,
  buildPayrollExportSheet,
  payrollSheetToCsv,
} from '@shared/hr/payrollExportSheet.js';
import {
  PostingGovernanceService,
  type GovernanceAccount,
  type GovernanceJournalRequest,
} from '../../services/postingGovernanceService.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repoRoot = path.resolve(serverRoot, '..');

type Gate = { id: string; section: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(section: string, id: string, ok: boolean, detail: string): void {
  gates.push({ id, section, ok, detail });
  if (!ok) {
    expect({ id, ok, detail }).toEqual({ id, ok: true, detail });
  }
}

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

function fileHas(rel: string, re: RegExp | string): boolean {
  const p = path.join(repoRoot, rel);
  if (!existsSync(p)) return false;
  const src = readFileSync(p, 'utf8');
  return typeof re === 'string' ? src.includes(re) : re.test(src);
}

function makeAcct(overrides: Partial<GovernanceAccount>): GovernanceAccount {
  return {
    id: 'id',
    accountCode: 'x',
    accountName: 'n',
    accountType: 'ASSET',
    normalBalance: 'DEBIT',
    isPostingAccount: true,
    isActive: true,
    allowManualPosting: false,
    allowedSources: [],
    systemAccountTag: null,
    ...overrides,
  };
}

function govReq(
  source: GovernanceJournalRequest['source'],
  lines: GovernanceJournalRequest['lines'],
  accounts: GovernanceAccount[],
): GovernanceJournalRequest {
  return { source, lines, accounts };
}

describe('CONSOLIDATED PROOF: HR salary + staff advances (sole acceptance)', () => {
  // ── A. Anti-patterns that must NEVER return ─────────────────────────────
  it('A: anti-patterns — no till payroll, no double cash-out shortage, no illegal till variance source', () => {
    const svc = readRepo('SamplePOS.Server/src/modules/hr/hr.service.ts');
    const repo = readRepo('SamplePOS.Server/src/modules/hr/hrComplete.repository.ts');
    const ui = readRepo('samplepos.client/src/pages/hr/HRPage.tsx');
    const till = readRepo('SamplePOS.Server/src/modules/cash-register/cashRegisterService.ts');
    const mig598 = readRepo('shared/sql/598_hr_payroll_complete.sql');
    const gov = readRepo('SamplePOS.Server/src/services/postingGovernanceService.ts');

    gate('A', 'ANTI_NO_DEFAULT_1010_UI', !ui.includes("useState('1010')"), 'UI must not default pay-from to 1010');
    gate(
      'A',
      'ANTI_LIST_EXCLUDES_1010',
      repo.includes("NOT IN ('1010', '1015')"),
      'payment account list excludes till/UF',
    );
    gate(
      'A',
      'ANTI_598_NO_PAYROLL_ON_1010',
      !/"AccountCode" IN \('1010'/.test(mig598),
      '598 must not grant PAYROLL onto 1010',
    );
    gate(
      'A',
      'ANTI_SHORTAGE_NOT_PAYROLL_SOURCE',
      /isTillShortage\s*\?\s*'CASH_VARIANCE'\s*:\s*'PAYROLL'/.test(svc),
      'shortage must not post as PAYROLL',
    );
    gate(
      'A',
      'ANTI_TILL_VAR_NOT_RECEIPT',
      /async createVarianceGLEntry[\s\S]*?source:\s*'CASH_VARIANCE'/.test(till) &&
        !/async createVarianceGLEntry[\s\S]*?source:\s*'PAYMENT_RECEIPT'/.test(till),
      'till variance must not use PAYMENT_RECEIPT',
    );
    gate(
      'A',
      'ANTI_SVC_NO_CATCH_SWALLOW',
      !svc.includes('assertPaymentAccount(pool, data.paymentAccountCode).catch'),
      'no swallowed payment-account errors',
    );
    gate('A', 'ANTI_GOV_HAS_CASH_VARIANCE', /'\s*CASH_VARIANCE\s*'/.test(gov), 'CASH_VARIANCE in PostingSource');
    gate('A', 'ANTI_GOV_RULE_D_ALLOWS_VARIANCE', /source !== 'CASH_VARIANCE'/.test(gov), 'Rule D allows CASH_VARIANCE');
  });

  // ── B. Disbursement SSOT ────────────────────────────────────────────────
  it('B: disbursement SSOT — 1010 forbidden; pick 1012; assert tag-aware', () => {
    gate('B', 'DISB_TILL', HR_TILL_CASH_ACCOUNT === '1010', 'till=1010');
    gate('B', 'DISB_PETTY', HR_PETTY_CASH_ACCOUNT === '1012', 'petty=1012');
    gate('B', 'DISB_1010_FORBIDDEN', isForbiddenHrDisbursementAccount('1010', 'CASH'), '1010+CASH blocked');
    gate('B', 'DISB_1015_FORBIDDEN', isForbiddenHrDisbursementAccount('1015', 'UNDEPOSITED_FUNDS'), '1015 blocked');
    gate('B', 'DISB_1012_OK', !isForbiddenHrDisbursementAccount('1012', 'PETTY_CASH'), '1012 allowed');

    let threw = false;
    try {
      assertHrDisbursementAccount('1010', 'CASH');
    } catch (e) {
      threw = (e as Error).message.includes('HR_PAY_NOT_CASH_DRAWER');
    }
    gate('B', 'DISB_ASSERT_THROWS', threw, 'assert throws for till');

    gate(
      'B',
      'DISB_PICK',
      pickHrDisbursementAccount([
        { code: '1010', tag: 'CASH' },
        { code: '1012', tag: 'PETTY_CASH' },
        { code: '1020', tag: 'BANK' },
      ]) === '1012',
      'pick prefers 1012',
    );

    const repo = readRepo('SamplePOS.Server/src/modules/hr/hrComplete.repository.ts');
    gate(
      'B',
      'DISB_ASSERT_LOADS_TAG',
      /SystemAccountTag[\s\S]{0,200}assertHrDisbursementAccount\(row\.code,\s*row\.tag\)/.test(repo),
      'assertPaymentAccount loads code+tag from DB',
    );
  });

  // ── C. Math + export identity ───────────────────────────────────────────
  it('C: payroll math + export sheet identity (Decimal only)', () => {
    const mathSrc = readRepo('shared/hr/payrollMath.ts');
    gate('C', 'MATH_DECIMAL', mathSrc.includes("from 'decimal.js'"), 'decimal.js');
    gate('C', 'MATH_NO_ROUND', !/Math\.round\(/.test(mathSrc), 'no Math.round');
    gate('C', 'MATH_NO_MIN', !/Math\.min\(/.test(mathSrc), 'no Math.min');

    const r = computePayrollAmounts({
      basicSalary: 1_000_000.005,
      monthlyAllowance: 100_000.005,
      openAdvanceRemaining: 400_000.01,
    });
    assertPayrollIdentity(r);
    gate('C', 'MATH_2DP', money2(r.gross).dp() === 2, `gross dp=${money2(r.gross).dp()}`);
    gate(
      'C',
      'MATH_IDENTITY',
      money2(r.gross).eq(money2(r.advanceRecovered).plus(money2(r.netPay))),
      `${r.gross} = ${r.advanceRecovered}+${r.netPay}`,
    );

    const sheet = buildPayrollExportSheet(
      { startDate: '2026-08-01', endDate: '2026-08-31', status: 'POSTED' },
      [
        {
          employeeFirstName: 'Ada',
          employeeLastName: 'Okello',
          basicSalary: 1_000_000.01,
          allowances: 100_000,
          advanceRecovered: 400_000.01,
          netPay: 700_000,
        },
      ],
    );
    const csv = payrollSheetToCsv(sheet);
    assertPayrollCsvConsistent(csv);
    gate('C', 'EXPORT_BOM', csv.charCodeAt(0) === 0xfeff, 'UTF-8 BOM');
    gate(
      'C',
      'EXPORT_TOTAL_IDENTITY',
      money2(sheet.totals.gross).eq(
        money2(sheet.totals.advanceRecovered).plus(money2(sheet.totals.netPay)),
      ),
      'export totals identity',
    );

    let broke = false;
    try {
      buildPayrollExportSheet(
        { startDate: '2026-08-01', endDate: '2026-08-31', status: 'OPEN' },
        [{ basicSalary: 100, allowances: 0, advanceRecovered: 40, netPay: 50 }],
      );
    } catch (e) {
      broke = (e as Error).message.includes('EXPORT_PAYROLL_ROW_IDENTITY');
    }
    gate('C', 'EXPORT_UNBALANCED_FAILS', broke, 'unbalanced export refused');
  });

  // ── D. GL shapes ────────────────────────────────────────────────────────
  it('D: GL builders — accrual / advance / shortage / pay', () => {
    const accrual = buildPayrollAccrualJournal({
      gross: 1_100_000,
      advanceRecovered: 400_000,
      netPay: 700_000,
      payableAccountCode: '2400-001',
      advanceAccountCode: '1410-001',
      empName: 'Ada',
    });
    assertJournalBalanced(accrual);
    assertJournalMatchesExpected(accrual, [
      { accountCode: PAYROLL_EXPENSE_ACCOUNT, side: 'debit', amount: 1_100_000, label: 'exp' },
      { accountCode: '1410-001', side: 'credit', amount: 400_000, label: 'recover' },
      { accountCode: '2400-001', side: 'credit', amount: 700_000, label: 'payable' },
    ]);
    gate('D', 'GL_ACCRUAL', true, 'DR 6000 / CR 1410 / CR 2400');

    const adv = buildEmployeeAdvanceJournal({
      amount: 400_000,
      advanceAccountCode: '1410-001',
      paymentAccountCode: '1012',
    });
    assertJournalBalanced(adv);
    gate('D', 'GL_ADVANCE', adv[1]!.accountCode === '1012', 'salary advance CR 1012');

    const short = buildCashShortageChargeJournal({
      amount: 25_000,
      advanceAccountCode: '1410-002',
    });
    assertJournalBalanced(short);
    gate(
      'D',
      'GL_SHORTAGE_TILL',
      short[1]!.accountCode === TILL_CASH_ACCOUNT,
      'shortage CR 1010 only',
    );

    const pay = buildPayrollPaymentJournal({
      netPay: 700_000,
      payableAccountCode: '2400-001',
      paymentAccountCode: '1012',
    });
    assertJournalBalanced(pay);
    gate('D', 'GL_PAY', pay[1]!.accountCode === '1012', 'pay CR 1012');

    const fifo = allocateFifoRecovery(
      [
        { id: 'a1', remainingAmount: 100_000 },
        { id: 'a2', remainingAmount: 250_000 },
      ],
      300_000,
    );
    gate(
      'D',
      'FIFO',
      fifo.length === 2 && fifo[0]!.amount === 100_000 && fifo[1]!.amount === 200_000,
      JSON.stringify(fifo),
    );
  });

  // ── E. Live governance Rule D ───────────────────────────────────────────
  it('E: live PostingGovernance — PAYROLL≠CR1010; CASH_VARIANCE=CR1010; PAYROLL=CR1012', () => {
    const cash1010 = makeAcct({
      accountCode: '1010',
      accountName: 'Cash Drawer',
      systemAccountTag: 'CASH',
      allowedSources: ['PAYMENT_DEPOSIT', 'CASH_VARIANCE', 'SYSTEM_CORRECTION'],
    });
    const petty1012 = makeAcct({
      accountCode: '1012',
      accountName: 'Petty Cash',
      systemAccountTag: 'PETTY_CASH',
      allowedSources: ['PAYROLL', 'TREASURY_PETTY_CASH'],
    });
    const adv1410 = makeAcct({
      accountCode: '1410-001',
      accountName: 'Emp Adv',
      allowedSources: ['PAYROLL', 'CASH_VARIANCE'],
    });
    const pay2400 = makeAcct({
      accountCode: '2400-001',
      accountName: 'Sal Payable',
      accountType: 'LIABILITY',
      normalBalance: 'CREDIT',
      allowedSources: ['PAYROLL'],
    });

    let blocked = false;
    try {
      PostingGovernanceService.validate(
        govReq(
          'PAYROLL',
          [
            { accountCode: '1410-001', debitAmount: 50_000, creditAmount: 0 },
            { accountCode: '1010', debitAmount: 0, creditAmount: 50_000 },
          ],
          [adv1410, cash1010],
        ),
      );
    } catch (err) {
      const e = err as { code?: string; message?: string };
      blocked = e.code === 'GOV_RULE_D_CASH_CREDIT' || String(e.message).includes('Cannot credit Cash');
    }
    gate('E', 'GOV_PAYROLL_CR_1010_BLOCKED', blocked, 'Rule D blocks PAYROLL+CR 1010');

    let varianceOk = true;
    try {
      PostingGovernanceService.validate(
        govReq(
          'CASH_VARIANCE',
          [
            { accountCode: '1410-001', debitAmount: 50_000, creditAmount: 0 },
            { accountCode: '1010', debitAmount: 0, creditAmount: 50_000 },
          ],
          [adv1410, cash1010],
        ),
      );
    } catch (err) {
      varianceOk = false;
      gate('E', 'GOV_VARIANCE_ERR', false, (err as Error).message.slice(0, 160));
    }
    gate('E', 'GOV_VARIANCE_CR_1010_OK', varianceOk, 'CASH_VARIANCE+CR 1010 allowed');

    let pettyOk = true;
    try {
      PostingGovernanceService.validate(
        govReq(
          'PAYROLL',
          [
            { accountCode: '2400-001', debitAmount: 700_000, creditAmount: 0 },
            { accountCode: '1012', debitAmount: 0, creditAmount: 700_000 },
          ],
          [pay2400, petty1012],
        ),
      );
    } catch (err) {
      pettyOk = false;
      gate('E', 'GOV_PETTY_ERR', false, (err as Error).message.slice(0, 160));
    }
    gate('E', 'GOV_PAYROLL_CR_1012_OK', pettyOk, 'PAYROLL+CR 1012 allowed');
  });

  // ── F. Full loop cash identity ──────────────────────────────────────────
  it('F: E2E loop — advance out + recover + pay net; cash out = gross', () => {
    const advanceAmt = 400_000;
    const math = computePayrollAmounts({
      basicSalary: 1_000_000,
      monthlyAllowance: 100_000,
      openAdvanceRemaining: advanceAmt,
    });
    assertPayrollIdentity(math);
    gate(
      'F',
      'LOOP_MATH',
      math.gross === 1_100_000 && math.advanceRecovered === 400_000 && math.netPay === 700_000,
      JSON.stringify(math),
    );

    const advanceJe = buildEmployeeAdvanceJournal({
      amount: advanceAmt,
      advanceAccountCode: '1410-001',
      paymentAccountCode: '1012',
    });
    const accrualJe = buildPayrollAccrualJournal({
      gross: math.gross,
      advanceRecovered: math.advanceRecovered,
      netPay: math.netPay,
      payableAccountCode: '2400-001',
      advanceAccountCode: '1410-001',
      empName: 'Ada',
    });
    const payJe = buildPayrollPaymentJournal({
      netPay: math.netPay,
      payableAccountCode: '2400-001',
      paymentAccountCode: '1012',
    });
    assertJournalBalanced(advanceJe);
    assertJournalBalanced(accrualJe);
    assertJournalBalanced(payJe);

    const cashOut = money2(advanceAmt).plus(money2(math.netPay));
    gate(
      'F',
      'LOOP_CASH_EQ_GROSS',
      cashOut.eq(math.gross),
      `cashOut ${cashOut} = gross ${math.gross}`,
    );
    gate(
      'F',
      'LOOP_NO_DOUBLE_SHORTAGE',
      buildCashShortageChargeJournal({ amount: 10_000, advanceAccountCode: '1410-9' })[1]!
        .accountCode === '1010',
      'shortage never credits petty',
    );
  });

  // ── G. Wiring (service / UI / migrations / concurrency / liquidity) ─────
  it('G: wiring — locks, liquidity, migrations, UI shortage path', () => {
    const svc = readRepo('SamplePOS.Server/src/modules/hr/hr.service.ts');
    const hrRepo = readRepo('SamplePOS.Server/src/modules/hr/hr.repository.ts');
    const ui = readRepo('samplepos.client/src/pages/hr/HRPage.tsx');

    gate(
      'G',
      'WIRE_PROCESS_LOCK',
      /async processPayroll[\s\S]{0,2500}lockForUpdate/.test(svc),
      'processPayroll FOR UPDATE',
    );
    gate(
      'G',
      'WIRE_PROCESS_NO_REPOST',
      /Cannot re-process payroll: accrual or payment JE already exists/.test(svc),
      'refuse re-process after GL',
    );
    gate(
      'G',
      'WIRE_LIQUIDITY_PAY',
      /assertSufficientLiquidityFunds[\s\S]{0,120}payroll payment/.test(svc),
      'pay checks liquidity',
    );
    gate(
      'G',
      'WIRE_LIQUIDITY_ADV',
      /assertSufficientLiquidityFunds[\s\S]{0,120}staff salary advance/.test(svc),
      'advance checks liquidity',
    );
    gate(
      'G',
      'WIRE_POST_LOCK',
      /async postPayroll[\s\S]{0,2500}lockForUpdate/.test(svc),
      'postPayroll locks',
    );
    gate(
      'G',
      'WIRE_PAY_LOCK',
      /async payPayroll[\s\S]{0,3000}lockForUpdate/.test(svc),
      'payPayroll locks',
    );
    gate(
      'G',
      'WIRE_DUP_ACCRUAL',
      svc.includes('Duplicate accrual blocked'),
      'dup accrual blocked',
    );
    gate('G', 'WIRE_DUP_PAY', svc.includes('Duplicate payment blocked'), 'dup pay blocked');
    gate(
      'G',
      'WIRE_MIG_601',
      fileHas('shared/sql/601_hr_cash_governance.sql', 'array_remove') &&
        fileHas('shared/sql/601_hr_cash_governance.sql', 'CASH_VARIANCE'),
      '601 strips PAYROLL from till + grants CASH_VARIANCE',
    );
    gate(
      'G',
      'WIRE_MIG_598_ADV',
      fileHas('shared/sql/598_hr_payroll_complete.sql', 'employee_advances'),
      '598 advances table',
    );
    gate(
      'G',
      'WIRE_MIG_599_UQ',
      fileHas('shared/sql/599_hr_payroll_integrity.sql', 'payroll_entries'),
      '599 integrity constraints',
    );
    gate(
      'G',
      'WIRE_SUBLEDGER_ACTIVE',
      /isAccountActive/.test(hrRepo) &&
        /async ensureEmployeeSubLedger[\s\S]{0,600}isAccountActive/.test(svc),
      'heal inactive/missing 2400 sub-ledger before post',
    );
    gate(
      'G',
      'WIRE_DELETE_NO_ORPHAN',
      /hasFinancialHistory/.test(hrRepo) &&
        /Cannot delete employee with payroll or advance history/.test(svc),
      'block delete that deactivates sub-ledger then fails FK',
    );
    gate(
      'G',
      'WIRE_POST_ENSURE_ALL',
      /async postPayroll[\s\S]{0,1200}ensureEmployeeSubLedger/.test(svc) &&
        !/if \(!entry\.employee_account_code\)/.test(svc),
      'post always ensures sub-ledgers (not only when code null)',
    );
    gate(
      'G',
      'WIRE_UI_SHORTAGE',
      /Charges till shortfall/.test(ui) && /CASH_SHORTAGE'\s*\?\s*'1010'/.test(ui),
      'UI shortage forces 1010 / hides pay-from',
    );
    gate('G', 'WIRE_UI_PICK', ui.includes('pickHrDisbursementAccount'), 'UI pick SSOT');
  });

  // ── H. Fail-loud builders ───────────────────────────────────────────────
  it('H: fail-loud — zero / unbalanced / shortfall refused', () => {
    const cases: Array<{ id: string; fn: () => void }> = [
      {
        id: 'FAIL_IDENTITY',
        fn: () =>
          buildPayrollAccrualJournal({
            gross: 100,
            advanceRecovered: 40,
            netPay: 50,
            payableAccountCode: '2400-001',
            advanceAccountCode: '1410-001',
            empName: 'x',
          }),
      },
      {
        id: 'FAIL_PAY_ZERO',
        fn: () =>
          buildPayrollPaymentJournal({
            netPay: 0,
            payableAccountCode: '2400-001',
            paymentAccountCode: '1012',
          }),
      },
      {
        id: 'FAIL_ADV_ZERO',
        fn: () =>
          buildEmployeeAdvanceJournal({
            amount: 0,
            advanceAccountCode: '1410-001',
            paymentAccountCode: '1012',
          }),
      },
      {
        id: 'FAIL_FIFO_SHORT',
        fn: () => allocateFifoRecovery([{ id: 'a', remainingAmount: 10 }], 20),
      },
    ];
    for (const c of cases) {
      let threw = false;
      try {
        c.fn();
      } catch {
        threw = true;
      }
      gate('H', c.id, threw, 'must throw');
    }
  });
});

afterAll(() => {
  const passed = gates.filter((g) => g.ok).length;
  const failed = gates.filter((g) => !g.ok);
  const bySection = gates.reduce<Record<string, { pass: number; fail: number }>>((acc, g) => {
    acc[g.section] ??= { pass: 0, fail: 0 };
    if (g.ok) acc[g.section].pass += 1;
    else acc[g.section].fail += 1;
    return acc;
  }, {});

  const evidence = {
    proof: 'HR_SALARY_ADVANCES_CONSOLIDATED',
    soleAcceptance: true,
    supersedes: ['PROOF_HR_PAYROLL_INTEGRITY'],
    generatedAt: new Date().toISOString(),
    summary: { passed, failed: failed.length, total: gates.length, bySection },
    identities: {
      salaryAdvance: 'DR 1410 / CR 1012|bank|MoMo · source PAYROLL',
      tillShortageCharge: 'DR 1410 / CR 1010 · source CASH_VARIANCE',
      accrual: 'DR 6000 gross / CR 1410 recovered / CR 2400 net',
      pay: 'DR 2400 / CR 1012|bank|MoMo · source PAYROLL',
      ruleD: 'PAYROLL cannot credit CASH 1010; CASH_VARIANCE can',
      cashLoop: 'advanceOut + netPay = gross (no float)',
      tillNotesPath: 'TREASURY_PETTY_CASH fund 1012 from 1010, then salary advance from 1012',
    },
    requiredMigrations: ['598_hr_payroll_complete.sql', '599_hr_payroll_integrity.sql', '601_hr_cash_governance.sql'],
    gates,
  };

  const md = [
    '# CONSOLIDATED PROOF: HR Salary + Staff Advances',
    '',
    '**Sole acceptance proof.** Do not accept payroll/advance work on partial proofs.',
    '',
    `Generated: ${evidence.generatedAt}`,
    '',
    failed.length === 0
      ? `**PASS** — ${passed}/${gates.length} gates`
      : `**FAIL** — ${failed.length} gate(s) open`,
    '',
    '## Identities (must hold)',
    '',
    '| Step | Journal | Source |',
    '|------|---------|--------|',
    '| Salary advance | DR 1410 / CR 1012\\|bank\\|MoMo | PAYROLL |',
    '| Till shortage → employee | DR 1410 / CR 1010 | CASH_VARIANCE |',
    '| Accrual | DR 6000 / CR 1410 recovered / CR 2400 net | PAYROLL |',
    '| Pay net | DR 2400 / CR 1012\\|bank\\|MoMo | PAYROLL |',
    '',
    '- Rule D: `PAYROLL` **cannot** credit Cash Drawer 1010.',
    '- Cash loop: `advanceOut + netPay = gross` (Decimal 2dp).',
    '- Till notes for salary advance: Treasury fund petty (`TREASURY_PETTY_CASH`) then advance from 1012.',
    '- Migrations required: **598, 599, 601**.',
    '',
    '## Sections',
    '',
    ...Object.entries(bySection).map(
      ([s, v]) => `- **${s}**: ${v.pass} pass / ${v.fail} fail`,
    ),
    '',
    '| Section | Gate | OK | Detail |',
    '|---------|------|----|--------|',
    ...gates.map(
      (g) =>
        `| ${g.section} | ${g.id} | ${g.ok ? 'PASS' : 'FAIL'} | ${g.detail.replace(/\|/g, '/')} |`,
    ),
    '',
  ].join('\n');

  writeFileSync(
    path.join(repoRoot, 'PROOF_HR_SALARY_ADVANCES_CONSOLIDATED.json'),
    JSON.stringify(evidence, null, 2),
  );
  writeFileSync(path.join(repoRoot, 'PROOF_HR_SALARY_ADVANCES_CONSOLIDATED.md'), md);

  // Keep old filenames as pointers so prior links do not look "green" falsely.
  const pointerMd = [
    '# SUPERSEDED',
    '',
    'This file is **not** the acceptance proof.',
    '',
    'Use **[PROOF_HR_SALARY_ADVANCES_CONSOLIDATED.md](./PROOF_HR_SALARY_ADVANCES_CONSOLIDATED.md)**',
    `(${passed}/${gates.length} gates, soleAcceptance=true).`,
    '',
  ].join('\n');
  writeFileSync(
    path.join(repoRoot, 'PROOF_HR_PAYROLL_INTEGRITY.json'),
    JSON.stringify(
      {
        superseded: true,
        use: 'PROOF_HR_SALARY_ADVANCES_CONSOLIDATED',
        generatedAt: evidence.generatedAt,
        summary: evidence.summary,
      },
      null,
      2,
    ),
  );
  writeFileSync(path.join(repoRoot, 'PROOF_HR_PAYROLL_INTEGRITY.md'), pointerMd);
});
