/**
 * Gate A architecture proof — VAT Remittance (ADR-005 Phase 3A)
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VAT_REMITTANCE_TOUCHPOINT_REGISTRY,
  countVatTouchpointsByStatus,
  VAT_REMITTANCE_WRITE_GATEWAY,
} from './vatRemittanceTouchpointRegistry.js';
import {
  assertRemittanceCeiling,
  assertVatRemittanceAccounts,
  assertRemittanceDebitsVatControl,
  assertProductVatAccountNotWht,
  assertVatPostingSourceNotWht,
  VatRemittanceInvariantError,
  VAT_CONTROL_ACCOUNT,
} from '@shared/vat-remittance/index.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('VAT Remittance architecture proof (Gate A partial — 3A)', () => {
  it('A-01 ADR-005 freeze statement exists and is Accepted', () => {
    const adr = readRepo('docs/architecture/VAT_REMITTANCE_ADR.md');
    expect(adr).toMatch(/Freeze VAT around two distinct economic events/i);
    expect(adr).toMatch(/\*\*Status:\*\* Accepted/i);
  });

  it('A-02 registry lists accrual and remittance touchpoints', () => {
    const ids = new Set(VAT_REMITTANCE_TOUCHPOINT_REGISTRY.map((t) => t.id));
    for (const id of ['VR01', 'VR04', 'VR07', 'VR08', 'VR09']) {
      expect(ids.has(id)).toBe(true);
    }
    expect(countVatTouchpointsByStatus('NOT_STARTED')).toBe(0);
    expect(VAT_REMITTANCE_WRITE_GATEWAY).toContain('modules/vat-remittance');
  });

  it('A-03 every touchpoint has status + owner + proof', () => {
    for (const t of VAT_REMITTANCE_TOUCHPOINT_REGISTRY) {
      expect(t.owner.length).toBeGreaterThan(0);
      expect(t.proof.length).toBeGreaterThan(0);
    }
  });

  it('schema 548/549 and shared classifiers exist', () => {
    expect(
      existsSync(path.join(repoRoot, 'shared/sql/548_vat_remittance_foundation.sql')),
    ).toBe(true);
    expect(
      existsSync(path.join(repoRoot, 'shared/sql/549_vat_tax_receivable_vr_inv_6.sql')),
    ).toBe(true);
    expect(existsSync(path.join(repoRoot, 'shared/vat-remittance/index.ts'))).toBe(true);
    const sql = readRepo('shared/sql/548_vat_remittance_foundation.sql');
    expect(sql).toMatch(/vat_remittance_document_enabled/);
    const ver = readRepo('SamplePOS.Server/src/constants/schemaVersion.ts');
    expect(ver).toMatch(/CURRENT_SCHEMA_VERSION\s*=\s*(549|550|551)\b/);
  });

  it('Phase 3B Decision B recorded + VAT recon lane', () => {
    const adr = readRepo('docs/architecture/VAT_REMITTANCE_ADR.md');
    expect(adr).toMatch(/Decision B/);
    expect(
      existsSync(
        path.join(
          repoRoot,
          'SamplePOS.Server/src/modules/vat-remittance/vatAccrualReconService.ts',
        ),
      ),
    ).toBe(true);
    const provider = readRepo(
      'SamplePOS.Server/src/modules/financial-reconciliation/providers/vatReconciliationProvider.ts',
    );
    expect(provider).toMatch(/domain = 'vat'/);
  });

  it('Phase 3C remittance gateway migrated (VR08)', () => {
    const vr08 = VAT_REMITTANCE_TOUCHPOINT_REGISTRY.find((t) => t.id === 'VR08');
    expect(vr08?.status).toBe('MIGRATED');
    expect(
      existsSync(
        path.join(repoRoot, 'SamplePOS.Server/src/modules/vat-remittance/vatRemittanceService.ts'),
      ),
    ).toBe(true);
    const types = readRepo('shared/treasury/treasuryTypes.ts');
    expect(types).toMatch(/case 'VAT_REMITTANCE':\s*return 'VAT_REMITTANCE'/);
  });

  it('A-06 Rule D allows VAT_REMITTANCE cash credit', () => {
    const gov = readRepo('SamplePOS.Server/src/services/postingGovernanceService.ts');
    expect(gov).toMatch(/'VAT_REMITTANCE'/);
    expect(gov).toMatch(/source !== 'VAT_REMITTANCE'/);
  });
});

describe('VAT Remittance invariants (Phase 3A stubs)', () => {
  it('VR-INV-2 rejects over-remit', () => {
    expect(() =>
      assertRemittanceCeiling({ remittanceAmount: 100.01, availableVatPayable: 100 }),
    ).toThrow(VatRemittanceInvariantError);
  });

  it('VR-INV-5 rejects WHT accounts on remittance lines', () => {
    expect(() =>
      assertVatRemittanceAccounts({
        lines: [
          { accountCode: VAT_CONTROL_ACCOUNT },
          { accountCode: '2350' },
        ],
      }),
    ).toThrow(/VR-INV-5/);
  });

  it('VR-INV-1 requires debit to 2300', () => {
    expect(() =>
      assertRemittanceDebitsVatControl({
        lines: [
          { accountCode: '1010', debitAmount: 0, creditAmount: 50 },
          { accountCode: '2100', debitAmount: 50, creditAmount: 0 },
        ],
      }),
    ).toThrow(/VR-INV-1/);
  });

  it('VR-INV-6 rejects product VAT receivable on 1250', () => {
    expect(() =>
      assertProductVatAccountNotWht({
        taxPayableAccount: '2300',
        taxReceivableAccount: '1250',
      }),
    ).toThrow(/VR-INV-6/);
  });

  it('VR-INV-9 rejects WHT posting source for VAT', () => {
    expect(() => assertVatPostingSourceNotWht('WHT_REMITTANCE')).toThrow(/VR-INV-9/);
    expect(() => assertVatPostingSourceNotWht('VAT_REMITTANCE')).not.toThrow();
  });

  it('Phase 3D: VR06 settled SSOT + VR13 period-close checklist', () => {
    const liability = readRepo('SamplePOS.Server/src/modules/withholding-tax/whtReportService.ts');
    expect(liability).toMatch(/sumPostedVatRemittances/);
    expect(liability).toMatch(/VR-INV-10/);

    const checklist = readRepo('samplepos.client/src/lib/financialCloseChecklist.ts');
    expect(checklist).toMatch(/step-vat-remittance/);

    const ids = new Set(VAT_REMITTANCE_TOUCHPOINT_REGISTRY.map((t) => t.id));
    expect(ids.has('VR13')).toBe(true);
    expect(VAT_REMITTANCE_TOUCHPOINT_REGISTRY.find((t) => t.id === 'VR06')?.status).toBe(
      'MIGRATED',
    );
  });
});
