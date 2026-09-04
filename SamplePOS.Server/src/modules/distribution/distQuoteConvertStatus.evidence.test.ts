/**
 * PROOF: Distribution from-quotation status SSOT matches POS convertible set.
 * DRAFT wholesale quotes must convert (Henber Q-2026-0299 incident).
 *
 * npm test -- --runInBand src/modules/distribution/distQuoteConvertStatus.evidence.test.ts
 */
import { afterAll, describe, expect, it } from '@jest/globals';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { POS_CONVERTIBLE_QUOTE_STATUSES } from '../sales/quoteConvertibilityGuard.js';
import { isQuoteConvertibleFrom } from '@shared/types/quotation.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repoRoot = path.resolve(serverRoot, '..');

type Gate = { id: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string): void {
  gates.push({ id, ok, detail });
  expect({ id, ok, detail }).toEqual({ id, ok: true, detail });
}

describe('PROOF: dist convertFromQuotation status SSOT', () => {
  it('allows DRAFT/SENT/ACCEPTED — same as POS', () => {
    gate(
      'POS_SET',
      POS_CONVERTIBLE_QUOTE_STATUSES.join(',') === 'DRAFT,SENT,ACCEPTED',
      [...POS_CONVERTIBLE_QUOTE_STATUSES].join(','),
    );
    gate(
      'UI_DRAFT_CONVERTIBLE',
      isQuoteConvertibleFrom({
        status: 'DRAFT',
        validUntil: '2099-12-31',
        convertedToSaleId: null,
      }) === true,
      'UI shows Convert for DRAFT',
    );
  });

  it('distService uses POS_CONVERTIBLE_QUOTE_STATUSES (includes DRAFT)', () => {
    const src = readFileSync(
      path.join(serverRoot, 'src/modules/distribution/distService.ts'),
      'utf8',
    );
    const fn = src.slice(
      src.indexOf('export async function convertFromQuotation'),
      src.indexOf('export async function convertFromQuotation') + 3500,
    );
    gate(
      'USES_POS_SET',
      fn.includes('POS_CONVERTIBLE_QUOTE_STATUSES') &&
        fn.includes('ERR_DIST_QUOTE_STATUS'),
      'convertFromQuotation shares POS convertible statuses',
    );
    gate(
      'NO_DRAFT_BLOCK',
      !fn.includes("status !== 'ACCEPTED' && quotation.status !== 'SENT'") &&
        !/Only ACCEPTED or SENT/.test(fn),
      'no longer blocks DRAFT-only path',
    );
    gate(
      'ALLOWS_DRAFT_MSG',
      fn.includes('DRAFT, SENT, or ACCEPTED'),
      'error message lists DRAFT',
    );
  });
});

afterAll(() => {
  const passed = gates.filter((g) => g.ok).length;
  const payload = {
    feature: 'DIST_QUOTE_CONVERT_STATUS_SSOT',
    verdict: passed === gates.length ? 'PASS' : 'FAIL',
    passed,
    total: gates.length,
    gates,
    incident: {
      tenant: 'henber.wizarddigital-inv.com',
      quotationId: '2e9de83f-bcc0-4655-999a-e3594a9cab96',
      quoteNumber: 'Q-2026-0299',
      status: 'DRAFT',
      fulfillmentMode: 'WHOLESALE',
      error: 'ERR_DIST_QUOTE_STATUS',
      cause: 'dist convert required ACCEPTED|SENT while UI/POS allow DRAFT',
      fix: 'convertFromQuotation uses POS_CONVERTIBLE_QUOTE_STATUSES (DRAFT|SENT|ACCEPTED)',
    },
    generatedAt: new Date().toISOString(),
  };
  for (const root of [repoRoot, serverRoot]) {
    writeFileSync(
      path.join(root, 'PROOF_DIST_QUOTE_CONVERT_STATUS_SSOT.json'),
      `${JSON.stringify(payload, null, 2)}\n`,
    );
    writeFileSync(
      path.join(root, 'PROOF_DIST_QUOTE_CONVERT_STATUS_SSOT.md'),
      `# PROOF_DIST_QUOTE_CONVERT_STATUS_SSOT\n\nVerdict: **${payload.verdict}** (${passed}/${gates.length})\n\n` +
        gates.map((g) => `- ${g.ok ? 'PASS' : 'FAIL'} \`${g.id}\`: ${g.detail}`).join('\n') +
        `\n\n## Incident\n\n- ${payload.incident.quoteNumber} (${payload.incident.status}) → ${payload.incident.error}\n- Fix: ${payload.incident.fix}\n`,
    );
  }
});
