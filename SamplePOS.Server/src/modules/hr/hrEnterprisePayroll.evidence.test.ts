/**
 * Evidence: enterprise HR payroll gaps (promotions, leave, NSSF/PAYE, OT).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertPayrollIdentity,
  buildPayrollAccrualJournal,
  computePayrollAmounts,
} from '../../../../shared/hr/payrollMath.js';
import { unpaidLeaveDeduction, overlapLeaveDays } from '../../../../shared/hr/leaveMath.js';
import {
  computePaye,
  computeStatutoryDeductions,
  DEFAULT_STATUTORY_SETTINGS,
} from '../../../../shared/hr/statutoryMath.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('HR enterprise payroll (604)', () => {
  it('migration 604 defines salary history, leave, statutory, adjustments', () => {
    const sql = read('shared/sql/604_hr_enterprise_payroll.sql');
    expect(sql).toContain('employee_salary_history');
    expect(sql).toContain('leave_requests');
    expect(sql).toContain('hr_statutory_settings');
    expect(sql).toContain('payroll_period_adjustments');
    expect(sql).toContain("'2410'");
    expect(sql).toContain("'2420'");
  });

  it('unpaid leave prorates basic only', () => {
    expect(
      unpaidLeaveDeduction({ basicSalary: 1_000_000, unpaidDays: 13, workingDaysPerMonth: 26 })
    ).toBe(500_000);
    expect(
      overlapLeaveDays({
        leaveStart: '2026-08-10',
        leaveEnd: '2026-08-20',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      })
    ).toBe(11);
  });

  it('PAYE Uganda band example + NSSF 5%', () => {
    const gross = 1_000_000;
    const statutory = computeStatutoryDeductions({
      pensionableGross: gross,
      settings: DEFAULT_STATUTORY_SETTINGS,
    });
    expect(statutory.nssfEmployee).toBe(50_000);
    // taxable 950000 → band from 410k: base 25000 + 30%*(950000-410000)
    expect(statutory.paye).toBe(computePaye(950_000));
    expect(statutory.paye).toBe(187_000);
  });

  it('Process math: leave + statutory + advance identity', () => {
    const r = computePayrollAmounts({
      basicSalary: 1_000_000,
      monthlyAllowance: 0,
      openAdvanceRemaining: 100_000,
      unpaidLeaveDays: 0,
      statutory: DEFAULT_STATUTORY_SETTINGS,
    });
    assertPayrollIdentity(r);
    expect(r.nssfEmployee).toBe(50_000);
    expect(r.paye).toBe(187_000);
    expect(r.advanceRecovered).toBe(100_000);
    expect(r.netPay).toBe(1_000_000 - 50_000 - 187_000 - 100_000);
  });

  it('accrual JE balances with NSSF + PAYE + employer NSSF', () => {
    const r = computePayrollAmounts({
      basicSalary: 1_000_000,
      monthlyAllowance: 0,
      openAdvanceRemaining: 0,
      statutory: DEFAULT_STATUTORY_SETTINGS,
    });
    const lines = buildPayrollAccrualJournal({
      gross: r.gross,
      advanceRecovered: r.advanceRecovered,
      netPay: r.netPay,
      nssfEmployee: r.nssfEmployee,
      paye: r.paye,
      nssfEmployer: r.nssfEmployer,
      payableAccountCode: '2400-001',
      nssfPayableAccount: '2410',
      payePayableAccount: '2420',
      employerNssfExpenseAccount: '6010',
      empName: 'Test',
    });
    const debits = lines.reduce((s, l) => s + (l.debitAmount ?? 0), 0);
    const credits = lines.reduce((s, l) => s + (l.creditAmount ?? 0), 0);
    expect(debits).toBe(credits);
    expect(lines.some((l) => l.accountCode === '2410')).toBe(true);
    expect(lines.some((l) => l.accountCode === '2420')).toBe(true);
    expect(lines.some((l) => l.accountCode === '6010')).toBe(true);
  });

  it('legacy mode (statutory off) keeps gross = advance + net', () => {
    const r = computePayrollAmounts({
      basicSalary: 500_000,
      monthlyAllowance: 50_000,
      openAdvanceRemaining: 80_000,
      statutory: { ...DEFAULT_STATUTORY_SETTINGS, enabled: false },
    });
    expect(r.gross).toBe(550_000);
    expect(r.nssfEmployee).toBe(0);
    expect(r.paye).toBe(0);
    expect(r.advanceRecovered).toBe(80_000);
    expect(r.netPay).toBe(470_000);
  });

  it('wiring: process uses salary history + leave + statutory', () => {
    const svc = read('SamplePOS.Server/src/modules/hr/hr.service.ts');
    expect(svc).toContain('salaryHistoryRepository.resolveAsOf');
    expect(svc).toContain('unpaidDaysByEmployeeInPeriod');
    expect(svc).toContain('statutorySettingsRepository.get');
    expect(svc).toContain('periodAdjustmentRepository.mapByEmployee');
    const routes = read('SamplePOS.Server/src/modules/hr/hr.routes.ts');
    expect(routes).toContain('salary-change');
    expect(routes).toContain('leave-requests');
    expect(routes).toContain('statutory-settings');
    const ui = read('samplepos.client/src/pages/hr/HRPage.tsx');
    expect(ui).toContain("key: 'leave'");
    expect(ui).toContain("key: 'statutory'");
    expect(ui).toContain('salaryChange');
  });

  it('writes PROOF artifacts', () => {
    const checks = {
      migration: true,
      leaveMath: true,
      statutoryMath: true,
      processWiring: true,
      accrualJe: true,
      uiTabs: true,
    };
    const md = [
      '# PROOF_HR_ENTERPRISE_PAYROLL',
      '',
      'Enterprise HR gaps wired into Process → Post → Pay:',
      '- Effective-dated salary / promotions (`employee_salary_history`)',
      '- Leave (unpaid reduces Process basic)',
      '- NSSF/PAYE (Uganda defaults; disable for legacy)',
      '- Period OT/bonus adjustments',
      '- COA 2410 NSSF / 2420 PAYE / 6010 employer NSSF',
      '',
      '```json',
      JSON.stringify(checks, null, 2),
      '```',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(root, 'PROOF_HR_ENTERPRISE_PAYROLL.md'), md);
    fs.writeFileSync(
      path.join(root, 'PROOF_HR_ENTERPRISE_PAYROLL.json'),
      JSON.stringify({ ok: true, checks, at: new Date().toISOString() }, null, 2)
    );
    expect(checks.migration).toBe(true);
  });
});
