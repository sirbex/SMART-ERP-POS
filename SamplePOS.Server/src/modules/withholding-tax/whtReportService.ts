/**
 * Tax Compliance Reports — SAP / Odoo / QB / Tally style period packages.
 *
 * HTTP surface: GET /api/reports/tax-compliance/{summary|register|liability}
 * (Reports module). This file is the accounting SSOT for calculations.
 *
 * Tabs:
 *   Summary   — VAT boxes (output/input) + WHT payable/receivable closing
 *   Register  — WHT certificate register (payment withholding)
 *   Liability — Opening / accrued / settled / closing for 2350, 1250, 2300
 */
import type pg from 'pg';
import { Money } from '../../utils/money.js';
import { LEDGER_NET_ACTIVE_SQL } from '../../utils/ledgerNetActive.js';
import { AccountCodes } from '../../services/glEntryService.js';
import { getTaxReversalReport } from '../reports/cnDnReportService.js';
import { listWhtCertificates, type WhtCertificateRow } from './whtService.js';
import { sumPostedVatRemittances } from '../vat-remittance/vatRemittanceSettled.js';
import { ValidationError } from '../../middleware/errorHandler.js';

export interface TaxLiabilityMovement {
  accountCode: string;
  accountName: string;
  kind: 'LIABILITY' | 'ASSET';
  opening: number;
  accrued: number;
  settled: number;
  closing: number;
  /** closing − (opening + accrued − settled); should be ~0 when consistent */
  reconcilingDifference: number;
}

export interface TaxComplianceSummary {
  period: { startDate: string; endDate: string };
  vat: {
    outputTax: number;
    outputReversed: number;
    netOutputTax: number;
    inputTax: number;
    inputReversed: number;
    netInputTax: number;
    /** Net VAT due (positive = payable) */
    netVatPayable: number;
    byRate: Array<{
      taxRate: number;
      netSalesTax: number;
      netPurchaseTax: number;
    }>;
  };
  wht: {
    payableClosing: number;
    receivableClosing: number;
    certificatesIssued: number;
    withheldInPeriod: number;
    remittedInPeriod: number;
    recoveredInPeriod: number;
  };
  standards: {
    model: 'SAP_TAX_RETURN_STYLE';
    notes: string[];
  };
}

function requirePeriod(startDate?: string, endDate?: string): { startDate: string; endDate: string } {
  if (!startDate || !endDate) {
    throw new ValidationError('startDate and endDate are required (YYYY-MM-DD)');
  }
  if (startDate > endDate) {
    throw new ValidationError('startDate must be on or before endDate');
  }
  return { startDate, endDate };
}

async function glBalanceAsOf(
  pool: pg.Pool,
  accountCode: string,
  asOfDate: string,
  kind: 'ASSET' | 'LIABILITY',
): Promise<number> {
  const result = await pool.query<{ debits: string; credits: string }>(
    `SELECT
       COALESCE(SUM(le."DebitAmount"), 0) AS debits,
       COALESCE(SUM(le."CreditAmount"), 0) AS credits
     FROM ledger_entries le
     JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
     JOIN accounts a ON a."Id" = le."AccountId"
     WHERE a."AccountCode" = $1
       AND ${LEDGER_NET_ACTIVE_SQL}
       AND lt."TransactionDate"::DATE <= $2::date`,
    [accountCode, asOfDate],
  );
  const debits = Number(result.rows[0]?.debits ?? 0);
  const credits = Number(result.rows[0]?.credits ?? 0);
  const raw = kind === 'ASSET' ? debits - credits : credits - debits;
  return Money.toNumber(Money.round(raw));
}

/** Day before startDate (YYYY-MM-DD). */
export function dayBefore(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Pure liability rollforward used by reports and proof.
 * closingExpected = opening + accrued − settled
 */
export function computeLiabilityRollforward(input: {
  opening: number;
  accrued: number;
  settled: number;
  closingActual: number;
}): { closingExpected: number; reconcilingDifference: number } {
  const closingExpected = Money.toNumber(
    Money.round(Money.subtract(Money.add(input.opening, input.accrued), input.settled)),
  );
  const reconcilingDifference = Money.toNumber(
    Money.round(Money.subtract(input.closingActual, closingExpected)),
  );
  return { closingExpected, reconcilingDifference };
}

async function periodEntryAmounts(
  pool: pg.Pool,
  startDate: string,
  endDate: string,
  side: 'PAYABLE' | 'RECEIVABLE',
): Promise<{ accrued: number; settled: number }> {
  const paymentType = side === 'PAYABLE' ? 'SUPPLIER_PAYMENT' : 'CUSTOMER_PAYMENT';
  const settleType = side === 'PAYABLE' ? 'WHT_REMITTANCE' : 'WHT_RECEIVABLE_RECOVERY';
  const result = await pool.query<{ accrued: string; settled: string }>(
    `SELECT
       COALESCE(SUM(CASE WHEN transaction_type = $1 THEN wht_amount ELSE 0 END), 0) AS accrued,
       COALESCE(SUM(CASE WHEN transaction_type = $2 THEN wht_amount ELSE 0 END), 0) AS settled
     FROM withholding_tax_entries
     WHERE created_at::DATE >= $3::date
       AND created_at::DATE <= $4::date
       AND transaction_type IN ($1, $2)`,
    [paymentType, settleType, startDate, endDate],
  );
  return {
    accrued: Money.toNumber(Money.round(Number(result.rows[0]?.accrued ?? 0))),
    settled: Money.toNumber(Money.round(Number(result.rows[0]?.settled ?? 0))),
  };
}

async function vatGlMovement(
  pool: pg.Pool,
  startDate: string,
  endDate: string,
): Promise<{ opening: number; closing: number; periodNetCredit: number }> {
  const openDate = dayBefore(startDate);
  const opening = await glBalanceAsOf(pool, AccountCodes.TAX_PAYABLE, openDate, 'LIABILITY');
  const closing = await glBalanceAsOf(pool, AccountCodes.TAX_PAYABLE, endDate, 'LIABILITY');
  const period = await pool.query<{ net: string }>(
    `SELECT COALESCE(SUM(le."CreditAmount" - le."DebitAmount"), 0) AS net
     FROM ledger_entries le
     JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
     JOIN accounts a ON a."Id" = le."AccountId"
     WHERE a."AccountCode" = $1
       AND ${LEDGER_NET_ACTIVE_SQL}
       AND lt."TransactionDate"::DATE >= $2::date
       AND lt."TransactionDate"::DATE <= $3::date`,
    [AccountCodes.TAX_PAYABLE, startDate, endDate],
  );
  return {
    opening,
    closing,
    periodNetCredit: Money.toNumber(Money.round(Number(period.rows[0]?.net ?? 0))),
  };
}

export async function getTaxComplianceSummary(
  pool: pg.Pool,
  startDate: string,
  endDate: string,
): Promise<TaxComplianceSummary> {
  const period = requirePeriod(startDate, endDate);
  const vatReport = await getTaxReversalReport(pool, period.startDate, period.endDate);
  const [payableClose, receivableClose, payablePeriod, receivablePeriod, certs] = await Promise.all([
    glBalanceAsOf(pool, AccountCodes.WHT_PAYABLE, period.endDate, 'LIABILITY'),
    glBalanceAsOf(pool, AccountCodes.WHT_RECEIVABLE, period.endDate, 'ASSET'),
    periodEntryAmounts(pool, period.startDate, period.endDate, 'PAYABLE'),
    periodEntryAmounts(pool, period.startDate, period.endDate, 'RECEIVABLE'),
    listWhtCertificates(
      { startDate: period.startDate, endDate: period.endDate },
      pool,
    ),
  ]);

  const netOutput = vatReport.summary.netSalesTax;
  const netInput = vatReport.summary.netPurchaseTax;
  const netVatPayable = Money.toNumber(Money.round(Money.subtract(netOutput, netInput)));

  return {
    period,
    vat: {
      outputTax: vatReport.summary.totalSalesTax,
      outputReversed: vatReport.summary.totalSalesReversed,
      netOutputTax: netOutput,
      inputTax: vatReport.summary.totalPurchaseTax,
      inputReversed: vatReport.summary.totalPurchaseReversed,
      netInputTax: netInput,
      netVatPayable,
      byRate: vatReport.data.map((r) => ({
        taxRate: r.taxRate,
        netSalesTax: r.netSalesTax,
        netPurchaseTax: r.netPurchaseTax,
      })),
    },
    wht: {
      payableClosing: payableClose,
      receivableClosing: receivableClose,
      certificatesIssued: certs.length,
      withheldInPeriod: Money.toNumber(
        Money.round(Money.add(payablePeriod.accrued, receivablePeriod.accrued)),
      ),
      remittedInPeriod: payablePeriod.settled,
      recoveredInPeriod: receivablePeriod.settled,
    },
    standards: {
      model: 'SAP_TAX_RETURN_STYLE',
      notes: [
        'VAT boxes from document tax (invoices / CN / SCN + POS sale_items DocumentTax lines) — SAP tax return style.',
        'WHT payable/receivable from control accounts 2350 / 1250 (Odoo / Tally withholding ledgers).',
        'Net VAT payable = net output − net input (QuickBooks Sales Tax style).',
        'Product VAT uses tax_definitions; payment WHT uses withholding_tax_types (no dual posting).',
      ],
    },
  };
}

export interface WhtRegisterReport {
  period: { startDate: string; endDate: string };
  rows: Array<
    WhtCertificateRow & {
      side: 'SUPPLIER' | 'CUSTOMER';
      status: 'ISSUED';
    }
  >;
  totals: {
    baseAmount: number;
    whtAmount: number;
    netAmount: number;
    count: number;
  };
}

export async function getWhtRegisterReport(
  pool: pg.Pool,
  startDate: string,
  endDate: string,
  side?: 'SUPPLIER' | 'CUSTOMER',
): Promise<WhtRegisterReport> {
  const period = requirePeriod(startDate, endDate);
  let rows = await listWhtCertificates(
    { startDate: period.startDate, endDate: period.endDate },
    pool,
  );
  if (side === 'SUPPLIER') {
    rows = rows.filter((r) => r.transactionType === 'SUPPLIER_PAYMENT');
  } else if (side === 'CUSTOMER') {
    rows = rows.filter((r) => r.transactionType === 'CUSTOMER_PAYMENT');
  }

  const mapped = rows.map((r) => ({
    ...r,
    side: (r.transactionType === 'CUSTOMER_PAYMENT' ? 'CUSTOMER' : 'SUPPLIER') as
      | 'SUPPLIER'
      | 'CUSTOMER',
    status: 'ISSUED' as const,
  }));

  const baseAmount = Money.toNumber(
    Money.round(mapped.reduce((s, r) => s + r.baseAmount, 0)),
  );
  const whtAmount = Money.toNumber(
    Money.round(mapped.reduce((s, r) => s + r.whtAmount, 0)),
  );
  const netAmount = Money.toNumber(
    Money.round(mapped.reduce((s, r) => s + r.netAmount, 0)),
  );

  return {
    period,
    rows: mapped,
    totals: { baseAmount, whtAmount, netAmount, count: mapped.length },
  };
}

export interface TaxLiabilityReport {
  period: { startDate: string; endDate: string };
  movements: TaxLiabilityMovement[];
  consistent: boolean;
}

export async function getTaxLiabilityReport(
  pool: pg.Pool,
  startDate: string,
  endDate: string,
): Promise<TaxLiabilityReport> {
  const period = requirePeriod(startDate, endDate);
  const openDate = dayBefore(period.startDate);

  const [
    payableOpen,
    payableClose,
    receivableOpen,
    receivableClose,
    payablePeriod,
    receivablePeriod,
    vat,
    vatSettledFromTd,
  ] = await Promise.all([
    glBalanceAsOf(pool, AccountCodes.WHT_PAYABLE, openDate, 'LIABILITY'),
    glBalanceAsOf(pool, AccountCodes.WHT_PAYABLE, period.endDate, 'LIABILITY'),
    glBalanceAsOf(pool, AccountCodes.WHT_RECEIVABLE, openDate, 'ASSET'),
    glBalanceAsOf(pool, AccountCodes.WHT_RECEIVABLE, period.endDate, 'ASSET'),
    periodEntryAmounts(pool, period.startDate, period.endDate, 'PAYABLE'),
    periodEntryAmounts(pool, period.startDate, period.endDate, 'RECEIVABLE'),
    vatGlMovement(pool, period.startDate, period.endDate),
    // VR-INV-10: settled = Σ posted VAT_REMITTANCE TDs (not GL plug)
    sumPostedVatRemittances(pool, period.startDate, period.endDate),
  ]);

  const payableRf = computeLiabilityRollforward({
    opening: payableOpen,
    accrued: payablePeriod.accrued,
    settled: payablePeriod.settled,
    closingActual: payableClose,
  });
  const receivableRf = computeLiabilityRollforward({
    opening: receivableOpen,
    accrued: receivablePeriod.accrued,
    settled: receivablePeriod.settled,
    closingActual: receivableClose,
  });
  // VAT: accrued ≈ period net credit on 2300; settled = posted VAT_REMITTANCE TDs (VR-INV-10)
  const vatAccrued = Math.max(0, vat.periodNetCredit);
  const vatSettled = vatSettledFromTd;
  const vatRf = computeLiabilityRollforward({
    opening: vat.opening,
    accrued: vatAccrued,
    settled: vatSettled,
    closingActual: vat.closing,
  });

  const movements: TaxLiabilityMovement[] = [
    {
      accountCode: AccountCodes.WHT_PAYABLE,
      accountName: 'Withholding Tax Payable',
      kind: 'LIABILITY',
      opening: payableOpen,
      accrued: payablePeriod.accrued,
      settled: payablePeriod.settled,
      closing: payableClose,
      reconcilingDifference: payableRf.reconcilingDifference,
    },
    {
      accountCode: AccountCodes.WHT_RECEIVABLE,
      accountName: 'Tax Receivable (WHT)',
      kind: 'ASSET',
      opening: receivableOpen,
      accrued: receivablePeriod.accrued,
      settled: receivablePeriod.settled,
      closing: receivableClose,
      reconcilingDifference: receivableRf.reconcilingDifference,
    },
    {
      accountCode: AccountCodes.TAX_PAYABLE,
      accountName: 'Tax Payable (VAT)',
      kind: 'LIABILITY',
      opening: vat.opening,
      accrued: vatAccrued,
      settled: vatSettled,
      closing: vat.closing,
      reconcilingDifference: vatRf.reconcilingDifference,
    },
  ];

  const consistent = movements.every((m) => Math.abs(m.reconcilingDifference) <= 0.05);

  return { period, movements, consistent };
}
