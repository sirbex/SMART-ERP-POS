/**
 * SupplierStatementBody — periodic supplier account statement.
 * Uses the shared statement renderer from customerStatementBody.
 */

import type { LayoutContext } from '../baseDocumentLayout.js';
import {
    renderStatementBody,
    type StatementRenderInput,
} from './customerStatementBody.js';

export interface SupplierStatementBodyData {
    supplier: {
        name: string;
        email: string | null;
        phone: string | null;
        address: string | null;
    };
    period: { start: string; end: string };
    openingBalance: number;
    closingBalance: number;
    entries: StatementRenderInput['entries'];
}

export function renderSupplierStatementBody(
    ctx: LayoutContext,
    data: SupplierStatementBodyData,
): void {
    renderStatementBody(ctx, {
        partyLabel: 'SUPPLIER',
        party: data.supplier,
        period: data.period,
        openingBalance: data.openingBalance,
        closingBalance: data.closingBalance,
        debitLabel: 'Debits',
        creditLabel: 'Credits',
        entries: data.entries,
    });
}
