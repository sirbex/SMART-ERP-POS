/**
 * Gate A architecture proof — Reporting (ADR-007 Phase 5A)
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REPORTING_TOUCHPOINT_REGISTRY,
  countReportingTouchpointsByStatus,
  REPORTING_WRITE_GATEWAY,
} from './reportingTouchpointRegistry.js';
import {
  assertUsesFinancialPnlFunction,
  ReportingInvariantError,
} from '@shared/reporting/index.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('Reporting architecture proof (Gate A partial — 5A)', () => {
  it('A-01 ADR-007 freeze statement exists and is Accepted', () => {
    const adr = readRepo('docs/architecture/REPORTING_ADR.md');
    expect(adr).toMatch(/Freeze financial reporting around declared Single Sources of Truth/i);
    expect(adr).toMatch(/\*\*Status:\*\* Accepted/i);
  });

  it('A-02 registry lists P&L / tax / close / legacy surfaces', () => {
    const ids = new Set(REPORTING_TOUCHPOINT_REGISTRY.map((t) => t.id));
    for (const id of ['RP01', 'RP04', 'RP05', 'RP06', 'RP07', 'RP09', 'RP13']) {
      expect(ids.has(id)).toBe(true);
    }
    expect(countReportingTouchpointsByStatus('NOT_STARTED')).toBe(0);
    expect(REPORTING_WRITE_GATEWAY).toMatch(/ADR-007/);
  });

  it('A-03 every touchpoint has status + owner + proof + class', () => {
    for (const t of REPORTING_TOUCHPOINT_REGISTRY) {
      expect(t.owner.length).toBeGreaterThan(0);
      expect(t.proof.length).toBeGreaterThan(0);
      expect(t.class.length).toBeGreaterThan(0);
    }
  });

  it('A-04 ERP financial P&L route calls fn_get_profit_loss', () => {
    const routes = readRepo('SamplePOS.Server/src/routes/erpAccountingRoutes.ts');
    expect(() => assertUsesFinancialPnlFunction(routes)).not.toThrow();
    expect(routes).toMatch(/fn_get_profit_loss/);
  });

  it('RP04 service P&L uses fn_get_profit_loss* (Phase 5B)', () => {
    const tp = REPORTING_TOUCHPOINT_REGISTRY.find((t) => t.id === 'RP04');
    expect(tp?.class).toBe('FINANCIAL');
    expect(tp?.status).toBe('MIGRATED');
    const svc = readRepo('SamplePOS.Server/src/services/profitLossReportService.ts');
    expect(svc).toMatch(/fn_get_profit_loss/);
    expect(svc).toMatch(/fn_get_profit_loss_summary/);
    expect(svc).not.toMatch(/gl_period_balances/);
  });

  it('RP09 close ReportsLauncher links FINANCIAL/TAX/CLOSE surfaces', () => {
    const tp = REPORTING_TOUCHPOINT_REGISTRY.find((t) => t.id === 'RP09');
    expect(tp?.status).toBe('MIGRATED');
    const ui = readRepo('samplepos.client/src/components/financial-workspace/ReportsLauncher.tsx');
    expect(ui).toMatch(/\/accounting\/profit-loss/);
    expect(ui).toMatch(/\/reports\/tax-compliance/);
    expect(ui).toMatch(/\/accounting\/vat-remittance/);
    expect(ui).toMatch(/\/accounting\/bad-debt/);
    expect(ui).toMatch(/\/inventory\/quarantine/);
    expect(ui).toMatch(/kind:\s*'financial'/);
    expect(ui).toMatch(/kind:\s*'operational'/);
  });

  it('doc pack + shared classifiers exist', () => {
    expect(existsSync(path.join(repoRoot, 'docs/architecture/REPORTING_INVARIANTS.md'))).toBe(true);
    expect(existsSync(path.join(repoRoot, 'docs/architecture/REPORTING_PHASE5_ROADMAP.md'))).toBe(true);
    expect(existsSync(path.join(repoRoot, 'PROOF_REPORTING_CHARTER.md'))).toBe(true);
    expect(existsSync(path.join(repoRoot, 'shared/reporting/index.ts'))).toBe(true);
  });

  it('assertUsesFinancialPnlFunction rejects unrelated text', () => {
    expect(() => assertUsesFinancialPnlFunction('SELECT 1')).toThrow(ReportingInvariantError);
  });
});
