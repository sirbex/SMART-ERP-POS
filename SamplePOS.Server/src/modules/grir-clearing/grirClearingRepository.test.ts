/**
 * Regression: grir_clearing INSERT must not reuse $9 for status + CASE (PG 42P08).
 * Also: supplier filter must never bind free-text into UUID columns (PG 22P02).
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSupplierFilter, isUuid } from './supplierFilter.js';

const repoPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'grirClearingRepository.ts'
);
const src = readFileSync(repoPath, 'utf8');

describe('grirClearingRepository.createClearingRecord SQL', () => {
  it('does not reuse status parameter in CASE WHEN (avoids 42P08)', () => {
    expect(src).toContain('VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())');
    expect(src).not.toMatch(/CASE WHEN \$9 IN/);
  });

  it('updateClearingStatus uses boolean for matched_at, not status IN (...)', () => {
    expect(src).toContain('matched_at = CASE WHEN $4 THEN NOW() ELSE matched_at END');
    expect(src).not.toMatch(/CASE WHEN \$2 IN/);
  });

  it('match-candidates / open list resolve supplier via resolveSupplierFilter (not raw UUID bind)', () => {
    expect(src).toMatch(/resolveSupplierFilter/);
    expect(src).toMatch(/CompanyName" ILIKE/);
  });
});

describe('resolveSupplierFilter — PG 22P02 guard', () => {
  it('treats empty as none', () => {
    expect(resolveSupplierFilter(undefined)).toEqual({ mode: 'none' });
    expect(resolveSupplierFilter('')).toEqual({ mode: 'none' });
    expect(resolveSupplierFilter('   ')).toEqual({ mode: 'none' });
  });

  it('treats UUID as id filter', () => {
    const id = '3bdfdabb-cb7a-478a-99f3-bea84db0a1a9';
    expect(resolveSupplierFilter(id)).toEqual({ mode: 'id', supplierId: id });
    expect(isUuid(id)).toBe(true);
  });

  it('treats free-text like "sal" as name search — never UUID', () => {
    expect(resolveSupplierFilter('sal')).toEqual({ mode: 'search', supplierSearch: 'sal' });
    expect(isUuid('sal')).toBe(false);
    expect(resolveSupplierFilter('Salaama Distributors')).toEqual({
      mode: 'search',
      supplierSearch: 'Salaama Distributors',
    });
  });
});
