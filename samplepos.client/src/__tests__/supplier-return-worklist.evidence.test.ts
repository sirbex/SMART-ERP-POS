/**
 * PROOF: Client supplier returns worklist — full wiring + action gates SSOT.
 *
 * npx vitest run src/__tests__/supplier-return-worklist.evidence.test.ts
 */
import { describe, expect, it, afterAll } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  canCreateSupplierCreditNoteFromReturn,
  isSupplierReturnNeedsAttention,
  mustBillBeforeSupplierCreditNote,
  resolveSupplierReturnActionStatus,
  SUPPLIER_RETURN_ACTION_LABELS,
  SUPPLIER_RETURNS_DEFAULT_FILTER,
  SUPPLIER_RETURNS_ROUTE,
} from '../../../shared/domain/supplierReturnWorklist';
import { unwrapReturnGrnListPayload } from '../hooks/useReturnGrn';

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

describe('Supplier return worklist domain SSOT (client)', () => {
  it('action matrix is consistent for UI gates', () => {
    const needScn = {
      status: 'POSTED' as const,
      hasCreditNote: false,
      hasSupplierBill: true,
    };
    gate(
      'UI_SSOT_NEED_SCN',
      resolveSupplierReturnActionStatus(needScn) === 'NEED_SCN' &&
        canCreateSupplierCreditNoteFromReturn(needScn) &&
        isSupplierReturnNeedsAttention(needScn),
      'open return → create SCN',
    );

    const needBill = {
      status: 'POSTED' as const,
      hasCreditNote: false,
      hasSupplierBill: false,
    };
    gate(
      'UI_SSOT_NEED_BILL',
      resolveSupplierReturnActionStatus(needBill) === 'COMPLETE' &&
        !mustBillBeforeSupplierCreditNote(needBill) &&
        !canCreateSupplierCreditNoteFromReturn(needBill) &&
        !isSupplierReturnNeedsAttention(needBill),
      'uninvoiced return is Done — no bill-first drama',
    );

    const fullReverse = {
      status: 'POSTED' as const,
      hasCreditNote: false,
      hasSupplierBill: true,
      reason: '[Uninvoiced reversal] wrong delivery',
    };
    gate(
      'UI_SSOT_FULL_REVERSE_NO_SCN',
      resolveSupplierReturnActionStatus(fullReverse) === 'COMPLETE' &&
        !canCreateSupplierCreditNoteFromReturn(fullReverse) &&
        !isSupplierReturnNeedsAttention(fullReverse),
      'full/uninvoiced reverse never offers Create Credit Note (even if sibling bill linked)',
    );

    gate(
      'LABELS',
      SUPPLIER_RETURN_ACTION_LABELS.NEED_SCN === 'Need credit note' &&
        SUPPLIER_RETURN_ACTION_LABELS.COMPLETE === 'Done',
      'labels locked',
    );
    gate(
      'DEFAULTS',
      SUPPLIER_RETURNS_ROUTE === '/inventory/goods-receipts/returns' &&
        SUPPLIER_RETURNS_DEFAULT_FILTER === 'attention',
      'nested under GR + default filter',
    );
  });

  it('list response unwrapping never silently drops rows or totals', () => {
    const rows = [
      {
        id: '1',
        returnGrnNumber: 'RGRN-1',
        grnId: 'g',
        grnNumber: '',
        supplierId: 's',
        supplierName: 'A',
        returnDate: '2026-01-01',
        status: 'POSTED' as const,
        reason: 'x',
        totalAmount: 1,
        createdBy: '',
        createdAt: '',
        updatedAt: '',
      },
    ];

    const standard = unwrapReturnGrnListPayload({
      data: {
        success: true,
        data: rows,
        pagination: { page: 1, limit: 50, total: 8, totalPages: 1 },
      },
    });
    gate(
      'UNWRAP_STANDARD',
      standard.rows.length === 1 && standard.pagination?.total === 8,
      `rows=${standard.rows.length} total=${standard.pagination?.total}`,
    );

    const double = unwrapReturnGrnListPayload({
      data: {
        data: rows,
        pagination: { page: 2, total: 3, totalPages: 2 },
      },
    });
    gate(
      'UNWRAP_NESTED',
      double.rows.length === 1 && double.pagination?.total === 3,
      'double-wrap',
    );

    const bare = unwrapReturnGrnListPayload({ data: rows });
    gate('UNWRAP_ARRAY_BODY', bare.rows.length === 1, 'array body');

    const empty = unwrapReturnGrnListPayload(undefined);
    gate(
      'UNWRAP_EMPTY_EXPLICIT',
      empty.rows.length === 0 && empty.pagination === null,
      'empty is explicit not invent',
    );
  });
});

describe('Supplier return worklist UI/API wiring', () => {
  it('page uses SSOT, list filters, and SCN/post actions without GR-only discovery', () => {
    const page = read('samplepos.client/src/pages/inventory/SupplierReturnsPage.tsx');

    gate('USES_SSOT_IMPORT', page.includes('supplierReturnWorklist'), 'imports domain SSOT');
    gate(
      'USES_CAN_CREATE',
      page.includes('canCreateSupplierCreditNoteFromReturn'),
      'gates Create credit note via SSOT',
    );
    gate(
      'USES_MUST_BILL',
      !page.includes('Bill on GR first') && !page.includes('bill-first-'),
      'never renders Bill-on-GR-first CTA (mustBillBefore is always false)',
    );
    gate(
      'USES_RESOLVE_STATUS',
      page.includes('resolveSupplierReturnActionStatus') || page.includes('SUPPLIER_RETURN_ACTION_LABELS'),
      'badge uses domain labels/status',
    );
    gate(
      'DEFAULT_ATTENTION',
      page.includes('SUPPLIER_RETURNS_DEFAULT_FILTER') && page.includes('needsAttention'),
      'default attn filter',
    );
    gate('LIST_HOOK', page.includes('useReturnGrns'), 'list hook');
    gate('POST_HOOK', page.includes('usePostReturnGrn'), 'post draft');
    gate('CN_HOOK', page.includes('useCreateCreditNoteFromReturn'), 'create SCN');
    gate('UNWRAP_LIST', page.includes('unwrapReturnGrnListPayload'), 'no ad-hoc silent list parse');
    gate('CREDIT_NOTES_LINK', page.includes('/accounting/credit-debit-notes'), 'apply SCN path');
    gate('GR_LINK', page.includes('/inventory/goods-receipts'), 'source GR path');
    gate(
      'NO_PER_GR_ONLY',
      page.includes('across suppliers') ||
        page.includes('All return-to-supplier') ||
        page.includes('all suppliers'),
      'all-supplier worklist',
    );
    gate(
      'EMBEDDED_WORKBENCH',
      page.includes('useOutletContext') && page.includes('ReceivingWorkbenchContext'),
      'nested under Receiving workbench',
    );
    gate(
      'SSOT_GATES_ONLY',
      page.includes('canCreateSupplierCreditNoteFromReturn') &&
        page.includes('isSupplierReturnNeedsAttention') &&
        !page.includes('Bill on GR first'),
      'create SCN / attention use domain SSOT; no bill-first fork',
    );
  });

  it('nav embeds returns under Goods Receipts desk; app + api + doc flow consistent', () => {
    const nav = read('samplepos.client/src/components/inventory/inventoryNavConfig.ts');
    gate(
      'NAV_NO_TOP_TAB',
      !nav.includes("path: '/inventory/supplier-returns'") &&
        !/id:\s*'supplier-returns'/.test(nav),
      'returns not a primary inventory tab',
    );
    gate(
      'NAV_GR_DESK',
      nav.includes("path: '/inventory/goods-receipts'") &&
        (nav.includes('supplier returns') || nav.includes('Receive stock')),
      'Goods Receipts is receiving desk',
    );

    const workbench = read('samplepos.client/src/pages/inventory/ReceivingWorkbench.tsx');
    gate(
      'WORKBENCH_TABS',
      workbench.includes('receiving-tab-receipts') &&
        workbench.includes('receiving-tab-returns') &&
        workbench.includes(SUPPLIER_RETURNS_ROUTE) &&
        workbench.includes('unwrapReturnGrnListPayload'),
      'Receipts | Returns sub-tabs + attention unwrap',
    );

    const app = read('samplepos.client/src/App.tsx');
    gate(
      'APP_NESTED',
      app.includes('ReceivingWorkbench') &&
        app.includes('path="returns"') &&
        app.includes('SupplierReturnsPage'),
      'nested GR/returns routes',
    );
    gate(
      'APP_REDIRECT',
      app.includes('path="/inventory/supplier-returns"') &&
        app.includes('to="/inventory/goods-receipts/returns"'),
      'legacy redirect',
    );
    gate(
      'APP_PERM',
      /goods-receipts[\s\S]{0,400}purchasing\.read/.test(app),
      'purchasing.read on receiving desk',
    );

    const api = read('samplepos.client/src/utils/api.ts');
    gate(
      'API_PARAMS',
      api.includes('needsAttention') && api.includes("apiClient.get<ApiResponse>('return-grn'"),
      'API params',
    );

    gate(
      'DOC_FLOW',
      read('samplepos.client/src/components/shared/DocumentFlowButton.tsx').includes(
        'RETURN_GRN: `/inventory/goods-receipts/returns`',
      ),
      'document flow',
    );

    const gr = read('samplepos.client/src/pages/inventory/GoodsReceiptsPage.tsx');
    gate(
      'GR_EMBEDDED',
      gr.includes('useOutletContext') && gr.includes('embedded') && gr.includes('unwrapReturnGrnListPayload'),
      'receipts page embeds under workbench + same list unwrap',
    );
    gate('GR_NO_TOP_CTA', !gr.includes('/inventory/supplier-returns'), 'no orphan returns CTA on GR');
  });
});

afterAll(() => {
  const payload = {
    proof: 'SUPPLIER_RETURN_WORKLIST_CLIENT',
    passed: gates.every((g) => g.ok),
    asOf: new Date().toISOString(),
    gates,
  };
  writeFileSync(
    path.join(repoRoot, 'PROOF_SUPPLIER_RETURN_WORKLIST_CLIENT.json'),
    JSON.stringify(payload, null, 2),
  );
  writeFileSync(
    path.join(repoRoot, 'PROOF_SUPPLIER_RETURN_WORKLIST_CLIENT.md'),
    [
      '# PROOF: Supplier return worklist (client)',
      '',
      `**Result:** ${payload.passed ? 'PASS' : 'FAIL'}`,
      '',
      ...gates.map((g) => `- ${g.ok ? '✅' : '❌'} \`${g.id}\` — ${g.detail}`),
      '',
    ].join('\n'),
  );
});
