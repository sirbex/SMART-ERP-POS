import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

/**
 * Format a number as currency
 */
function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(num)) return String(value);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

/**
 * Export amortization schedule to PDF
 */
export function exportAmortizationToPDF(data: {
  loanNumber: string;
  borrowerName: string;
  monthlyPayment: string;
  totalInterest: string;
  totalPayment: string;
  payments: Array<{
    paymentNumber: number;
    dueDate: string;
    principal: string;
    interest: string;
    totalPayment: string;
    remainingBalance: string;
  }>;
}) {
  const doc = new jsPDF();

  // Title
  doc.setFontSize(18);
  doc.text('Amortization Schedule', 14, 20);

  // Loan info
  doc.setFontSize(11);
  doc.text(`Loan: ${data.loanNumber}`, 14, 30);
  doc.text(`Borrower: ${data.borrowerName}`, 14, 36);
  doc.text(`Monthly Payment: ${formatCurrency(data.monthlyPayment)}`, 14, 42);
  doc.text(`Total Interest: ${formatCurrency(data.totalInterest)}`, 14, 48);
  doc.text(`Total Payment: ${formatCurrency(data.totalPayment)}`, 14, 54);

  // Table
  autoTable(doc, {
    startY: 62,
    head: [['#', 'Due Date', 'Principal', 'Interest', 'Total', 'Balance']],
    body: data.payments.map((p) => [
      p.paymentNumber,
      new Date(p.dueDate).toLocaleDateString(),
      formatCurrency(p.principal),
      formatCurrency(p.interest),
      formatCurrency(p.totalPayment),
      formatCurrency(p.remainingBalance),
    ]),
    theme: 'grid',
    headStyles: { fillColor: [41, 128, 185] },
    styles: { fontSize: 9 },
  });

  doc.save(`amortization_${data.loanNumber}_${Date.now()}.pdf`);
}

/**
 * Export amortization schedule to CSV
 */
export function exportAmortizationToCSV(data: {
  loanNumber: string;
  borrowerName: string;
  monthlyPayment: string;
  totalInterest: string;
  totalPayment: string;
  payments: Array<{
    paymentNumber: number;
    dueDate: string;
    principal: string;
    interest: string;
    totalPayment: string;
    remainingBalance: string;
  }>;
}) {
  const rows = [
    ['Amortization Schedule'],
    ['Loan', data.loanNumber],
    ['Borrower', data.borrowerName],
    ['Monthly Payment', formatCurrency(data.monthlyPayment)],
    ['Total Interest', formatCurrency(data.totalInterest)],
    ['Total Payment', formatCurrency(data.totalPayment)],
    [],
    ['Payment #', 'Due Date', 'Principal', 'Interest', 'Total Payment', 'Remaining Balance'],
    ...data.payments.map((p) => [
      p.paymentNumber,
      new Date(p.dueDate).toLocaleDateString(),
      formatCurrency(p.principal),
      formatCurrency(p.interest),
      formatCurrency(p.totalPayment),
      formatCurrency(p.remainingBalance),
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Amortization');
  XLSX.writeFile(wb, `amortization_${data.loanNumber}_${Date.now()}.xlsx`);
}

/**
 * Export Profit & Loss to PDF
 */
export function exportProfitLossToPDF(report: any) {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text('Profit & Loss Statement', 14, 20);

  doc.setFontSize(11);
  doc.text(
    `${new Date(report.period.startDate).toLocaleDateString()} - ${new Date(
      report.period.endDate
    ).toLocaleDateString()}`,
    14,
    28
  );

  let y = 40;

  // Revenue
  doc.setFontSize(13);
  doc.text('Revenue', 14, y);
  y += 6;
  doc.setFontSize(10);
  report.revenue.accounts.forEach((acc: any) => {
    doc.text(`  ${acc.accountName}`, 14, y);
    doc.text(formatCurrency(acc.balance), 180, y, { align: 'right' });
    y += 5;
  });
  doc.setFont('helvetica', 'bold');
  doc.text('Total Revenue', 14, y);
  doc.text(formatCurrency(report.revenue.total), 180, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  y += 10;

  // Net Income highlight
  if (y > 250) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Net Income', 14, y);
  doc.text(formatCurrency(report.netIncome), 180, y, { align: 'right' });
  doc.text(`Margin: ${report.netProfitMargin}`, 14, y + 6);

  doc.save(`profit_loss_${Date.now()}.pdf`);
}

/**
 * Export Profit & Loss to CSV
 */
export function exportProfitLossToCSV(report: any) {
  const rows = [
    ['Profit & Loss Statement'],
    [
      `${new Date(report.period.startDate).toLocaleDateString()} - ${new Date(
        report.period.endDate
      ).toLocaleDateString()}`,
    ],
    [],
    ['Revenue'],
    ...report.revenue.accounts.map((acc: any) => [acc.accountName, formatCurrency(acc.balance)]),
    ['Total Revenue', formatCurrency(report.revenue.total)],
    [],
    ['Cost of Goods Sold'],
    ...report.costOfGoodsSold.accounts.map((acc: any) => [
      acc.accountName,
      formatCurrency(acc.balance),
    ]),
    ['Total COGS', formatCurrency(report.costOfGoodsSold.total)],
    [],
    ['Gross Profit', formatCurrency(report.grossProfit), report.grossProfitMargin],
    [],
    ['Operating Expenses'],
    ...report.operatingExpenses.accounts.map((acc: any) => [
      acc.accountName,
      formatCurrency(acc.balance),
    ]),
    ['Total Operating Expenses', formatCurrency(report.operatingExpenses.total)],
    [],
    ['Operating Income', formatCurrency(report.operatingIncome), report.operatingMargin],
    [],
    ['Net Income', formatCurrency(report.netIncome), report.netProfitMargin],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Profit & Loss');
  XLSX.writeFile(wb, `profit_loss_${Date.now()}.xlsx`);
}

/**
 * Export Balance Sheet to PDF
 */
export function exportBalanceSheetToPDF(report: any) {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text('Balance Sheet', 14, 20);

  doc.setFontSize(11);
  doc.text(`As of ${new Date(report.asOfDate).toLocaleDateString()}`, 14, 28);

  let y = 40;

  // Assets
  doc.setFontSize(13);
  doc.text('ASSETS', 14, y);
  y += 8;

  doc.setFontSize(10);
  doc.text('Current Assets', 14, y);
  y += 5;
  report.assets.currentAssets.accounts.forEach((acc: any) => {
    doc.text(`  ${acc.accountName}`, 14, y);
    doc.text(formatCurrency(acc.balance), 90, y, { align: 'right' });
    y += 5;
  });
  doc.setFont('helvetica', 'bold');
  doc.text('Total Current Assets', 14, y);
  doc.text(formatCurrency(report.assets.currentAssets.total), 90, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  y += 8;

  doc.text('Fixed Assets', 14, y);
  y += 5;
  report.assets.fixedAssets.accounts.forEach((acc: any) => {
    doc.text(`  ${acc.accountName}`, 14, y);
    doc.text(formatCurrency(acc.balance), 90, y, { align: 'right' });
    y += 5;
  });
  doc.setFont('helvetica', 'bold');
  doc.text('Total Fixed Assets', 14, y);
  doc.text(formatCurrency(report.assets.fixedAssets.total), 90, y, { align: 'right' });
  y += 8;
  doc.text('TOTAL ASSETS', 14, y);
  doc.text(formatCurrency(report.assets.totalAssets), 90, y, { align: 'right' });

  // Start second column for Liabilities & Equity
  y = 40;
  const col2X = 110;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'normal');
  doc.text('LIABILITIES & EQUITY', col2X, y);
  y += 8;

  doc.setFontSize(10);
  doc.text('Current Liabilities', col2X, y);
  y += 5;
  report.liabilities.currentLiabilities.accounts.forEach((acc: any) => {
    doc.text(`  ${acc.accountName}`, col2X, y);
    doc.text(formatCurrency(acc.balance), 190, y, { align: 'right' });
    y += 5;
  });
  doc.setFont(undefined, 'bold');
  doc.text('Total Current Liabilities', col2X, y);
  doc.text(formatCurrency(report.liabilities.currentLiabilities.total), 190, y, { align: 'right' });
  doc.setFont(undefined, 'normal');
  y += 8;

  doc.text('Equity', col2X, y);
  y += 5;
  report.equity.accounts.forEach((acc: any) => {
    doc.text(`  ${acc.accountName}`, col2X, y);
    doc.text(formatCurrency(acc.balance), 190, y, { align: 'right' });
    y += 5;
  });
  doc.setFont(undefined, 'bold');
  doc.text('Total Equity', col2X, y);
  doc.text(formatCurrency(report.equity.total), 190, y, { align: 'right' });
  y += 8;
  doc.text('TOTAL LIABILITIES & EQUITY', col2X, y);
  doc.text(formatCurrency(report.totalLiabilitiesAndEquity), 190, y, { align: 'right' });

  doc.save(`balance_sheet_${Date.now()}.pdf`);
}

/**
 * Export Balance Sheet to CSV
 */
export function exportBalanceSheetToCSV(report: any) {
  const rows = [
    ['Balance Sheet'],
    [`As of ${new Date(report.asOfDate).toLocaleDateString()}`],
    [],
    ['ASSETS'],
    ['Current Assets'],
    ...report.assets.currentAssets.accounts.map((acc: any) => [
      acc.accountName,
      formatCurrency(acc.balance),
    ]),
    ['Total Current Assets', formatCurrency(report.assets.currentAssets.total)],
    [],
    ['Fixed Assets'],
    ...report.assets.fixedAssets.accounts.map((acc: any) => [
      acc.accountName,
      formatCurrency(acc.balance),
    ]),
    ['Total Fixed Assets', formatCurrency(report.assets.fixedAssets.total)],
    [],
    ['TOTAL ASSETS', formatCurrency(report.assets.totalAssets)],
    [],
    ['LIABILITIES & EQUITY'],
    ['Current Liabilities'],
    ...report.liabilities.currentLiabilities.accounts.map((acc: any) => [
      acc.accountName,
      formatCurrency(acc.balance),
    ]),
    ['Total Current Liabilities', formatCurrency(report.liabilities.currentLiabilities.total)],
    [],
    ['Long-term Liabilities'],
    ...report.liabilities.longTermLiabilities.accounts.map((acc: any) => [
      acc.accountName,
      formatCurrency(acc.balance),
    ]),
    ['Total Long-term Liabilities', formatCurrency(report.liabilities.longTermLiabilities.total)],
    [],
    ['Equity'],
    ...report.equity.accounts.map((acc: any) => [acc.accountName, formatCurrency(acc.balance)]),
    ['Total Equity', formatCurrency(report.equity.total)],
    [],
    ['TOTAL LIABILITIES & EQUITY', formatCurrency(report.totalLiabilitiesAndEquity)],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Balance Sheet');
  XLSX.writeFile(wb, `balance_sheet_${Date.now()}.xlsx`);
}
