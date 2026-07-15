/**
 * Liquidity Movements — HTTP surface under /api/reports/liquidity-movements
 * Supports format=json (default) | pdf | csv from the same query SSOT.
 */

import type { Request, Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  getLiquidityAccountBalances,
  getLiquidityMovementsReport,
  LIQUIDITY_COLUMN_LABELS,
  LIQUIDITY_MOVEMENT_COLUMNS,
  friendlyLiquidityDocType,
  type LiquidityMovementColumn,
  type LiquidityMovementRow,
} from './liquidityMovementsReportService.js';
import { ValidationError } from '../../middleware/errorHandler.js';
import {
  ReportPDFGenerator,
  PDFTableColumn,
  formatCurrencyPDF,
  PDFColors,
} from '../documents/pdfGenerator.js';
import { reportsService } from './reportsService.js';

const QuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  accountCode: z.string().optional(),
  documentType: z.string().optional(),
  q: z.string().max(200).optional(),
  treasuryDocumentsOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  includeReversals: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? true : v === 'true')),
  columns: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional(),
  format: z.enum(['json', 'pdf', 'csv']).optional().default('json'),
});

function now(): string {
  return new Date().toLocaleString('en-GB', { hour12: false });
}

async function getCompanyName(pool: Pool): Promise<string> {
  try {
    const settings = await reportsService.getSystemSettings(pool);
    return settings.businessName || 'SMART ERP';
  } catch {
    return 'SMART ERP';
  }
}

function parseColumns(raw?: string): LiquidityMovementColumn[] | undefined {
  if (!raw) return undefined;
  return raw
    .split(',')
    .map((c) => c.trim())
    .filter((c): c is LiquidityMovementColumn =>
      (LIQUIDITY_MOVEMENT_COLUMNS as readonly string[]).includes(c),
    );
}

const DEFAULT_EXPORT_COLUMNS: LiquidityMovementColumn[] = [
  'transactionDate',
  'documentNumber',
  'documentType',
  'accountCode',
  'accountName',
  'description',
  'debitAmount',
  'creditAmount',
];

function cellValue(row: LiquidityMovementRow, col: LiquidityMovementColumn): string {
  const v = row[col];
  if (col === 'documentType') return friendlyLiquidityDocType(v as string | null);
  if (col === 'debitAmount' || col === 'creditAmount') {
    const n = Number(v || 0);
    return n ? n.toFixed(2) : '';
  }
  if (v == null) return '';
  return String(v);
}

function pdfColumnDefs(columns: LiquidityMovementColumn[]): PDFTableColumn[] {
  const widths: Partial<Record<LiquidityMovementColumn, number>> = {
    transactionDate: 0.1,
    transactionNumber: 0.1,
    documentNumber: 0.1,
    documentType: 0.09,
    accountCode: 0.08,
    accountName: 0.12,
    description: 0.2,
    debitAmount: 0.1,
    creditAmount: 0.1,
    fromAccountCode: 0.08,
    toAccountCode: 0.08,
    referenceType: 0.09,
    journalId: 0.1,
    treasuryDocumentId: 0.1,
  };
  const raw = columns.map((id) => ({
    id,
    w: widths[id] ?? 0.1,
  }));
  const sum = raw.reduce((s, c) => s + c.w, 0) || 1;
  return raw.map(({ id, w }) => ({
    header: LIQUIDITY_COLUMN_LABELS[id],
    key: id,
    width: w / sum,
    align: id === 'debitAmount' || id === 'creditAmount' ? ('right' as const) : ('left' as const),
  }));
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export const liquidityMovementsReportController = {
  async getMovements(req: Request, res: Response, pool: Pool) {
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues.map((i) => i.message).join('; '));
    }
    const q = parsed.data;
    if (q.startDate > q.endDate) {
      throw new ValidationError('startDate must be on or before endDate');
    }

    const columns = parseColumns(q.columns);
    const exportLimit = q.format === 'json' ? q.limit : q.limit ?? 5000;
    const data = await getLiquidityMovementsReport(pool, {
      startDate: q.startDate,
      endDate: q.endDate,
      accountCode: q.accountCode,
      documentType: q.documentType,
      search: q.q,
      treasuryDocumentsOnly: q.treasuryDocumentsOnly,
      includeReversals: q.includeReversals,
      columns: columns ?? (q.format === 'json' ? undefined : DEFAULT_EXPORT_COLUMNS),
      limit: exportLimit,
    });

    if (q.format === 'csv') {
      const cols = data.meta.columns;
      const header = cols.map((c) => csvEscape(LIQUIDITY_COLUMN_LABELS[c])).join(',');
      const lines = data.rows.map((row) =>
        cols.map((c) => csvEscape(cellValue(row, c))).join(','),
      );
      const totalsRow = cols
        .map((c, i) => {
          if (c === 'debitAmount') return csvEscape(data.meta.totals.moneyIn.toFixed(2));
          if (c === 'creditAmount') return csvEscape(data.meta.totals.moneyOut.toFixed(2));
          if (i === 0) return csvEscape('TOTALS');
          if (c === 'description') {
            return csvEscape(
              `Net ${data.meta.totals.net.toFixed(2)} · ${data.meta.totals.count} lines`,
            );
          }
          return '';
        })
        .join(',');

      const body = [header, ...lines, totalsRow].join('\n');
      const filename = `liquidity-movements-${q.startDate}_${q.endDate}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(`\uFEFF${body}\n`);
      return;
    }

    if (q.format === 'pdf') {
      const company = await getCompanyName(pool);
      const gen = new ReportPDFGenerator(company, { layout: 'landscape' });
      const doc = gen.getDocument();
      const filename = `liquidity-movements-${q.startDate}_${q.endDate}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      doc.pipe(res);

      const filterBits = [
        q.accountCode ? `Account ${q.accountCode}` : 'All liquidity',
        q.documentType ? friendlyLiquidityDocType(q.documentType) : null,
        q.treasuryDocumentsOnly ? 'Documented only' : null,
        q.includeReversals === false ? 'Reversals excluded' : null,
        q.q ? `Search “${q.q}”` : null,
      ].filter(Boolean);

      gen.addHeader({
        companyName: company,
        title: 'Liquidity Movements',
        subtitle: `${q.startDate} → ${q.endDate}${filterBits.length ? ` · ${filterBits.join(' · ')}` : ''}`,
        generatedAt: now(),
      });

      gen.addSummaryCards([
        {
          label: 'Money in',
          value: formatCurrencyPDF(data.meta.totals.moneyIn),
          color: PDFColors.success,
        },
        {
          label: 'Money out',
          value: formatCurrencyPDF(data.meta.totals.moneyOut),
          color: PDFColors.danger,
        },
        {
          label: 'Net',
          value: formatCurrencyPDF(data.meta.totals.net),
          color: PDFColors.primary,
        },
        {
          label: 'Lines',
          value: String(data.meta.totals.count) + (data.meta.totals.truncated ? '+' : ''),
          color: PDFColors.info,
        },
      ]);

      const cols = data.meta.columns;
      const pdfCols = pdfColumnDefs(cols);
      gen.addTable(
        pdfCols,
        data.rows.map((row) => {
          const out: Record<string, string> = {};
          for (const c of cols) {
            if (c === 'debitAmount' || c === 'creditAmount') {
              const n = Number(row[c] || 0);
              out[c] = n ? formatCurrencyPDF(n) : '—';
            } else if (c === 'documentType') {
              out[c] = friendlyLiquidityDocType(row.documentType);
            } else {
              const v = row[c];
              out[c] = v == null || v === '' ? '—' : String(v);
            }
          }
          return out;
        }),
      );

      gen.end();
      return;
    }

    res.json({ success: true, data });
  },

  async getBalances(req: Request, res: Response, pool: Pool) {
    const items = await getLiquidityAccountBalances(pool);
    res.json({
      success: true,
      data: {
        items,
        ssot: 'posted ledger_entries (AccountingCore balance formula)',
      },
    });
  },

  async getColumns(_req: Request, res: Response) {
    res.json({
      success: true,
      data: {
        columns: LIQUIDITY_MOVEMENT_COLUMNS.map((id) => ({
          id,
          label: LIQUIDITY_COLUMN_LABELS[id],
        })),
      },
    });
  },
};
