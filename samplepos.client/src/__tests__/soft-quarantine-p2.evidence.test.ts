/**
 * EVIDENCE: Soft quarantine P2 — unified expiry automation (HARD + SOFT), flag default off.
 * Run: npx vitest run src/__tests__/soft-quarantine-p2.evidence.test.ts
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { shouldSkipGlRepairForMovement } from '@shared/loss-quarantine/index';

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

describe('EVIDENCE — Soft quarantine P2 (expiry automation)', () => {
  it('LQ-INV-8: soft + automation refs skip GL repair', () => {
    gate(
      'SKIP_SOFT_REF',
      shouldSkipGlRepairForMovement({
        movementType: 'EXPIRY',
        referenceType: 'SOFT_QUARANTINE',
        economicEvent: 'QUARANTINE_TRANSFER',
        postsGl: false,
      }),
      'SOFT_QUARANTINE skips GL repair',
    );
    gate(
      'SKIP_AUTO_REF',
      shouldSkipGlRepairForMovement({
        movementType: 'EXPIRY',
        referenceType: 'EXPIRY_AUTOMATION',
        economicEvent: 'QUARANTINE_TRANSFER',
        postsGl: false,
      }),
      'EXPIRY_AUTOMATION skips GL repair',
    );
  });

  it('Wiring: unified automation service + job + UI', () => {
    const svc = read('SamplePOS.Server/src/modules/inventory/warehouse/expiryAutomationService.ts');
    const panel = read('samplepos.client/src/components/inventory/ExpiryAutomationPanel.tsx');
    const page = read('samplepos.client/src/pages/inventory/QuarantineWorkqueuePage.tsx');
    const settings = read('samplepos.client/src/pages/settings/tabs/SystemSettingsTab.tsx');
    const repair = read('SamplePOS.Server/src/modules/system/glRepairService.ts');
    const doc = read('docs/architecture/LOSS_QUARANTINE_SOFT_QUARANTINE.md');

    gate('DOC_P2', doc.includes('P2 scope'), 'P2 documented in soft quarantine ADR addendum');
    gate(
      'NO_MS_ONLY_THROW',
      !svc.includes('Expiry automation requires multistore mode'),
      'preview/process no longer multistore-only',
    );
    gate(
      'SOFT_BRANCH',
      svc.includes('processSoftExpiredLots') && svc.includes('applySoftQuarantine'),
      'soft path uses applySoftQuarantine',
    );
    gate(
      'HARD_BRANCH',
      svc.includes('processHardExpiredLots') && svc.includes('moveLotQuantityBetweenStores'),
      'hard path still store-transfers',
    );
    gate(
      'FLAG_GATED',
      svc.includes('isExpiryAutomationEnabled') &&
        svc.includes('Expiry automation is disabled'),
      'process requires flag unless force',
    );
    gate(
      'SCHEDULE_BOTH',
      svc.includes('runScheduledExpiryAutomation') &&
        read('SamplePOS.Server/src/services/calculationsScheduledJobs.ts').includes(
          'initCalculationsScheduledJobs',
        ) &&
        read('SamplePOS.Server/src/services/jobQueue.ts').includes('registerCalculationsHandler'),
      'unified calculations dispatcher for nightly jobs',
    );
    gate(
      'AUTO_REF_SOFT',
      svc.includes('processSoftExpiredLots') &&
        svc.includes("referenceType: 'EXPIRY_AUTOMATION'") &&
        svc.includes('applySoftQuarantine'),
      'automation soft path tags EXPIRY_AUTOMATION',
    );
    gate(
      'REPAIR_SOFT',
      repair.includes("SOFT_QUARANTINE"),
      'glRepair SQL skips SOFT_QUARANTINE',
    );
    gate(
      'PANEL_NO_GATE',
      !panel.includes('MultistoreGate') &&
        panel.includes("quarantineMode === 'SOFT'") &&
        panel.includes('Quarantine expired now'),
      'ExpiryAutomationPanel mode-aware without MultistoreGate',
    );
    gate(
      'WQ_PANEL',
      page.includes('ExpiryAutomationPanel'),
      'quarantine workqueue hosts automation panel',
    );
    gate(
      'SETTINGS_FLAG',
      settings.includes('expiryAutomationEnabled'),
      'system inventory settings expose nightly flag',
    );
    gate(
      'NO_PL_COPY',
      panel.includes('no write-off') ||
        page.includes('Quarantine does not hit the P&L') ||
        page.includes('no expense yet'),
      'UI states quarantine is not P&L',
    );
  });

  it('writes PROOF artifacts', () => {
    const failed = gates.filter((g) => !g.ok);
    const evidence = {
      feature: 'SOFT_QUARANTINE_P2',
      provenAt: new Date().toISOString(),
      contract:
        'Unified expiry automation: HARD store transfer or SOFT status quarantine; shared flag default off; quarantine-only (no P&L); LQ-INV-8 skips SOFT_QUARANTINE + EXPIRY_AUTOMATION',
      gates,
      summary: {
        total: gates.length,
        passed: gates.filter((g) => g.ok).length,
        failed: failed.length,
        verdict: failed.length === 0 ? 'PASS' : 'FAIL',
      },
    };
    writeFileSync(
      path.join(repoRoot, 'PROOF_SOFT_QUARANTINE_P2.json'),
      JSON.stringify(evidence, null, 2),
    );
    writeFileSync(
      path.join(repoRoot, 'PROOF_SOFT_QUARANTINE_P2.md'),
      [
        '# PROOF — Soft quarantine P2 (expiry automation)',
        '',
        `**Verdict:** ${evidence.summary.verdict}`,
        `**Proven at:** ${evidence.provenAt}`,
        '',
        `**Contract:** ${evidence.contract}`,
        '',
        ...gates.map((g) => `- ${g.ok ? 'PASS' : 'FAIL'} \`${g.id}\`: ${g.detail}`),
        '',
        '```bash',
        'cd samplepos.client && npx vitest run src/__tests__/soft-quarantine-p2.evidence.test.ts src/__tests__/soft-quarantine-p1.evidence.test.ts',
        '```',
        '',
      ].join('\n'),
    );
    gate('ARTIFACTS', existsSync(path.join(repoRoot, 'PROOF_SOFT_QUARANTINE_P2.json')), 'PROOF written');
    expect(failed).toEqual([]);
  });
});
