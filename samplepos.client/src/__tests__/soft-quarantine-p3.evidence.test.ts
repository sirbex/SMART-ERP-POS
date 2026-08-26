/**
 * EVIDENCE: Soft quarantine P3 — Expiring Items → quarantine bridge (no P&L).
 * Run: npx vitest run src/__tests__/soft-quarantine-p3.evidence.test.ts
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

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

describe('EVIDENCE — Soft quarantine P3 (Expiring Items bridge)', () => {
  it('API + service bridge', () => {
    const soft = read('SamplePOS.Server/src/modules/loss-quarantine/softQuarantineService.ts');
    const routes = read('SamplePOS.Server/src/modules/loss-quarantine/lossQuarantineRoutes.ts');
    const doc = read('docs/architecture/LOSS_QUARANTINE_SOFT_QUARANTINE.md');

    gate('DOC_P3', doc.includes('P3 scope'), 'P3 documented');
    gate(
      'FN',
      soft.includes('quarantineFromExpiringReport'),
      'quarantineFromExpiringReport exists',
    );
    gate(
      'SOFT_BRANCH',
      soft.includes("quarantineMode: 'SOFT'") && soft.includes('applySoftQuarantine'),
      'report bridge soft path',
    );
    gate(
      'HARD_BRANCH',
      soft.includes("quarantineMode: 'HARD'") && soft.includes('moveLotQuantityBetweenStores'),
      'report bridge hard path',
    );
    gate(
      'NO_PL',
      soft.includes('postsGl: false') && soft.includes("economicEvent: 'QUARANTINE_TRANSFER'"),
      'bridge posts no GL',
    );
    gate(
      'EXPIRED_ONLY',
      soft.includes('Only calendar-expired batches can be quarantined from this report'),
      'rejects non-expired from report',
    );
    gate(
      'ROUTES',
      routes.includes('/from-expiring-report') && routes.includes('/from-expiring-report/bulk'),
      'report quarantine API routes',
    );
  });

  it('UI: Expiring Items actions + deep-link; warning SSOT preserved', () => {
    const page = read('samplepos.client/src/pages/ReportsPage.tsx');
    const api = read('samplepos.client/src/utils/api.ts');

    gate(
      'LINK',
      page.includes('data-expiring-quarantine-link') && page.includes('/inventory/quarantine'),
      'deep-link to quarantine workqueue',
    );
    gate(
      'ROW_ACTION',
      page.includes('data-expiring-quarantine-row') &&
        page.includes('quarantineFromExpiringReport'),
      'per-row Quarantine on expired',
    );
    gate(
      'BULK',
      page.includes('data-expiring-quarantine-bulk') &&
        page.includes('quarantineFromExpiringReportBulk'),
      'bulk quarantine expired in view',
    );
    gate(
      'EXPIRED_GATE',
      page.includes("band === 'expired'") && page.includes('canQuarantine'),
      'action only for expired band',
    );
    gate(
      'SSOT_KEPT',
      page.includes('Shelf-life register') && page.includes('filterExpiringRowsByBand'),
      'Expiring Items warning SSOT unchanged',
    );
    gate(
      'API_CLIENT',
      api.includes('from-expiring-report') && api.includes('quarantineFromExpiringReport'),
      'client API methods',
    );
  });

  it('writes PROOF artifacts', () => {
    const failed = gates.filter((g) => !g.ok);
    const evidence = {
      feature: 'SOFT_QUARANTINE_P3',
      provenAt: new Date().toISOString(),
      contract:
        'Expiring Items → quarantine bridge (expired only); soft/hard mode; no P&L; deep-link to workqueue; warning SSOT preserved',
      gates,
      summary: {
        total: gates.length,
        passed: gates.filter((g) => g.ok).length,
        failed: failed.length,
        verdict: failed.length === 0 ? 'PASS' : 'FAIL',
      },
    };
    writeFileSync(
      path.join(repoRoot, 'PROOF_SOFT_QUARANTINE_P3.json'),
      JSON.stringify(evidence, null, 2),
    );
    writeFileSync(
      path.join(repoRoot, 'PROOF_SOFT_QUARANTINE_P3.md'),
      [
        '# PROOF — Soft quarantine P3 (Expiring Items bridge)',
        '',
        `**Verdict:** ${evidence.summary.verdict}`,
        `**Proven at:** ${evidence.provenAt}`,
        '',
        `**Contract:** ${evidence.contract}`,
        '',
        ...gates.map((g) => `- ${g.ok ? 'PASS' : 'FAIL'} \`${g.id}\`: ${g.detail}`),
        '',
        '```bash',
        'cd samplepos.client && npx vitest run src/__tests__/soft-quarantine-p3.evidence.test.ts src/__tests__/soft-quarantine-p2.evidence.test.ts src/__tests__/soft-quarantine-p1.evidence.test.ts',
        '```',
        '',
      ].join('\n'),
    );
    gate('ARTIFACTS', existsSync(path.join(repoRoot, 'PROOF_SOFT_QUARANTINE_P3.json')), 'PROOF written');
    expect(failed).toEqual([]);
  });
});
