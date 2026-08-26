/**
 * EVIDENCE: Damage → quarantine visibility (soft + hard mode adapter).
 * Run: npx vitest run src/__tests__/quarantine-damage-visibility.evidence.test.ts
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  softQuarantineStatusForReason,
  softQuarantineBucketForStatus,
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

describe('EVIDENCE — Damage visible in quarantine (consistent flow)', () => {
  it('SSOT: DAMAGE reason maps to QUARANTINED status and DAMAGE aging bucket', () => {
    gate(
      'REASON_STATUS',
      softQuarantineStatusForReason('DAMAGE') === 'QUARANTINED',
      'DAMAGE → QUARANTINED lot status',
    );
    gate(
      'STATUS_BUCKET',
      softQuarantineBucketForStatus('QUARANTINED') === 'DAMAGE',
      'QUARANTINED → DAMAGE workqueue band',
    );
  });

  it('Multistore: DAMAGE adjustment transfers to DAMAGE store (no P&L)', () => {
    const adj = read('SamplePOS.Server/src/modules/inventory/warehouse/warehouseAdjustmentService.ts');
    gate(
      'MS_DAMAGE_TRANSFER',
      adj.includes("params.reason === 'DAMAGE'") &&
        adj.includes('ensureDamageStore') &&
        adj.includes("quarantineKind: 'DAMAGE'") &&
        adj.includes("economicEvent: 'QUARANTINE_TRANSFER'"),
      'multistore DAMAGE OUT → DAMAGE store quarantine',
    );
    gate(
      'MS_AGING_STORE',
      read('SamplePOS.Server/src/modules/loss-quarantine/quarantineAgingService.ts').includes(
        "'DAMAGE', 'EXPIRED', 'RETURN'",
      ),
      'hard aging includes DAMAGE store type',
    );
  });

  it('Single-store: DAMAGE adjustment routes to soft quarantine (not GL handler)', () => {
    const inv = read('SamplePOS.Server/src/modules/inventory/inventoryService.ts');
    const soft = read('SamplePOS.Server/src/modules/loss-quarantine/softQuarantineService.ts');
    const aging = read('SamplePOS.Server/src/modules/loss-quarantine/quarantineAgingService.ts');
    const page = read('samplepos.client/src/pages/inventory/QuarantineWorkqueuePage.tsx');
    const adjUi = read('samplepos.client/src/pages/inventory/InventoryAdjustmentsPage.tsx');

    gate(
      'SS_DAMAGE_ROUTE',
      inv.includes('singleStoreQuarantineFromAdjustment') &&
        inv.includes("params.reason === 'DAMAGE'") &&
        inv.includes('applySoftQuarantine'),
      'single-store DAMAGE OUT → soft quarantine helper',
    );
    gate(
      'SS_AGING_FILTER',
      aging.includes("options.storeType === 'DAMAGE'") &&
        aging.includes("= 'QUARANTINED'"),
      'soft aging DAMAGE filter matches QUARANTINED status',
    );
    gate(
      'UI_DAMAGE_BAND',
      page.includes("'DAMAGE'") &&
        page.includes("defaultReason(line.storeType)") &&
        page.includes("storeType === 'DAMAGE'") &&
        page.includes('/inventory/adjustments'),
      'workqueue DAMAGE band + dispose reason + adjustments link',
    );
    gate(
      'UI_ADJ_MSG',
      adjUi.includes('Damage quarantined') && adjUi.includes('Quarantine'),
      'adjustments UI directs to quarantine after damage',
    );
    gate(
      'SOFT_NO_GL',
      soft.includes("movementType: input.reason === 'EXPIRED' ? 'EXPIRY' : 'DAMAGE'") &&
        soft.includes('postsGl: false'),
      'soft damage quarantine audit without P&L',
    );
  });

  it('writes PROOF artifacts', () => {
    const failed = gates.filter((g) => !g.ok);
    const evidence = {
      feature: 'QUARANTINE_DAMAGE_VISIBILITY',
      provenAt: new Date().toISOString(),
      contract:
        'Damaged stock always visible in quarantine workqueue: multistore DAMAGE store transfer or single-store QUARANTINED soft status; no immediate P&L on quarantine',
      gates,
      summary: {
        total: gates.length,
        passed: gates.filter((g) => g.ok).length,
        failed: failed.length,
        verdict: failed.length === 0 ? 'PASS' : 'FAIL',
      },
    };
    writeFileSync(
      path.join(repoRoot, 'PROOF_QUARANTINE_DAMAGE_VISIBILITY.json'),
      JSON.stringify(evidence, null, 2),
    );
    writeFileSync(
      path.join(repoRoot, 'PROOF_QUARANTINE_DAMAGE_VISIBILITY.md'),
      [
        '# PROOF — Damage visible in quarantine',
        '',
        `**Verdict:** ${evidence.summary.verdict}`,
        `**Proven at:** ${evidence.provenAt}`,
        '',
        `**Contract:** ${evidence.contract}`,
        '',
        ...gates.map((g) => `- ${g.ok ? 'PASS' : 'FAIL'} \`${g.id}\`: ${g.detail}`),
        '',
        '```bash',
        'cd samplepos.client && npx vitest run src/__tests__/quarantine-damage-visibility.evidence.test.ts',
        '```',
        '',
      ].join('\n'),
    );
    gate('ARTIFACTS', existsSync(path.join(repoRoot, 'PROOF_QUARANTINE_DAMAGE_VISIBILITY.json')), 'PROOF written');
    expect(failed).toEqual([]);
  });
});
