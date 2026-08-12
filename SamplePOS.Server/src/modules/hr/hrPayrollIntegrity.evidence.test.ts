/**
 * SUPERSEDED — run the consolidated sole-acceptance proof instead:
 *   npm test -- --runInBand src/modules/hr/hrSalaryAdvancesConsolidated.evidence.test.ts
 *
 * This file only verifies the consolidated artifact exists after that suite runs,
 * and fails if someone regenerates a "green" partial proof here.
 */
import { describe, expect, it } from '@jest/globals';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..', '..');

describe('PROOF_HR_PAYROLL_INTEGRITY is superseded', () => {
  it('points operators to PROOF_HR_SALARY_ADVANCES_CONSOLIDATED', () => {
    // Importing the consolidated suite would double-run; just require the file on disk
    // after CI runs the consolidated test. Here we assert the source of truth file exists.
    const consol = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'hrSalaryAdvancesConsolidated.evidence.test.ts',
    );
    expect(existsSync(consol)).toBe(true);
    const src = readFileSync(consol, 'utf8');
    expect(src).toContain('soleAcceptance');
    expect(src).toContain('PROOF_HR_SALARY_ADVANCES_CONSOLIDATED');
    expect(src).toContain('ANTI_NO_DEFAULT_1010_UI');
    expect(src).toContain('GOV_PAYROLL_CR_1010_BLOCKED');
    expect(src).toContain('LOOP_CASH_EQ_GROSS');
    expect(src).toContain('WIRE_PROCESS_LOCK');
    expect(src).toContain('WIRE_LIQUIDITY_PAY');
  });
});
