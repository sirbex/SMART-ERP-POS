/**
 * Evidence: sales.print_count for reprint audit — schema + fail-soft route.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

function read(pathFromRepo: string): string {
  return readFileSync(resolve(repoRoot, pathFromRepo), 'utf8');
}

describe('EVIDENCE — sales.print_count reprint audit', () => {
  it('migration 586 adds print_count idempotently', () => {
    const migPath = resolve(repoRoot, 'shared/sql/586_sales_print_count.sql');
    expect(existsSync(migPath)).toBe(true);
    const mig = read('shared/sql/586_sales_print_count.sql');
    expect(mig).toMatch(/ADD COLUMN IF NOT EXISTS print_count/);
    expect(mig).toMatch(/INSERT INTO schema_version \(version\) VALUES \(586\)/);
  });

  it('STRUCT: POST /sales/:id/reprint self-heals missing print_count (42703)', () => {
    const routes = read('SamplePOS.Server/src/modules/sales/salesRoutes.ts');
    expect(routes).toMatch(/print_count/);
    expect(routes).toMatch(/42703/);
    expect(routes).toMatch(/ADD COLUMN IF NOT EXISTS print_count/);
    expect(routes).toMatch(/logReceiptReprint/);
  });
});
