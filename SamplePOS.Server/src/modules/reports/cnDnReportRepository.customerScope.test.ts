import { jest, describe, test, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'cnDnReportRepository.ts',
);
const source = readFileSync(repoPath, 'utf8');

describe('customerArScopeSql PostgreSQL parameter typing', () => {
  test('casts customer param separately for varchar EntityId and uuid customer_id', () => {
    expect(source).toContain('EntityId" = ${customerParam}::text');
    expect(source).toContain('customer_id = ${customerParam}::uuid');
    expect(source).toContain('ar_customer_payments acp');
    expect(source).toContain('payment_method');
  });
});
