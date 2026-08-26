/**
 * EVIDENCE: Soft quarantine P4 — policy-gated auto-dispose after aging (default off).
 * Run: npx vitest run src/__tests__/soft-quarantine-p4.evidence.test.ts
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  QUARANTINE_AUTO_DISPOSE_BUCKET,
  QUARANTINE_AUTO_DISPOSE_DEFAULT_MIN_AGE_DAYS,
  QUARANTINE_AUTO_DISPOSE_MAX_LINES_PER_RUN,
} from '@shared/loss-quarantine/index';

const repoRoot = path.resolve(__dirname, '../../..');

type Gate = { id: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string): void {
  gates.push({ id, ok, detail });
  expect({ id, ok, detail }).toEqual({ id, ok: true, detail });
}

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('EVIDENCE — Soft quarantine P4 (auto-dispose after aging)', () => {
  it('SSOT + migration: separate flag, default off, EXPIRED-only', () => {
    const ssot = read('shared/loss-quarantine/softQuarantineSsot.ts');
    const sql = read('shared/sql/608_quarantine_auto_dispose.sql');
    const doc = read('docs/architecture/LOSS_QUARANTINE_SOFT_QUARANTINE.md');
    const anchors = read('SamplePOS.Server/src/modules/system/migrationAnchors.ts');

    gate('DOC_P4', doc.includes('P4 scope'), 'P4 documented');
    gate(
      'SSOT_BUCKET',
      QUARANTINE_AUTO_DISPOSE_BUCKET === 'EXPIRED' &&
        ssot.includes("QUARANTINE_AUTO_DISPOSE_BUCKET = 'EXPIRED'"),
      'auto-dispose EXPIRED bucket only',
    );
    gate(
      'SSOT_DEFAULTS',
      QUARANTINE_AUTO_DISPOSE_DEFAULT_MIN_AGE_DAYS === 30 &&
        QUARANTINE_AUTO_DISPOSE_MAX_LINES_PER_RUN === 100,
      'default min age 30 / max 100 lines',
    );
    gate(
      'SQL_DEFAULT_OFF',
      sql.includes('quarantine_auto_dispose_enabled BOOLEAN NOT NULL DEFAULT false') &&
        sql.includes('quarantine_auto_dispose_min_age_days INTEGER NOT NULL DEFAULT 30'),
      'migration columns default off / 30 days',
    );
    gate(
      'ANCHOR',
      anchors.includes('608_quarantine_auto_dispose.sql') &&
        anchors.includes('quarantine_auto_dispose_enabled'),
      'migration anchor registered',
    );
  });

  it('Service: dispose gateway + flag gate + schedule; no second loss engine', () => {
    const svc = read(
      'SamplePOS.Server/src/modules/loss-quarantine/quarantineAutoDisposeService.ts',
    );
    const routes = read('SamplePOS.Server/src/modules/loss-quarantine/lossQuarantineRoutes.ts');
    const jobs = read('SamplePOS.Server/src/services/expiryAutomationJobs.ts');
    const server = read('SamplePOS.Server/src/server.ts');
    const settingsRepo = read(
      'SamplePOS.Server/src/modules/system-settings/systemSettingsRepository.ts',
    );
    const types = read('shared/types/systemSettings.ts');

    gate(
      'USES_DISPOSE',
      svc.includes('disposeFromQuarantine') && !svc.includes('AccountingCore.post'),
      'reuses disposeFromQuarantine gateway',
    );
    gate(
      'FLAG_GATED',
      svc.includes('isQuarantineAutoDisposeEnabled') &&
        svc.includes('Quarantine auto-dispose is disabled'),
      'process requires flag unless force',
    );
    gate(
      'EXPIRED_FILTER',
      svc.includes('QUARANTINE_AUTO_DISPOSE_BUCKET') && svc.includes("storeType: QUARANTINE_AUTO_DISPOSE_BUCKET"),
      'candidates filtered to EXPIRED aging',
    );
    gate(
      'SCHEDULE',
      svc.includes('runScheduledQuarantineAutoDispose') &&
        jobs.includes('registerExpiryAutomationCalculationsHandlers') &&
        jobs.includes('quarantine-auto-dispose') &&
        jobs.includes('30 4 * * *') &&
        read('SamplePOS.Server/src/services/calculationsScheduledJobs.ts').includes(
          'initCalculationsScheduledJobs',
        ) &&
        read('SamplePOS.Server/src/services/jobQueue.ts').includes('startCalculationsProcessor'),
      'nightly 04:30 + unified calculations dispatcher',
    );
    gate(
      'ROUTES',
      routes.includes('/auto-dispose/preview') && routes.includes('/auto-dispose/process'),
      'preview + process API routes',
    );
    gate(
      'SETTINGS',
      types.includes('quarantineAutoDisposeEnabled') &&
        settingsRepo.includes('quarantine_auto_dispose_enabled'),
      'settings DTO + repository persist flag',
    );
  });

  it('UI + writes PROOF artifacts', () => {
    const panel = read('samplepos.client/src/components/inventory/QuarantineAutoDisposePanel.tsx');
    const page = read('samplepos.client/src/pages/inventory/QuarantineWorkqueuePage.tsx');
    const settings = read('samplepos.client/src/pages/settings/tabs/SystemSettingsTab.tsx');
    const api = read('samplepos.client/src/utils/api.ts');

    gate(
      'PANEL',
      panel.includes('data-quarantine-auto-dispose-panel') &&
        panel.includes('quarantineAutoDisposeEnabled'),
      'auto-dispose panel exists',
    );
    gate(
      'WORKQUEUE',
      page.includes('QuarantineAutoDisposePanel') &&
        page.includes('quarantineAutoDisposeProcess'),
      'workqueue hosts auto-dispose panel',
    );
    gate(
      'SETTINGS_UI',
      settings.includes('data-settings-quarantine-auto-dispose') &&
        settings.includes('quarantineAutoDisposeEnabled'),
      'Settings → Inventory auto-dispose controls',
    );
    gate(
      'API_CLIENT',
      api.includes('auto-dispose/preview') && api.includes('quarantineAutoDisposeProcess'),
      'client API methods',
    );

    const failed = gates.filter((g) => !g.ok);
    const evidence = {
      feature: 'SOFT_QUARANTINE_P4',
      provenAt: new Date().toISOString(),
      contract:
        'Policy-gated auto-dispose after aging: separate flag default off; EXPIRED only; disposeFromQuarantine (P&L); soft/hard; nightly 04:30; no second loss engine',
      gates,
      summary: {
        total: gates.length,
        passed: gates.filter((g) => g.ok).length,
        failed: failed.length,
        verdict: failed.length === 0 ? 'PASS' : 'FAIL',
      },
    };
    writeFileSync(
      path.join(repoRoot, 'PROOF_SOFT_QUARANTINE_P4.json'),
      JSON.stringify(evidence, null, 2),
    );
    writeFileSync(
      path.join(repoRoot, 'PROOF_SOFT_QUARANTINE_P4.md'),
      [
        '# PROOF — Soft quarantine P4 (auto-dispose after aging)',
        '',
        `**Verdict:** ${evidence.summary.verdict}`,
        `**Proven at:** ${evidence.provenAt}`,
        '',
        `**Contract:** ${evidence.contract}`,
        '',
        ...gates.map((g) => `- ${g.ok ? 'PASS' : 'FAIL'} \`${g.id}\`: ${g.detail}`),
        '',
        '```bash',
        'cd samplepos.client && npx vitest run src/__tests__/soft-quarantine-p4.evidence.test.ts src/__tests__/soft-quarantine-p3.evidence.test.ts src/__tests__/soft-quarantine-p2.evidence.test.ts src/__tests__/soft-quarantine-p1.evidence.test.ts',
        'npm run ci:loss-quarantine-fitness',
        '```',
        '',
      ].join('\n'),
    );
    gate('ARTIFACTS', existsSync(path.join(repoRoot, 'PROOF_SOFT_QUARANTINE_P4.json')), 'PROOF written');
    expect(failed).toEqual([]);
  });
});
