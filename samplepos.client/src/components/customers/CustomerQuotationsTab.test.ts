/**
 * P5 — Customer Center quotations tab: bucket → server filter mapping.
 *
 * Pinning this contract guarantees that:
 *  - "Open" never accidentally shows CONVERTED/CANCELLED/EXPIRED/REJECTED
 *    (delegates to the P1 server-side openOnly SSOT).
 *  - "Converted" only shows quotes the server flagged CONVERTED.
 *  - "All" sends no status filter, so the customer's full quotation history
 *    is returned.
 *  - customerId is ALWAYS scoped — the tab must never leak another
 *    customer's quotes if the bucket toggle is changed.
 */
import { describe, it, expect } from 'vitest';
import { bucketToQuotationFilters } from './CustomerQuotationsTab';

describe('bucketToQuotationFilters', () => {
  const cid = 'cust-123';

  it('open → openOnly:true, no status, scoped to customer', () => {
    expect(bucketToQuotationFilters('open', cid)).toEqual({
      customerId: cid,
      limit: 50,
      openOnly: true,
    });
  });

  it('converted → status:CONVERTED, no openOnly, scoped to customer', () => {
    expect(bucketToQuotationFilters('converted', cid)).toEqual({
      customerId: cid,
      limit: 50,
      status: 'CONVERTED',
    });
  });

  it('all → no status, no openOnly, scoped to customer', () => {
    const f = bucketToQuotationFilters('all', cid);
    expect(f).toEqual({ customerId: cid, limit: 50 });
    expect(f).not.toHaveProperty('openOnly');
    expect(f).not.toHaveProperty('status');
  });

  it('honours a custom limit', () => {
    expect(bucketToQuotationFilters('open', cid, 10).limit).toBe(10);
    expect(bucketToQuotationFilters('all', cid, 200).limit).toBe(200);
  });

  it('NEVER drops the customerId for any bucket', () => {
    for (const b of ['open', 'converted', 'all'] as const) {
      expect(bucketToQuotationFilters(b, cid).customerId).toBe(cid);
    }
  });

  it('open and converted do NOT both set openOnly + status together', () => {
    // openOnly is a stronger filter; combining them would let one accidentally
    // mask the other. The mapping must pick exactly one channel per bucket.
    const open = bucketToQuotationFilters('open', cid);
    const conv = bucketToQuotationFilters('converted', cid);
    expect(open.status).toBeUndefined();
    expect(conv.openOnly).toBeUndefined();
  });
});
