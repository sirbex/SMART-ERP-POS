/**
 * Safe numeric parsing for SQL parameters — prevents node-pg sending "NaN" to PostgreSQL.
 */

export function safeParseInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

export function assertPositiveFinite(value: unknown, label = 'Value'): number {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim().replace(/[,\s]/g, ''));
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${label} must be a positive finite number`);
  }
  return n;
}

export function assertFiniteNumber(value: unknown, label = 'Value'): number {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isFinite(n)) {
    throw new Error(`${label} must be a finite number`);
  }
  return n;
}

/** Parse YYYY-MM-DD and return fiscal year/month for GL period writes. */
export function fiscalPartsFromIsoDate(isoDate: string, label = 'Date'): { year: number; month: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  const year = parseInt(isoDate.slice(0, 4), 10);
  const month = parseInt(isoDate.slice(5, 7), 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error(`${label} is invalid`);
  }
  return { year, month };
}
