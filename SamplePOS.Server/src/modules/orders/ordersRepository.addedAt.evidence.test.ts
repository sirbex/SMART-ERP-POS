/**
 * Proof: restaurant addItems must never INSERT explicit NULL into added_at
 * (pg 23502 NOT NULL — DEFAULT is bypassed by bound NULL).
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('pos_order_items.added_at insert contract', () => {
  it('EVIDENCE: addOrderItems stamps addedAt when column exists (never || null)', () => {
    const src = readFileSync(path.join(here, 'ordersRepository.ts'), 'utf8');
    const fn = src.slice(
      src.indexOf('async addOrderItems('),
      src.indexOf('async getById('),
    );
    expect(fn).toMatch(/Never bind NULL into added_at/);
    expect(fn).toMatch(/const addedAt = item\.addedAt \|\| new Date\(\)\.toISOString\(\)/);
    expect(fn).not.toMatch(/item\.addedAt \|\| null/);
  });
});
