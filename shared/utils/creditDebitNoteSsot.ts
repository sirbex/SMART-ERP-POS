/**
 * Credit / Debit Note SSOT — document kinds, amount-charge synthesis, status helpers.
 * Client UI, API schemas, and server create paths must consume this (not re-declare).
 */

/** Internal line label when operator posts a flat debit amount (not a POS product). */
export const AMOUNT_CHARGE_LINE_NAME = 'Additional charge' as const;

/** Internal line label when operator posts a flat credit allowance / price correction. */
export const AMOUNT_CREDIT_LINE_NAME = 'Price correction' as const;

/** UI/API kinds for flat-amount notes (one create dialog; customer CN is a separate invoice-line wizard). */
export type AmountNoteKind =
    | 'CUSTOMER_DEBIT_NOTE'
    | 'SUPPLIER_CREDIT_NOTE'
    | 'SUPPLIER_DEBIT_NOTE';

export type LinkedInvoiceParty = 'customer' | 'supplier';

export interface AmountNoteKindMeta {
    kind: AmountNoteKind;
    party: LinkedInvoiceParty;
    /** Document direction: credit reduces balance, debit increases it. */
    polarity: 'credit' | 'debit';
    title: string;
    description: string;
    invoiceLabel: string;
    invoiceSearchPlaceholder: string;
}

export const AMOUNT_NOTE_KINDS: Record<AmountNoteKind, AmountNoteKindMeta> = {
    CUSTOMER_DEBIT_NOTE: {
        kind: 'CUSTOMER_DEBIT_NOTE',
        party: 'customer',
        polarity: 'debit',
        title: 'Create Debit Note',
        description: 'Additional charge on a customer invoice.',
        invoiceLabel: 'Customer invoice *',
        invoiceSearchPlaceholder: 'Invoice # or customer name...',
    },
    SUPPLIER_CREDIT_NOTE: {
        kind: 'SUPPLIER_CREDIT_NOTE',
        party: 'supplier',
        polarity: 'credit',
        title: 'Create Credit Note',
        description: 'Price correction or allowance on a supplier bill.',
        invoiceLabel: 'Supplier invoice *',
        invoiceSearchPlaceholder: 'Invoice # or supplier name...',
    },
    SUPPLIER_DEBIT_NOTE: {
        kind: 'SUPPLIER_DEBIT_NOTE',
        party: 'supplier',
        polarity: 'debit',
        title: 'Create Debit Note',
        description: 'Additional charge on a supplier bill.',
        invoiceLabel: 'Supplier invoice *',
        invoiceSearchPlaceholder: 'Invoice # or supplier name...',
    },
};

export function getAmountNoteMeta(kind: AmountNoteKind): AmountNoteKindMeta {
    return AMOUNT_NOTE_KINDS[kind];
}

/** Customer credit note uses invoice-line wizard, not amount form. */
export const CUSTOMER_CREDIT_NOTE_ENTRY = {
    title: 'Create Credit Note',
    description: 'Choose the customer invoice to credit.',
    invoiceLabel: 'Customer invoice *',
    invoiceSearchPlaceholder: 'Invoice # or customer name...',
} as const;

export function isNoteDraftStatus(status: string | null | undefined): boolean {
    if (!status) return false;
    const s = status.toUpperCase();
    return s === 'DRAFT';
}

/** Build AR amount charge line (unitPrice). */
export function buildCustomerAmountChargeLine(amount: number, reason?: string) {
    return {
        productName: AMOUNT_CHARGE_LINE_NAME,
        description: reason?.trim() || undefined,
        quantity: 1,
        unitPrice: amount,
        taxRate: 0,
    } as const;
}

/** Build AP amount charge line (unitCost). */
export function buildSupplierAmountChargeLine(amount: number, reason?: string) {
    return {
        productName: AMOUNT_CHARGE_LINE_NAME,
        description: reason?.trim() || undefined,
        quantity: 1,
        unitCost: amount,
        taxRate: 0,
    } as const;
}

/** Build AP price-correction / allowance line (unitCost). */
export function buildSupplierAmountCreditLine(amount: number, reason?: string) {
    return {
        productName: AMOUNT_CREDIT_LINE_NAME,
        description: reason?.trim() || undefined,
        quantity: 1,
        unitCost: amount,
        taxRate: 0,
    } as const;
}

export function supplierNoteStatusLabel(input: {
    status: string;
    referenceInvoiceNumber?: string | null;
}): string {
    if (input.status === 'APPLIED' && input.referenceInvoiceNumber) {
        return `Allocated → ${input.referenceInvoiceNumber}`;
    }
    if (input.status === 'APPLIED') return 'Fully allocated';
    return input.status;
}

export function isReturnGrnCreditNote(input: {
    documentType?: string;
    reason?: string | null;
    notes?: string | null;
}): boolean {
    return (
        input.documentType === 'SUPPLIER_CREDIT_NOTE'
        && (
            input.reason?.includes('RGRN-') === true
            || input.notes?.toLowerCase().includes('return grn') === true
        )
    );
}
