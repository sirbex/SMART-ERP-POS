/**
 * Gate A / E architecture proof — Treasury Document (ADR-003 Phase 1E)
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TREASURY_TOUCHPOINT_REGISTRY,
  countTouchpointsByStatus,
  TREASURY_WRITE_GATEWAY,
} from './treasuryTouchpointRegistry.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('Treasury architecture proof (Gate A)', () => {
  it('A-01 ADR-003 freeze statement exists', () => {
    const adr = readRepo('docs/architecture/TREASURY_DOCUMENT_ADR.md');
    expect(adr).toMatch(/Freeze the Treasury domain/i);
    expect(adr).toMatch(/Treasury Document/);
  });

  it('A-02 registry lists every required liquidity family', () => {
    const ids = new Set(TREASURY_TOUCHPOINT_REGISTRY.map((t) => t.id));
    for (const id of ['T01', 'T03', 'T05', 'T08', 'T09', 'T10', 'T12', 'T14', 'T16']) {
      expect(ids.has(id)).toBe(true);
    }
    expect(TREASURY_TOUCHPOINT_REGISTRY.length).toBeGreaterThanOrEqual(14);
  });

  it('A-03 every touchpoint has status + owner', () => {
    for (const t of TREASURY_TOUCHPOINT_REGISTRY) {
      expect(['MIGRATED', 'SHIMMED', 'ALLOW_LISTED', 'DEFERRED', 'NOT_STARTED']).toContain(
        t.status,
      );
      expect(t.owner.length).toBeGreaterThan(0);
      expect(t.proof.length).toBeGreaterThan(0);
    }
    expect(countTouchpointsByStatus('NOT_STARTED')).toBe(0);
  });

  it('A-04 MANUAL_JOURNAL cannot credit CASH (Rule D)', () => {
    const gov = readRepo('SamplePOS.Server/src/services/postingGovernanceService.ts');
    expect(gov).toMatch(/GOV_RULE_D_CASH_CREDIT/);
    expect(gov).toMatch(/TREASURY_DEPOSIT/);
    expect(gov).toMatch(/TREASURY_TRANSFER/);
    expect(gov).toMatch(/TREASURY_PETTY_CASH/);
  });

  it('A-06 deposit worksheet gateway exists under treasury module', () => {
    expect(TREASURY_WRITE_GATEWAY).toContain('modules/treasury');
    expect(
      existsSync(path.join(repoRoot, 'SamplePOS.Server/src/modules/treasury/depositWorksheetService.ts')),
    ).toBe(true);
  });

  it('register shims call treasury when flag on', () => {
    const reg = readRepo('SamplePOS.Server/src/modules/cash-register/cashRegisterService.ts');
    expect(reg).toMatch(/createTreasuryTransfer|createAndPostTransferInTx/);
    expect(reg).toMatch(/createPettyCashDocument/);
    expect(reg).toMatch(/treasuryOn|isTreasuryDocumentEnabled/);
  });

  it('banking transfer shims to TD when flag on', () => {
    const bank = readRepo('SamplePOS.Server/src/services/bankingService.ts');
    expect(bank).toMatch(/createAndPostTransferInTx|createTreasuryTransfer/);
  });
});

describe('Treasury governance proof (Gate E)', () => {
  it('E-01 mutating routes require liquidity write (banking or accounting.manage)', () => {
    const routes = readRepo('SamplePOS.Server/src/modules/treasury/treasuryRoutes.ts');
    expect(routes).toMatch(/requireLiquidityWrite/);
    expect(routes).toMatch(/requireLiquidityRead/);
    expect(routes).toMatch(/banking\.create/);
    expect(routes).toMatch(/banking\.read/);
    expect(routes).toMatch(/accounting\.manage/);
    const writeCount = (routes.match(/requireLiquidityWrite/g) ?? []).length;
    expect(writeCount).toBeGreaterThanOrEqual(5);
  });

  it('E-03 posted immutability enforced in shared invariants', () => {
    const inv = readRepo('shared/treasury/treasuryInvariants.ts');
    expect(inv).toMatch(/TD_INV_3_IMMUTABLE/);
    expect(inv).toMatch(/assertMutableStatus/);
  });

  it('E-04 audit fields required on POSTED (TD-INV-7)', () => {
    const inv = readRepo('shared/treasury/treasuryInvariants.ts');
    expect(inv).toMatch(/assertPostedAuditFields/);
    expect(inv).toMatch(/TD_INV_7/);
  });

  it('E-02 approval path exists on service', () => {
    const svc = readRepo('SamplePOS.Server/src/modules/treasury/treasuryService.ts');
    expect(svc).toMatch(/approve|PENDING_APPROVAL|requiresApproval/);
  });
});
