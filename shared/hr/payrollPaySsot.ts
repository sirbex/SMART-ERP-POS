/**
 * Payroll pay run SSOT — enterprise cash disbursement granularity.
 *
 * Modes (SAP HCM / Odoo payroll payment batch):
 *   ALL      — pay remaining net for every unpaid entry in the period
 *   SELECTED — pay remaining net for listed employees only
 *   PARTIAL  — pay explicit amounts (≤ remaining) per employee
 *
 * Period status after a run:
 *   PAID            — every entry with NetPay>0 has AmountPaid ≥ NetPay
 *   PARTIALLY_PAID  — at least one payment posted, residual remains
 *
 * Identity: AmountPaid + Remaining = NetPay (2dp). Never overpay.
 */

import { money2, money2Number } from './payrollMath.js';

export const PAYROLL_PAY_MODES = ['ALL', 'SELECTED', 'PARTIAL'] as const;
export type PayrollPayMode = (typeof PAYROLL_PAY_MODES)[number];

/** Period statuses that accept a pay run. */
export const PAYROLL_PAYABLE_PERIOD_STATUSES = ['POSTED', 'PARTIALLY_PAID'] as const;
export type PayrollPayablePeriodStatus = (typeof PAYROLL_PAYABLE_PERIOD_STATUSES)[number];

export const PAYROLL_PERIOD_STATUSES = [
  'OPEN',
  'PROCESSED',
  'POSTED',
  'PARTIALLY_PAID',
  'PAID',
] as const;
export type PayrollPeriodStatus = (typeof PAYROLL_PERIOD_STATUSES)[number];

export function isPayrollPayMode(v: unknown): v is PayrollPayMode {
  return typeof v === 'string' && (PAYROLL_PAY_MODES as readonly string[]).includes(v);
}

export function isPayrollPayablePeriodStatus(v: unknown): v is PayrollPayablePeriodStatus {
  return (
    typeof v === 'string' &&
    (PAYROLL_PAYABLE_PERIOD_STATUSES as readonly string[]).includes(v)
  );
}

/** Remaining cash payable for an entry (never negative). */
export function payrollEntryRemaining(netPay: number, amountPaid: number): number {
  const net = money2(netPay);
  const paid = money2(amountPaid);
  if (net.isNeg()) {
    throw new Error('PAYROLL_PAY_NEG_NET: NetPay cannot be negative');
  }
  if (paid.isNeg()) {
    throw new Error('PAYROLL_PAY_NEG_PAID: AmountPaid cannot be negative');
  }
  if (paid.gt(net)) {
    throw new Error(
      `PAYROLL_PAY_OVERPAID: AmountPaid ${money2Number(paid)} > NetPay ${money2Number(net)}`
    );
  }
  return money2Number(net.minus(paid));
}

export function isPayrollEntryFullyPaid(netPay: number, amountPaid: number): boolean {
  if (money2Number(netPay) <= 0) return true;
  return payrollEntryRemaining(netPay, amountPaid) <= 0;
}

export type PayrollPayLineInput = {
  employeeId: string;
  amount?: number;
};

export type ResolvedPayrollPayLine = {
  employeeId: string;
  entryId: string;
  payAmount: number;
  remainingBefore: number;
  netPay: number;
  amountPaidBefore: number;
};

export function resolvePayrollPayLines(input: {
  mode: PayrollPayMode;
  entries: Array<{
    id: string;
    employeeId: string;
    netPay: number;
    amountPaid: number;
  }>;
  employeeIds?: string[] | null;
  lines?: PayrollPayLineInput[] | null;
}): ResolvedPayrollPayLine[] {
  const byEmp = new Map(input.entries.map((e) => [e.employeeId, e]));

  if (input.mode === 'ALL') {
    if (input.employeeIds?.length || input.lines?.length) {
      throw new Error('PAYROLL_PAY_ALL_EXTRAS: ALL mode must not send employeeIds or lines');
    }
    const out: ResolvedPayrollPayLine[] = [];
    for (const e of input.entries) {
      const remaining = payrollEntryRemaining(e.netPay, e.amountPaid);
      if (remaining <= 0) continue;
      out.push({
        employeeId: e.employeeId,
        entryId: e.id,
        payAmount: remaining,
        remainingBefore: remaining,
        netPay: e.netPay,
        amountPaidBefore: e.amountPaid,
      });
    }
    return out;
  }

  if (input.mode === 'SELECTED') {
    const ids = input.employeeIds ?? [];
    if (ids.length === 0) {
      throw new Error('PAYROLL_PAY_SELECTED_EMPTY: select at least one employee');
    }
    if (input.lines?.length) {
      throw new Error('PAYROLL_PAY_SELECTED_LINES: use PARTIAL mode for explicit amounts');
    }
    const seen = new Set<string>();
    const out: ResolvedPayrollPayLine[] = [];
    for (const empId of ids) {
      if (seen.has(empId)) throw new Error(`PAYROLL_PAY_DUP_EMPLOYEE: ${empId}`);
      seen.add(empId);
      const e = byEmp.get(empId);
      if (!e) throw new Error(`PAYROLL_PAY_UNKNOWN_EMPLOYEE: ${empId} not in this period`);
      const remaining = payrollEntryRemaining(e.netPay, e.amountPaid);
      if (remaining <= 0) {
        throw new Error(`PAYROLL_PAY_ALREADY_PAID: employee ${empId} has no remaining net`);
      }
      out.push({
        employeeId: empId,
        entryId: e.id,
        payAmount: remaining,
        remainingBefore: remaining,
        netPay: e.netPay,
        amountPaidBefore: e.amountPaid,
      });
    }
    return out;
  }

  const lines = input.lines ?? [];
  if (lines.length === 0) {
    throw new Error('PAYROLL_PAY_PARTIAL_EMPTY: provide lines[{ employeeId, amount }]');
  }
  const seen = new Set<string>();
  const out: ResolvedPayrollPayLine[] = [];
  for (const line of lines) {
    if (!line.employeeId) throw new Error('PAYROLL_PAY_PARTIAL_NO_EMPLOYEE');
    if (seen.has(line.employeeId)) {
      throw new Error(`PAYROLL_PAY_DUP_EMPLOYEE: ${line.employeeId}`);
    }
    seen.add(line.employeeId);
    const e = byEmp.get(line.employeeId);
    if (!e) {
      throw new Error(`PAYROLL_PAY_UNKNOWN_EMPLOYEE: ${line.employeeId} not in this period`);
    }
    const remaining = payrollEntryRemaining(e.netPay, e.amountPaid);
    if (remaining <= 0) {
      throw new Error(`PAYROLL_PAY_ALREADY_PAID: employee ${line.employeeId} has no remaining net`);
    }
    const amt = money2Number(line.amount ?? NaN);
    if (!Number.isFinite(amt) || amt <= 0) {
      throw new Error(`PAYROLL_PAY_BAD_AMOUNT: employee ${line.employeeId} amount must be > 0`);
    }
    if (money2(amt).gt(money2(remaining))) {
      throw new Error(
        `PAYROLL_PAY_OVER_REMAINING: employee ${line.employeeId} amount ${amt} > remaining ${remaining}`
      );
    }
    out.push({
      employeeId: line.employeeId,
      entryId: e.id,
      payAmount: amt,
      remainingBefore: remaining,
      netPay: e.netPay,
      amountPaidBefore: e.amountPaid,
    });
  }
  return out;
}

export function resolvePeriodStatusAfterPay(
  entries: Array<{ netPay: number; amountPaid: number }>
): 'PAID' | 'PARTIALLY_PAID' {
  const withCash = entries.filter((e) => money2Number(e.netPay) > 0);
  if (withCash.length === 0) return 'PAID';
  const allDone = withCash.every((e) => isPayrollEntryFullyPaid(e.netPay, e.amountPaid));
  return allDone ? 'PAID' : 'PARTIALLY_PAID';
}

export function sumPayAmounts(lines: Array<{ payAmount: number }>): number {
  return money2Number(lines.reduce((s, l) => s.plus(money2(l.payAmount)), money2(0)));
}
