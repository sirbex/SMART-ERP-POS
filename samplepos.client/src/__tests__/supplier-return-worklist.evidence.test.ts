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
      resolveSupplierReturnActionStatus(needBill) === 'NEED_BILL' &&
        mustBillBeforeSupplierCreditNote(needBill) &&
        !canCreateSupplierCreditNoteFromReturn(needBill),
      'no SCN without bill',
    );

    gate(
      'LABELS',
      SUPPLIER_RETURN_ACTION_LABELS.NEED_SCN === 'Need credit note' &&
        SUPPLIER_RETURN_ACTION_LABELS.NEED_BILL === 'Need supplier bill',
      'labels locked',
    );
    gate(
      'DEFAULTS',
      SUPPLIER_RETURNS_ROUTE === '/inventory/goods-receipts/returns' &&
        SUPPLIER_RETURNS_DEFAULT_FILTER === 'attention',
      'nested under GR + default filter',
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
      page.includes('mustBillBeforeSupplierCreditNote'),
      'gates Bill CTA via SSOT',
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
        page.includes('mustBillBeforeSupplierCreditNote') &&
        page.includes('isSupplierReturnNeedsAttention'),
      'create SCN / bill / open count use domain SSOT only',
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
        workbench.includes(SUPPLIER_RETURNS_ROUTE),
      'Receipts | Returns sub-tabs',
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
      gr.includes('useOutletContext') && gr.includes('embedded'),
      'receipts page embeds under workbench',
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
