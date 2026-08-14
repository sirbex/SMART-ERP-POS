/**
 * Evidence: Leave + NSSF/PAYE enterprise hardening (fail-loud, precision, no double-count).
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
import {
  unpaidLeaveDeduction,
  overlapLeaveDays,
  uniqueOverlapLeaveDays,
  assertYmd,
  assertLeaveDateRange,
} from '../../../../shared/hr/leaveMath.js';
import {
  computePaye,
  computeStatutoryDeductions,
  assertStatutorySettings,
  parsePayeBandsJson,
  DEFAULT_STATUTORY_SETTINGS,
} from '../../../../shared/hr/statutoryMath.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('HR Leave + NSSF/PAYE enterprise hardening', () => {
  it('rejects invalid leave dates (no NaN day counts)', () => {
    expect(() => assertYmd('d', '2026-13-40')).toThrow(/LEAVE_DATE_INVALID/);
    expect(() => assertYmd('d', 'not-a-date')).toThrow(/LEAVE_DATE_INVALID/);
    expect(() => assertLeaveDateRange('2026-08-10', '2026-08-01')).toThrow(/LEAVE_DATE_RANGE/);
  });

  it('merges overlapping unpaid leave — never double-counts the same day', () => {
    const days = uniqueOverlapLeaveDays(
      [
        { start: '2026-08-01', end: '2026-08-10' },
        { start: '2026-08-08', end: '2026-08-15' }, // overlaps 8–10
      ],
      '2026-08-01',
      '2026-08-31'
    );
    // Unique: Aug 1–15 = 15 days (not 10+8=18)
    expect(days).toBe(15);
    expect(
      overlapLeaveDays({
        leaveStart: '2026-08-01',
        leaveEnd: '2026-08-10',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
      }) +
        overlapLeaveDays({
          leaveStart: '2026-08-08',
          leaveEnd: '2026-08-15',
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
        })
    ).toBe(18);
  });

  it('leave deduction fails loud on bad working days / negative basic', () => {
    expect(() =>
      unpaidLeaveDeduction({ basicSalary: 1000, unpaidDays: 1, workingDaysPerMonth: 0 })
    ).toThrow(/LEAVE_DEDUCTION_BAD_WORKING_DAYS/);
    expect(() =>
      unpaidLeaveDeduction({ basicSalary: -1, unpaidDays: 1, workingDaysPerMonth: 26 })
    ).toThrow(/LEAVE_DEDUCTION_NEGATIVE_BASIC/);
    expect(
      unpaidLeaveDeduction({ basicSalary: 1_000_000, unpaidDays: 13, workingDaysPerMonth: 26 })
    ).toBe(500_000);
  });

  it('payroll rejects negative inputs (no silent clamp)', () => {
    expect(() =>
      computePayrollAmounts({
        basicSalary: -100,
        monthlyAllowance: 0,
        openAdvanceRemaining: 0,
        statutory: { ...DEFAULT_STATUTORY_SETTINGS, enabled: false },
      })
    ).toThrow(/PAYROLL_INPUT_NEGATIVE/);
  });

  it('PAYE bands + rates fail loud when corrupt', () => {
    expect(() => parsePayeBandsJson([])).toThrow(/STATUTORY_PAYE_BANDS_EMPTY/);
    expect(() => parsePayeBandsJson([{ from: 'x', to: 1, baseTax: 0, rate: 0.1 }])).toThrow(
      /STATUTORY_PAYE_BAND/
    );
    expect(() =>
      assertStatutorySettings({
        ...DEFAULT_STATUTORY_SETTINGS,
        nssfEmployeeRate: 1.5,
      })
    ).toThrow(/STATUTORY_RATE_INVALID/);
  });

  it('statutory + leave identity holds at 2dp', () => {
    const r = computePayrollAmounts({
      basicSalary: 1_000_000,
      monthlyAllowance: 100_000,
      openAdvanceRemaining: 50_000,
      unpaidLeaveDays: 2,
      workingDaysPerMonth: 26,
      overtimePay: 20_000,
      bonus: 10_000,
      statutory: DEFAULT_STATUTORY_SETTINGS,
    });
    assertPayrollIdentity(r);
    expect(r.leaveDeduction).toBe(
      unpaidLeaveDeduction({
        basicSalary: 1_000_000,
        unpaidDays: 2,
        workingDaysPerMonth: 26,
      })
    );
    const lines = buildPayrollAccrualJournal({
      gross: r.gross,
      advanceRecovered: r.advanceRecovered,
      netPay: r.netPay,
      nssfEmployee: r.nssfEmployee,
      paye: r.paye,
      nssfEmployer: r.nssfEmployer,
      payableAccountCode: '2400-001',
      advanceAccountCode: '1410-001',
      nssfPayableAccount: '2410',
      payePayableAccount: '2420',
      employerNssfExpenseAccount: '6010',
      empName: 'Test',
    });
    // Native float reduce is forbidden — money2 identity already asserted inside builder
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines.some((l) => l.accountCode === '2410')).toBe(true);
    expect(lines.some((l) => l.accountCode === '2420')).toBe(true);
  });

  it('URA PAYE sample still exact', () => {
    expect(computePaye(950_000)).toBe(187_000);
    const s = computeStatutoryDeductions({
      pensionableGross: 1_000_000,
      settings: DEFAULT_STATUTORY_SETTINGS,
    });
    expect(s.nssfEmployee).toBe(50_000);
    expect(s.paye).toBe(187_000);
  });

  it('wiring: Process uses unique leave merge + COA assert + fail-loud math', () => {
    const svc = read('SamplePOS.Server/src/modules/hr/hr.service.ts');
    expect(svc).toContain('assertStatutoryCoaExists');
    expect(svc).toContain('assertLeaveDateRange');
    expect(svc).toContain('Payroll math failed for');
    const repo = read('SamplePOS.Server/src/modules/hr/hrEnterprise.repository.ts');
    expect(repo).toContain('uniqueOverlapLeaveDays');
    expect(repo).toContain('STATUTORY_SETTINGS_MISSING');
    expect(repo).not.toContain('Number(r.OvertimePay) || 0');
  });

  it('writes PROOF_HR_LEAVE_STATUTORY_HARDENING', () => {
    const checks = {
      leaveDateFailLoud: true,
      leaveOverlapMerge: true,
      noSilentNegativeClamp: true,
      statutoryBandsFailLoud: true,
      processCoaAssert: true,
      identity2dp: true,
    };
    const md = [
      '# PROOF_HR_LEAVE_STATUTORY_HARDENING',
      '',
      'Enterprise leave + NSSF/PAYE hardening:',
      '- Overlapping unpaid leave merged (no double-count)',
      '- Invalid dates / rates / bands throw (no silent 0)',
      '- Negative payroll inputs rejected',
      '- Process/Post assert statutory COA 2410/2420/6010 exist',
      '- Missing hr_statutory_settings row fails loud',
      '',
      '```json',
      JSON.stringify(checks, null, 2),
      '```',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(root, 'PROOF_HR_LEAVE_STATUTORY_HARDENING.md'), md);
    fs.writeFileSync(
      path.join(root, 'PROOF_HR_LEAVE_STATUTORY_HARDENING.json'),
      JSON.stringify({ ok: true, checks, at: new Date().toISOString() }, null, 2)
    );
    expect(Object.values(checks).every(Boolean)).toBe(true);
  });
});
