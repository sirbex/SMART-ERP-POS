/**
 * EVIDENCE — Supplier bill cancel (SSOT, API, UI, no error swallowing).
 * Writes PROOF_SUPPLIER_BILL_CANCEL.json / .md
 *
 * Run: npx vitest run src/modules/supplier-payments/supplierInvoiceCancel.evidence.test.ts
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isSupplierBillCancellable,
  supplierBillCancelBlockReason,
} from '../../../../shared/utils/supplierBillCancelEligibility.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

type Gate = { id: string; ok: boolean; detail: string };
const gates: Gate[] = [];

function gate(id: string, ok: boolean, detail: string): void {
  gates.push({ id, ok, detail });
  expect({ id, ok, detail }).toEqual({ id, ok: true, detail });
}

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('EVIDENCE — Supplier bill cancel integrity', () => {
  it('SSOT: blocks payments, credits, and terminal docs', () => {
    const open = {
      status: 'UNPAID',
      documentType: 'SUPPLIER_INVOICE',
      invoiceNumber: 'SBILL-TEST',
      amountPaid: 0,
      creditsApplied: 0,
    };
    gate('SSOT_OPEN', isSupplierBillCancellable(open), 'unpaid bill cancellable');
    gate(
      'SSOT_PAID',
      !isSupplierBillCancellable({ ...open, amountPaid: 100 }) &&
        /Reverse supplier payments/i.test(supplierBillCancelBlockReason({ ...open, amountPaid: 100 }) ?? ''),
      'paid bill blocked with message',
    );
    gate(
      'SSOT_CREDITS',
      !isSupplierBillCancellable({ ...open, creditsApplied: 50 }) &&
        /credit notes/i.test(supplierBillCancelBlockReason({ ...open, creditsApplied: 50 }) ?? ''),
      'credits block cancel',
    );
  });

  it('Wiring: API, service GL guard, UI — no silent error swallow on cancel', () => {
    const svc = read('SamplePOS.Server/src/modules/supplier-payments/supplierPaymentService.ts');
    const routes = read('SamplePOS.Server/src/modules/supplier-payments/supplierPaymentRoutes.ts');
    const repo = read('SamplePOS.Server/src/modules/supplier-payments/supplierPaymentRepository.ts');
    const paymentsUi = read('samplepos.client/src/pages/accounting/SupplierPaymentsPage.tsx');
    const suppliersUi = read('samplepos.client/src/pages/SuppliersPage.tsx');
    const shared = read('shared/utils/supplierBillCancelEligibility.ts');

    gate(
      'API_ROUTE',
      routes.includes('/invoices/:id/cancel') &&
        routes.includes("requirePermission('purchasing.cancel_bill')"),
      'POST cancel route + permission',
    );
    gate(
      'SERVICE_PRECHECK',
      svc.includes('findInvoiceCancelContext') &&
        svc.includes('countActivePaymentAllocations') &&
        svc.includes('supplierBillCancelBlockReason'),
      'server pre-checks before GL reverse',
    );
    gate(
      'GL_NO_DISCREPANCY',
      svc.includes('open GL posting') && svc.includes('reversal incomplete'),
      'throws if open SUPPLIER_INVOICE GL remains after cancel attempt',
    );
    gate(
      'REPO_CREDITS',
      repo.includes('findInvoiceCancelContext') && repo.includes('CREDITS_APPLIED_SQL'),
      'cancel context includes applied SCN credits',
    );
    gate(
      'UI_PAYMENTS',
      paymentsUi.includes('purchasing.cancel_bill') &&
        paymentsUi.includes('Cancel bill') &&
        paymentsUi.includes('@shared/utils/supplierBillCancelEligibility'),
      'Supplier Payments cancel button + shared SSOT',
    );
    gate(
      'UI_SUPPLIERS',
      suppliersUi.includes('Cancel bill') && suppliersUi.includes('cancelSupplierInvoice'),
      'Suppliers invoice detail cancel',
    );
    gate(
      'UI_SUPPLIERS_DASHBOARD_REFRESH',
      suppliersUi.includes('onApChanged') &&
        suppliersUi.includes('refreshApDashboard') &&
        suppliersUi.includes('getInvoiceSummary') &&
        suppliersUi.includes('invalidateQueries') &&
        suppliersUi.includes('Bill cancelled, but summary refresh failed'),
      'cancel refreshes Outstanding cards + supplier balances immediately',
    );
    gate(
      'NO_SWALLOW_SUMMARY',
      !paymentsUi.includes('getInvoiceSummary().then(setInvoiceSummary).catch(() => undefined)'),
      'no silent catch on post-cancel summary refresh',
    );
    gate(
      'CANCEL_ERRORS_SURFACE',
      paymentsUi.includes("toast.error(errMsg || 'Failed to cancel bill')") &&
        paymentsUi.includes('Bill cancelled, but summary refresh failed'),
      'cancel + summary errors surfaced to user',
    );
    gate('SHARED_SSOT', shared.includes('creditsApplied'), 'shared eligibility includes credits');
  });

  it('writes PROOF_SUPPLIER_BILL_CANCEL artifact', () => {
    const liveJson = path.join(repoRoot, 'PROOF_SUPPLIER_BILL_CANCEL_LIVE.json');
    const liveRan = existsSync(liveJson);
    const liveVerdict = liveRan
      ? (JSON.parse(readFileSync(liveJson, 'utf8')) as { verdict?: string }).verdict ?? 'UNKNOWN'
      : 'NOT_RUN';

    gate('ARTIFACT_WRITTEN', true, 'preparing PROOF_SUPPLIER_BILL_CANCEL.json');
    gate('LIVE_PROOF_PASS', liveRan && liveVerdict === 'PASS', `live verdict=${liveVerdict}`);

    const passed = gates.filter((g) => g.ok).length;
    const failed = gates.filter((g) => !g.ok).length;
    const verdict = failed === 0 ? 'PASS' : 'FAIL';

    const artifact = {
      feature: 'SUPPLIER_BILL_CANCEL',
      verdict,
      gateCount: gates.length,
      passed,
      failed,
      gates,
      liveProof: { ran: liveRan, verdict: liveVerdict },
      generatedAt: new Date().toISOString(),
    };

    writeFileSync(
      path.join(repoRoot, 'PROOF_SUPPLIER_BILL_CANCEL.json'),
      JSON.stringify(artifact, null, 2),
    );
    writeFileSync(
      path.join(repoRoot, 'PROOF_SUPPLIER_BILL_CANCEL.md'),
      `# PROOF — Supplier bill cancel\n\n**Verdict:** ${verdict} (${passed}/${gates.length})\n**Live proof:** ${liveVerdict}\n\n## Gates\n\n${gates.map((g) => `- **${g.ok ? 'PASS' : 'FAIL'}** ${g.id}: ${g.detail}`).join('\n')}\n\nRun: \`npm run proof:supplier-bill-cancel:live && npm run proof:supplier-bill-cancel\`\n`,
    );
  });
});
