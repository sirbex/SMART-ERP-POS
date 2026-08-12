/**
 * HR payroll / advances / balances export HTTP.
 * Sheet numbers come ONLY from shared/hr/payrollExportSheet (SSOT).
 * PDF uses ReportPDFGenerator; CSV uses payrollSheetToCsv / advanceSheetToCsv / balanceSheetToCsv.
 */

import type { Response } from 'express';
import type { Pool } from 'pg';
import {
    ReportPDFGenerator,
    formatCurrencyPDF,
    PDFColors,
    type PDFTableColumn,
} from '../documents/pdfGenerator.js';
import { reportsService } from '../reports/reportsService.js';
import { hrService } from './hr.service.js';
import {
    advanceSheetToCsv,
    balanceSheetToCsv,
    buildAdvanceExportSheet,
    buildBalanceExportSheet,
    buildPayrollExportSheet,
    payrollSheetToCsv,
} from '../../../../shared/hr/payrollExportSheet.js';

export type ExportFormat = 'pdf' | 'csv';

function sendCsv(res: Response, filename: string, body: string): void {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(body);
}

function moneyPdf(n: number): string {
    return formatCurrencyPDF(n);
}

function nowStamp(): string {
    return new Date().toLocaleString('en-GB', { hour12: false, timeZone: 'Africa/Kampala' });
}

async function companyName(pool: Pool): Promise<string> {
    const settings = await reportsService.getSystemSettings(pool);
    return settings.businessName || 'SMART ERP';
}

function beginPdf(
    res: Response,
    filename: string,
    company: string,
    layout: 'portrait' | 'landscape' = 'landscape'
): ReportPDFGenerator {
    const gen = new ReportPDFGenerator(company, { layout });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    gen.getDocument().pipe(res);
    return gen;
}

export async function exportPayrollPeriod(
    pool: Pool,
    res: Response,
    periodId: string,
    format: ExportFormat
): Promise<void> {
    const period = await hrService.getPayrollPeriodById(pool, periodId);
    if (!period) {
        res.status(404).json({ success: false, error: 'Payroll period not found' });
        return;
    }
    const entries = await hrService.getPayrollEntries(pool, periodId);
    const sheet = buildPayrollExportSheet(
        { startDate: period.startDate, endDate: period.endDate, status: period.status },
        entries
    );
    const range = `${sheet.periodStart}_${sheet.periodEnd}`;

    if (format === 'csv') {
        sendCsv(res, `payroll-${range}.csv`, payrollSheetToCsv(sheet));
        return;
    }

    const company = await companyName(pool);
    const gen = beginPdf(res, `payroll-${range}.pdf`, company, 'landscape');
    gen.addHeader({
        companyName: company,
        title: 'Payroll sheet',
        subtitle: `${sheet.periodStart} → ${sheet.periodEnd} · ${sheet.status}`,
        generatedAt: nowStamp(),
    });
    gen.addSummaryCards([
        { label: 'Gross', value: moneyPdf(sheet.totals.gross), color: PDFColors.info },
        { label: 'Advance recovered', value: moneyPdf(sheet.totals.advanceRecovered), color: PDFColors.warning },
        { label: 'Net to pay', value: moneyPdf(sheet.totals.netPay), color: PDFColors.success },
        { label: 'Staff', value: String(sheet.totals.count), color: PDFColors.primary },
    ]);

    const cols: PDFTableColumn[] = [
        { header: 'Employee', key: 'name', width: 0.16, align: 'left' },
        { header: 'Dept', key: 'dept', width: 0.1, align: 'left' },
        { header: 'Basic', key: 'basic', width: 0.11, align: 'right' },
        { header: 'Allowances', key: 'allow', width: 0.11, align: 'right' },
        { header: 'Gross', key: 'gross', width: 0.11, align: 'right' },
        { header: 'Advance rec.', key: 'adv', width: 0.13, align: 'right' },
        { header: 'Net to pay', key: 'net', width: 0.13, align: 'right' },
        { header: 'Pay JE', key: 'payJe', width: 0.15, align: 'left' },
    ];
    gen.addTable(
        cols,
        sheet.rows.map((r) => ({
            name: r.employeeName || '—',
            dept: r.department || '—',
            basic: moneyPdf(r.basicSalary),
            allow: moneyPdf(r.allowances),
            gross: moneyPdf(r.gross),
            adv: moneyPdf(r.advanceRecovered),
            net: moneyPdf(r.netPay),
            payJe: r.paymentJe || r.accrualJe || '—',
        }))
    );
    gen.end();
}

export async function exportAdvances(
    pool: Pool,
    res: Response,
    format: ExportFormat,
    filters: { employeeId?: string; status?: string } = {}
): Promise<void> {
    const advances = await hrService.listAdvances(pool, filters);
    const sheet = buildAdvanceExportSheet(advances);
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
        sendCsv(res, `staff-advances-${stamp}.csv`, advanceSheetToCsv(sheet));
        return;
    }

    const company = await companyName(pool);
    const gen = beginPdf(res, `staff-advances-${stamp}.pdf`, company, 'landscape');
    gen.addHeader({
        companyName: company,
        title: 'Staff advances & shortages',
        subtitle: filters.status ? `Status ${filters.status}` : 'All open and cleared',
        generatedAt: nowStamp(),
    });
    gen.addSummaryCards([
        { label: 'Issued', value: moneyPdf(sheet.totals.amount), color: PDFColors.info },
        { label: 'Still outstanding', value: moneyPdf(sheet.totals.remaining), color: PDFColors.warning },
        { label: 'Shortage charged', value: moneyPdf(sheet.totals.shortage), color: PDFColors.danger },
        { label: 'Records', value: String(sheet.totals.count), color: PDFColors.primary },
    ]);
    gen.addTable(
        [
            { header: 'Date', key: 'date', width: 0.1, align: 'left' },
            { header: 'Employee', key: 'name', width: 0.18, align: 'left' },
            { header: 'Reason', key: 'reason', width: 0.16, align: 'left' },
            { header: 'Amount', key: 'amount', width: 0.12, align: 'right' },
            { header: 'Remaining', key: 'remaining', width: 0.12, align: 'right' },
            { header: 'Status', key: 'status', width: 0.1, align: 'left' },
            { header: 'JE', key: 'je', width: 0.22, align: 'left' },
        ],
        sheet.rows.map((r) => ({
            date: r.advanceDate,
            name: r.employeeName || '—',
            reason: r.reasonLabel,
            amount: moneyPdf(r.amount),
            remaining: moneyPdf(r.remainingAmount),
            status: r.status,
            je: r.journalJe || '—',
        }))
    );
    gen.end();
}

export async function exportBalances(pool: Pool, res: Response, format: ExportFormat): Promise<void> {
    const balances = await hrService.listEmployeeBalances(pool);
    const sheet = buildBalanceExportSheet(balances);
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
        sendCsv(res, `staff-balances-${stamp}.csv`, balanceSheetToCsv(sheet));
        return;
    }

    const company = await companyName(pool);
    const gen = beginPdf(res, `staff-balances-${stamp}.pdf`, company, 'portrait');
    gen.addHeader({
        companyName: company,
        title: 'Staff ledger balances',
        subtitle: 'Salaries Payable (2400) · Employee Advances (1410)',
        generatedAt: nowStamp(),
    });
    gen.addSummaryCards([
        { label: 'Salaries payable', value: moneyPdf(sheet.totals.salariesPayable), color: PDFColors.primary },
        { label: 'Advances outstanding', value: moneyPdf(sheet.totals.advancesOutstanding), color: PDFColors.warning },
        { label: 'Staff', value: String(sheet.totals.count), color: PDFColors.info },
    ]);
    gen.addTable(
        [
            { header: 'Employee', key: 'name', width: 0.28, align: 'left' },
            { header: 'Payable acct', key: 'payAcct', width: 0.16, align: 'left' },
            { header: 'Salaries payable', key: 'payable', width: 0.2, align: 'right' },
            { header: 'Advance acct', key: 'advAcct', width: 0.16, align: 'left' },
            { header: 'Advances due', key: 'adv', width: 0.2, align: 'right' },
        ],
        sheet.rows.map((r) => ({
            name: r.employeeName,
            payAcct: r.payableAccountCode || '—',
            payable: moneyPdf(r.salariesPayable),
            advAcct: r.advanceAccountCode || '—',
            adv: moneyPdf(r.advancesOutstanding),
        }))
    );
    gen.end();
}
