/**
 * POS after-print audit: only persisted sales hit /sales/:id/reprint.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(resolve(here, '..', rel), 'utf8');
}

describe('EVIDENCE — sale receipt print audit vs hold order', () => {
  it('STRUCT: POS only audits print for isPersistedSale + UUID; silent toast', () => {
    const pos = read('pages/pos/POSPage.tsx');
    expect(pos).toMatch(/isPersistedSale/);
    expect(pos).toMatch(/logSaleReceiptPrintAudit/);
    expect(pos).toMatch(/isPersistedSale:\s*true/);
    expect(pos).toMatch(/isPersistedSale:\s*false/);
    expect(pos).toMatch(/silentErrorToast:\s*true/);
    // Must not blind-post any UUID from lastSale (order holds are also UUIDs)
    expect(pos).not.toMatch(
      /if \(lastSale\?\.id && !String\(lastSale\.id\)\.startsWith\('offline'\)/,
    );
  });

  it('STRUCT: Sales reprint audit is silent on 404', () => {
    const sales = read('pages/SalesPage.tsx');
    expect(sales).toMatch(/sales\/\$\{sale\.id\}\/reprint/);
    expect(sales).toMatch(/silentErrorToast:\s*true/);
  });
});
