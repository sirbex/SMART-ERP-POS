import { describe, expect, it } from '@jest/globals';
import { LEDGER_NET_ACTIVE_SQL } from './ledgerNetActive.js';

describe('LEDGER_NET_ACTIVE_SQL', () => {
  it('requires POSTED status', () => {
    expect(LEDGER_NET_ACTIVE_SQL).toContain('"Status" = \'POSTED\'');
  });

  it('excludes reversed originals', () => {
    expect(LEDGER_NET_ACTIVE_SQL).toContain('"IsReversed" = FALSE');
  });

  it('excludes reversal transactions (paired exclusion)', () => {
    expect(LEDGER_NET_ACTIVE_SQL).toContain('"ReversedByTransactionId"');
    expect(LEDGER_NET_ACTIVE_SQL).toContain('NOT IN');
  });
});
