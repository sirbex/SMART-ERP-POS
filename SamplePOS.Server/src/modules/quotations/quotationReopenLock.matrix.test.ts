/**
 * Quotation re-open lock — comprehensive matrix proof.
 *
 * Single auditable file proving the contract:
 *
 *   "A quotation that has already been made a sale (or claimed by any
 *    downstream conversion path) MUST NEVER be reopened, edited, or
 *    re-converted from ANY entry point — regardless of whether the
 *    quotation is QUICK, STANDARD, RETAIL, or WHOLESALE."
 *
 * For each (quote_type × fulfillment_mode) variant we prove every public
 * write entry point refuses the operation:
 *
 *   A. assertEditableQuotation           — edit body / items
 *   B. assertStatusChangeable            — change status
 *   C. assertQuoteConvertibleForPosSale  — POS sale pre-check
 *   D. quotationRepository.canConvertQuotation
 *                                        — sale-conversion gate
 *   E. quotationRepository.markQuotationAsConverted
 *                                        — SQL UPDATE WHERE clause (atomic claim)
 *   F. quotationRepository.markQuotationAsConvertedToSO
 *                                        — wholesale SO SQL UPDATE WHERE clause
 *   G. quotationRepository.markQuotationAsConvertedToFirstDN
 *                                        — wholesale DN idempotent claim
 *   H. quotationRepository.listQuotations({openOnly:true})
 *                                        — sold quotes hidden from "open" lists
 *
 * Pure functions / SQL-shape assertions → no DB, runs in <1 second.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Pool, PoolClient } from 'pg';

import {
  assertEditableQuotation,
  assertStatusChangeable,
  type QuotationGuardShape,
} from './quotationGuards.js';
import { assertQuoteConvertibleForPosSale } from '../sales/quoteConvertibilityGuard.js';
import { quotationRepository } from './quotationRepository.js';
import { CLOSED_QUOTATION_STATUSES } from '../../../../shared/zod/quotation.js';

// ─────────────────────────────────────────────────────────────────────────
// Variants — exhaustive over the (quote_type × fulfillment_mode) space
// described in quotationRepository.QuotationDbRow.
// ─────────────────────────────────────────────────────────────────────────
type Variant = {
  label: string;
  quoteType: 'quick' | 'standard';
  fulfillmentMode: 'RETAIL' | 'WHOLESALE';
};

const VARIANTS: Variant[] = [
  { label: 'QUICK / RETAIL    (POS-style quick quote)',     quoteType: 'quick',    fulfillmentMode: 'RETAIL' },
  { label: 'STANDARD / RETAIL (full-form retail quote)',    quoteType: 'standard', fulfillmentMode: 'RETAIL' },
  { label: 'STANDARD / WHOLESALE (DN/SO wholesale quote)',  quoteType: 'standard', fulfillmentMode: 'WHOLESALE' },
];

const SOLD_SALE_ID = 'sale-uuid-already-sold';
const SOLD_SO_ID   = 'so-uuid-already-sold';
const SOLD_DN_ID   = 'dn-uuid-already-sold';

// Helper: build a quotation row in the canonical "already sold" shape.
function alreadySold(variant: Variant, claim: 'sale' | 'so' | 'dn'): QuotationGuardShape & {
  id: string;
  quote_type: Variant['quoteType'];
  fulfillment_mode: Variant['fulfillmentMode'];
  valid_until: string;
  converted_to_dn_id: string | null;
} {
  return {
    status: 'CONVERTED',
    quote_number: `Q-2026-${variant.quoteType.toUpperCase()}-${variant.fulfillmentMode}`,
    id: 'quote-uuid-sold',
    quote_type: variant.quoteType,
    fulfillment_mode: variant.fulfillmentMode,
    valid_until: '2030-01-01',
    converted_to_sale_id: claim === 'sale' ? SOLD_SALE_ID : null,
    converted_to_so_id:   claim === 'so'   ? SOLD_SO_ID   : null,
    converted_to_dn_id:   claim === 'dn'   ? SOLD_DN_ID   : null,
  };
}

const expectConflict409 = (fn: () => unknown): { statusCode: number; message: string } => {
  let caught: unknown;
  try { fn(); } catch (e) { caught = e; }
  expect(caught).toBeDefined();
  const e = caught as { statusCode?: number; message?: string };
  expect(e.statusCode).toBe(409);
  return { statusCode: e.statusCode!, message: e.message ?? '' };
};

const expectBusinessErrorCode = (
  fn: () => unknown,
  expectedCode: string,
): { errorCode: string; message: string } => {
  let caught: unknown;
  try { fn(); } catch (e) { caught = e; }
  expect(caught).toBeDefined();
  const e = caught as { errorCode?: string; message?: string };
  expect(e.errorCode).toBe(expectedCode);
  return { errorCode: e.errorCode!, message: e.message ?? '' };
};

// ─────────────────────────────────────────────────────────────────────────
// SECTION 1 — Pure guards (A, B, C) ×  variant × claim path
// ─────────────────────────────────────────────────────────────────────────
describe('Quotation re-open lock — pure guards, all variants', () => {
  for (const variant of VARIANTS) {
    describe(variant.label, () => {
      const claims: Array<'sale' | 'so' | 'dn'> = ['sale', 'so', 'dn'];

      for (const claim of claims) {
        describe(`when already claimed by ${claim.toUpperCase()}`, () => {
          const row = alreadySold(variant, claim);

          // The DN-claim case does NOT populate converted_to_sale_id /
          // converted_to_so_id, so the editability guard only fires on the
          // terminal status. That is exactly what the guard contract promises.
          it('A. assertEditableQuotation → 409 ConflictError', () => {
            expectConflict409(() => assertEditableQuotation(row));
          });

          it('B. assertStatusChangeable(→DRAFT) → 409 ConflictError', () => {
            expectConflict409(() => assertStatusChangeable(row, 'DRAFT'));
          });

          it('B. assertStatusChangeable(→CANCELLED) → 409 ConflictError', () => {
            expectConflict409(() => assertStatusChangeable(row, 'CANCELLED'));
          });

          it('C. assertQuoteConvertibleForPosSale → BusinessError ERR_SALE_005', () => {
            const { message } = expectBusinessErrorCode(
              () => assertQuoteConvertibleForPosSale(row.status, row.quote_number),
              'ERR_SALE_005',
            );
            expect(message).toContain(row.quote_number);
            expect(message).toContain('CONVERTED');
          });
        });
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// SECTION 2 — Repository convert-gate (D) per variant
// ─────────────────────────────────────────────────────────────────────────
describe('Quotation re-open lock — canConvertQuotation, all variants', () => {
  type QueryFn = (...args: unknown[]) => Promise<unknown>;
  const makeMockPool = (row: Record<string, unknown>) => {
    return {
      query: jest.fn<QueryFn>().mockResolvedValue({ rows: [row], rowCount: 1 }),
    } as unknown as Pool;
  };

  for (const variant of VARIANTS) {
    it(`${variant.label} — CONVERTED status → can=false, reason mentions "already converted"`, async () => {
      const row = {
        id: 'q-sold',
        status: 'CONVERTED',
        quote_number: 'Q-X',
        quote_type: variant.quoteType,
        fulfillment_mode: variant.fulfillmentMode,
        valid_until: '2030-01-01',
        converted_to_sale_id: SOLD_SALE_ID,
        converted_to_so_id: null,
      };
      const pool = makeMockPool(row);
      const result = await quotationRepository.canConvertQuotation(pool, 'q-sold');
      expect(result.can).toBe(false);
      expect(result.reason).toMatch(/already converted/i);
    });

    it(`${variant.label} — CANCELLED status → can=false, reason mentions "cancelled"`, async () => {
      const row = {
        id: 'q-cancelled',
        status: 'CANCELLED',
        quote_number: 'Q-X',
        quote_type: variant.quoteType,
        fulfillment_mode: variant.fulfillmentMode,
        valid_until: '2030-01-01',
        converted_to_sale_id: null,
        converted_to_so_id: null,
      };
      const pool = makeMockPool(row);
      const result = await quotationRepository.canConvertQuotation(pool, 'q-cancelled');
      expect(result.can).toBe(false);
      expect(result.reason).toMatch(/cancelled/i);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// SECTION 3 — Atomic claim SQL shape (E, F) — the row-level race guard
// ─────────────────────────────────────────────────────────────────────────
describe('Quotation re-open lock — atomic UPDATE-WHERE claim contract', () => {
  type QueryFn = (...args: unknown[]) => Promise<unknown>;
  const makeMockClient = (rows: unknown[] = []) => {
    const captured: Array<{ sql: string; values: unknown[] }> = [];
    const query = jest.fn<QueryFn>(async (sql: unknown, values: unknown) => {
      captured.push({ sql: String(sql), values: (values as unknown[]) ?? [] });
      return { rows, rowCount: rows.length };
    });
    return { client: { query } as unknown as PoolClient, captured };
  };

  it('E. markQuotationAsConverted — WHERE clause rejects ANY prior claim (sale OR so) and status=CONVERTED', async () => {
    const { client, captured } = makeMockClient([{ id: 'q1', status: 'CONVERTED' }]);
    await quotationRepository.markQuotationAsConverted(client, 'q1', 'sale-new', 'inv-new');
    const { sql } = captured[0];
    expect(sql).toMatch(/UPDATE\s+quotations/i);
    expect(sql).toMatch(/SET[\s\S]*status\s*=\s*'CONVERTED'/i);
    expect(sql).toMatch(/status\s*!=\s*'CONVERTED'/i);
    expect(sql).toMatch(/converted_to_sale_id\s+IS\s+NULL/i);
    expect(sql).toMatch(/converted_to_so_id\s+IS\s+NULL/i);
  });

  it('E. markQuotationAsConverted — throws when the WHERE clause matches no row (already sold)', async () => {
    const { client } = makeMockClient([]); // simulate "no rows affected"
    await expect(
      quotationRepository.markQuotationAsConverted(client, 'q1', 'sale-new', null),
    ).rejects.toThrow(/already been converted|does not exist/i);
  });

  it('F. markQuotationAsConvertedToSO — WHERE clause rejects ANY prior claim (sale OR so) and status=CONVERTED', async () => {
    const { client, captured } = makeMockClient([{ id: 'q1', status: 'CONVERTED' }]);
    await quotationRepository.markQuotationAsConvertedToSO(client, 'q1', 'so-new');
    const { sql } = captured[0];
    expect(sql).toMatch(/UPDATE\s+quotations/i);
    expect(sql).toMatch(/converted_to_so_id\s*=\s*\$1/);
    expect(sql).toMatch(/status\s*!=\s*'CONVERTED'/i);
    expect(sql).toMatch(/converted_to_sale_id\s+IS\s+NULL/i);
    expect(sql).toMatch(/converted_to_so_id\s+IS\s+NULL/i);
  });

  it('F. markQuotationAsConvertedToSO — throws when the WHERE clause matches no row (already sold)', async () => {
    const { client } = makeMockClient([]);
    await expect(
      quotationRepository.markQuotationAsConvertedToSO(client, 'q1', 'so-new'),
    ).rejects.toThrow(/already been converted|does not exist/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// SECTION 4 — Wholesale DN convert-once (G)
// ─────────────────────────────────────────────────────────────────────────
describe('Quotation re-open lock — markQuotationAsConvertedToFirstDN idempotency', () => {
  type QueryFn = (...args: unknown[]) => Promise<unknown>;

  it('returns alreadyClaimed:true when the quote was already converted by ANY path', async () => {
    let call = 0;
    const responses = [
      { rows: [],            rowCount: 0 }, // UPDATE — precondition failed
      { rows: [{ id: 'q1' }] },             // SELECT — row exists
    ];
    const query = jest.fn<QueryFn>(async () => responses[call++]);
    const client = { query } as unknown as PoolClient;

    const result = await quotationRepository.markQuotationAsConvertedToFirstDN(
      client, 'q1', 'dn-new',
    );
    expect(result).toEqual({ alreadyClaimed: true, row: null });
  });

  it('WHERE clause rejects ANY prior claim (sale OR so OR dn) and status=CONVERTED', async () => {
    let capturedSql = '';
    const query = jest.fn<QueryFn>(async (sql: unknown) => {
      capturedSql = String(sql);
      return { rows: [{ id: 'q1' }], rowCount: 1 };
    });
    const client = { query } as unknown as PoolClient;
    await quotationRepository.markQuotationAsConvertedToFirstDN(client, 'q1', 'dn-1');
    expect(capturedSql).toMatch(/status\s*!=\s*'CONVERTED'/i);
    expect(capturedSql).toMatch(/converted_to_sale_id\s+IS\s+NULL/i);
    expect(capturedSql).toMatch(/converted_to_so_id\s+IS\s+NULL/i);
    expect(capturedSql).toMatch(/converted_to_dn_id\s+IS\s+NULL/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// SECTION 5 — Listing (H) — sold quotes invisible to "open" filter
// ─────────────────────────────────────────────────────────────────────────
describe('Quotation re-open lock — listQuotations openOnly excludes sold quotes', () => {
  type QueryFn = (...args: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>;

  beforeEach(() => jest.clearAllMocks());

  it('CLOSED_QUOTATION_STATUSES includes every "sold/closed" terminal status', () => {
    expect([...CLOSED_QUOTATION_STATUSES].sort()).toEqual(
      ['CANCELLED', 'CONVERTED', 'EXPIRED', 'REJECTED'].sort(),
    );
  });

  it('openOnly=true binds every closed status as a parameterised exclusion', async () => {
    const query = jest.fn<QueryFn>().mockImplementation(async (sql: unknown) => {
      if (typeof sql === 'string' && /COUNT\(\*\)/i.test(sql)) {
        return { rows: [{ count: '0' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const pool = { query } as unknown as Pool;

    await quotationRepository.listQuotations(pool, { page: 1, limit: 20, openOnly: true });

    const [countSql, countValues] = (query as jest.Mock).mock.calls[0] as [string, unknown[]];
    expect(countSql).toMatch(/status NOT IN \(/);
    // Every closed status is bound — string interpolation is not used.
    for (const s of CLOSED_QUOTATION_STATUSES) expect(countValues).toContain(s);
    // CONVERTED specifically — the "already sold" case the contract targets.
    expect(countValues).toContain('CONVERTED');
  });
});
