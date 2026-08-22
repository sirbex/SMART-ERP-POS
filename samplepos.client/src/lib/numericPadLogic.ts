/**
 * Pure numeric pad transitions — tested without DOM.
 * NumericSoftKeyboardPad UI drives these.
 */

export type InAppNumericKey =
  | { kind: 'digit'; digit: string }
  | { kind: 'decimal' }
  | { kind: 'backspace' }
  | { kind: 'clear' };

export type ApplyNumericKeyOpts = {
  allowDecimal?: boolean;
  replaceAll?: boolean;
};

export function applyInAppNumericKey(
  value: string,
  key: InAppNumericKey,
  opts?: ApplyNumericKeyOpts,
): { next: string; replaceAll: boolean } {
  const current = typeof value === 'string' ? value : '';
  const allowDecimal = opts?.allowDecimal !== false;

  if (key.kind === 'clear') {
    return { next: '', replaceAll: false };
  }

  if (key.kind === 'backspace') {
    if (opts?.replaceAll) return { next: '', replaceAll: false };
    return { next: current.slice(0, -1), replaceAll: false };
  }

  if (key.kind === 'decimal') {
    if (!allowDecimal) return { next: current, replaceAll: false };
    if (opts?.replaceAll) return { next: '0.', replaceAll: false };
    if (current.includes('.')) return { next: current, replaceAll: false };
    if (!current) return { next: '0.', replaceAll: false };
    return { next: `${current}.`, replaceAll: false };
  }

  const digit = key.digit;
  if (!/^\d$/.test(digit)) return { next: current, replaceAll: false };

  if (opts?.replaceAll) return { next: digit, replaceAll: false };
  if (current === '0' && !current.includes('.')) return { next: digit, replaceAll: false };
  return { next: current + digit, replaceAll: false };
}

/** Parse display string to number; empty → fallback. */
export function parseNumericPadValue(raw: string, fallback = 0): number {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '.') return fallback;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : fallback;
}
