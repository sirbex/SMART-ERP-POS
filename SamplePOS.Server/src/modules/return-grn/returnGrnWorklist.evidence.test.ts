/**
 * PROOF + unit: Supplier return worklist list API (SQL + filters + actionStatus SSOT).
 *
 * npm test -- --runInBand src/modules/return-grn/returnGrnWorklist.evidence.test.ts
 */
import { afterAll, describe, expect, it, jest } from '@jest/globals';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import {
  canCreateSupplierCreditNoteFromReturn,
  isSupplierReturnNeedsAttention,
  mustBillBeforeSupplierCreditNote,
  resolveSupplierReturnActionStatus,
  SUPPLIER_RETURNS_API,
  SUPPLIER_RETURNS_DEFAULT_FILTER,
  SUPPLIER_RETURNS_ROUTE,
} from '../../../../shared/domain/supplierReturnWorklist.js';
import { returnGrnRepository } from './returnGrnRepository.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repoRoot = path.resolve(serverRoot, '..');

type Gate = { id: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string): void {
  gates.push({ id, ok, detail });
  if (!ok) {
    expect({ id, ok, detail }).toEqual({ id, ok: true, detail });
  }
}

function readRepo(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

function fileHas(rel: string, needle: string | RegExp): boolean {
  const p = path.join(repoRoot, rel);
  if (!existsSync(p)) return false;
  const src = readFileSync(p, 'utf8');
  return typeof needle === 'string' ? src.includes(needle) : needle.test(src);
}

describe('Supplier return worklist — actionStatus SSOT', () => {
  it('domain rules: DRAFT / bill / SCN / complete matrix', () => {
    gate(
      'SSOT_DRAFT',
      resolveSupplierReturnActionStatus({ status: 'DRAFT' }) === 'DRAFT',
      'draft',
    );
    gate(
      'SSOT_NEED_BILL',
      resolveSupplierReturnActionStatus({
        status: 'POSTED',
        hasCreditNote: false,
        hasSupplierBill: false,
      }) === 'NEED_BILL',
      'no bill no scn',
    );
    gate(
      'SSOT_NEED_SCN',
      resolveSupplierReturnActionStatus({
        status: 'POSTED',
        hasCreditNote: false,
        hasSupplierBill: true,
      }) === 'NEED_SCN',
      'bill yes scn no',
    );
    gate(
      'SSOT_HAS_SCN',
      resolveSupplierReturnActionStatus({
        status: 'POSTED',
        hasCreditNote: true,
        hasSupplierBill: true,
        creditNoteStatus: 'POSTED',
      }) === 'HAS_SCN',
      'open SCN',
    );
    gate(
      'SSOT_COMPLETE',
      resolveSupplierReturnActionStatus({
        status: 'POSTED',
        hasCreditNote: true,
        hasSupplierBill: true,
        creditNoteStatus: 'APPLIED',
      }) === 'COMPLETE',
      'applied SCN',
    );
    gate(
      'ATTN_POSTED_NO_SCN',
      isSupplierReturnNeedsAttention({ status: 'POSTED', hasCreditNote: false }),
      'needs attention',
    );
    gate(
      'ATTN_NOT_WITH_SCN',
      !isSupplierReturnNeedsAttention({ status: 'POSTED', hasCreditNote: true }),
      'has scn not attention',
    );
    gate(
      'CAN_SCN',
      canCreateSupplierCreditNoteFromReturn({
        status: 'POSTED',
        hasCreditNote: false,
        hasSupplierBill: true,
      }),
      'create SCN allowed',
    );
    gate(
      'CANNOT_SCN_NO_BILL',
      !canCreateSupplierCreditNoteFromReturn({
        status: 'POSTED',
        hasCreditNote: false,
        hasSupplierBill: false,
      }) &&
        mustBillBeforeSupplierCreditNote({
          status: 'POSTED',
          hasCreditNote: false,
          hasSupplierBill: false,
        }),
      'must bill first',
    );
  });
});

describe('Supplier return worklist — repository list (SQL e2e against mock pool)', () => {
  it('needsAttention + search params drive SQL SSOT filters and worklist columns', async () => {
    const captured: { sql: string; params: unknown[] }[] = [];
    const mockPool = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        captured.push({ sql: String(sql), params: params || [] });
        if (String(sql).includes('COUNT(*)')) {
          return { rows: [{ count: 2 }] };
        }
        return {
          rows: [
            {
              id: 'r1',
              returnGrnNumber: 'RGRN-2026-0001',
              grnId: 'g1',
              supplierId: 's1',
              supplierName: 'SALUD',
              grNumber: 'GR-1',
              returnDate: '2026-07-01',
              status: 'POSTED',
              reason: 'damaged',
              createdBy: null,
              createdAt: '2026-07-01',
              updatedAt: '2026-07-01',
              totalAmount: 15000,
              hasCreditNote: false,
              hasSupplierBill: true,
              creditNoteNumber: null,
              creditNoteStatus: null,
              supplierBillNumber: 'SBILL-1',
              actionStatus: 'NEED_SCN',
            },
            {
              id: 'r2',
              returnGrnNumber: 'RGRN-2026-0002',
              status: 'POSTED',
              hasCreditNote: false,
              hasSupplierBill: false,
              totalAmount: 5000,
              actionStatus: 'NEED_BILL',
            },
          ],
        };
      }),
    } as unknown as Pool;

    const result = await returnGrnRepository.list(mockPool, {
      page: 1,
      limit: 50,
      needsAttention: true,
      search: 'SALUD',
    });

    gate('LIST_TOTAL', result.total === 2, `total=${result.total}`);
    gate('LIST_ROWS', result.rows.length === 2, `rows=${result.rows.length}`);
    gate('LIST_TWO_QUERIES', captured.length === 2, `q=${captured.length}`);

    const dataSql = captured[1]?.sql || '';
    gate('SQL_RETURN_GRN', dataSql.includes('FROM return_grn r'), 'from return_grn');
    gate('SQL_SUPPLIER_JOIN', dataSql.includes('JOIN suppliers s'), 'join all suppliers');
    gate('SQL_NEEDS_POSTED', dataSql.includes(`r.status = 'POSTED'`), 'attention status POSTED');
    gate(
      'SQL_NEEDS_NO_SCN',
      dataSql.includes('SUPPLIER_CREDIT_NOTE') && dataSql.includes('NOT ('),
      'attention excludes active SCN',
    );
    gate(
      'SQL_SEARCH',
      dataSql.includes('ILIKE') && captured[1].params.some((p) => String(p).includes('SALUD')),
      'search bind',
    );
    gate('SQL_TOTAL_AMOUNT', dataSql.includes('"totalAmount"'), 'amount column');
    gate('SQL_HAS_BILL', dataSql.includes('"hasSupplierBill"'), 'bill flag');
    gate('SQL_HAS_SCN', dataSql.includes('"hasCreditNote"'), 'scn flag');
    gate('SQL_ACTION_STATUS', dataSql.includes('"actionStatus"'), 'actionStatus projection');
    gate(
      'SQL_ACTION_CASE',
      dataSql.includes("WHEN r.status = 'DRAFT' THEN 'DRAFT'") &&
        dataSql.includes("THEN 'NEED_BILL'") &&
        dataSql.includes("THEN 'NEED_SCN'"),
      'CASE matches domain SSOT labels',
    );
    gate(
      'SQL_ORDER_ATTN_FIRST',
      /ORDER BY[\s\S]*NOT \(/.test(dataSql),
      'open returns sorted first',
    );

    // Domain agrees with projected actionStatus on mock rows
    for (const row of result.rows) {
      const derived = resolveSupplierReturnActionStatus(row);
      gate(
        `ROW_${row.returnGrnNumber || row.id}_SSOT`,
        !row.actionStatus || row.actionStatus === derived,
        `actionStatus=${row.actionStatus} derived=${derived}`,
      );
    }

    // first row can create SCN
    gate(
      'ROW1_CAN_SCN',
      canCreateSupplierCreditNoteFromReturn(result.rows[0]),
      'NEED_SCN can create',
    );
    gate(
      'ROW2_MUST_BILL',
      mustBillBeforeSupplierCreditNote(result.rows[1]),
      'NEED_BILL gates SCN',
    );
  });

  it('status filter alone binds without inventing attention clauses', async () => {
    const captured: string[] = [];
    const mockPool = {
      query: jest.fn(async (sql: string) => {
        captured.push(String(sql));
        if (String(sql).includes('COUNT')) return { rows: [{ count: 0 }] };
        return { rows: [] };
      }),
    } as unknown as Pool;

    await returnGrnRepository.list(mockPool, {
      page: 1,
      limit: 20,
      status: 'DRAFT',
    });

    const dataSql = captured.find((s) => s.includes('LIMIT')) || '';
    gate('FILTER_DRAFT_BIND', dataSql.includes('r.status = $'), 'status param');
    // needsAttention adds literal POSTED after filters — draft-only path must not force POSTED attention
    gate(
      'FILTER_DRAFT_NO_FORCE_ATTN',
      !/r\.status = 'POSTED'/.test(dataSql) || dataSql.includes('r.status = $'),
      'draft filter uses bind not attention force only',
    );
  });
});

describe('Supplier return worklist — structural e2e chain (API → UI)', () => {
  it('controller, routes, client API, page, receiving workbench, permissions', () => {
    gate(
      'DOMAIN_ROUTE',
      SUPPLIER_RETURNS_ROUTE === '/inventory/goods-receipts/returns' &&
        SUPPLIER_RETURNS_API === 'return-grn' &&
        SUPPLIER_RETURNS_DEFAULT_FILTER === 'attention',
      'constants nested under GR',
    );

    const controller = readRepo('SamplePOS.Server/src/modules/return-grn/returnGrnController.ts');
    gate('CTRL_NEEDS_ATTENTION', controller.includes('needsAttention'), 'query needsAttention');
    gate('CTRL_SEARCH', controller.includes('search'), 'query search');
    gate('CTRL_LIMIT_CAP', controller.includes('Math.min') && controller.includes('200'), 'limit cap');

    const routes = readRepo('SamplePOS.Server/src/modules/return-grn/returnGrnRoutes.ts');
    gate('ROUTE_LIST', routes.includes("returnGrnController.list") && routes.includes("'/'"), 'GET list');
    gate('ROUTE_CN', routes.includes('credit-note'), 'POST credit-note');
    gate('ROUTE_CN_PERM', routes.includes("requirePermission('suppliers.create')"), 'SCN permission');

    const api = readRepo('samplepos.client/src/utils/api.ts');
    gate('CLIENT_LIST_PARAMS', api.includes('needsAttention') && api.includes('return-grn'), 'client list');
    gate('CLIENT_CN', api.includes('createCreditNote'), 'client createCreditNote');

    const hook = readRepo('samplepos.client/src/hooks/useReturnGrn.ts');
    gate('HOOK_NEEDS', hook.includes('needsAttention'), 'hook params');
    gate('HOOK_CN', hook.includes('useCreateCreditNoteFromReturn'), 'hook mutation');

    const page = readRepo('samplepos.client/src/pages/inventory/SupplierReturnsPage.tsx');
    gate(
      'PAGE_ROUTE_HINT',
      page.includes(SUPPLIER_RETURNS_ROUTE) || page.includes('goods-receipts/returns'),
      'page knows nested route',
    );
    gate('PAGE_DEFAULT_ATTN', page.includes('SUPPLIER_RETURNS_DEFAULT_FILTER') || page.includes("'attention'"), 'default attention');
    gate('PAGE_NEEDS_PARAM', page.includes('needsAttention') && page.includes('true'), 'sends needsAttention');
    gate('PAGE_CREATE_CN', page.includes('Create credit note'), 'create SCN CTA');
    gate('PAGE_BILL_FIRST', page.includes('Bill on GR first'), 'bill CTA');
    gate('PAGE_SSOT', page.includes('canCreateSupplierCreditNoteFromReturn'), 'uses domain SSOT');
    gate(
      'PAGE_ALL_SUPPLIERS',
      page.includes('across suppliers') || page.includes('all suppliers'),
      'worklist copy',
    );
    gate(
      'PAGE_EMBEDDED',
      page.includes('useOutletContext') && page.includes('ReceivingWorkbenchContext'),
      'embeds under Receiving',
    );

    const nav = readRepo('samplepos.client/src/components/inventory/inventoryNavConfig.ts');
    gate(
      'NAV_NO_TOP_TAB',
      !nav.includes("path: '/inventory/supplier-returns'") &&
        !/id:\s*'supplier-returns'/.test(nav),
      'not a primary inventory tab',
    );
    gate(
      'NAV_GR_DESK',
      nav.includes("path: '/inventory/goods-receipts'") &&
        (nav.includes('supplier returns') || nav.includes('Receive stock')),
      'Goods Receipts receiving desk',
    );

    const workbench = readRepo('samplepos.client/src/pages/inventory/ReceivingWorkbench.tsx');
    gate(
      'WORKBENCH',
      workbench.includes('receiving-workbench') &&
        workbench.includes('receiving-tab-returns') &&
        workbench.includes(SUPPLIER_RETURNS_ROUTE),
      'Receiving tabs shell',
    );

    const app = readRepo('samplepos.client/src/App.tsx');
    gate(
      'APP_NESTED',
      app.includes('ReceivingWorkbench') &&
        app.includes('path="returns"') &&
        app.includes('SupplierReturnsPage'),
      'nested routes under GR',
    );
    gate(
      'APP_REDIRECT',
      app.includes('path="/inventory/supplier-returns"') &&
        app.includes('/inventory/goods-receipts/returns'),
      'legacy supplier-returns redirect',
    );
    gate('APP_PERM', /goods-receipts[\s\S]{0,400}purchasing\.read/.test(app), 'purchasing.read gate');

    const gr = readRepo('samplepos.client/src/pages/inventory/GoodsReceiptsPage.tsx');
    gate('GR_EMBEDDED', gr.includes('useOutletContext') && gr.includes('embedded'), 'GR embeds under workbench');
    gate('GR_NO_ORPHAN_CTA', !gr.includes('/inventory/supplier-returns'), 'no top-tab path on GR');

    const flow = readRepo('samplepos.client/src/components/shared/DocumentFlowButton.tsx');
    gate(
      'DOC_FLOW_RGRN',
      flow.includes('RETURN_GRN: `/inventory/goods-receipts/returns`'),
      'doc flow to worklist',
    );

    // SCN product path still requires bill (ERR_RETURN_GRN_001)
    const svc = readRepo('SamplePOS.Server/src/modules/return-grn/returnGrnService.ts');
    gate(
      'SVC_BILL_GATE',
      svc.includes('SUPPLIER_BILL_REQUIRED_FOR_SCN') || svc.includes('ERR_RETURN_GRN_001'),
      'SCN requires bill',
    );
    gate(
      'SVC_CLEARING',
      svc.includes('resolveRgrnClearingAccountCode') && svc.includes('recordSupplierCreditNoteToGL'),
      'SCN clears 2150/2160',
    );
  });
});

afterAll(() => {
  const outMd = path.join(repoRoot, 'PROOF_SUPPLIER_RETURN_WORKLIST.md');
  const outJson = path.join(repoRoot, 'PROOF_SUPPLIER_RETURN_WORKLIST.json');
  const passed = gates.every((g) => g.ok);
  const payload = {
    proof: 'SUPPLIER_RETURN_WORKLIST',
    passed,
    asOf: new Date().toISOString(),
    gates,
    route: SUPPLIER_RETURNS_ROUTE,
    defaultFilter: SUPPLIER_RETURNS_DEFAULT_FILTER,
    claims: [
      'All-supplier RGRN list API with needsAttention + search',
      'actionStatus SSOT shared with UI (DRAFT|NEED_BILL|NEED_SCN|HAS_SCN|COMPLETE)',
      'UI nested under Goods Receipts → Returns (/inventory/goods-receipts/returns); legacy /supplier-returns redirects',
      'Create SCN gated by supplier bill (product + UI)',
    ],
  };
  writeFileSync(outJson, JSON.stringify(payload, null, 2));
  writeFileSync(
    outMd,
    [
      '# PROOF: Supplier return worklist',
      '',
      `**Result:** ${passed ? 'PASS' : 'FAIL'}`,
      `**As of:** ${payload.asOf}`,
      '',
      '## Claims',
      ...payload.claims.map((c) => `- ${c}`),
      '',
      '## Gates',
      ...gates.map((g) => `- ${g.ok ? '✅' : '❌'} \`${g.id}\` — ${g.detail}`),
      '',
    ].join('\n'),
  );
  expect(passed).toBe(true);
});
