/**
 * Journal accuracy engine — SAP/Odoo/Tally-style posting checks.
 * Fail loud: every mismatch throws JournalAccuracyError (never soft-pass).
 */

export type JournalSide = 'debit' | 'credit';

export interface ExpectedJournalLine {
  accountCode: string;
  side: JournalSide;
  amount: number;
  /** Plain label for operators / auditors */
  label: string;
}

export interface ActualJournalLine {
  accountCode: string;
  debitAmount?: number;
  creditAmount?: number;
}

export interface MatchOptions {
  /**
   * When true (default), actual must contain exactly the expected lines —
   * no extras, no missing, same cardinality.
   */
  exact?: boolean;
  epsilon?: number;
}

export class JournalAccuracyError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'JournalAccuracyError';
  }
}

export function roundMoney(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function lineDebit(line: ActualJournalLine): number {
  return roundMoney(Number(line.debitAmount ?? 0));
}

function lineCredit(line: ActualJournalLine): number {
  return roundMoney(Number(line.creditAmount ?? 0));
}

/** Reject dual-sided or zero/garbage lines — production journals are one-sided. */
export function assertOneSidedLines(lines: ActualJournalLine[], epsilon = 0.01): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const d = lineDebit(line);
    const c = lineCredit(line);
    if (!line.accountCode?.trim()) {
      throw new JournalAccuracyError(
        `Line ${i + 1}: accountCode is required`,
        'JA_NO_ACCOUNT',
      );
    }
    if (d > epsilon && c > epsilon) {
      throw new JournalAccuracyError(
        `Line ${i + 1} (${line.accountCode}): cannot have both debit ${d} and credit ${c}`,
        'JA_DUAL_SIDED',
      );
    }
    if (d <= epsilon && c <= epsilon) {
      throw new JournalAccuracyError(
        `Line ${i + 1} (${line.accountCode}): debit and credit are both zero`,
        'JA_ZERO_LINE',
      );
    }
  }
}

export function assertJournalBalanced(
  lines: ActualJournalLine[],
  epsilon = 0.01,
): { totalDebits: number; totalCredits: number } {
  assertOneSidedLines(lines, epsilon);

  let totalDebits = 0;
  let totalCredits = 0;
  for (const line of lines) {
    totalDebits = roundMoney(totalDebits + lineDebit(line));
    totalCredits = roundMoney(totalCredits + lineCredit(line));
  }
  if (lines.length === 0) {
    throw new JournalAccuracyError('Journal has no lines', 'JA_NO_LINES');
  }
  if (Math.abs(totalDebits - totalCredits) > epsilon) {
    throw new JournalAccuracyError(
      `Journal not balanced: Debits ${totalDebits.toFixed(2)} ≠ Credits ${totalCredits.toFixed(2)}`,
      'JA_UNBALANCED',
    );
  }
  if (totalDebits <= 0) {
    throw new JournalAccuracyError('Journal total must be greater than zero', 'JA_ZERO');
  }
  return { totalDebits, totalCredits };
}

function keyOf(accountCode: string, side: JournalSide, amount: number): string {
  return `${accountCode}|${side}|${amount.toFixed(2)}`;
}

/**
 * Match expected business lines to actual journal.
 * Default exact=true: extras are failures (no silent leftover lines).
 */
export function assertJournalMatchesExpected(
  actual: ActualJournalLine[],
  expected: ExpectedJournalLine[],
  optionsOrEpsilon: MatchOptions | number = {},
): void {
  const options: MatchOptions =
    typeof optionsOrEpsilon === 'number'
      ? { epsilon: optionsOrEpsilon, exact: true }
      : optionsOrEpsilon;
  const epsilon = options.epsilon ?? 0.01;
  const exact = options.exact !== false;

  if (expected.length === 0) {
    throw new JournalAccuracyError(
      'Expected journal specification is empty — refuse silent match',
      'JA_EMPTY_EXPECTED',
    );
  }

  assertJournalBalanced(actual, epsilon);

  if (exact && actual.length !== expected.length) {
    throw new JournalAccuracyError(
      `Journal line count ${actual.length} ≠ expected ${expected.length} (exact match required)`,
      'JA_LINE_COUNT',
    );
  }

  const used = new Set<number>();

  for (const exp of expected) {
    const amount = roundMoney(exp.amount);
    if (!(amount > 0)) {
      throw new JournalAccuracyError(
        `${exp.label}: expected amount must be positive (got ${amount})`,
        'JA_BAD_EXPECTED',
      );
    }
    const hitIdx = actual.findIndex((a, idx) => {
      if (used.has(idx)) return false;
      if (a.accountCode !== exp.accountCode) return false;
      const d = lineDebit(a);
      const c = lineCredit(a);
      if (exp.side === 'debit') return Math.abs(d - amount) <= epsilon && c <= epsilon;
      return Math.abs(c - amount) <= epsilon && d <= epsilon;
    });
    if (hitIdx < 0) {
      throw new JournalAccuracyError(
        `${exp.label}: expected ${exp.side.toUpperCase()} ${exp.accountCode} ${amount.toFixed(2)} — not found in journal`,
        'JA_MISSING_LINE',
      );
    }
    used.add(hitIdx);
  }

  if (exact) {
    for (let i = 0; i < actual.length; i++) {
      if (used.has(i)) continue;
      const a = actual[i]!;
      const d = lineDebit(a);
      const c = lineCredit(a);
      const side: JournalSide = d > epsilon ? 'debit' : 'credit';
      const amt = d > epsilon ? d : c;
      throw new JournalAccuracyError(
        `Unexpected journal line: ${side.toUpperCase()} ${a.accountCode} ${amt.toFixed(2)} (exact match forbids extras)`,
        'JA_EXTRA_LINE',
      );
    }
  }
}

/** Fail if any forbidden account appears (wrong economics). */
export function assertForbiddenAccounts(
  lines: ActualJournalLine[],
  forbidden: string[],
  context = 'journal',
): void {
  for (const code of forbidden) {
    const hit = lines.find((l) => l.accountCode === code);
    if (hit) {
      throw new JournalAccuracyError(
        `${context}: forbidden account ${code} must not appear in this posting`,
        'JA_FORBIDDEN_ACCOUNT',
      );
    }
  }
}

/** Build a two-line balanced journal for scenarios. */
export function twoLineJournal(
  debitAccount: string,
  creditAccount: string,
  amount: number,
): ActualJournalLine[] {
  const a = roundMoney(amount);
  if (!(a > 0)) {
    throw new JournalAccuracyError('twoLineJournal amount must be positive', 'JA_BAD_AMOUNT');
  }
  if (!debitAccount?.trim() || !creditAccount?.trim()) {
    throw new JournalAccuracyError('twoLineJournal requires debit and credit accounts', 'JA_NO_ACCOUNT');
  }
  if (debitAccount === creditAccount) {
    throw new JournalAccuracyError(
      `twoLineJournal refuses same account on both sides (${debitAccount})`,
      'JA_SAME_ACCOUNT',
    );
  }
  return [
    { accountCode: debitAccount, debitAmount: a, creditAmount: 0 },
    { accountCode: creditAccount, debitAmount: 0, creditAmount: a },
  ];
}

export interface PnlDeltaExpectation {
  /** Change in P&L net income (negative = expense / COGS up) */
  netIncomeDelta: number;
  label: string;
}

/**
 * Net income impact from COGS/expense-style 5xxx/6xxx/7xxx debits (539 classification).
 * Revenue credits on 4xxx increase net income.
 */
export function netIncomeImpactFromJournal(lines: ActualJournalLine[]): number {
  let impact = 0;
  for (const line of lines) {
    const code = line.accountCode;
    const d = lineDebit(line);
    const c = lineCredit(line);
    if (code.startsWith('4')) {
      impact = roundMoney(impact + (c - d));
    } else if (code.startsWith('5') || code.startsWith('6') || code.startsWith('7')) {
      impact = roundMoney(impact - (d - c));
    }
  }
  return impact;
}

export function assertPnlImpact(
  lines: ActualJournalLine[],
  expected: PnlDeltaExpectation,
  epsilon = 0.01,
): void {
  const actual = netIncomeImpactFromJournal(lines);
  if (Math.abs(actual - expected.netIncomeDelta) > epsilon) {
    throw new JournalAccuracyError(
      `${expected.label}: P&L net impact ${actual.toFixed(2)} ≠ expected ${expected.netIncomeDelta.toFixed(2)}`,
      'JA_PNL_IMPACT',
    );
  }
}

/** Diagnose helper for proofs — never used to swallow; only format. */
export function formatJournal(lines: ActualJournalLine[]): string {
  return lines
    .map((l) => {
      const d = lineDebit(l);
      const c = lineCredit(l);
      if (d > 0) return `DR ${l.accountCode} ${d.toFixed(2)}`;
      return `CR ${l.accountCode} ${c.toFixed(2)}`;
    })
    .join(' | ');
}

export { keyOf };
