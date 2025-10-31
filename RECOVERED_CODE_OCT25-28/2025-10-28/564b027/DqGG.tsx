import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ProfitLossReport from '@/components/financial/ProfitLossReport';
import BalanceSheetReport from '@/components/financial/BalanceSheetReport';
import CashFlowReport from '@/components/financial/CashFlowReport';
import ComparativeReports from '@/components/financial/ComparativeReports';

export default function FinancialPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-qb-gray-900">Financial Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          View comprehensive financial statements and reports
        </p>
      </div>

      <Card className="p-4">
        <Tabs defaultValue="profit-loss">
          <TabsList>
            <TabsTrigger value="profit-loss">Profit & Loss</TabsTrigger>
            <TabsTrigger value="balance-sheet">Balance Sheet</TabsTrigger>
            <TabsTrigger value="cash-flow">Cash Flow</TabsTrigger>
            <TabsTrigger value="comparative">Comparative</TabsTrigger>
          </TabsList>

          <TabsContent value="profit-loss">
            <ProfitLossReport />
          </TabsContent>
          <TabsContent value="balance-sheet">
            <BalanceSheetReport />
          </TabsContent>
          <TabsContent value="cash-flow">
            <CashFlowReport />
          </TabsContent>
          <TabsContent value="comparative">
            <ComparativeReports />
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
