/**
 * Phase 3C — VAT remittance posting proofs (VR-INV-1/2/7/9 structural)
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';
import { postingSourceForDocumentType } from '@shared/treasury/index.js';
import {
  assertRemittanceCeiling,
  assertVatRemittanceAccounts,
  assertRemittanceDebitsVatControl,
  assertVatPostingSourceNotWht,
  VAT_CONTROL_ACCOUNT,
  VatRemittanceInvariantError,
} from '@shared/vat-remittance/index.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('VAT remittance posting (Phase 3C)', () => {
  it('postingSourceForDocumentType maps VAT_REMITTANCE (not TREASURY_TRANSFER)', () => {
    expect(postingSourceForDocumentType('VAT_REMITTANCE')).toBe('VAT_REMITTANCE');
    expect(postingSourceForDocumentType('WHT_REMITTANCE')).toBe('WHT_REMITTANCE');
  });

  it('VR-INV-1 remittance shape debits 2300 and rejects WHT accounts', () => {
    const lines = [
      { accountCode: VAT_CONTROL_ACCOUNT, debitAmount: 100, creditAmount: 0 },
      { accountCode: '1010', debitAmount: 0, creditAmount: 100 },
    ];
    expect(() => assertRemittanceDebitsVatControl({ lines })).not.toThrow();
    expect(() => assertVatRemittanceAccounts({ lines })).not.toThrow();
    expect(() =>
      assertVatRemittanceAccounts({
        lines: [
          { accountCode: '2300' },
          { accountCode: '2350' },
        ],
      }),
    ).toThrow(VatRemittanceInvariantError);
  });

  it('VR-INV-2 over-remit rejected; concurrent residual simulation', () => {
    let available = 50_000;
    const attempt = (qty: number) => {
      assertRemittanceCeiling({ remittanceAmount: qty, availableVatPayable: available });
      available = Math.round((available - qty) * 100) / 100;
    };
    attempt(50_000);
    expect(available).toBe(0);
    expect(() => attempt(1)).toThrow(VatRemittanceInvariantError);
  });

  it('VR-INV-9 rejects WHT posting source for VAT settlement', () => {
    expect(() => assertVatPostingSourceNotWht('WHT_REMITTANCE')).toThrow(/VR-INV-9/);
    expect(() => assertVatPostingSourceNotWht('VAT_REMITTANCE')).not.toThrow();
  });

  it('service + routes exist with flag gate and reverse', () => {
    expect(
      existsSync(
        path.join(repoRoot, 'SamplePOS.Server/src/modules/vat-remittance/vatRemittanceService.ts'),
      ),
    ).toBe(true);
    const svc = readRepo('SamplePOS.Server/src/modules/vat-remittance/vatRemittanceService.ts');
    expect(svc).toContain('createAndPostVatRemittance');
    expect(svc).toContain('reverseVatRemittance');
    expect(svc).toContain('pg_advisory_xact_lock');
    expect(svc).toContain('assertRemittanceCeiling');
    expect(svc).toContain("documentType: 'VAT_REMITTANCE'");

    const routes = readRepo('SamplePOS.Server/src/modules/vat-remittance/vatRemittanceRoutes.ts');
    expect(routes).toMatch(/requirePermission\('accounting\.manage'\)/);
    expect(routes).toContain('/remit');
    expect(routes).toContain('/:id/reverse');

    const ui = readRepo('samplepos.client/src/pages/accounting/VatRemittancePage.tsx');
    expect(ui).toContain('Post VAT remittance');
  });
});
