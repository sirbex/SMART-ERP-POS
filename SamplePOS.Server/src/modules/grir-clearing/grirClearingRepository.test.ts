/**
 * Regression: grir_clearing INSERT must not reuse $9 for status + CASE (PG 42P08).
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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
});
