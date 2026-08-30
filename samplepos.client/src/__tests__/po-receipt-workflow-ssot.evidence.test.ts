/**
 * PROOF: PO receipt workflow SSOT — full reverse returns PO to DRAFT.
 *
 * Emits: PROOF_PO_RECEIPT_WORKFLOW_SSOT.json / .md
 * Run: npm run proof:po-receipt-workflow-ssot
 */
import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyPOReceiptLane,
  isPOFullyReversedProgress,
  resolveTargetPOWorkflowStatus,
  shouldShowPOReceiptProgressLine,
} from '@shared/domain/poReceiptWorkflowSsot';
import { derivePOReceiptStatusBadge } from '@shared/utils/purchaseOrderReceiptDisplay';

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

describe('PROOF: PO receipt workflow SSOT', () => {
  it('shared SSOT files exist', () => {
    for (const rel of [
      'shared/domain/poReceiptWorkflowSsot.ts',
      'shared/utils/purchaseOrderReceiptDisplay.ts',
      'SamplePOS.Server/src/modules/purchase-orders/poReceiptStatusSync.ts',
    ]) {
      gate(`FILE_${rel.replace(/[\\/.]/g, '_')}`, exists(rel), rel);
    }
  });

  it('behavioral: full reverse → DRAFT; no Reopened noise', () => {
    gate(
      'SYNC_FULL_REVERSE_TO_DRAFT',
      resolveTargetPOWorkflowStatus('COMPLETED', {
        fullyReceived: false,
        fullyReversed: true,
      }) === 'DRAFT' &&
        resolveTargetPOWorkflowStatus('PENDING', {
          fullyReceived: false,
          fullyReversed: true,
        }) === null &&
        resolveTargetPOWorkflowStatus('DRAFT', {
          fullyReceived: false,
          fullyReversed: true,
        }) === null,
      'full reverse: COMPLETED→DRAFT; PENDING stays (resubmit) unless event forces draft',
    );

    gate(
      'SYNC_COMPLETE_AND_PARTIAL',
      resolveTargetPOWorkflowStatus('PENDING', {
        fullyReceived: true,
        fullyReversed: false,
      }) === 'COMPLETED' &&
        resolveTargetPOWorkflowStatus('COMPLETED', {
          fullyReceived: false,
          fullyReversed: false,
        }) === 'PENDING' &&
        resolveTargetPOWorkflowStatus('CANCELLED', {
          fullyReceived: false,
          fullyReversed: true,
        }) === null &&
        resolveTargetPOWorkflowStatus('DRAFT', {
          fullyReceived: true,
          fullyReversed: false,
        }) === null,
      'full receive → COMPLETED; partial reopen → PENDING; CANCELLED/DRAFT untouched',
    );

    const fullReverse = {
      completedGrCount: 1,
      netReceivedQtyTotal: 0,
      openQtyTotal: 24,
      orderedQtyTotal: 24,
    };
    gate(
      'FULLY_REVERSED_HELPER',
      isPOFullyReversedProgress(fullReverse) && !shouldShowPOReceiptProgressLine(fullReverse),
      'full reverse detected; hide 0/N open progress noise',
    );

    const draftBadge = derivePOReceiptStatusBadge('DRAFT', fullReverse);
    gate(
      'LANE_DRAFT_AFTER_REVERSE',
      classifyPOReceiptLane('DRAFT', fullReverse) === 'DRAFT' &&
        draftBadge.label === 'Draft' &&
        draftBadge.lane === 'DRAFT',
      'UI shows Draft — not Reopened (reversed)',
    );

    gate(
      'LANE_AWAITING',
      classifyPOReceiptLane('PENDING', {
        completedGrCount: 0,
        netReceivedQtyTotal: 0,
        openQtyTotal: 10,
      }) === 'AWAITING_RECEIPT',
      'never-received stays Awaiting Receipt',
    );

    gate(
      'LANE_PARTIAL',
      classifyPOReceiptLane('PENDING', {
        completedGrCount: 1,
        netReceivedQtyTotal: 20,
        openQtyTotal: 4,
      }) === 'PARTIALLY_RECEIVED',
      'partial after return → Partially Received',
    );

    gate(
      'NO_REOPENED_LABEL',
      !draftBadge.label.toLowerCase().includes('reopened') &&
        !Object.values(
          // ensure SSOT labels do not advertise reopened noise
          { a: draftBadge.label },
        ).some((l) => String(l).includes('Reopened')),
      'no Reopened (reversed) operator noise',
    );
  });

  it('wiring: sole sync writer + heal + UI', () => {
    const sync = read('SamplePOS.Server/src/modules/purchase-orders/poReceiptStatusSync.ts');
    const poSvc = read('SamplePOS.Server/src/modules/purchase-orders/purchaseOrderService.ts');
    const returnSvc = read('SamplePOS.Server/src/modules/return-grn/returnGrnService.ts');
    const grSvc = read('SamplePOS.Server/src/modules/goods-receipts/goodsReceiptService.ts');
    const poPage = read('samplepos.client/src/pages/inventory/PurchaseOrdersPage.tsx');
    const domain = read('shared/domain/poReceiptWorkflowSsot.ts');

    gate(
      'WIRE_SYNC_TO_DRAFT',
      sync.includes('fullyReversed') &&
        sync.includes("'DRAFT'") &&
        sync.includes('healFullyReversedPurchaseOrdersToDraft') &&
        sync.includes("po.status = 'COMPLETED'") &&
        !sync.includes("po.status IN ('PENDING', 'COMPLETED')"),
      'sync writes DRAFT on reverse; list heal only COMPLETED (not PENDING)',
    );
    gate(
      'WIRE_LIST_HEALS',
      poSvc.includes('healFullyReversedPurchaseOrdersToDraft') &&
        domain.includes('resubmits') &&
        domain.includes('PENDING'),
      'PO list heals stuck COMPLETED; resubmit PENDING stays for Send',
    );
    gate(
      'WIRE_RETURN_USES_SYNC',
      returnSvc.includes('syncPOStatusWithReceipts'),
      'Return GRN post uses sync',
    );
    gate(
      'WIRE_GR_FINALIZE_USES_SYNC',
      grSvc.includes('syncPOStatusWithReceipts'),
      'GR finalize uses sync',
    );
    gate(
      'WIRE_UI_DRAFT',
      poPage.includes('derivePOReceiptStatusBadge') &&
        poPage.includes('shouldShowPOReceiptProgressLine') &&
        domain.includes("→ DRAFT") &&
        !domain.includes('REOPENED_REVERSED'),
      'UI + domain: Draft after reverse, no REOPENED_REVERSED lane',
    );
  });
});

afterAll(() => {
  const pass = gates.filter((g) => g.ok).length;
  const fail = gates.filter((g) => !g.ok).length;
  const verdict = fail === 0 ? 'PASS' : 'FAIL';
  const at = new Date().toISOString();
  const evidence = {
    at,
    feature: 'PO_RECEIPT_WORKFLOW_SSOT',
    summary: { pass, fail, total: gates.length, verdict },
    scope:
      'Full GR reverse → PO DRAFT (manage again); hide 0/N progress noise; sole sync + list heal',
    sharedModules: [
      'shared/domain/poReceiptWorkflowSsot.ts',
      'shared/utils/purchaseOrderReceiptDisplay.ts',
      'SamplePOS.Server/src/modules/purchase-orders/poReceiptStatusSync.ts',
    ],
    gates,
  };
  writeFileSync(
    path.join(repoRoot, 'PROOF_PO_RECEIPT_WORKFLOW_SSOT.json'),
    JSON.stringify(evidence, null, 2),
  );
  writeFileSync(
    path.join(repoRoot, 'PROOF_PO_RECEIPT_WORKFLOW_SSOT.md'),
    `# PROOF — PO receipt workflow SSOT

**Generated:** ${at}  
**Verdict:** **${verdict}** (${pass}/${gates.length})  
**Scope:** ${evidence.scope}

## Gates

| Gate | Result | Detail |
|------|--------|--------|
${gates.map((g) => `| \`${g.id}\` | ${g.ok ? 'PASS' : 'FAIL'} | ${g.detail.replace(/\|/g, '\\|')} |`).join('\n')}
`,
  );
});
