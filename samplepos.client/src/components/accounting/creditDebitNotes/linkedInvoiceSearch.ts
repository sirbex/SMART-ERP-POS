/**
 * Linked invoice search SSOT for credit/debit note create flows.
 * Customer AR invoices and supplier AP bills use one mapper shape.
 */

import { api } from '../../../services/api';
import type { LinkedInvoiceParty } from '@shared/utils/creditDebitNoteSsot';

export interface LinkedInvoiceOption {
    id: string;
    invoiceNumber: string;
    partyName: string;
    partyId?: string;
    totalAmount: string;
    amountDue?: string;
    status?: string;
}

const CANCELLED = new Set(['CANCELLED', 'Cancelled', 'VOIDED', 'VOID']);

function rowStr(row: Record<string, unknown>, ...keys: string[]): string {
    for (const k of keys) {
        const v = row[k];
        if (v != null && String(v).length) return String(v);
    }
    return '';
}

export async function searchLinkedInvoices(
    party: LinkedInvoiceParty,
    query: string,
    limit = 15,
): Promise<LinkedInvoiceOption[]> {
    if (query.trim().length < 2) return [];

    if (party === 'customer') {
        const res = await api.get('/accounting/comprehensive/invoices', {
            params: { search: query, limit, documentType: 'INVOICE' },
        });
        const rows = (res.data?.data?.data || res.data?.data || []) as Array<Record<string, unknown>>;
        return rows
            .filter((inv) => {
                const docType = rowStr(inv, 'documentType', 'document_type') || 'INVOICE';
                const status = rowStr(inv, 'status');
                return docType === 'INVOICE' && !CANCELLED.has(status);
            })
            .map((inv) => ({
                id: rowStr(inv, 'id'),
                invoiceNumber: rowStr(inv, 'invoiceNumber', 'invoice_number'),
                partyName: rowStr(inv, 'customerName', 'customer_name') || 'Customer',
                partyId: rowStr(inv, 'customerId', 'customer_id') || undefined,
                totalAmount: rowStr(inv, 'totalAmount', 'total_amount') || '0',
                amountDue: rowStr(inv, 'amountDue', 'amount_due', 'balance') || undefined,
                status: rowStr(inv, 'status') || undefined,
            }))
            .filter((r) => r.id && r.invoiceNumber);
    }

    const res = await api.get('/supplier-payments/invoices', { params: { search: query, limit } });
    const data = (res.data?.data?.items || res.data?.data?.data || res.data?.data || []) as Array<Record<string, unknown>>;
    return data
        .map((inv) => ({
            id: rowStr(inv, 'id'),
            invoiceNumber: rowStr(inv, 'invoiceNumber', 'supplierInvoiceNumber', 'invoice_number'),
            partyName: rowStr(inv, 'supplierName', 'supplier_name') || 'Supplier',
            partyId: rowStr(inv, 'supplierId', 'supplier_id') || undefined,
            totalAmount: rowStr(inv, 'totalAmount', 'total_amount') || '0',
            amountDue: rowStr(inv, 'amountDue', 'amount_due', 'balance') || undefined,
            status: rowStr(inv, 'status') || undefined,
        }))
        .filter((r) => r.id && r.invoiceNumber);
}
