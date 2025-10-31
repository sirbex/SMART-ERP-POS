import { Card } from '@/components/ui/card';

export default function BankingPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-qb-gray-900">Banking & Reconciliation</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage bank accounts and reconcile transactions
        </p>
      </div>
      <Card className="p-6">
        <p className="text-center text-muted-foreground">Banking page coming soon...</p>
      </Card>
    </div>
  );
}
