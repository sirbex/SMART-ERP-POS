/**
 * Unpaid leave → payroll reduction SSOT.
 *
 * Rules (enterprise):
 *   - Dates are YYYY-MM-DD only — invalid formats throw (no NaN day counts).
 *   - Overlapping approved unpaid intervals are MERGED before counting
 *     (never double-charge the same calendar day).
 *   - Deduction = min(unpaidDays, workingDaysPerMonth) / workingDaysPerMonth × basic.
 *   - Allowances / OT / bonus are NOT reduced by unpaid leave (contractual components).
 *   - workingDaysPerMonth must be > 0; negative money inputs throw.
 */

import { money2, money2Number } from './payrollMath.js';

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function assertYmd(label: string, ymd: string): string {
  const s = String(ymd ?? '').trim().slice(0, 10);
  const m = YMD_RE.exec(s);
  if (!m) {
    throw new Error(`LEAVE_DATE_INVALID: ${label} must be YYYY-MM-DD, got "${ymd}"`);
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new Error(`LEAVE_DATE_INVALID: ${label} is not a real calendar day "${s}"`);
  }
  return s;
}

export function assertLeaveDateRange(startYmd: string, endYmd: string): {
  start: string;
  end: string;
  days: number;
} {
  const start = assertYmd('startDate', startYmd);
  const end = assertYmd('endDate', endYmd);
  if (end < start) {
    throw new Error(`LEAVE_DATE_RANGE: endDate ${end} is before startDate ${start}`);
  }
  return { start, end, days: inclusiveDayCount(start, end) };
}

/**
 * Count calendar days of [leaveStart, leaveEnd] ∩ [periodStart, periodEnd] (inclusive).
 */
export function overlapLeaveDays(input: {
  leaveStart: string;
  leaveEnd: string;
  periodStart: string;
  periodEnd: string;
}): number {
  const leaveStart = assertYmd('leaveStart', input.leaveStart);
  const leaveEnd = assertYmd('leaveEnd', input.leaveEnd);
  const periodStart = assertYmd('periodStart', input.periodStart);
  const periodEnd = assertYmd('periodEnd', input.periodEnd);
  if (leaveEnd < leaveStart) {
    throw new Error(
      `LEAVE_DATE_RANGE: leaveEnd ${leaveEnd} is before leaveStart ${leaveStart}`
    );
  }
  if (periodEnd < periodStart) {
    throw new Error(
      `LEAVE_DATE_RANGE: periodEnd ${periodEnd} is before periodStart ${periodStart}`
    );
  }
  const start = maxDate(leaveStart, periodStart);
  const end = minDate(leaveEnd, periodEnd);
  if (start > end) return 0;
  return inclusiveDayCount(start, end);
}

export interface DateInterval {
  start: string;
  end: string;
}

/**
 * Merge overlapping/adjacent YYYY-MM-DD intervals (inclusive), then count unique days
 * that fall inside [periodStart, periodEnd].
 */
export function uniqueOverlapLeaveDays(
  intervals: DateInterval[],
  periodStart: string,
  periodEnd: string
): number {
  const pStart = assertYmd('periodStart', periodStart);
  const pEnd = assertYmd('periodEnd', periodEnd);
  if (pEnd < pStart) {
    throw new Error(`LEAVE_DATE_RANGE: periodEnd ${pEnd} is before periodStart ${pStart}`);
  }
  if (intervals.length === 0) return 0;

  const clipped: DateInterval[] = [];
  for (const raw of intervals) {
    const start = assertYmd('interval.start', raw.start);
    const end = assertYmd('interval.end', raw.end);
    if (end < start) {
      throw new Error(`LEAVE_DATE_RANGE: interval end ${end} before start ${start}`);
    }
    const cStart = maxDate(start, pStart);
    const cEnd = minDate(end, pEnd);
    if (cStart <= cEnd) clipped.push({ start: cStart, end: cEnd });
  }
  if (clipped.length === 0) return 0;

  clipped.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const merged: DateInterval[] = [{ ...clipped[0]! }];
  for (let i = 1; i < clipped.length; i++) {
    const cur = clipped[i]!;
    const last = merged[merged.length - 1]!;
    // Adjacent days merge (end+1 day == next start) — avoid double-count on abutting leaves
    if (cur.start <= addDays(last.end, 1)) {
      if (cur.end > last.end) last.end = cur.end;
    } else {
      merged.push({ ...cur });
    }
  }

  let total = 0;
  for (const m of merged) {
    total += inclusiveDayCount(m.start, m.end);
  }
  return total;
}

export function unpaidLeaveDeduction(input: {
  basicSalary: number | string;
  unpaidDays: number | string;
  workingDaysPerMonth: number | string;
}): number {
  const basic = money2(input.basicSalary);
  const days = money2(input.unpaidDays);
  const working = money2(input.workingDaysPerMonth);

  if (basic.lt(0)) {
    throw new Error(`LEAVE_DEDUCTION_NEGATIVE_BASIC: basic=${basic}`);
  }
  if (days.lt(0)) {
    throw new Error(`LEAVE_DEDUCTION_NEGATIVE_DAYS: unpaidDays=${days}`);
  }
  if (working.lte(0)) {
    throw new Error(
      `LEAVE_DEDUCTION_BAD_WORKING_DAYS: workingDaysPerMonth must be > 0, got ${working}`
    );
  }
  if (basic.eq(0) || days.eq(0)) return 0;

  const cappedDays = days.gt(working) ? working : days;
  return money2Number(basic.mul(cappedDays).div(working));
}

function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

function minDate(a: string, b: string): string {
  return a <= b ? a : b;
}

function inclusiveDayCount(startYmd: string, endYmd: string): number {
  const s = parseYmd(startYmd);
  const e = parseYmd(endYmd);
  const ms = e.getTime() - s.getTime();
  if (!Number.isFinite(ms) || ms < 0) {
    throw new Error(`LEAVE_DAY_COUNT_INVALID: ${startYmd}→${endYmd}`);
  }
  return Math.floor(ms / 86_400_000) + 1;
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function addDays(ymd: string, days: number): string {
  const dt = parseYmd(ymd);
  dt.setUTCDate(dt.getUTCDate() + days);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
