/**
 * Credit/Debit Note Reports Service
 *
 * Business logic layer for CN/DN reporting.
 * Adds running balances and summary computations on top of repository data.
 */

import type { Pool } from 'pg';
import Decimal from 'decimal.js';
import * as repo from './cnDnReportRepository.js';
import type {
    ReturnsAllowancesRow,
    PurchaseReturnsAllowancesRow,
    LedgerEntryRow,
    NoteRegisterRow,
    TaxReversalRow,
    InvoiceAdjustmentRow,
    SupplierStatementData,
    SupplierAgingRow,
} from './cnDnReportTypes.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ─── 1. Sales Returns & Allowances (P&L) ───────────────────────────
export async function getSalesReturnsAndAllowances(
    pool: Pool,
    startDate: string,
    endDate: string,
): Promise<{
    data: ReturnsAllowancesRow[];
    summary: { totalSales: number; totalReturns: number; netSales: number; totalCreditNotes: number };
}> {
    const data = await repo.getSalesReturnsReport(pool, startDate, endDate);

    let totalSales = new Decimal(0);
    let totalReturns = new Decimal(0);
    let totalCN = 0;
    for (const row of data) {
        totalSales = totalSales.plus(row.totalSales);
        totalReturns = totalReturns.plus(row.salesReturns);
        totalCN += row.creditNoteCount;
    }

    return {
        data,
        summary: {
            totalSales: totalSales.toDecimalPlaces(2).toNumber(),
            totalReturns: totalReturns.toDecimalPlaces(2).toNumber(),
            netSales: totalSales.minus(totalReturns).toDecimalPlaces(2).toNumber(),
            totalCreditNotes: totalCN,
        },
    };
}

// ─── 2. Purchase Returns & Allowances (P&L) ────────────────────────
export async function getPurchaseReturnsAndAllowances(
    pool: Pool,
    startDate: string,
    endDate: string,
): Promise<{
    data: PurchaseReturnsAllowancesRow[];
    summary: {
        totalPurchases: number;
        totalReturns: number;
        netPurchases: number;
        totalCreditNotes: number;
    };
}> {
    const data = await repo.getPurchaseReturnsReport(pool, startDate, endDate);

    let totalPurchases = new Decimal(0);
    let totalReturns = new Decimal(0);
    let totalCN = 0;
    for (const row of data) {
        totalPurchases = totalPurchases.plus(row.totalPurchases);
        totalReturns = totalReturns.plus(row.purchaseReturns);
        totalCN += row.creditNoteCount;
    }

    return {
        data,
        summary: {
            totalPurchases: totalPurchases.toDecimalPlaces(2).toNumber(),
            totalReturns: totalReturns.toDecimalPlaces(2).toNumber(),
            netPurchases: totalPurchases.minus(totalReturns).toDecimalPlaces(2).toNumber(),
            totalCreditNotes: totalCN,
        },
    };
}

// ─── 3. AR Ledger (GL view) with running balance ───────────────────
export async function getArLedger(
    pool: Pool,
    startDate: string,
    endDate: string,
    customerId?: string,
): Promise<{
    data: LedgerEntryRow[];
    summary: { totalDebit: number; totalCredit: number; netBalance: number };
}> {
    const rows = await repo.getArLedger(pool, startDate, endDate, customerId);

    let runBal = new Decimal(0);
    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);
    const data: LedgerEntryRow[] = rows.map((r) => {
        totalDebit = totalDebit.plus(r.debit);
        totalCredit = totalCredit.plus(r.credit);
        runBal = runBal.plus(r.debit).minus(r.credit);
        return { ...r, balance: runBal.toDecimalPlaces(2).toNumber() };
    });

    return {
        data,
        summary: {
            totalDebit: totalDebit.toDecimalPlaces(2).toNumber(),
            totalCredit: totalCredit.toDecimalPlaces(2).toNumber(),
            netBalance: runBal.toDecimalPlaces(2).toNumber(),
        },
    };
}

// ─── 4. AP Ledger (GL view) with running balance ───────────────────
export async function getApLedger(
    pool: Pool,
    startDate: string,
    endDate: string,
    supplierId?: string,
): Promise<{
    data: LedgerEntryRow[];
    summary: { totalDebit: number; totalCredit: number; netBalance: number };
}> {
    const rows = await repo.getApLedger(pool, startDate, endDate, supplierId);

    let runBal = new Decimal(0);
    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);
    const data: LedgerEntryRow[] = rows.map((r) => {
        totalDebit = totalDebit.plus(r.debit);
        totalCredit = totalCredit.plus(r.credit);
        // AP is a liability: credit increases, debit decreases
        runBal = runBal.plus(r.credit).minus(r.debit);
        return { ...r, balance: runBal.toDecimalPlaces(2).toNumber() };
    });

    return {
        data,
        summary: {
            totalDebit: totalDebit.toDecimalPlaces(2).toNumber(),
            totalCredit: totalCredit.toDecimalPlaces(2).toNumber(),
            netBalance: runBal.toDecimalPlaces(2).toNumber(),
        },
    };
}

// ─── 5. Credit/Debit Note Register ─────────────────────────────────
export async function getNoteRegister(
    pool: Pool,
    options: {
        startDate: string;
        endDate: string;
        side?: 'CUSTOMER' | 'SUPPLIER';
        documentType?: string;
        status?: string;
    },
): Promise<{
    data: NoteRegisterRow[];
    summary: { totalNotes: number; totalAmount: number; postedCount: number; draftCount: number };
}> {
    const data = await repo.getNoteRegister(pool, options);

    let totalAmount = new Decimal(0);
    let posted = 0;
    let drafts = 0;
    for (const row of data) {
        totalAmount = totalAmount.plus(row.totalAmount);
        if (row.status === 'Posted' || row.status === 'POSTED') posted++;
        if (row.status === 'Draft' || row.status === 'DRAFT') drafts++;
    }

    return {
        data,
        summary: {
            totalNotes: data.length,
            totalAmount: totalAmount.toDecimalPlaces(2).toNumber(),
            postedCount: posted,
            draftCount: drafts,
        },
    };
}

// ─── 6. Tax Reversal Report ────────────────────────────────────────
export async function getTaxReversalReport(
    pool: Pool,
    startDate: string,
    endDate: string,
): Promise<{
    data: TaxReversalRow[];
    summary: {
        totalSalesTax: number;
        totalSalesReversed: number;
        netSalesTax: number;
        totalPurchaseTax: number;
        totalPurchaseReversed: number;
        netPurchaseTax: number;
    };
}> {
    const data = await repo.getTaxReversalReport(pool, startDate, endDate);

    let totalSalesTax = new Decimal(0);
    let totalSalesReversed = new Decimal(0);
    let totalPurchaseTax = new Decimal(0);
    let totalPurchaseReversed = new Decimal(0);
    for (const row of data) {
        totalSalesTax = totalSalesTax.plus(row.salesTax);
        totalSalesReversed = totalSalesReversed.plus(row.taxReversedByCN);
        totalPurchaseTax = totalPurchaseTax.plus(row.purchaseTax);
        totalPurchaseReversed = totalPurchaseReversed.plus(row.taxReversedBySCN);
    }

    return {
        data,
        summary: {
            totalSalesTax: totalSalesTax.toDecimalPlaces(2).toNumber(),
            totalSalesReversed: totalSalesReversed.toDecimalPlaces(2).toNumber(),
            netSalesTax: totalSalesTax.minus(totalSalesReversed).toDecimalPlaces(2).toNumber(),
            totalPurchaseTax: totalPurchaseTax.toDecimalPlaces(2).toNumber(),
            totalPurchaseReversed: totalPurchaseReversed.toDecimalPlaces(2).toNumber(),
            netPurchaseTax: totalPurchaseTax.minus(totalPurchaseReversed).toDecimalPlaces(2).toNumber(),
        },
    };
}

// ─── 7. Invoice Adjustment History ─────────────────────────────────
export async function getInvoiceAdjustments(
    pool: Pool,
    invoiceId: string,
    side: 'CUSTOMER' | 'SUPPLIER' = 'CUSTOMER',
): Promise<InvoiceAdjustmentRow[]> {
    return repo.getInvoiceAdjustments(pool, invoiceId, side);
}

// ─── 8. Supplier Statement ─────────────────────────────────────────
export async function getSupplierStatement(
    pool: Pool,
    supplierId: string,
    startDate: string,
    endDate: string,
): Promise<SupplierStatementData> {
    // Get supplier name
    const nameResult = await pool.query(
        `SELECT "CompanyName" FROM suppliers WHERE "Id" = $1`,
        [supplierId],
    );
    const supplierName = nameResult.rows[0]?.CompanyName || 'Unknown';

    const openingBalance = await repo.getSupplierStatementOpeningBalance(pool, supplierId, startDate);
    const rawEntries = await repo.getSupplierStatementEntries(pool, supplierId, startDate, endDate);

    // Compute running balance
    let runBal = new Decimal(openingBalance);
    const entries = rawEntries.map((e) => {
        runBal = runBal.plus(e.debit).minus(e.credit);
        return { ...e, balanceAfter: runBal.toDecimalPlaces(2).toNumber() };
    });

    return {
        supplierId,
        supplierName,
        periodStart: startDate,
        periodEnd: endDate,
        openingBalance,
        closingBalance: runBal.toDecimalPlaces(2).toNumber(),
        entries,
    };
}

// ─── 9. Supplier Aging (Aged Payables) ─────────────────────────────
export async function getSupplierAging(
    pool: Pool,
): Promise<{
    data: SupplierAgingRow[];
    summary: { totalSuppliers: number; totalOutstanding: number; current: number; over90: number };
}> {
    const asOfDate = new Date().toISOString().split('T')[0];
    const data = await repo.getSupplierAging(pool, asOfDate);

    let totalOutstanding = new Decimal(0);
    let current = new Decimal(0);
    let over90 = new Decimal(0);
    for (const row of data) {
        totalOutstanding = totalOutstanding.plus(row.totalOutstanding);
        current = current.plus(row.current);
        over90 = over90.plus(row.over90);
    }

    return {
        data,
        summary: {
            totalSuppliers: data.length,
            totalOutstanding: totalOutstanding.toDecimalPlaces(2).toNumber(),
            current: current.toDecimalPlaces(2).toNumber(),
            over90: over90.toDecimalPlaces(2).toNumber(),
        },
    };
}
