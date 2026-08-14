/**
 * Payroll monetary SSOT (shared).
 *
 * Rules (Tally/QB/SAP simplified, Uganda-ready):
 *   contractual = basic + allowances
 *   earnings = contractual + overtime + bonus − leaveDeduction
 *   gross = max(0, earnings)   // pensionable / expense base
 *   statutory = NSSF EE + PAYE (optional)
 *   advanceRecovered = min(openAdvances, max(0, gross − statutory))
 *   netPay = gross − statutory − advanceRecovered
 *   Accrual JE: DR expense(gross) [+ employer NSSF] =
 *               CR advance + CR NSSF + CR PAYE + CR payable(net) [+ CR NSSF employer]
 *
 * Allowance boundary (SAP / Odoo / Tally / QuickBooks):
 *   - MonthlyAllowance / payroll "allowances" = contractual recurring wage component
 *     (fixed monthly transport/housing baked into salary). Part of gross pay.
 *   - Daily / ad-hoc transport, fuel, per-diems paid by Accounts = Expenses module
 *     (category ALLOWANCE / travel). Operating expense — NOT payroll gross, NOT
 *     recovered from salary. Do not put those amounts in MonthlyAllowance.
 *
 * Precision: decimal.js ROUND_HALF_UP to 2dp — never native float arithmetic.
 */

import Decimal from 'decimal.js';
import {
  assertJournalBalanced,
  type ActualJournalLine,
} from '../financial-accuracy/journalAccuracy.js';
import { unpaidLeaveDeduction } from './leaveMath.js';
import {
  computeStatutoryDeductions,
  DEFAULT_STATUTORY_SETTINGS,
  type StatutorySettings,
} from './statutoryMath.js';

Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
});

const DP = 2;

export function money2(value: unknown): Decimal {
  if (value === null || value === undefined || value === '') {
    return new Decimal(0).toDecimalPlaces(DP);
  }
  const d = new Decimal(value as string | number | Decimal);
  if (!d.isFinite()) {
    throw new Error(`MONEY_INVALID: cannot parse monetary value ${String(value)}`);
  }
  return d.toDecimalPlaces(DP, Decimal.ROUND_HALF_UP);
}

export function money2Number(value: unknown): number {
  return money2(value).toNumber();
}

export interface PayrollComputeInput {
  basicSalary: number | string;
  monthlyAllowance: number | string;
  openAdvanceRemaining: number | string;
  overtimePay?: number | string;
  bonus?: number | string;
  unpaidLeaveDays?: number | string;
  workingDaysPerMonth?: number | string;
  statutory?: StatutorySettings | null;
}

export interface PayrollComputeResult {
  basicSalary: number;
  allowances: number;
  overtimePay: number;
  bonus: number;
  unpaidLeaveDays: number;
  leaveDeduction: number;
  gross: number;
  nssfEmployee: number;
  paye: number;
  nssfEmployer: number;
  advanceRecovered: number;
  deductions: number;
  netPay: number;
}

export function computePayrollAmounts(input: PayrollComputeInput): PayrollComputeResult {
  const basicRaw = money2(input.basicSalary);
  const allowRaw = money2(input.monthlyAllowance);
  const otRaw = money2(input.overtimePay ?? 0);
  const bonusRaw = money2(input.bonus ?? 0);
  const openRaw = money2(input.openAdvanceRemaining);
  const unpaidDays = money2(input.unpaidLeaveDays ?? 0);
  const workingDays = money2(input.workingDaysPerMonth ?? 26);

  if (basicRaw.lt(0)) throw new Error(`PAYROLL_INPUT_NEGATIVE: basicSalary=${basicRaw}`);
  if (allowRaw.lt(0)) throw new Error(`PAYROLL_INPUT_NEGATIVE: monthlyAllowance=${allowRaw}`);
  if (otRaw.lt(0)) throw new Error(`PAYROLL_INPUT_NEGATIVE: overtimePay=${otRaw}`);
  if (bonusRaw.lt(0)) throw new Error(`PAYROLL_INPUT_NEGATIVE: bonus=${bonusRaw}`);
  if (openRaw.lt(0)) throw new Error(`PAYROLL_INPUT_NEGATIVE: openAdvanceRemaining=${openRaw}`);
  if (unpaidDays.lt(0)) throw new Error(`PAYROLL_INPUT_NEGATIVE: unpaidLeaveDays=${unpaidDays}`);
  if (workingDays.lte(0)) {
    throw new Error(`PAYROLL_WORKING_DAYS: must be > 0, got ${workingDays}`);
  }

  const basicSalary = basicRaw;
  const allowances = allowRaw;
  const overtimePay = otRaw;
  const bonus = bonusRaw;
  const unpaidLeaveDaysNum = unpaidDays.toNumber();

  const leaveDeduction = money2(
    unpaidLeaveDeduction({
      basicSalary: basicSalary.toNumber(),
      unpaidDays: unpaidLeaveDaysNum,
      workingDaysPerMonth: workingDays.toNumber(),
    })
  );

  const contractual = money2(basicSalary.plus(allowances).plus(overtimePay).plus(bonus));
  const grossRaw = money2(contractual.minus(leaveDeduction));
  if (grossRaw.lt(0)) {
    throw new Error(
      `PAYROLL_GROSS_NEGATIVE: contractual=${contractual} leaveDeduction=${leaveDeduction}`
    );
  }
  const gross = grossRaw;

  const settings = input.statutory ?? {
    ...DEFAULT_STATUTORY_SETTINGS,
    enabled: false,
  };
  const statutory = computeStatutoryDeductions({
    pensionableGross: gross.toNumber(),
    settings,
  });
  const nssfEmployee = money2(statutory.nssfEmployee);
  const paye = money2(statutory.paye);
  const nssfEmployer = money2(statutory.nssfEmployer);

  const afterStatutory = money2(gross.minus(nssfEmployee).minus(paye));
  if (afterStatutory.lt(0)) {
    throw new Error(
      `PAYROLL_AFTER_STATUTORY_NEGATIVE: gross=${gross} nssf=${nssfEmployee} paye=${paye}`
    );
  }
  const maxRecoverable = afterStatutory;
  const openAdv = openRaw;
  const advanceRecovered = money2(openAdv.lt(maxRecoverable) ? openAdv : maxRecoverable);
  const deductions = money2(advanceRecovered.plus(nssfEmployee).plus(paye));
  const netPay = money2(gross.minus(deductions));

  if (netPay.lt(0)) {
    throw new Error(
      `PAYROLL_MATH_NEGATIVE_NET: gross=${gross} nssf=${nssfEmployee} paye=${paye} recovered=${advanceRecovered}`
    );
  }

  const result: PayrollComputeResult = {
    basicSalary: basicSalary.toNumber(),
    allowances: allowances.toNumber(),
    overtimePay: overtimePay.toNumber(),
    bonus: bonus.toNumber(),
    unpaidLeaveDays: unpaidLeaveDaysNum,
    leaveDeduction: leaveDeduction.toNumber(),
    gross: gross.toNumber(),
    nssfEmployee: nssfEmployee.toNumber(),
    paye: paye.toNumber(),
    nssfEmployer: nssfEmployer.toNumber(),
    advanceRecovered: advanceRecovered.toNumber(),
    deductions: deductions.toNumber(),
    netPay: netPay.toNumber(),
  };

  assertPayrollIdentity(result);
  return result;
}

/** Fail loud if gross ≠ advanceRecovered + nssf + paye + netPay */
export function assertPayrollIdentity(r: {
  gross: number | string;
  advanceRecovered: number | string;
  netPay: number | string;
  nssfEmployee?: number | string;
  paye?: number | string;
}): void {
  const nssf = money2(r.nssfEmployee ?? 0);
  const paye = money2(r.paye ?? 0);
  const lhs = money2(r.gross);
  const rhs = money2(money2(r.advanceRecovered).plus(nssf).plus(paye).plus(money2(r.netPay)));
  if (!lhs.equals(rhs)) {
    throw new Error(
      `PAYROLL_IDENTITY_BROKEN: gross ${lhs} ≠ recovered ${r.advanceRecovered} + nssf ${nssf} + paye ${paye} + net ${r.netPay}`
    );
  }
}

/** @deprecated use assertPayrollIdentity — returns false on break (legacy callers only) */
export function accrualLinesBalance(
  gross: number,
  advanceRecovered: number,
  netPay: number,
  nssfEmployee = 0,
  paye = 0
): boolean {
  try {
    assertPayrollIdentity({
      gross,
      advanceRecovered,
      nssfEmployee,
      paye,
      netPay,
    });
    return true;
  } catch {
    // Intentionally boolean for legacy call-sites — new code must use assertPayrollIdentity.
    return false;
  }
}

export const PAYROLL_EXPENSE_ACCOUNT = '6000';

export function buildPayrollAccrualJournal(input: {
  gross: number;
  advanceRecovered: number;
  netPay: number;
  nssfEmployee?: number;
  paye?: number;
  nssfEmployer?: number;
  payableAccountCode: string;
  advanceAccountCode?: string | null;
  nssfPayableAccount?: string | null;
  payePayableAccount?: string | null;
  employerNssfExpenseAccount?: string | null;
  empName: string;
}): ActualJournalLine[] {
  const nssfEmployee = money2Number(input.nssfEmployee ?? 0);
  const paye = money2Number(input.paye ?? 0);
  const nssfEmployer = money2Number(input.nssfEmployer ?? 0);

  assertPayrollIdentity({
    gross: input.gross,
    advanceRecovered: input.advanceRecovered,
    nssfEmployee,
    paye,
    netPay: input.netPay,
  });

  const gross = money2Number(input.gross);
  const recovered = money2Number(input.advanceRecovered);
  const net = money2Number(input.netPay);

  if (gross <= 0 && recovered <= 0 && net <= 0 && nssfEmployee <= 0 && paye <= 0) {
    throw new Error('PAYROLL_ACCRUAL_EMPTY: nothing to post');
  }
  if (!input.payableAccountCode?.trim() && net > 0) {
    throw new Error('PAYROLL_ACCRUAL_NO_PAYABLE: missing salaries payable account');
  }
  if (recovered > 0 && !input.advanceAccountCode?.trim()) {
    throw new Error('PAYROLL_ACCRUAL_NO_ADVANCE_ACCT: missing employee advance account');
  }
  if (nssfEmployee > 0 && !input.nssfPayableAccount?.trim()) {
    throw new Error('PAYROLL_ACCRUAL_NO_NSSF_ACCT: missing NSSF payable account');
  }
  if (paye > 0 && !input.payePayableAccount?.trim()) {
    throw new Error('PAYROLL_ACCRUAL_NO_PAYE_ACCT: missing PAYE payable account');
  }
  if (nssfEmployer > 0) {
    if (!input.employerNssfExpenseAccount?.trim()) {
      throw new Error('PAYROLL_ACCRUAL_NO_EMPLOYER_NSSF_EXPENSE');
    }
    if (!input.nssfPayableAccount?.trim()) {
      throw new Error('PAYROLL_ACCRUAL_NO_NSSF_ACCT: missing NSSF payable for employer portion');
    }
  }

  const lines: ActualJournalLine[] = [
    {
      accountCode: PAYROLL_EXPENSE_ACCOUNT,
      debitAmount: gross,
      creditAmount: 0,
    },
  ];

  if (nssfEmployer > 0) {
    lines.push({
      accountCode: input.employerNssfExpenseAccount!,
      debitAmount: nssfEmployer,
      creditAmount: 0,
    });
  }

  if (recovered > 0) {
    lines.push({
      accountCode: input.advanceAccountCode!,
      debitAmount: 0,
      creditAmount: recovered,
    });
  }

  const nssfTotal = money2Number(money2(nssfEmployee).plus(nssfEmployer));
  if (nssfTotal > 0) {
    lines.push({
      accountCode: input.nssfPayableAccount!,
      debitAmount: 0,
      creditAmount: nssfTotal,
    });
  }

  if (paye > 0) {
    lines.push({
      accountCode: input.payePayableAccount!,
      debitAmount: 0,
      creditAmount: paye,
    });
  }

  if (net > 0) {
    lines.push({
      accountCode: input.payableAccountCode,
      debitAmount: 0,
      creditAmount: net,
    });
  }

  assertJournalBalanced(lines);
  return lines;
}

export function buildPayrollPaymentJournal(input: {
  netPay: number;
  payableAccountCode: string;
  paymentAccountCode: string;
}): ActualJournalLine[] {
  const net = money2Number(input.netPay);
  if (net <= 0) throw new Error('PAYROLL_PAY_ZERO: net pay must be positive');
  if (!input.payableAccountCode?.trim()) throw new Error('PAYROLL_PAY_NO_PAYABLE');
  if (!input.paymentAccountCode?.trim()) throw new Error('PAYROLL_PAY_NO_CASH');

  const lines: ActualJournalLine[] = [
    {
      accountCode: input.payableAccountCode,
      debitAmount: net,
      creditAmount: 0,
    },
    {
      accountCode: input.paymentAccountCode,
      debitAmount: 0,
      creditAmount: net,
    },
  ];
  assertJournalBalanced(lines);
  return lines;
}

export function buildEmployeeAdvanceJournal(input: {
  amount: number;
  advanceAccountCode: string;
  paymentAccountCode: string;
}): ActualJournalLine[] {
  const amount = money2Number(input.amount);
  if (amount <= 0) throw new Error('EMP_ADVANCE_ZERO: amount must be positive');
  if (!input.advanceAccountCode?.trim()) throw new Error('EMP_ADVANCE_NO_ASSET');
  if (!input.paymentAccountCode?.trim()) throw new Error('EMP_ADVANCE_NO_CASH');

  const lines: ActualJournalLine[] = [
    {
      accountCode: input.advanceAccountCode,
      debitAmount: amount,
      creditAmount: 0,
    },
    {
      accountCode: input.paymentAccountCode,
      debitAmount: 0,
      creditAmount: amount,
    },
  ];
  assertJournalBalanced(lines);
  return lines;
}

/**
 * Charge till shortfall to employee — does NOT take a second cash out from petty/bank.
 *   DR 1410 Employee Advances / CR 1010 Cash Drawer
 * Governance source must be CASH_VARIANCE (Rule D), never PAYROLL.
 */
export const TILL_CASH_ACCOUNT = '1010';

export function buildCashShortageChargeJournal(input: {
  amount: number;
  advanceAccountCode: string;
}): ActualJournalLine[] {
  return buildEmployeeAdvanceJournal({
    amount: input.amount,
    advanceAccountCode: input.advanceAccountCode,
    paymentAccountCode: TILL_CASH_ACCOUNT,
  });
}

/** Allocate FIFO recovery amounts without float drift */
export function allocateFifoRecovery(
  openAdvances: Array<{ id: string; remainingAmount: number | string }>,
  toRecover: number | string
): Array<{ advanceId: string; amount: number }> {
  let left = money2(toRecover);
  if (left.lte(0)) return [];

  const out: Array<{ advanceId: string; amount: number }> = [];
  for (const adv of openAdvances) {
    if (left.lte(0)) break;
    const rem = money2(adv.remainingAmount);
    if (rem.lte(0)) continue;
    const take = money2(rem.lt(left) ? rem : left);
    if (take.lte(0)) continue;
    out.push({ advanceId: adv.id, amount: take.toNumber() });
    left = money2(left.minus(take));
  }

  if (left.gt(0)) {
    throw new Error(
      `PAYROLL_ADVANCE_SHORTFALL: ${left.toFixed(2)} could not be allocated from open advances`
    );
  }
  return out;
}
