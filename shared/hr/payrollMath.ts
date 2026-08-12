/**
 * Payroll monetary SSOT (shared).
 *
 * Rules (Tally/QB/SAP simplified):
 *   gross = basic + allowances
 *   advanceRecovered = min(openAdvances, gross)  — never drives net negative
 *   netPay = gross − advanceRecovered
 *   Accrual JE must balance: DR expense(gross) = CR advance + CR payable(net)
 *
 * Precision: decimal.js ROUND_HALF_UP to 2dp — never native float arithmetic.
 */

import Decimal from 'decimal.js';
import {
  assertJournalBalanced,
  type ActualJournalLine,
} from '../financial-accuracy/journalAccuracy.js';

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
}

export interface PayrollComputeResult {
  basicSalary: number;
  allowances: number;
  gross: number;
  advanceRecovered: number;
  deductions: number;
  netPay: number;
}

export function computePayrollAmounts(input: PayrollComputeInput): PayrollComputeResult {
  const zero = new Decimal(0);
  const basicRaw = money2(input.basicSalary);
  const allowRaw = money2(input.monthlyAllowance);
  const openRaw = money2(input.openAdvanceRemaining);

  const basicSalary = basicRaw.lt(0) ? zero : basicRaw;
  const allowances = allowRaw.lt(0) ? zero : allowRaw;
  const gross = money2(basicSalary.plus(allowances));
  const openAdv = openRaw.lt(0) ? zero : openRaw;
  const advanceRecovered = money2(openAdv.lt(gross) ? openAdv : gross);
  const deductions = advanceRecovered;
  const netPay = money2(gross.minus(deductions));

  if (netPay.lt(0)) {
    throw new Error(
      `PAYROLL_MATH_NEGATIVE_NET: gross=${gross} recovered=${advanceRecovered}`
    );
  }

  const result: PayrollComputeResult = {
    basicSalary: basicSalary.toNumber(),
    allowances: allowances.toNumber(),
    gross: gross.toNumber(),
    advanceRecovered: advanceRecovered.toNumber(),
    deductions: deductions.toNumber(),
    netPay: netPay.toNumber(),
  };

  assertPayrollIdentity(result);
  return result;
}

/** Fail loud if gross ≠ advanceRecovered + netPay */
export function assertPayrollIdentity(r: PayrollComputeResult): void {
  const lhs = money2(r.gross);
  const rhs = money2(money2(r.advanceRecovered).plus(money2(r.netPay)));
  if (!lhs.equals(rhs)) {
    throw new Error(
      `PAYROLL_IDENTITY_BROKEN: gross ${lhs} ≠ recovered ${r.advanceRecovered} + net ${r.netPay}`
    );
  }
}

/** @deprecated use assertPayrollIdentity — kept for call-site compatibility */
export function accrualLinesBalance(
  gross: number,
  advanceRecovered: number,
  netPay: number
): boolean {
  try {
    assertPayrollIdentity({
      basicSalary: 0,
      allowances: 0,
      gross,
      advanceRecovered,
      deductions: advanceRecovered,
      netPay,
    });
    return true;
  } catch {
    return false;
  }
}

export const PAYROLL_EXPENSE_ACCOUNT = '6000';

export function buildPayrollAccrualJournal(input: {
  gross: number;
  advanceRecovered: number;
  netPay: number;
  payableAccountCode: string;
  advanceAccountCode?: string | null;
  empName: string;
}): ActualJournalLine[] {
  assertPayrollIdentity({
    basicSalary: 0,
    allowances: 0,
    gross: input.gross,
    advanceRecovered: input.advanceRecovered,
    deductions: input.advanceRecovered,
    netPay: input.netPay,
  });

  const gross = money2Number(input.gross);
  const recovered = money2Number(input.advanceRecovered);
  const net = money2Number(input.netPay);

  if (gross <= 0 && recovered <= 0 && net <= 0) {
    throw new Error('PAYROLL_ACCRUAL_EMPTY: nothing to post');
  }
  if (!input.payableAccountCode?.trim() && net > 0) {
    throw new Error('PAYROLL_ACCRUAL_NO_PAYABLE: missing salaries payable account');
  }
  if (recovered > 0 && !input.advanceAccountCode?.trim()) {
    throw new Error('PAYROLL_ACCRUAL_NO_ADVANCE_ACCT: missing employee advance account');
  }

  const lines: ActualJournalLine[] = [
    {
      accountCode: PAYROLL_EXPENSE_ACCOUNT,
      debitAmount: gross,
      creditAmount: 0,
    },
  ];

  if (recovered > 0) {
    lines.push({
      accountCode: input.advanceAccountCode!,
      debitAmount: 0,
      creditAmount: recovered,
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
