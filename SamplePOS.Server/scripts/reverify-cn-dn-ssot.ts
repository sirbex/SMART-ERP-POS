/**
 * One-shot CN/DN integrity + accuracy reverify (no Jest/vitest env deps).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AMOUNT_NOTE_KINDS,
  AMOUNT_CHARGE_LINE_NAME,
  AMOUNT_CREDIT_LINE_NAME,
  buildCustomerAmountChargeLine,
  buildSupplierAmountChargeLine,
  buildSupplierAmountCreditLine,
  isNoteDraftStatus,
  getAmountNoteMeta,
} from '../../shared/utils/creditDebitNoteSsot.ts';
import {
  CreateCustomerDebitNoteSchema,
  CreateSupplierCreditNoteSchema,
  CreateSupplierDebitNoteSchema,
  CreateCustomerCreditNoteSchema,
} from '../../shared/zod/creditDebitNote.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const uuid = '11111111-1111-1111-1111-111111111111';
let pass = 0;
let fail = 0;
const rows: Array<{ gate: string; ok: boolean; detail?: string }> = [];

function ok(gate: string, cond: boolean, detail = '') {
  rows.push({ gate, ok: cond, detail: detail || undefined });
  if (cond) pass++;
  else fail++;
  console.log(cond ? 'PASS' : 'FAIL', gate, detail || '');
}

// Behavioral
ok('amount-kinds-3', Object.keys(AMOUNT_NOTE_KINDS).length === 3);
ok(
  'meta-cust-dn',
  getAmountNoteMeta('CUSTOMER_DEBIT_NOTE').party === 'customer'
    && getAmountNoteMeta('CUSTOMER_DEBIT_NOTE').polarity === 'debit',
);
ok('meta-sup-cn', getAmountNoteMeta('SUPPLIER_CREDIT_NOTE').polarity === 'credit');
ok('meta-sup-dn', getAmountNoteMeta('SUPPLIER_DEBIT_NOTE').polarity === 'debit');

const cl = buildCustomerAmountChargeLine(125, ' freight ');
ok(
  'cust-synth',
  cl.productName === AMOUNT_CHARGE_LINE_NAME
    && cl.unitPrice === 125
    && cl.quantity === 1
    && cl.description === 'freight',
);
ok(
  'sup-dn-synth',
  buildSupplierAmountChargeLine(50).unitCost === 50
    && buildSupplierAmountChargeLine(50).productName === AMOUNT_CHARGE_LINE_NAME,
);
ok(
  'sup-cn-synth',
  buildSupplierAmountCreditLine(40).productName === AMOUNT_CREDIT_LINE_NAME
    && buildSupplierAmountCreditLine(40).unitCost === 40,
);

ok(
  'zod-cust-dn-amount',
  CreateCustomerDebitNoteSchema.safeParse({ invoiceId: uuid, reason: 'x', amount: 10 }).success,
);
ok(
  'zod-cust-dn-empty',
  !CreateCustomerDebitNoteSchema.safeParse({ invoiceId: uuid, reason: 'x' }).success,
);
ok(
  'zod-cust-dn-zero',
  !CreateCustomerDebitNoteSchema.safeParse({ invoiceId: uuid, reason: 'x', amount: 0 }).success,
);
ok(
  'zod-sup-cn-amount',
  CreateSupplierCreditNoteSchema.safeParse({
    invoiceId: uuid,
    reason: 'x',
    noteType: 'PRICE_CORRECTION',
    amount: 10,
  }).success,
);
ok(
  'zod-sup-cn-full-needs-lines',
  !CreateSupplierCreditNoteSchema.safeParse({
    invoiceId: uuid,
    reason: 'x',
    noteType: 'FULL',
    amount: 10,
  }).success,
);
ok(
  'zod-sup-dn',
  CreateSupplierDebitNoteSchema.safeParse({ invoiceId: uuid, reason: 'x', amount: 5 }).success,
);
ok(
  'zod-cust-cn-needs-lines',
  !CreateCustomerCreditNoteSchema.safeParse({
    invoiceId: uuid,
    reason: 'x',
    noteType: 'PRICE_CORRECTION',
  }).success,
);
ok(
  'draft-case',
  isNoteDraftStatus('Draft')
    && isNoteDraftStatus('DRAFT')
    && !isNoteDraftStatus('POSTED'),
);

// Structural
const page = readFileSync(resolve(root, 'samplepos.client/src/pages/accounting/CreditDebitNotesPage.tsx'), 'utf8');
const dlg = readFileSync(resolve(root, 'samplepos.client/src/components/accounting/creditDebitNotes/CreateAmountNoteDialog.tsx'), 'utf8');
const svc = readFileSync(resolve(root, 'SamplePOS.Server/src/modules/credit-debit-notes/creditDebitNoteService.ts'), 'utf8');
const gl = readFileSync(resolve(root, 'SamplePOS.Server/src/services/glEntryService.ts'), 'utf8');
const ctrl = readFileSync(resolve(root, 'SamplePOS.Server/src/modules/credit-debit-notes/creditDebitNoteController.ts'), 'utf8');
const grids = readFileSync(resolve(root, 'samplepos.client/src/components/accounting/CreditDebitNotesAdaptiveGrids.tsx'), 'utf8');
const api = readFileSync(resolve(root, 'samplepos.client/src/services/creditDebitNoteService.ts'), 'utf8');
const linked = readFileSync(resolve(root, 'samplepos.client/src/components/accounting/creditDebitNotes/linkedInvoiceSearch.ts'), 'utf8');

ok('page-ssot-import', page.includes("from '../../components/accounting/creditDebitNotes'"));
ok('page-create-amount', page.includes('CreateAmountNoteDialog') && page.includes('SelectCustomerInvoiceDialog'));
ok(
  'page-no-local-modals',
  !page.includes('function CreateCustomerNoteModal')
    && !page.includes('function CreateSupplierNoteModal'),
);
ok(
  'dlg-zod-client',
  dlg.includes('CreateCustomerDebitNoteSchema')
    && dlg.includes('CreateSupplierCreditNoteSchema')
    && dlg.includes('CreateSupplierDebitNoteSchema'),
);
ok('dlg-uniform-footer', dlg.includes('Save draft') && dlg.includes('Create & post'));
ok('dlg-unwrap-envelope', dlg.includes('res.data?.note'));
ok(
  'server-synth-ssot',
  svc.includes('buildCustomerAmountChargeLine')
    && svc.includes('buildSupplierAmountChargeLine')
    && svc.includes('buildSupplierAmountCreditLine')
    && svc.includes('creditDebitNoteSsot'),
);
ok(
  'server-no-legacy-hardcode',
  !svc.includes("productName: 'Additional Charge'")
    && !svc.includes("productName: 'Price Correction'"),
);
ok(
  'dn-gl-source',
  (() => {
    const i = gl.indexOf('export async function recordCustomerDebitNoteToGL');
    if (i < 0) return false;
    const slice = gl.slice(i, i + 2500);
    return slice.includes("source: 'SALES_INVOICE'");
  })(),
);
ok(
  'cn-gl-source',
  (() => {
    const i = gl.indexOf('export async function recordCustomerCreditNoteToGL');
    if (i < 0) return false;
    const slice = gl.slice(i, i + 2500);
    return slice.includes("source: 'SALES_REFUND'");
  })(),
);
ok(
  'controller-zod',
  ctrl.includes('CreateCustomerDebitNoteSchema')
    && ctrl.includes('CreateSupplierCreditNoteSchema')
    && ctrl.includes('CreateSupplierDebitNoteSchema'),
);
ok('grids-ssot', grids.includes('isNoteDraftStatus') && grids.includes('creditDebitNoteSsot'));
ok('api-zod-types', api.includes("from '@shared/zod/creditDebitNote'"));
ok(
  'linked-search-both-parties',
  linked.includes("party === 'customer'")
    && linked.includes('/accounting/comprehensive/invoices')
    && linked.includes('/supplier-payments/invoices'),
);

// API envelope accuracy: controller shape matches dialog unwrap
ok(
  'controller-envelope',
  ctrl.includes('data: { note: result.note, lineItems: result.lineItems }'),
);
ok(
  'api-returns-response-data',
  /createCustomerDebitNote[\s\S]{0,200}return response\.data/.test(api),
);

console.log(JSON.stringify({ pass, fail, result: fail ? 'FAIL' : 'PASS', total: pass + fail }, null, 2));
process.exit(fail ? 1 : 0);
