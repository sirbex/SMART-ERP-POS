import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import financialReportsService, { type BalanceSheetReport, type AccountSummary } from '@/services/financialReportsService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { CheckCircle2, XCircle } from 'lucide-react';

function currency(amount: string | number) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(num)) return amount as string;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(num);
}

export default function BalanceSheetReport() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [queryDate, setQueryDate] = useState(asOfDate);

  const { data, isLoading, error } = useQuery({
    queryKey: ['balance-sheet', queryDate],
    queryFn: () => financialReportsService.getBalanceSheet(queryDate),
  });

  const report: BalanceSheetReport | undefined = data?.report;

  const handleGenerate = () => {
    setQueryDate(asOfDate);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-end">
          <div className="flex-1">
            <label className="text-sm font-medium">As of Date</label>
            <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </div>
          <Button onClick={handleGenerate}>Generate Report</Button>
        </div>
      </Card>

      {isLoading && <div className="text-sm text-muted-foreground p-4">Loading report...</div>}
      {error && <div className="text-sm text-red-600 p-4">Error loading report. Please try again.</div>}

      {report && (
        <div className="space-y-4">
          <Card className="p-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-qb-gray-900">Balance Sheet</h2>
              <p className="text-sm text-muted-foreground mt-1">
                As of {new Date(report.asOfDate).toLocaleDateString()}
              </p>
              <div className="mt-2 flex items-center justify-center gap-2">
                {report.isBalanced ? (
                  <>
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="text-sm text-green-700 font-medium">Balanced</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-red-600" />
                    <span className="text-sm text-red-700 font-medium">Unbalanced</span>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Assets */}
              <div className="space-y-4">
                <div className="font-bold text-xl text-qb-gray-900">ASSETS</div>

                <div>
                  <div className="font-semibold mb-2">Current Assets</div>
                  <Table>
                    <TableBody>
                      {report.assets.currentAssets.accounts.map((acc: AccountSummary) => (
                        <TableRow key={acc.accountId}>
                          <TableCell className="pl-4 text-sm">{acc.accountName}</TableCell>
                          <TableCell className="text-right text-sm">{currency(acc.balance)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold border-t">
                        <TableCell>Total Current Assets</TableCell>
                        <TableCell className="text-right">{currency(report.assets.currentAssets.total)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                <div>
                  <div className="font-semibold mb-2">Fixed Assets</div>
                  <Table>
                    <TableBody>
                      {report.assets.fixedAssets.accounts.map((acc: AccountSummary) => (
                        <TableRow key={acc.accountId}>
                          <TableCell className="pl-4 text-sm">{acc.accountName}</TableCell>
                          <TableCell className="text-right text-sm">{currency(acc.balance)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold border-t">
                        <TableCell>Total Fixed Assets</TableCell>
                        <TableCell className="text-right">{currency(report.assets.fixedAssets.total)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded flex justify-between">
                  <span className="font-bold">Total Assets</span>
                  <span className="font-bold">{currency(report.assets.totalAssets)}</span>
                </div>
              </div>

              {/* Liabilities & Equity */}
              <div className="space-y-4">
                <div className="font-bold text-xl text-qb-gray-900">LIABILITIES & EQUITY</div>

                <div>
                  <div className="font-semibold mb-2">Current Liabilities</div>
                  <Table>
                    <TableBody>
                      {report.liabilities.currentLiabilities.accounts.map((acc: AccountSummary) => (
                        <TableRow key={acc.accountId}>
                          <TableCell className="pl-4 text-sm">{acc.accountName}</TableCell>
                          <TableCell className="text-right text-sm">{currency(acc.balance)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold border-t">
                        <TableCell>Total Current Liabilities</TableCell>
                        <TableCell className="text-right">{currency(report.liabilities.currentLiabilities.total)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                <div>
                  <div className="font-semibold mb-2">Long-term Liabilities</div>
                  <Table>
                    <TableBody>
                      {report.liabilities.longTermLiabilities.accounts.map((acc: AccountSummary) => (
                        <TableRow key={acc.accountId}>
                          <TableCell className="pl-4 text-sm">{acc.accountName}</TableCell>
                          <TableCell className="text-right text-sm">{currency(acc.balance)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold border-t">
                        <TableCell>Total Long-term Liabilities</TableCell>
                        <TableCell className="text-right">{currency(report.liabilities.longTermLiabilities.total)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded flex justify-between">
                  <span className="font-bold">Total Liabilities</span>
                  <span className="font-bold">{currency(report.liabilities.totalLiabilities)}</span>
                </div>

                <div>
                  <div className="font-semibold mb-2">Equity</div>
                  <Table>
                    <TableBody>
                      {report.equity.accounts.map((acc: AccountSummary) => (
                        <TableRow key={acc.accountId}>
                          <TableCell className="pl-4 text-sm">{acc.accountName}</TableCell>
                          <TableCell className="text-right text-sm">{currency(acc.balance)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold border-t">
                        <TableCell>Total Equity</TableCell>
                        <TableCell className="text-right">{currency(report.equity.total)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded flex justify-between">
                  <span className="font-bold">Total Liabilities & Equity</span>
                  <span className="font-bold">{currency(report.totalLiabilitiesAndEquity)}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
