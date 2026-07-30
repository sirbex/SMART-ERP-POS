/**
 * Prefixed document number allocation (SALE-/ORD-/REF-YYYY-NNNN).
 *
 * SSOT for sales, orders, and refunds — never duplicate the MAX+1 SQL inline.
 *
 * Permanent fix for production 409 sales_sale_number_key:
 * lexicographic ORDER BY … DESC picks SALE-YYYY-999 over SALE-YYYY-4872 and
 * regenerates colliding numbers. Always use numeric MAX of digits-only suffixes.
 *
 * Must run on a transaction client so pg_advisory_xact_lock is held until COMMIT.
 */
import type { Pool, PoolClient } from 'pg';

export const DOCUMENT_NUMBER_TARGETS = {
  sale: { table: 'sales', column: 'sale_number' },
  order: { table: 'pos_orders', column: 'order_number' },
  refund: { table: 'sale_refunds', column: 'refund_number' },
} as const;

export type DocumentNumberKind = keyof typeof DOCUMENT_NUMBER_TARGETS;

const DIGITS_ONLY = /^[0-9]+$/;

/**
 * Extract trailing numeric sequence after a fixed prefix.
 * Returns null for malformed / non-digit suffixes (ignored by allocator).
 */
export function extractNumericSuffix(documentNumber: string, prefix: string): number | null {
  if (!documentNumber.startsWith(prefix)) return null;
  const suffix = documentNumber.slice(prefix.length);
  if (!DIGITS_ONLY.test(suffix)) return null;
  const n = Number.parseInt(suffix, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pure numeric next-number (mirrors SQL MAX(digits)+1). Used by unit proofs
 * and to document the algorithm without a database.
 */
export function nextPrefixedDocumentNumber(
  existing: readonly string[],
  prefix: string,
  pad = 4,
): string {
  let max = 0;
  for (const value of existing) {
    const n = extractNumericSuffix(value, prefix);
    if (n !== null && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(pad, '0')}`;
}

/**
 * Historical broken allocator (lexicographic DESC). Kept for regression evidence only.
 */
export function lexNextBrokenDocumentNumber(
  existing: readonly string[],
  prefix: string,
  pad = 4,
): string {
  const matching = existing.filter((v) => v.startsWith(prefix));
  if (matching.length === 0) {
    return `${prefix}${String(1).padStart(pad, '0')}`;
  }
  const last = [...matching].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))[0];
  const raw = last.slice(prefix.length);
  const sequence = Number.parseInt(raw, 10) + 1;
  return `${prefix}${String(sequence).padStart(pad, '0')}`;
}

/**
 * Allocate the next document number under an advisory xact lock.
 * Digits-only filter ignores malformed historical values (e.g. SALE-2026-TEST).
 */
export async function allocateNextPrefixedDocumentNumber(
  client: Pool | PoolClient,
  opts: {
    kind: DocumentNumberKind;
    prefix: string;
    pad?: number;
  },
): Promise<string> {
  const { kind, prefix } = opts;
  const pad = opts.pad ?? 4;
  const target = DOCUMENT_NUMBER_TARGETS[kind];
  if (!target) {
    throw new Error(`Unknown document number kind: ${String(kind)}`);
  }
  if (!/^[A-Z]+-\d{4}-$/.test(prefix)) {
    throw new Error('Invalid document number prefix');
  }

  // Serialize allocation for this prefix until TX commit
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);

  // Table/column from allowlist only — never interpolate untrusted identifiers.
  // substr(string, int): do not use SUBSTRING(... FROM $n) (regex form returns NULL).
  const sql = `
    SELECT COALESCE(
      MAX(CAST(substr(${target.column}, $2) AS INTEGER)),
      0
    ) + 1 AS next_num
    FROM ${target.table}
    WHERE ${target.column} LIKE $1
      AND substr(${target.column}, $2) ~ '^[0-9]+$'`;

  const result = await client.query<{ next_num: number | string }>(sql, [
    `${prefix}%`,
    prefix.length + 1,
  ]);
  const nextNum = Number(result.rows[0]?.next_num ?? 1);
  return `${prefix}${String(nextNum).padStart(pad, '0')}`;
}
