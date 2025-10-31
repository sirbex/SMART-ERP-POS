import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import financialReportsService, { type ProfitAndLossReport, type AccountSummary } from '@/services/financialReportsService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Download, FileDown } from 'lucide-react';
import { exportProfitLossToPDF, exportProfitLossToCSV } from '@/utils/exportUtils';

function currency(amount: string | number) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(num)) return amount as string;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(num);
}

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export default function ProfitLossReport() {
  const defaults = getDefaultDateRange();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [queryDates, setQueryDates] = useState(defaults);

  const { data, isLoading, error } = useQuery({
    queryKey: ['profit-loss', queryDates.startDate, queryDates.endDate],
    queryFn: () => financialReportsService.getProfitAndLoss(queryDates.startDate, queryDates.endDate),
  });

  const report: ProfitAndLossReport | undefined = data?.report;

  const handleGenerate = () => {
    setQueryDates({ startDate, endDate });
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-end">
          <div className="flex-1">
            <label className="text-sm font-medium">Start Date</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="text-sm font-medium">End Date</label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <Button onClick={handleGenerate}>Generate Report</Button>
        </div>
      </Card>

      {isLoading && <div className="text-sm text-muted-foreground p-4">Loading report...</div>}
      {error && <div className="text-sm text-red-600 p-4">Error loading report. Please try again.</div>}

      {report && (
        <div className="space-y-4">
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => exportProfitLossToPDF(report)}>
              <FileDown className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
            <Button size="sm" variant="outline" onClick={() => exportProfitLossToCSV(report)}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>

          <Card className="p-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-qb-gray-900">Profit & Loss Statement</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {new Date(report.period.startDate).toLocaleDateString()} - {new Date(report.period.endDate).toLocaleDateString()}
              </p>
            </div>

            <div className="space-y-6">
              {/* Revenue */}
              <div>
                <div className="font-semibold text-lg mb-2">Revenue</div>
                <Table>
                  <TableBody>
                    {report.revenue.accounts.map((acc: AccountSummary) => (
                      <TableRow key={acc.accountId}>
                        <TableCell className="pl-6">{acc.accountName}</TableCell>
                        <TableCell className="text-right">{currency(acc.balance)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold border-t-2">
                      <TableCell>Total Revenue</TableCell>
                      <TableCell className="text-right">{currency(report.revenue.total)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* COGS */}
              {parseFloat(report.costOfGoodsSold.total) !== 0 && (
                <div>
                  <div className="font-semibold text-lg mb-2">Cost of Goods Sold</div>
                  <Table>
                    <TableBody>
                      {report.costOfGoodsSold.accounts.map((acc: AccountSummary) => (
                        <TableRow key={acc.accountId}>
                          <TableCell className="pl-6">{acc.accountName}</TableCell>
                          <TableCell className="text-right">{currency(acc.balance)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold border-t-2">
                        <TableCell>Total COGS</TableCell>
                        <TableCell className="text-right">{currency(report.costOfGoodsSold.total)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded flex justify-between">
                    <span className="font-semibold">Gross Profit</span>
                    <span className="font-semibold">{currency(report.grossProfit)} ({report.grossProfitMargin})</span>
                  </div>
                </div>
              )}

              {/* Operating Expenses */}
              <div>
                <div className="font-semibold text-lg mb-2">Operating Expenses</div>
                <Table>
                  <TableBody>
                    {report.operatingExpenses.accounts.map((acc: AccountSummary) => (
                      <TableRow key={acc.accountId}>
                        <TableCell className="pl-6">{acc.accountName}</TableCell>
                        <TableCell className="text-right">{currency(acc.balance)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold border-t-2">
                      <TableCell>Total Operating Expenses</TableCell>
                      <TableCell className="text-right">{currency(report.operatingExpenses.total)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded flex justify-between">
                  <span className="font-semibold">Operating Income</span>
                  <span className="font-semibold">{currency(report.operatingIncome)} ({report.operatingMargin})</span>
                </div>
              </div>

              {/* Net Income */}
              <div className="mt-4 p-4 bg-green-50 border-2 border-green-300 rounded-lg flex justify-between items-center">
                <span className="text-xl font-bold text-green-900">Net Income</span>
                <div className="text-right">
                  <div className="text-2xl font-bold text-green-900">{currency(report.netIncome)}</div>
                  <div className="text-sm text-green-700">Margin: {report.netProfitMargin}</div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
