/**
 * EVIDENCE: Every report surface exposes a Back to Reports control (SSOT ReportBackLink).
 * Run: npx vitest run src/__tests__/report-back-link.evidence.test.ts
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
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

function collectTsx(dirRel: string): string[] {
  const abs = path.join(repoRoot, dirRel);
  const out: string[] = [];
  for (const name of readdirSync(abs)) {
    const full = path.join(abs, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectTsx(path.join(dirRel, name).replace(/\\/g, '/')));
    } else if (name.endsWith('.tsx') && name.endsWith('Page.tsx')) {
      out.push(path.join(dirRel, name).replace(/\\/g, '/'));
    }
  }
  return out;
}

describe('EVIDENCE — Report back button SSOT', () => {
  it('ReportBackLink component + AdaptivePage backLink slot', () => {
    const link = read('samplepos.client/src/components/reports/ReportBackLink.tsx');
    const page = read('samplepos.client/src/components/adaptive/AdaptivePage.tsx');
    gate('HAS_COMPONENT', link.includes('data-report-back') && link.includes('Back to Reports'), 'ReportBackLink exists');
    gate('ADAPTIVE_SLOT', page.includes('backLink') && page.includes('data-adaptive-page-back'), 'AdaptivePage renders backLink');
  });

  it('Reports hub: params + results use ReportBackLink', () => {
    const hub = read('samplepos.client/src/pages/ReportsPage.tsx');
    gate('HUB_IMPORT', hub.includes("from '../components/reports/ReportBackLink'"), 'ReportsPage imports ReportBackLink');
    const backCount = (hub.match(/<ReportBackLink/g) || []).length;
    gate('HUB_USES', backCount >= 2, `ReportsPage uses ReportBackLink (${backCount}×)`);
  });

  it('every dedicated report page has ReportBackLink or data-report-back', () => {
    const pages = collectTsx('samplepos.client/src/pages/reports');
    gate('PAGES_FOUND', pages.length >= 10, `found ${pages.length} report pages`);
    const missing: string[] = [];
    for (const rel of pages) {
      const src = read(rel);
      if (!src.includes('ReportBackLink') && !src.includes('data-report-back')) {
        missing.push(rel);
      }
    }
    gate(
      'ALL_PAGES_BACK',
      missing.length === 0,
      missing.length === 0 ? `${pages.length} pages have back` : `missing: ${missing.join(', ')}`,
    );
  });

  it('writes PROOF artifacts', () => {
    const failed = gates.filter((g) => !g.ok);
    const evidence = {
      feature: 'REPORT_BACK_LINK_SSOT',
      provenAt: new Date().toISOString(),
      contract: 'Every report surface has Back to Reports via ReportBackLink',
      gates,
      summary: {
        total: gates.length,
        passed: gates.filter((g) => g.ok).length,
        failed: failed.length,
        verdict: failed.length === 0 ? 'PASS' : 'FAIL',
      },
    };
    writeFileSync(
      path.join(repoRoot, 'PROOF_REPORT_BACK_LINK.json'),
      JSON.stringify(evidence, null, 2),
    );
    writeFileSync(
      path.join(repoRoot, 'PROOF_REPORT_BACK_LINK.md'),
      [
        '# PROOF — Report back button SSOT',
        '',
        `**Verdict:** ${evidence.summary.verdict}`,
        `**Proven at:** ${evidence.provenAt}`,
        '',
        `**Contract:** ${evidence.contract}`,
        '',
        ...gates.map((g) => `- ${g.ok ? 'PASS' : 'FAIL'} \`${g.id}\`: ${g.detail}`),
        '',
        '```bash',
        'cd samplepos.client && npx vitest run src/__tests__/report-back-link.evidence.test.ts',
        '```',
        '',
      ].join('\n'),
    );
    gate('ARTIFACTS', true, 'PROOF_REPORT_BACK_LINK written');
    expect(failed).toEqual([]);
  });
});
