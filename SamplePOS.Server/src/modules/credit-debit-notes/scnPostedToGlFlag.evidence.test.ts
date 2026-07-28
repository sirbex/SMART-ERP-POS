/**
 * Evidence: posting a supplier CN/DN must set is_posted_to_gl so AP integrity
 * open-item includes the note (avoids GL↔subledger drift like SALUD −291,300).
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoSrc = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'creditDebitNoteRepository.ts'),
  'utf8',
);

describe('supplier CN/DN post sets is_posted_to_gl', () => {
  it('postSupplierNote stamps is_posted_to_gl = TRUE', () => {
    expect(repoSrc).toMatch(/async postSupplierNote[\s\S]*?is_posted_to_gl\s*=\s*TRUE/);
    expect(repoSrc).toMatch(/posted_to_gl_at\s*=\s*COALESCE\(posted_to_gl_at,\s*NOW\(\)\)/);
  });
});
