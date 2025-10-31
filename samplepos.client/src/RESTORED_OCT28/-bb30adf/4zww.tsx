import { Card } from '@/components/ui/card';

export default function LoansPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-qb-gray-900">Loans Management</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage customer, supplier, and employee loans
        </p>
      </div>
      <Card className="p-6">
        <p className="text-center text-muted-foreground">Loans page coming soon...</p>
      </Card>
    </div>
  );
}
