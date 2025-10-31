import { Card } from '@/components/ui/card';

export default function FinancialPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-qb-gray-900">Financial Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          View P&L statements, balance sheets, and comparative analysis
        </p>
      </div>
      <Card className="p-6">
        <p className="text-center text-muted-foreground">Financial reports page coming soon...</p>
      </Card>
    </div>
  );
}
