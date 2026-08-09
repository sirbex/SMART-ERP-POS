/**
 * Integrity: Credit/Debit note SSOT wiring (central create + shared schemas).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
    AMOUNT_CHARGE_LINE_NAME,
    AMOUNT_CREDIT_LINE_NAME,
    AMOUNT_NOTE_KINDS,
    buildCustomerAmountChargeLine,
    buildSupplierAmountChargeLine,
    buildSupplierAmountCreditLine,
    isNoteDraftStatus,
} from '../../../shared/utils/creditDebitNoteSsot';
import { CreateCustomerDebitNoteSchema } from '../../../shared/zod/creditDebitNote';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');

function read(rel: string) {
    return readFileSync(resolve(root, rel), 'utf8');
}

describe('Credit/Debit note SSOT integrity', () => {
    it('amount kinds cover customer DN + supplier CN/DN only', () => {
        expect(Object.keys(AMOUNT_NOTE_KINDS).sort()).toEqual([
            'CUSTOMER_DEBIT_NOTE',
            'SUPPLIER_CREDIT_NOTE',
            'SUPPLIER_DEBIT_NOTE',
        ]);
    });

    it('synthetic amount lines share names and shape', () => {
        const c = buildCustomerAmountChargeLine(100, 'freight');
        const d = buildSupplierAmountChargeLine(100, 'freight');
        const sc = buildSupplierAmountCreditLine(50, 'overcharge');
        expect(c.productName).toBe(AMOUNT_CHARGE_LINE_NAME);
        expect(d.productName).toBe(AMOUNT_CHARGE_LINE_NAME);
        expect(sc.productName).toBe(AMOUNT_CREDIT_LINE_NAME);
        expect(c.quantity).toBe(1);
        expect(d.unitCost).toBe(100);
        expect(c.unitPrice).toBe(100);
    });

    it('customer debit accepts amount-only (no product lines)', () => {
        const ok = CreateCustomerDebitNoteSchema.safeParse({
            invoiceId: '11111111-1111-1111-1111-111111111111',
            reason: 'Underbilled freight',
            amount: 2500,
        });
        expect(ok.success).toBe(true);
    });

    it('draft status normalizes client/server case', () => {
        expect(isNoteDraftStatus('Draft')).toBe(true);
        expect(isNoteDraftStatus('DRAFT')).toBe(true);
        expect(isNoteDraftStatus('POSTED')).toBe(false);
    });

    it('page delegates create to central module (no local product line form)', () => {
        const page = read('samplepos.client/src/pages/accounting/CreditDebitNotesPage.tsx');
        expect(page).toContain("from '../../components/accounting/creditDebitNotes'");
        expect(page).toContain('CreateAmountNoteDialog');
        expect(page).toContain('SelectCustomerInvoiceDialog');
        expect(page).not.toMatch(/productName:\s*''/);
        expect(page).not.toContain('function CreateCustomerNoteModal');
        expect(page).not.toContain('function CreateSupplierNoteModal');
    });

    it('server amount synthesis imports SSOT builders', () => {
        const svc = read('SamplePOS.Server/src/modules/credit-debit-notes/creditDebitNoteService.ts');
        expect(svc).toContain('buildCustomerAmountChargeLine');
        expect(svc).toContain('buildSupplierAmountChargeLine');
        expect(svc).toContain('buildSupplierAmountCreditLine');
        expect(svc).toContain('creditDebitNoteSsot');
    });

    it('client create dialog validates with shared zod', () => {
        const dlg = read('samplepos.client/src/components/accounting/creditDebitNotes/CreateAmountNoteDialog.tsx');
        expect(dlg).toContain('CreateCustomerDebitNoteSchema');
        expect(dlg).toContain('CreateSupplierCreditNoteSchema');
        expect(dlg).toContain('CreateSupplierDebitNoteSchema');
        expect(dlg).toContain('getAmountNoteMeta');
    });
});
