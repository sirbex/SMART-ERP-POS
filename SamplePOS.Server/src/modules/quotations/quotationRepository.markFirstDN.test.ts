/**
 * P6 unit tests — markQuotationAsConvertedToFirstDN atomic claim.
 *
 * Pins the convert-once contract that closes the wholesale Quote→DN loophole:
 *
 *  1. A wholesale quote with no prior claim is atomically transitioned to
 *     CONVERTED with converted_to_dn_id pointing at the first DN. Subsequent
 *     calls report `alreadyClaimed: true` and DO NOT touch the row.
 *  2. The WHERE clause is the SSOT for "unclaimed" — it MUST reject any
 *     attempt where converted_to_sale_id OR converted_to_so_id OR
 *     converted_to_dn_id is already set, OR status is already 'CONVERTED'.
 *     This guarantees the three conversion paths (retail / wholesale-SO /
 *     wholesale-DN) cannot all win against the same quote.
 *  3. If the row does not exist at all, the call throws — the caller is
 *     expected to have validated the quote first.
 *
 * Tests are SQL-shape assertions on the parameterised UPDATE; they do NOT
 * require a live database (consistent with the P3 pattern).
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { PoolClient } from 'pg';
import { quotationRepository } from './quotationRepository.js';

type QueryFn = (...args: unknown[]) => Promise<unknown>;

interface CapturedQuery {
  sql: string;
  values: unknown[];
}

const makeClient = (responses: Array<{ rows: unknown[]; rowCount?: number }>) => {
  const captured: CapturedQuery[] = [];
  let call = 0;
  const query = jest.fn<QueryFn>(async (sql: unknown, values: unknown) => {
    captured.push({ sql: String(sql), values: (values as unknown[]) ?? [] });
    const r = responses[call] ?? { rows: [] };
    call += 1;
    return r;
  });
  return {
    client: { query } as unknown as PoolClient,
    captured,
  };
};

describe('quotationRepository.markQuotationAsConvertedToFirstDN', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns alreadyClaimed:false and the new row when the claim wins', async () => {
    const newRow = {
      id: 'q-1',
      status: 'CONVERTED',
      converted_to_dn_id: 'dn-1',
    };
    const { client, captured } = makeClient([{ rows: [newRow], rowCount: 1 }]);

    const result = await quotationRepository.markQuotationAsConvertedToFirstDN(
      client,
      'q-1',
      'dn-1',
    );

    expect(result).toEqual({ alreadyClaimed: false, row: newRow });
    expect(captured).toHaveLength(1);

    const { sql, values } = captured[0];
    // Parameter order: $1 = dn id (what we set), $2 = quote id (what we filter on)
    expect(values).toEqual(['dn-1', 'q-1']);
    // Update must set status, the DN FK, version bump, converted_at, updated_at
    expect(sql).toMatch(/UPDATE\s+quotations/i);
    expect(sql).toMatch(/SET[\s\S]*status\s*=\s*'CONVERTED'/i);
    expect(sql).toMatch(/converted_to_dn_id\s*=\s*\$1/);
    expect(sql).toMatch(/converted_at\s*=\s*NOW\(\)/i);
    expect(sql).toMatch(/version\s*=\s*version\s*\+\s*1/i);
    // WHERE is the SSOT for "unclaimed" — must reject every prior-claim path.
    expect(sql).toMatch(/status\s*!=\s*'CONVERTED'/i);
    expect(sql).toMatch(/converted_to_sale_id\s+IS\s+NULL/i);
    expect(sql).toMatch(/converted_to_so_id\s+IS\s+NULL/i);
    expect(sql).toMatch(/converted_to_dn_id\s+IS\s+NULL/i);
  });

  it('returns alreadyClaimed:true (idempotent) when the quote was already claimed by ANY path', async () => {
    // First UPDATE returns no rows (precondition failed), follow-up SELECT
    // proves the row exists → idempotent no-op success.
    const { client, captured } = makeClient([
      { rows: [], rowCount: 0 },
      { rows: [{ id: 'q-1' }] },
    ]);

    const result = await quotationRepository.markQuotationAsConvertedToFirstDN(
      client,
      'q-1',
      'dn-2',
    );

    expect(result).toEqual({ alreadyClaimed: true, row: null });
    expect(captured).toHaveLength(2);
    // Second query is the existence probe — it MUST be a SELECT, not a write
    expect(captured[1].sql).toMatch(/^\s*SELECT\s+id\s+FROM\s+quotations/i);
    expect(captured[1].values).toEqual(['q-1']);
  });

  it('throws when the quote does not exist at all (caller should validate first)', async () => {
    const { client } = makeClient([
      { rows: [], rowCount: 0 },
      { rows: [] }, // existence probe also empty
    ]);

    await expect(
      quotationRepository.markQuotationAsConvertedToFirstDN(client, 'missing', 'dn-x'),
    ).rejects.toThrow(/not found/i);
  });

  it('only TWO queries are issued in the happy and idempotent paths (no extra round-trips)', async () => {
    const happy = makeClient([{ rows: [{ id: 'q-1' }], rowCount: 1 }]);
    await quotationRepository.markQuotationAsConvertedToFirstDN(happy.client, 'q-1', 'dn-1');
    expect(happy.captured).toHaveLength(1);

    const idempotent = makeClient([
      { rows: [], rowCount: 0 },
      { rows: [{ id: 'q-1' }] },
    ]);
    await quotationRepository.markQuotationAsConvertedToFirstDN(idempotent.client, 'q-1', 'dn-2');
    expect(idempotent.captured).toHaveLength(2);
  });
});
