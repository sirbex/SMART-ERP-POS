/**
 * HR export sheet SSOT — CSV and PDF must render THIS, never a second calculation.
 *
 * Money: payrollMath.money2 (Decimal 2dp). Native `+` on amounts is forbidden.
 * Identity (fail loud): gross = advanceRecovered + netPay on every row and on totals.
 */

import {
  assertPayrollIdentity,
  money2,
  money2Number,
} from './payrollMath.js';

export interface PayrollExportInput {
  employeeFirstName?: string | null;
  employeeLastName?: string | null;
  departmentName?: string | null;
  positionTitle?: string | null;
  basicSalary: number | string;
  allowances: number | string;
  overtimePay?: number | string;
  bonus?: number | string;
  leaveDeduction?: number | string;
  advanceRecovered: number | string;
  nssfEmployee?: number | string;
  paye?: number | string;
  netPay: number | string;
  journalTransactionNumber?: string | null;
  paymentTransactionNumber?: string | null;
}

export interface PayrollExportRow {
  employeeName: string;
  department: string;
  position: string;
  basicSalary: number;
  allowances: number;
  overtimePay: number;
  bonus: number;
  leaveDeduction: number;
  gross: number;
  nssfEmployee: number;
  paye: number;
  advanceRecovered: number;
  netPay: number;
  accrualJe: string;
  paymentJe: string;
}

export interface PayrollExportSheet {
  status: string;
  periodStart: string;
  periodEnd: string;
  rows: PayrollExportRow[];
  totals: {
    basicSalary: number;
    allowances: number;
    overtimePay: number;
    bonus: number;
    leaveDeduction: number;
    gross: number;
    nssfEmployee: number;
    paye: number;
    advanceRecovered: number;
    netPay: number;
    count: number;
  };
}

export interface AdvanceExportInput {
  advanceDate: string;
  employeeFirstName?: string | null;
  employeeLastName?: string | null;
  reason: string;
  amount: number | string;
  remainingAmount: number | string;
  status: string;
  paymentAccountCode: string;
  journalTransactionNumber?: string | null;
  notes?: string | null;
}

export interface AdvanceExportRow {
  advanceDate: string;
  employeeName: string;
  reason: string;
  reasonLabel: string;
  amount: number;
  remainingAmount: number;
  status: string;
  paymentAccountCode: string;
  journalJe: string;
  notes: string;
}

export interface AdvanceExportSheet {
  rows: AdvanceExportRow[];
  totals: {
    amount: number;
    remaining: number;
    shortage: number;
    count: number;
  };
}

export interface BalanceExportInput {
  firstName: string;
  lastName: string;
  payableAccountCode?: string | null;
  advanceAccountCode?: string | null;
  salariesPayable: number | string;
  advancesOutstanding: number | string;
  registerAdvancesOutstanding?: number | string;
  advanceSsotDrift?: boolean;
}

export interface BalanceExportSheet {
  rows: Array<{
    employeeName: string;
    payableAccountCode: string;
    salariesPayable: number;
    advanceAccountCode: string;
    advancesOutstanding: number;
    registerAdvancesOutstanding: number;
    advanceSsotDrift: boolean;
  }>;
  totals: {
    salariesPayable: number;
    advancesOutstanding: number;
    registerAdvancesOutstanding: number;
    count: number;
    driftCount: number;
  };
}

export function staffName(first?: string | null, last?: string | null): string {
  return `${first ?? ''} ${last ?? ''}`.trim();
}

export function reasonLabel(reason: string): string {
  if (reason === 'CASH_SHORTAGE') return 'Cash shortage';
  if (reason === 'SALARY_ADVANCE') return 'Salary advance';
  return reason.replace(/_/g, ' ');
}

export function moneyCell(n: number | string): string {
  return money2(n).toFixed(2);
}

function sum2(values: Array<number | string>): number {
  let acc = money2(0);
  for (const v of values) {
    acc = money2(acc.plus(money2(v)));
  }
  return acc.toNumber();
}

export function buildPayrollExportSheet(
  period: { startDate: string; endDate: string; status: string },
  entries: PayrollExportInput[]
): PayrollExportSheet {
  const rows: PayrollExportRow[] = entries.map((e, i) => {
    const basicSalary = money2Number(e.basicSalary);
    const allowances = money2Number(e.allowances);
    const overtimePay = money2Number(e.overtimePay ?? 0);
    const bonus = money2Number(e.bonus ?? 0);
    const leaveDeduction = money2Number(e.leaveDeduction ?? 0);
    const advanceRecovered = money2Number(e.advanceRecovered);
    const nssfEmployee = money2Number(e.nssfEmployee ?? 0);
    const paye = money2Number(e.paye ?? 0);
    const netPay = money2Number(e.netPay);
    const gross = money2Number(
      money2(basicSalary)
        .plus(allowances)
        .plus(overtimePay)
        .plus(bonus)
        .minus(leaveDeduction)
    );

    try {
      assertPayrollIdentity({
        gross,
        advanceRecovered,
        nssfEmployee,
        paye,
        netPay,
      });
    } catch (err) {
      throw new Error(
        `EXPORT_PAYROLL_ROW_IDENTITY: row ${i + 1} ${staffName(e.employeeFirstName, e.employeeLastName)} — ${(err as Error).message}`
      );
    }

    return {
      employeeName: staffName(e.employeeFirstName, e.employeeLastName),
      department: e.departmentName ?? '',
      position: e.positionTitle ?? '',
      basicSalary,
      allowances,
      overtimePay,
      bonus,
      leaveDeduction,
      gross,
      nssfEmployee,
      paye,
      advanceRecovered,
      netPay,
      accrualJe: e.journalTransactionNumber ?? '',
      paymentJe: e.paymentTransactionNumber ?? '',
    };
  });

  const totals = {
    basicSalary: sum2(rows.map((r) => r.basicSalary)),
    allowances: sum2(rows.map((r) => r.allowances)),
    overtimePay: sum2(rows.map((r) => r.overtimePay)),
    bonus: sum2(rows.map((r) => r.bonus)),
    leaveDeduction: sum2(rows.map((r) => r.leaveDeduction)),
    gross: sum2(rows.map((r) => r.gross)),
    nssfEmployee: sum2(rows.map((r) => r.nssfEmployee)),
    paye: sum2(rows.map((r) => r.paye)),
    advanceRecovered: sum2(rows.map((r) => r.advanceRecovered)),
    netPay: sum2(rows.map((r) => r.netPay)),
    count: rows.length,
  };

  assertPayrollIdentity({
    gross: totals.gross,
    advanceRecovered: totals.advanceRecovered,
    nssfEmployee: totals.nssfEmployee,
    paye: totals.paye,
    netPay: totals.netPay,
  });

  const grossCheck = money2Number(money2(totals.basicSalary).plus(money2(totals.allowances)));
  if (!money2(grossCheck).equals(money2(totals.gross))) {
    throw new Error(
      `EXPORT_PAYROLL_TOTAL_GROSS_MISMATCH: ${grossCheck} ≠ ${totals.gross}`
    );
  }

  return {
    status: period.status,
    periodStart: period.startDate,
    periodEnd: period.endDate,
    rows,
    totals,
  };
}

export function payrollSheetToCsv(sheet: PayrollExportSheet): string {
  const headers = [
    'Employee',
    'Department',
    'Position',
    'Basic',
    'Allowances',
    'OT',
    'Bonus',
    'Leave ded.',
    'Gross',
    'NSSF',
    'PAYE',
    'Advance recovered',
    'Net to pay',
    'Status',
    'Accrual JE',
    'Payment JE',
  ];
  const dataRows = sheet.rows.map((r) => [
    r.employeeName,
    r.department,
    r.position,
    moneyCell(r.basicSalary),
    moneyCell(r.allowances),
    moneyCell(r.overtimePay),
    moneyCell(r.bonus),
    moneyCell(r.leaveDeduction),
    moneyCell(r.gross),
    moneyCell(r.nssfEmployee),
    moneyCell(r.paye),
    moneyCell(r.advanceRecovered),
    moneyCell(r.netPay),
    sheet.status,
    r.accrualJe,
    r.paymentJe,
  ]);
  const totalRow = [
    'TOTALS',
    '',
    '',
    moneyCell(sheet.totals.basicSalary),
    moneyCell(sheet.totals.allowances),
    moneyCell(sheet.totals.overtimePay),
    moneyCell(sheet.totals.bonus),
    moneyCell(sheet.totals.leaveDeduction),
    moneyCell(sheet.totals.gross),
    moneyCell(sheet.totals.nssfEmployee),
    moneyCell(sheet.totals.paye),
    moneyCell(sheet.totals.advanceRecovered),
    moneyCell(sheet.totals.netPay),
    '',
    '',
    '',
  ];
  return csvBody(headers, [...dataRows, totalRow]);
}

export function buildAdvanceExportSheet(advances: AdvanceExportInput[]): AdvanceExportSheet {
  const rows: AdvanceExportRow[] = advances.map((a, i) => {
    const amount = money2Number(a.amount);
    const remainingAmount = money2Number(a.remainingAmount);
    if (amount <= 0) {
      throw new Error(`EXPORT_ADVANCE_AMOUNT: row ${i + 1} amount must be > 0`);
    }
    if (remainingAmount < 0) {
      throw new Error(`EXPORT_ADVANCE_REMAINING_NEG: row ${i + 1}`);
    }
    if (money2(remainingAmount).gt(money2(amount))) {
      throw new Error(
        `EXPORT_ADVANCE_REMAINING_GT_AMOUNT: row ${i + 1} remaining ${remainingAmount} > amount ${amount}`
      );
    }
    return {
      advanceDate: a.advanceDate,
      employeeName: staffName(a.employeeFirstName, a.employeeLastName),
      reason: a.reason,
      reasonLabel: reasonLabel(a.reason),
      amount,
      remainingAmount,
      status: a.status,
      paymentAccountCode: a.paymentAccountCode,
      journalJe: a.journalTransactionNumber ?? '',
      notes: a.notes ?? '',
    };
  });

  return {
    rows,
    totals: {
      amount: sum2(rows.map((r) => r.amount)),
      remaining: sum2(rows.map((r) => r.remainingAmount)),
      shortage: sum2(rows.filter((r) => r.reason === 'CASH_SHORTAGE').map((r) => r.amount)),
      count: rows.length,
    },
  };
}

export function advanceSheetToCsv(sheet: AdvanceExportSheet): string {
  const headers = ['Date', 'Employee', 'Reason', 'Amount', 'Remaining', 'Status', 'Pay from', 'JE', 'Notes'];
  const dataRows = sheet.rows.map((r) => [
    r.advanceDate,
    r.employeeName,
    r.reasonLabel,
    moneyCell(r.amount),
    moneyCell(r.remainingAmount),
    r.status,
    r.paymentAccountCode,
    r.journalJe,
    r.notes,
  ]);
  const totalRow = [
    'TOTALS',
    '',
    '',
    moneyCell(sheet.totals.amount),
    moneyCell(sheet.totals.remaining),
    '',
    '',
    '',
    '',
  ];
  return csvBody(headers, [...dataRows, totalRow]);
}

export function buildBalanceExportSheet(balances: BalanceExportInput[]): BalanceExportSheet {
  const rows = balances.map((b) => ({
    employeeName: staffName(b.firstName, b.lastName),
    payableAccountCode: b.payableAccountCode ?? '',
    salariesPayable: money2Number(b.salariesPayable),
    advanceAccountCode: b.advanceAccountCode ?? '',
    advancesOutstanding: money2Number(b.advancesOutstanding),
    registerAdvancesOutstanding: money2Number(b.registerAdvancesOutstanding ?? b.advancesOutstanding),
    advanceSsotDrift: Boolean(b.advanceSsotDrift),
  }));
  return {
    rows,
    totals: {
      salariesPayable: sum2(rows.map((r) => r.salariesPayable)),
      advancesOutstanding: sum2(rows.map((r) => r.advancesOutstanding)),
      registerAdvancesOutstanding: sum2(rows.map((r) => r.registerAdvancesOutstanding)),
      count: rows.length,
      driftCount: rows.filter((r) => r.advanceSsotDrift).length,
    },
  };
}

export function balanceSheetToCsv(sheet: BalanceExportSheet): string {
  const headers = [
    'Employee',
    'Payable account',
    'Salaries payable',
    'Advance account',
    'Advances GL',
    'Advances register',
    'SSOT drift',
  ];
  const dataRows = sheet.rows.map((r) => [
    r.employeeName,
    r.payableAccountCode,
    moneyCell(r.salariesPayable),
    r.advanceAccountCode,
    moneyCell(r.advancesOutstanding),
    moneyCell(r.registerAdvancesOutstanding),
    r.advanceSsotDrift ? 'YES' : 'NO',
  ]);
  const totalRow = [
    'TOTALS',
    '',
    moneyCell(sheet.totals.salariesPayable),
    '',
    moneyCell(sheet.totals.advancesOutstanding),
    moneyCell(sheet.totals.registerAdvancesOutstanding),
    sheet.totals.driftCount > 0 ? String(sheet.totals.driftCount) : '',
  ];
  return csvBody(headers, [...dataRows, totalRow]);
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function csvBody(headers: string[], rows: string[][]): string {
  const lines = [headers.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))];
  return `\uFEFF${lines.join('\n')}\n`;
}

/** Parse a payroll CSV (from payrollSheetToCsv) and verify totals row = sum of staff rows */
export function assertPayrollCsvConsistent(csv: string): {
  staffRows: number;
  totals: { gross: number; recovered: number; net: number };
} {
  const text = csv.replace(/^\uFEFF/, '').trim();
  const lines = text.split(/\n/).filter((l) => l.length > 0);
  if (lines.length < 2) throw new Error('EXPORT_CSV_EMPTY');
  const body = lines.slice(1);
  const totalLine = body[body.length - 1];
  if (!totalLine || !totalLine.startsWith('TOTALS')) {
    throw new Error('EXPORT_CSV_NO_TOTALS_ROW');
  }
  const staff = body.slice(0, -1);
  const idx = { gross: 8, nssf: 9, paye: 10, recovered: 11, net: 12 };
  const parseLine = (line: string) => {
    const cols = parseCsvLine(line);
    return {
      gross: money2Number(cols[idx.gross]),
      nssf: money2Number(cols[idx.nssf]),
      paye: money2Number(cols[idx.paye]),
      recovered: money2Number(cols[idx.recovered]),
      net: money2Number(cols[idx.net]),
    };
  };
  let sumGross = money2(0);
  let sumRec = money2(0);
  let sumNet = money2(0);
  for (const line of staff) {
    const r = parseLine(line);
    assertPayrollIdentity({
      gross: r.gross,
      advanceRecovered: r.recovered,
      nssfEmployee: r.nssf,
      paye: r.paye,
      netPay: r.net,
    });
    sumGross = money2(sumGross.plus(money2(r.gross)));
    sumRec = money2(sumRec.plus(money2(r.recovered)));
    sumNet = money2(sumNet.plus(money2(r.net)));
  }
  const tot = parseLine(totalLine);
  if (!money2(tot.gross).equals(sumGross) || !money2(tot.recovered).equals(sumRec) || !money2(tot.net).equals(sumNet)) {
    throw new Error(
      `EXPORT_CSV_TOTAL_MISMATCH: row-sum G=${sumGross} R=${sumRec} N=${sumNet} vs TOTALS G=${tot.gross} R=${tot.recovered} N=${tot.net}`
    );
  }
  return {
    staffRows: staff.length,
    totals: { gross: tot.gross, recovered: tot.recovered, net: tot.net },
  };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
