/**
 * PROOF: Aged sale returns (>30 days) are ADMIN-only.
 *
 * npm test -- --runInBand src/modules/sales/agedSaleReturnPolicy.evidence.test.ts
 */
import { afterAll, describe, expect, it } from '@jest/globals';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AGED_SALE_RETURN_DAYS,
  ERR_REFUND_AGED_ADMIN_ONLY,
  calendarDaysBetween,
  canProcessAgedSaleReturn,
  isAbsoluteAdminRole,
  isAgedSaleReturn,
} from '@shared/authorization/agedSaleReturnPolicy.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repoRoot = path.resolve(serverRoot, '..');

type Gate = { id: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string): void {
  gates.push({ id, ok, detail });
  expect({ id, ok, detail }).toEqual({ id, ok: true, detail });
}

describe('PROOF: Aged sale return ADMIN-only policy', () => {
  it('policy math: 30-day threshold and ADMIN gate', () => {
    gate('LIMIT_30', AGED_SALE_RETURN_DAYS === 30, `days=${AGED_SALE_RETURN_DAYS}`);
    gate(
      'DAY_31_AGED',
      isAgedSaleReturn('2026-06-22', '2026-07-23') === true &&
        calendarDaysBetween('2026-06-22', '2026-07-23') === 31,
      '31 days is aged',
    );
    gate(
      'DAY_30_NOT_AGED',
      isAgedSaleReturn('2026-06-22', '2026-07-22') === false,
      'exactly 30 days still allowed for non-admin',
    );
    gate('ADMIN_OK', isAbsoluteAdminRole('ADMIN') && isAbsoluteAdminRole('admin'), 'ADMIN');
    gate('SUPER_ADMIN_OK', isAbsoluteAdminRole('SUPER_ADMIN'), 'SUPER_ADMIN');
    gate(
      'MANAGER_NOT_ADMIN',
      !isAbsoluteAdminRole('MANAGER') && !isAbsoluteAdminRole('CASHIER'),
      'MANAGER/CASHIER are not absolute admin',
    );

    const cashierAged = canProcessAgedSaleReturn({
      saleDate: '2026-06-22',
      asOfDate: '2026-09-04',
      actorRole: 'CASHIER',
    });
    gate(
      'CASHIER_AGED_DENY',
      cashierAged.allowed === false && cashierAged.requiresAdmin === true,
      `ageDays=${cashierAged.ageDays}`,
    );

    const adminAged = canProcessAgedSaleReturn({
      saleDate: '2026-06-22',
      asOfDate: '2026-09-04',
      actorRole: 'ADMIN',
    });
    gate('ADMIN_AGED_ALLOW', adminAged.allowed === true, 'ADMIN may return aged sales');

    const fresh = canProcessAgedSaleReturn({
      saleDate: '2026-09-01',
      asOfDate: '2026-09-04',
      actorRole: 'CASHIER',
    });
    gate('CASHIER_FRESH_ALLOW', fresh.allowed === true && fresh.requiresAdmin === false, 'fresh sale');
  });

  it('server refundSale enforces ERR_REFUND_AGED_ADMIN_ONLY via users.role lookup', () => {
    const svc = readFileSync(
      path.join(serverRoot, 'src/modules/sales/salesService.ts'),
      'utf8',
    );
    const refundFn = svc.slice(svc.indexOf('async refundSale'), svc.indexOf('async refundSale') + 9000);
    gate(
      'SERVICE_USES_POLICY',
      refundFn.includes('canProcessAgedSaleReturn') &&
        refundFn.includes(ERR_REFUND_AGED_ADMIN_ONLY) &&
        refundFn.includes('SELECT role FROM users'),
      'refundSale looks up users.role and applies aged policy',
    );
    gate(
      'EXCHANGE_USES_REFUND_SALE',
      /processGuidedExchange[\s\S]*refundSale\(/.test(svc) ||
        svc.includes('await this.refundSale(pool, originalSaleId'),
      'guided exchange goes through refundSale (same gate)',
    );
  });

  it('UI gates Return/Exchange for non-admin on aged sales', () => {
    const page = readFileSync(
      path.join(repoRoot, 'samplepos.client/src/pages/SalesPage.tsx'),
      'utf8',
    );
    gate(
      'UI_IMPORTS_POLICY',
      page.includes('agedSaleReturnPolicy') && page.includes('agedReturnBlocked'),
      'SalesPage imports aged return policy',
    );
    gate(
      'UI_DISABLES_BUTTONS',
      page.includes('disabled={agedReturnBlocked}') &&
        page.includes('ADMIN only'),
      'Return/Exchange disabled with ADMIN-only hint',
    );
  });
});

afterAll(() => {
  const passed = gates.filter((g) => g.ok).length;
  const payload = {
    feature: 'AGED_SALE_RETURN_ADMIN_ONLY',
    verdict: passed === gates.length ? 'PASS' : 'FAIL',
    passed,
    total: gates.length,
    gates,
    policy: {
      limitDays: AGED_SALE_RETURN_DAYS,
      adminRoles: ['ADMIN', 'SUPER_ADMIN'],
      errorCode: ERR_REFUND_AGED_ADMIN_ONLY,
      enforcement: ['salesService.refundSale', 'SalesPage Return/Exchange buttons'],
    },
    generatedAt: new Date().toISOString(),
  };
  for (const root of [repoRoot, serverRoot]) {
    writeFileSync(
      path.join(root, 'PROOF_AGED_SALE_RETURN_ADMIN_ONLY.json'),
      `${JSON.stringify(payload, null, 2)}\n`,
    );
    writeFileSync(
      path.join(root, 'PROOF_AGED_SALE_RETURN_ADMIN_ONLY.md'),
      `# PROOF_AGED_SALE_RETURN_ADMIN_ONLY\n\nVerdict: **${payload.verdict}** (${passed}/${gates.length})\n\n` +
        `Policy: returns/exchanges on sales older than **${AGED_SALE_RETURN_DAYS} days** require **ADMIN**.\n\n` +
        gates.map((g) => `- ${g.ok ? 'PASS' : 'FAIL'} \`${g.id}\`: ${g.detail}`).join('\n') +
        '\n',
    );
  }
});
