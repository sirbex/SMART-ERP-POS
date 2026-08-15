/**
 * Uganda-style statutory payroll math (NSSF employee + PAYE) — enterprise SSOT.
 *
 * Order:
 *   pensionableGross → NSSF EE → taxable = gross − NSSF EE → PAYE
 * Advance recovery is applied after statutory (see payrollMath) so net never goes negative.
 *
 * Fail-loud: bad rates, empty accounts, corrupt PAYE bands — never silent fallback to 0 tax.
 */

import Decimal from 'decimal.js';
import { money2, money2Number } from './payrollMath.js';

Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
});

export interface PayeBand {
  /** Inclusive lower bound of monthly taxable income (UGX) */
  from: number;
  /** Exclusive upper bound; null = open-ended */
  to: number | null;
  /** Cumulative tax owed when taxable equals `from` (URA table base) */
  baseTax: number;
  /** Marginal rate as fraction (0.1 = 10%) */
  rate: number;
}

/** URA monthly PAYE bands (SME default; override only via validated settings JSON). */
export const DEFAULT_UGANDA_PAYE_BANDS: PayeBand[] = [
  { from: 0, to: 235_000, baseTax: 0, rate: 0 },
  { from: 235_000, to: 335_000, baseTax: 0, rate: 0.1 },
  { from: 335_000, to: 410_000, baseTax: 10_000, rate: 0.2 },
  { from: 410_000, to: 10_000_000, baseTax: 25_000, rate: 0.3 },
  { from: 10_000_000, to: null, baseTax: 2_870_000, rate: 0.4 },
];

export const DEFAULT_NSSF_EMPLOYEE_RATE = 0.05;
export const DEFAULT_NSSF_EMPLOYER_RATE = 0.1;

export interface StatutorySettings {
  enabled: boolean;
  nssfEmployeeRate: number;
  nssfEmployerRate: number;
  payeEnabled: boolean;
  payeBands: PayeBand[];
  workingDaysPerMonth: number;
  nssfPayableAccount: string;
  payePayableAccount: string;
  employerNssfExpenseAccount: string;
}

export const DEFAULT_STATUTORY_SETTINGS: StatutorySettings = {
  enabled: true,
  nssfEmployeeRate: DEFAULT_NSSF_EMPLOYEE_RATE,
  nssfEmployerRate: DEFAULT_NSSF_EMPLOYER_RATE,
  payeEnabled: true,
  payeBands: DEFAULT_UGANDA_PAYE_BANDS,
  workingDaysPerMonth: 26,
  nssfPayableAccount: '2410',
  payePayableAccount: '2420',
  employerNssfExpenseAccount: '6010',
};

function assertRate(label: string, rate: number): void {
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new Error(`STATUTORY_RATE_INVALID: ${label}=${rate} (must be 0..1 inclusive)`);
  }
}

export function assertPayeBands(bands: PayeBand[]): void {
  if (!Array.isArray(bands) || bands.length === 0) {
    throw new Error('STATUTORY_PAYE_BANDS_EMPTY: PAYE bands required when PAYE enabled');
  }
  let prevFrom = -1;
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i]!;
    if (!Number.isFinite(b.from) || b.from < 0) {
      throw new Error(`STATUTORY_PAYE_BAND: band[${i}].from invalid (${b.from})`);
    }
    if (b.to != null && (!Number.isFinite(b.to) || b.to <= b.from)) {
      throw new Error(`STATUTORY_PAYE_BAND: band[${i}].to must be > from`);
    }
    if (!Number.isFinite(b.baseTax) || b.baseTax < 0) {
      throw new Error(`STATUTORY_PAYE_BAND: band[${i}].baseTax invalid`);
    }
    if (!Number.isFinite(b.rate) || b.rate < 0 || b.rate > 1) {
      throw new Error(`STATUTORY_PAYE_BAND: band[${i}].rate invalid (${b.rate})`);
    }
    if (b.from < prevFrom) {
      throw new Error(`STATUTORY_PAYE_BAND: bands must be ascending by from (band[${i}])`);
    }
    prevFrom = b.from;
  }
  if (bands[0]!.from !== 0) {
    throw new Error('STATUTORY_PAYE_BAND: first band.from must be 0');
  }
}

export function assertStatutorySettings(settings: StatutorySettings): void {
  assertRate('nssfEmployeeRate', settings.nssfEmployeeRate);
  assertRate('nssfEmployerRate', settings.nssfEmployerRate);
  if (!Number.isFinite(settings.workingDaysPerMonth) || settings.workingDaysPerMonth <= 0) {
    throw new Error(
      `STATUTORY_WORKING_DAYS: must be > 0, got ${settings.workingDaysPerMonth}`
    );
  }
  if (!settings.nssfPayableAccount?.trim()) {
    throw new Error('STATUTORY_NSSF_ACCOUNT_MISSING');
  }
  if (!settings.payePayableAccount?.trim()) {
    throw new Error('STATUTORY_PAYE_ACCOUNT_MISSING');
  }
  if (!settings.employerNssfExpenseAccount?.trim()) {
    throw new Error('STATUTORY_EMPLOYER_NSSF_EXPENSE_MISSING');
  }
  if (settings.enabled && settings.payeEnabled) {
    assertPayeBands(settings.payeBands);
  } else if (settings.payeBands?.length) {
    // Still validate if present so corrupt JSON cannot lurk until PAYE is re-enabled
    assertPayeBands(settings.payeBands);
  }
}

export function computeNssfEmployee(
  pensionableGross: number | string,
  rate: number | string
): number {
  const g = money2(pensionableGross);
  const r = new Decimal(rate);
  if (!r.isFinite()) {
    throw new Error(`STATUTORY_NSSF_RATE_NAN: ${rate}`);
  }
  if (r.lt(0) || r.gt(1)) {
    throw new Error(`STATUTORY_NSSF_RATE_INVALID: ${rate}`);
  }
  if (g.lte(0) || r.eq(0)) return 0;
  return money2Number(g.mul(r));
}

export function computeNssfEmployer(
  pensionableGross: number | string,
  rate: number | string
): number {
  return computeNssfEmployee(pensionableGross, rate);
}

export function computePaye(
  taxableIncome: number | string,
  bands: PayeBand[] = DEFAULT_UGANDA_PAYE_BANDS
): number {
  assertPayeBands(bands);
  const taxable = money2(taxableIncome);
  if (taxable.lte(0)) return 0;

  const t = taxable.toNumber();
  for (let i = bands.length - 1; i >= 0; i--) {
    const band = bands[i]!;
    if (t >= band.from) {
      const excess = money2(t).minus(band.from);
      return money2Number(money2(band.baseTax).plus(excess.mul(band.rate)));
    }
  }
  throw new Error(`STATUTORY_PAYE_NO_BAND: taxable=${t} matched no band`);
}

export function computeStatutoryDeductions(input: {
  pensionableGross: number | string;
  settings: StatutorySettings;
}): { nssfEmployee: number; paye: number; nssfEmployer: number } {
  assertStatutorySettings(input.settings);

  if (!input.settings.enabled) {
    return { nssfEmployee: 0, paye: 0, nssfEmployer: 0 };
  }

  const gross = money2(input.pensionableGross);
  if (gross.lt(0)) {
    throw new Error(`STATUTORY_NEGATIVE_GROSS: ${gross}`);
  }

  const nssfEmployee = computeNssfEmployee(money2Number(gross), input.settings.nssfEmployeeRate);
  const taxable = money2(gross.minus(nssfEmployee));
  if (taxable.lt(0)) {
    throw new Error(
      `STATUTORY_TAXABLE_NEGATIVE: gross=${gross} nssf=${nssfEmployee} (rate too high?)`
    );
  }

  const paye = input.settings.payeEnabled
    ? computePaye(money2Number(taxable), input.settings.payeBands)
    : 0;
  const nssfEmployer = computeNssfEmployer(money2Number(gross), input.settings.nssfEmployerRate);

  const employeeStatutory = money2(nssfEmployee).plus(paye);
  if (employeeStatutory.gt(gross)) {
    throw new Error(
      `STATUTORY_EXCEEDS_GROSS: nssf+paye ${employeeStatutory} > gross ${gross}`
    );
  }

  return {
    nssfEmployee: money2Number(nssfEmployee),
    paye: money2Number(paye),
    nssfEmployer: money2Number(nssfEmployer),
  };
}

export function parsePayeBandsJson(raw: unknown): PayeBand[] {
  if (raw == null) {
    throw new Error('STATUTORY_PAYE_BANDS_NULL');
  }
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('STATUTORY_PAYE_BANDS_JSON_PARSE');
    }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('STATUTORY_PAYE_BANDS_EMPTY');
  }
  const bands: PayeBand[] = parsed.map((b, i) => {
    const row = b as Record<string, unknown>;
    const from = Number(row.from);
    const to = row.to == null ? null : Number(row.to);
    const baseTax = Number(row.baseTax ?? row.base_tax);
    const rate = Number(row.rate);
    if (![from, baseTax, rate].every((n) => Number.isFinite(n))) {
      throw new Error(`STATUTORY_PAYE_BAND: band[${i}] has non-numeric fields`);
    }
    if (to != null && !Number.isFinite(to)) {
      throw new Error(`STATUTORY_PAYE_BAND: band[${i}].to is not numeric`);
    }
    return { from, to, baseTax, rate };
  });
  assertPayeBands(bands);
  return bands;
}
