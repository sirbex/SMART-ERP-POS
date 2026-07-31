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

/**
 * Allocate next SALE-/ORD-/REF- number via sequence (no TX-scoped advisory lock).
 * Safe to call on the sale transaction client — nextval does not serialize FEFO/GL.
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

  const nextNum = await nextvalAllowlisted(client, target.sequence);
  return `${prefix}${String(nextNum).padStart(pad, '0')}`;
}

/**
 * Allocate next MOV-YYYY-NNNN via sequence — used on sale complete / stock paths.
 * Must NOT use advisory_xact_lock held until COMMIT (that serialized all completes).
 */
export async function allocateNextMovementNumber(
  client: Pool | PoolClient,
  pad = 4,
): Promise<string> {
  const year = getBusinessYear();
  const prefix = `MOV-${year}-`;
  const nextNum = await nextvalAllowlisted(client, DOCUMENT_NUMBER_TARGETS.movement.sequence);
  return `${prefix}${String(nextNum).padStart(pad, '0')}`;
}
