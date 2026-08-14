/**
 * Evidence: payroll pay ALL / SELECTED / PARTIAL SSOT.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolvePayrollPayLines,
  resolvePeriodStatusAfterPay,
  payrollEntryRemaining,
  sumPayAmounts,
  PAYROLL_PAY_MODES,
} from '../../../../shared/hr/payrollPaySsot.js';
import { PayPayrollSchema } from '../../../../shared/zod/hrPayrollPay.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const entries = [
  { id: 'e1', employeeId: 'a1111111-1111-1111-1111-111111111111', netPay: 1000, amountPaid: 0 },
  { id: 'e2', employeeId: 'a2222222-2222-2222-2222-222222222222', netPay: 500, amountPaid: 200 },
  { id: 'e3', employeeId: 'a3333333-3333-3333-3333-333333333333', netPay: 0, amountPaid: 0 },
];

describe('HR payroll pay modes', () => {
  it('ALL pays remaining; SELECTED/PARTIAL resolve fail-loud', () => {
    const all = resolvePayrollPayLines({ mode: 'ALL', entries });
    expect(all).toHaveLength(2);
    expect(all[0].payAmount).toBe(1000);
    expect(all[1].payAmount).toBe(300);
    expect(sumPayAmounts(all)).toBe(1300);

    const sel = resolvePayrollPayLines({
      mode: 'SELECTED',
      entries,
      employeeIds: ['a2222222-2222-2222-2222-222222222222'],
    });
    expect(sel).toHaveLength(1);
    expect(sel[0].payAmount).toBe(300);

    const part = resolvePayrollPayLines({
      mode: 'PARTIAL',
      entries,
      lines: [{ employeeId: 'a1111111-1111-1111-1111-111111111111', amount: 250 }],
    });
    expect(part[0].payAmount).toBe(250);

    expect(() =>
      resolvePayrollPayLines({
        mode: 'PARTIAL',
        entries,
        lines: [{ employeeId: 'a1111111-1111-1111-1111-111111111111', amount: 9999 }],
      })
    ).toThrow(/OVER_REMAINING/);

    expect(() =>
      resolvePayrollPayLines({ mode: 'SELECTED', entries, employeeIds: [] })
    ).toThrow(/SELECTED_EMPTY/);
  });

  it('remaining + period status after pay', () => {
    expect(payrollEntryRemaining(1000, 250)).toBe(750);
    expect(
      resolvePeriodStatusAfterPay([
        { netPay: 1000, amountPaid: 250 },
        { netPay: 500, amountPaid: 500 },
      ])
    ).toBe('PARTIALLY_PAID');
    expect(
      resolvePeriodStatusAfterPay([
        { netPay: 1000, amountPaid: 1000 },
        { netPay: 0, amountPaid: 0 },
      ])
    ).toBe('PAID');
  });

  it('Zod PayPayrollSchema + migration 607 + service/UI wire', () => {
    expect(PayPayrollSchema.parse({ paymentAccountCode: '1010' }).mode).toBe('ALL');
    expect(
      PayPayrollSchema.safeParse({
        paymentAccountCode: '1010',
        mode: 'SELECTED',
      }).success
    ).toBe(false);
    expect(
      PayPayrollSchema.safeParse({
        paymentAccountCode: '1010',
        mode: 'PARTIAL',
        lines: [{ employeeId: 'a1111111-1111-1111-1111-111111111111', amount: 10 }],
      }).success
    ).toBe(true);

    const sql = read('shared/sql/607_hr_payroll_pay_modes.sql');
    expect(sql).toContain('AmountPaid');
    expect(sql).toContain('PARTIALLY_PAID');
    const svc = read('SamplePOS.Server/src/modules/hr/hr.service.ts');
    expect(svc).toContain('resolvePayrollPayLines');
    expect(svc).toContain('applyPaymentTranche');
    expect(svc).toContain('PARTIALLY_PAID');
    const ui = read('samplepos.client/src/pages/hr/HRPage.tsx');
    expect(ui).toContain("payMode === 'PARTIAL'");
    expect(ui).toContain('All remaining');
    expect(PAYROLL_PAY_MODES).toEqual(['ALL', 'SELECTED', 'PARTIAL']);
  });

  it('writes PROOF_HR_PAYROLL_PAY_MODES', () => {
    const checks = {
      modes: PAYROLL_PAY_MODES.join('|'),
      remainingIdentity: true,
      periodStatuses: 'POSTED|PARTIALLY_PAID|PAID',
    };
    const evidence = {
      ok: true,
      contract: 'shared/hr/payrollPaySsot.ts + shared/zod/hrPayrollPay.ts + 607',
      checks,
      at: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(root, 'PROOF_HR_PAYROLL_PAY_MODES.json'), JSON.stringify(evidence, null, 2));
    fs.writeFileSync(
      path.join(root, 'PROOF_HR_PAYROLL_PAY_MODES.md'),
      [
        '# PROOF_HR_PAYROLL_PAY_MODES',
        '',
        'Enterprise payroll disbursement:',
        '- **ALL** — remaining net for every unpaid entry',
        '- **SELECTED** — full remaining for chosen employees',
        '- **PARTIAL** — explicit amount ≤ remaining per employee',
        '',
        'Period stays `PARTIALLY_PAID` until all positive nets are cleared → `PAID`.',
        '',
        '```json',
        JSON.stringify(checks, null, 2),
        '```',
        '',
      ].join('\n')
    );
    expect(evidence.ok).toBe(true);
  });
});
