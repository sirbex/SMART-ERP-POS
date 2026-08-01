/**
 * Prefixed document number allocation (SALE-/ORD-/REF-/MOV-YYYY-NNNN).
 *
 * Scale path: Postgres SEQUENCE via nextval() — concurrency-safe, no advisory
 * lock held across FEFO/GL. Values are not rolled back (gaps on aborted sales OK).
 *
 * Also keeps pure helpers for regression proofs (lex trap, digits-only).
 */
import type { Pool, PoolClient } from 'pg';
import { getBusinessYear } from './dateRange.js';

export const DOCUMENT_NUMBER_TARGETS = {
  sale: { table: 'sales', column: 'sale_number', sequence: 'doc_sale_number_seq' },
  order: { table: 'pos_orders', column: 'order_number', sequence: 'doc_order_number_seq' },
  refund: { table: 'sale_refunds', column: 'refund_number', sequence: 'doc_refund_number_seq' },
  movement: { table: 'stock_movements', column: 'movement_number', sequence: 'doc_movement_number_seq' },
} as const;

export type DocumentNumberKind = keyof typeof DOCUMENT_NUMBER_TARGETS;

const DIGITS_ONLY = /^[0-9]+$/;
const ALLOWED_SEQUENCES = new Set<string>(
  Object.values(DOCUMENT_NUMBER_TARGETS).map((t) => t.sequence),
);

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
 * Pure numeric next-number (mirrors historical MAX(digits)+1). Unit proofs only.
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
 * Historical broken allocator (lexicographic DESC). Regression evidence only.
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

async function nextvalAllowlisted(
  client: Pool | PoolClient,
  sequence: string,
): Promise<number> {
  if (!ALLOWED_SEQUENCES.has(sequence)) {
    throw new Error(`Unknown document number sequence: ${sequence}`);
  }
  const result = await client.query<{ n: string | number }>(
    `SELECT nextval('${sequence}') AS n`,
  );
  return Number(result.rows[0]?.n ?? 1);
}

const SEQUENCE_MAX_SQL: Record<DocumentNumberKind, string> = {
  sale: `SELECT COALESCE(MAX(CAST(substring(sale_number from '[0-9]+$') AS INTEGER)), 0) AS m
         FROM sales WHERE sale_number ~ '^SALE-[0-9]{4}-[0-9]+$'`,
  order: `SELECT COALESCE(MAX(CAST(substring(order_number from '[0-9]+$') AS INTEGER)), 0) AS m
          FROM pos_orders WHERE order_number ~ '^ORD-[0-9]{4}-[0-9]+$'`,
  refund: `SELECT COALESCE(MAX(CAST(substring(refund_number from '[0-9]+$') AS INTEGER)), 0) AS m
           FROM sale_refunds WHERE refund_number ~ '^REF-[0-9]{4}-[0-9]+$'`,
  movement: `SELECT COALESCE(MAX(CAST(substring(movement_number from '[0-9]+$') AS INTEGER)), 0) AS m
             FROM stock_movements WHERE movement_number ~ '^MOV-[0-9]{4}-[0-9]+$'`,
};

/**
 * Catch up doc_* sequences to MAX(digits) so nextval cannot collide with
 * legacy MAX+1 writers (GR / quote / delivery / adjustments).
 */
export async function resyncDocumentNumberSequences(
  client: Pool | PoolClient,
  kinds: readonly DocumentNumberKind[] = ['sale', 'order', 'refund', 'movement'],
): Promise<void> {
  for (const kind of kinds) {
    const target = DOCUMENT_NUMBER_TARGETS[kind];
    if (!ALLOWED_SEQUENCES.has(target.sequence)) {
      throw new Error(`Unknown document number sequence: ${target.sequence}`);
    }
    const maxRes = await client.query<{ m: string | number }>(SEQUENCE_MAX_SQL[kind]);
    const max = Number(maxRes.rows[0]?.m ?? 0);
    if (max > 0) {
      await client.query(`SELECT setval('${target.sequence}', $1, true)`, [max]);
    } else {
      await client.query(`SELECT setval('${target.sequence}', 1, false)`);
    }
  }
}

async function allocateUniquePrefixedNumber(
  client: Pool | PoolClient,
  opts: {
    kind: DocumentNumberKind;
    prefix: string;
    pad: number;
    existsSql: string;
  },
): Promise<string> {
  const { kind, prefix, pad, existsSql } = opts;
  const target = DOCUMENT_NUMBER_TARGETS[kind];
  for (let attempt = 1; attempt <= 6; attempt++) {
    const nextNum = await nextvalAllowlisted(client, target.sequence);
    const candidate = `${prefix}${String(nextNum).padStart(pad, '0')}`;
    // EXISTS AS exists — mocks that only stub nextval ({n}) treat as free.
    const exists = await client.query<{ exists?: boolean }>(existsSql, [candidate]);
    if (!exists.rows[0]?.exists) return candidate;
    // Sequence lagged behind a legacy MAX+1 writer — catch up and retry.
    await resyncDocumentNumberSequences(client, [kind]);
  }
  throw new Error(`Unable to allocate unique ${kind} document number`);
}

/**
 * Allocate next SALE-/ORD-/REF- number via sequence (no TX-scoped advisory lock).
 * Safe to call on the sale transaction client — nextval does not serialize FEFO/GL.
 * Self-heals when sequence lags behind MAX (legacy writers / failed TX gaps).
 */
export async function allocateNextPrefixedDocumentNumber(
  client: Pool | PoolClient,
  opts: {
    kind: Exclude<DocumentNumberKind, 'movement'>;
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

  const existsSql =
    kind === 'sale'
      ? `SELECT EXISTS(SELECT 1 FROM sales WHERE sale_number = $1) AS exists`
      : kind === 'order'
        ? `SELECT EXISTS(SELECT 1 FROM pos_orders WHERE order_number = $1) AS exists`
        : `SELECT EXISTS(SELECT 1 FROM sale_refunds WHERE refund_number = $1) AS exists`;

  return allocateUniquePrefixedNumber(client, { kind, prefix, pad, existsSql });
}

/**
 * Allocate next MOV-YYYY-NNNN via sequence — used on sale complete / stock paths.
 * Must NOT use advisory_xact_lock held until COMMIT (that serialized all completes).
 * Self-heals when legacy MAX+1 paths raced the sequence ahead.
 */
export async function allocateNextMovementNumber(
  client: Pool | PoolClient,
  pad = 4,
): Promise<string> {
  const year = getBusinessYear();
  const prefix = `MOV-${year}-`;
  return allocateUniquePrefixedNumber(client, {
    kind: 'movement',
    prefix,
    pad,
    existsSql: `SELECT EXISTS(SELECT 1 FROM stock_movements WHERE movement_number = $1) AS exists`,
  });
}
