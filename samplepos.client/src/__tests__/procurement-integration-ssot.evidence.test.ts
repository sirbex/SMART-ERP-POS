/**
 * PROOF: Procurement / AP integration SSOT — modules share one contract.
 *
 * Locks behavioral rules AND cross-wiring (client + server import the same shared modules).
 * Emits: PROOF_PROCUREMENT_INTEGRATION_SSOT.json / .md
 *
 * Run: npm run proof:procurement-integration-ssot
 */
import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PricingEngine } from '@shared/utils/pricingEngine';
import {
  finalizePoLineForSave,
  poLineTotal,
  syncPoLineFromEnteredTotal,
} from '@shared/utils/po-line-uom';
import {
  buildSupplierBillSettlement,
  isSupplierBillCancelledStatus,
} from '@shared/utils/supplierBillSettlement';
import {
  isSupplierReturnNeedsAttention,
  mustBillBeforeSupplierCreditNote,
  resolveSupplierReturnActionStatus,
  supplierReturnActionLabel,
} from '@shared/domain/supplierReturnWorklist';
import {
  canCreateSupplierBillFromGr,
  resolveGrBillingLane,
} from '@shared/domain/grBillingStatusSsot';
import {
  classifyPOReceiptLane,
  resolveTargetPOWorkflowStatus,
} from '@shared/domain/poReceiptWorkflowSsot';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

type Gate = { id: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string): void {
  gates.push({ id, ok, detail });
  expect({ id, ok, detail }).toEqual({ id, ok: true, detail });
}

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

function exists(rel: string): boolean {
  return existsSync(path.join(repoRoot, rel));
}

describe('PROOF: Procurement integration SSOT (shared across modules)', () => {
  it('shared modules exist (single source of truth files)', () => {
    const required = [
      'shared/utils/pricingEngine.ts',
      'shared/utils/po-line-uom.ts',
      'shared/utils/supplierBillSettlement.ts',
      'shared/utils/supplierBillCancelEligibility.ts',
      'shared/domain/supplierReturnWorklist.ts',
      'shared/domain/grnBillPromptSsot.ts',
      'shared/domain/grBillingStatusSsot.ts',
      'shared/domain/poReceiptWorkflowSsot.ts',
      'shared/sql/610_po_unit_price_precision_6dp.sql',
    ];
    for (const rel of required) {
      gate(`FILE_${rel.replace(/[\\/.]/g, '_')}`, exists(rel), rel);
    }
  });

  it('behavioral SSOT: PO money / bill status / reverse / return next-step', () => {
    gate(
      'PE_ENGINE',
      PricingEngine.calculateLineTotal(24, '291.666667').toDecimalPlaces(2).toFixed(2) ===
        '7000.00' && poLineTotal(24, '291.67') === '7000.08',
      '6dp unit keeps 7000; 2dp truncate yields 7000.08',
    );

    const synced = syncPoLineFromEnteredTotal(24, '7000');
    gate(
      'PO_PRESERVE_7000',
      synced.lineTotal === '7000.00' &&
        finalizePoLineForSave(24, '291.67', '7000').lineTotal === '7000.00',
      'typed line total preserved across sync + save finalize',
    );

    const cancelled = buildSupplierBillSettlement({
      totalAmount: 272_800.04,
      amountPaid: 0,
      creditsApplied: 0,
      outstandingBalance: 0,
      status: 'Cancelled',
    });
    gate(
      'CANCELLED_NEVER_PAID',
      isSupplierBillCancelledStatus('Cancelled') &&
        cancelled.displayStatus === 'Cancelled' &&
        cancelled.balanceDue === 0 &&
        !cancelled.equationHint.toLowerCase().includes('invoice total −'),
      'cancelled bill is Cancelled with 0 due — never Paid',
    );

    const uninvoicedReturn = {
      status: 'POSTED' as const,
      hasCreditNote: false,
      hasSupplierBill: false,
      reason: '[Uninvoiced reversal] test',
    };
    gate(
      'UNINVOICED_RETURN_DONE',
      resolveSupplierReturnActionStatus(uninvoicedReturn) === 'COMPLETE' &&
        !isSupplierReturnNeedsAttention(uninvoicedReturn) &&
        !mustBillBeforeSupplierCreditNote(uninvoicedReturn) &&
        supplierReturnActionLabel(uninvoicedReturn).includes('Reversal'),
      'uninvoiced reverse → Done/Reversal complete — not Need bill',
    );

    const invoicedReturn = {
      status: 'POSTED' as const,
      hasCreditNote: false,
      hasSupplierBill: true,
    };
    gate(
      'INVOICED_RETURN_NEED_SCN',
      resolveSupplierReturnActionStatus(invoicedReturn) === 'NEED_SCN' &&
        isSupplierReturnNeedsAttention(invoicedReturn),
      'invoiced return still needs SCN',
    );

    gate(
      'GR_LANE_REVERSED_BEATS_BILL',
      resolveGrBillingLane({
        receiptStatus: 'COMPLETED',
        isReversed: true,
        supplierBillNumber: 'SBILL-PO-SIBLING',
        billingStatus: 'REVERSED',
      }) === 'REVERSED' &&
        !canCreateSupplierBillFromGr({
          receiptStatus: 'COMPLETED',
          isReversed: true,
          supplierBillNumber: 'SBILL-PO-SIBLING',
        }),
      'reversed lane wins over sibling/bill number — never billable',
    );

    gate(
      'PO_REOPEN_AFTER_REVERSE',
      resolveTargetPOWorkflowStatus('COMPLETED', {
        fullyReceived: false,
        fullyReversed: true,
      }) === 'DRAFT' &&
        classifyPOReceiptLane('DRAFT', {
          completedGrCount: 1,
          netReceivedQtyTotal: 0,
          openQtyTotal: 24,
        }) === 'DRAFT',
      'full reverse → DRAFT workflow + Draft lane (manage again)',
    );
  });

  it('wiring: client + server consume the same shared SSOT (no local forks)', () => {
    const poPage = read('samplepos.client/src/pages/inventory/PurchaseOrdersPage.tsx');
    const grPage = read('samplepos.client/src/pages/inventory/GoodsReceiptsPage.tsx');
    const returnsPage = read('samplepos.client/src/pages/inventory/SupplierReturnsPage.tsx');
    const suppliersPage = read('samplepos.client/src/pages/SuppliersPage.tsx');
    const invoicesGrid = read(
      'samplepos.client/src/components/suppliers/SupplierInvoicesAdaptiveGrid.tsx',
    );
    const poSvc = read('SamplePOS.Server/src/modules/purchase-orders/purchaseOrderService.ts');
    const billSvc = read(
      'SamplePOS.Server/src/modules/supplier-payments/supplierPaymentService.ts',
    );
    const returnRepo = read('SamplePOS.Server/src/modules/return-grn/returnGrnRepository.ts');
    const grRepo = read('SamplePOS.Server/src/modules/goods-receipts/goodsReceiptRepository.ts');
    const grBadge = read('samplepos.client/src/components/inventory/GrBillingStatusBadge.tsx');
    const mig610 = read('shared/sql/610_po_unit_price_precision_6dp.sql');
    const post = read('SamplePOS.Server/src/modules/system/migrationPostconditions.ts');

    gate(
      'WIRE_PO_CLIENT',
      poPage.includes('finalizePoLineForSave') &&
        poPage.includes('syncPoLineFromEnteredTotal') &&
        poPage.includes('hydratePoLineMoney'),
      'Purchase Orders UI uses po-line-uom SSOT',
    );
    gate(
      'WIRE_PO_SERVER',
      poSvc.includes('PricingEngine.calculateLineTotal') && poSvc.includes('toDecimalPlaces(6'),
      'PO service persists PE totals + 6dp unit',
    );
    gate(
      'WIRE_PO_DB_6DP',
      mig610.includes('NUMERIC(18, 6)') &&
        post.includes('610_po_unit_price_precision_6dp.sql') &&
        post.includes('numeric_scale >= 6'),
      'DB unit_price scale ≥ 6 locked by migration + postcondition',
    );
    gate(
      'WIRE_BILL_SETTLEMENT',
      invoicesGrid.includes('buildSupplierBillSettlement') &&
        invoicesGrid.includes('isSupplierBillCancelledStatus') &&
        suppliersPage.includes('buildSupplierBillSettlement'),
      'supplier invoice UI uses settlement SSOT',
    );
    gate(
      'WIRE_DASHBOARD_REFRESH',
      suppliersPage.includes('refreshApDashboard') &&
        suppliersPage.includes('getInvoiceSummary') &&
        suppliersPage.includes('onApChanged'),
      'cancel/payment refreshes shared Outstanding cards',
    );
    gate(
      'WIRE_GR_NO_BILL_REVERSED',
      grPage.includes('isGrReversed') &&
        grPage.includes('not billable') &&
        grPage.includes('canCreateSupplierCreditNoteFromReturn') &&
        grPage.includes('No credit note needed') &&
        grPage.includes('Originally posted (now reversed') &&
        grPage.includes('!isGrReversed') &&
        !grPage.includes('Bill required before credit note') &&
        billSvc.includes('receipt was fully reversed'),
      'reversed GR: historical posting copy; hide return/reassign; block rebill',
    );
    gate(
      'WIRE_GR_BILLING_LANE_SSOT',
      grBadge.includes('grBillingStatusSsot') &&
        grBadge.includes("billing === 'REVERSED'") &&
        grRepo.includes('resolveGrBillingLane') &&
        grRepo.includes("THEN 'REVERSED'") &&
        grRepo.includes("billingStatus === 'REVERSED'"),
      'list SQL + getById + badge share REVERSED-before-INVOICED lane',
    );
    gate(
      'WIRE_PO_RECEIPT_WORKFLOW',
      poPage.includes('derivePOReceiptStatusBadge') &&
        poPage.includes('shouldShowPOReceiptProgressLine') &&
        poSvc.includes('poReceiptStatusSync') &&
        read('SamplePOS.Server/src/modules/return-grn/returnGrnService.ts').includes(
          'syncPOStatusWithReceipts',
        ),
      'PO UI + return post share poReceiptWorkflow sync/badge SSOT',
    );
    gate(
      'WIRE_RETURN_WORKLIST',
      returnsPage.includes('supplierReturnWorklist') &&
        returnsPage.includes('supplierReturnActionLabel') &&
        !returnsPage.includes('Bill on GR first') &&
        returnRepo.includes("THEN 'COMPLETE'") &&
        returnRepo.includes('hasSupplierBillSql') &&
        !returnRepo.includes("THEN 'NEED_BILL'"),
      'returns list SQL + UI share uninvoiced=COMPLETE rule',
    );
  });

  it('related evidence scripts are registered (suite is runnable)', () => {
    const pkg = read('package.json');
    const scripts = [
      'proof:po-total-ssot',
      'proof:po-receipt-workflow-ssot',
      'proof:grn-bill-prompt-defaults',
      'proof:supplier-invoice-grn-bounds',
      'proof:supplier-bill-cancel',
      'proof:procurement-integration-ssot',
    ];
    for (const s of scripts) {
      gate(`SCRIPT_${s.replace(/:/g, '_')}`, pkg.includes(`"${s}"`), s);
    }
  });
});

afterAll(() => {
  const pass = gates.filter((g) => g.ok).length;
  const fail = gates.filter((g) => !g.ok).length;
  const verdict = fail === 0 ? 'PASS' : 'FAIL';
  const at = new Date().toISOString();
  const evidence = {
    at,
    feature: 'PROCUREMENT_INTEGRATION_SSOT',
    summary: { pass, fail, total: gates.length, verdict },
    scope:
      'Cross-module SSOT: PO money, bill settlement, GR reverse≠billable, return next-step, dashboard refresh — shared modules + wiring + behavior',
    sharedModules: [
      'shared/utils/pricingEngine.ts',
      'shared/utils/po-line-uom.ts',
      'shared/utils/supplierBillSettlement.ts',
      'shared/domain/supplierReturnWorklist.ts',
      'shared/domain/grnBillPromptSsot.ts',
      'shared/domain/grBillingStatusSsot.ts',
      'shared/domain/poReceiptWorkflowSsot.ts',
    ],
    gates,
  };
  writeFileSync(
    path.join(repoRoot, 'PROOF_PROCUREMENT_INTEGRATION_SSOT.json'),
    JSON.stringify(evidence, null, 2),
  );
  writeFileSync(
    path.join(repoRoot, 'PROOF_PROCUREMENT_INTEGRATION_SSOT.md'),
    `# PROOF — Procurement / AP integration SSOT

**Generated:** ${at}  
**Verdict:** **${verdict}** (${pass}/${gates.length})  
**Scope:** ${evidence.scope}

## Shared modules (SSOT)

${evidence.sharedModules.map((m) => `- \`${m}\``).join('\n')}

## Gates

| Gate | Result | Detail |
|------|--------|--------|
${gates.map((g) => `| \`${g.id}\` | ${g.ok ? 'PASS' : 'FAIL'} | ${g.detail.replace(/\|/g, '\\|')} |`).join('\n')}

## Companion proofs

\`\`\`bash
npm run proof:procurement-integration-ssot
npm run proof:po-total-ssot
npm run proof:grn-bill-prompt-defaults
npm run proof:supplier-invoice-grn-bounds
npm run proof:supplier-bill-cancel
\`\`\`
`,
  );
  expect(fail).toBe(0);
});
