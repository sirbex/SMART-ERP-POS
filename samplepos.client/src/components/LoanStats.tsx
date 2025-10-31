import { useQuery } from '@tanstack/react-query';
import loanService from '@/services/loanService';
import { Card } from '@/components/ui/card';

function currency(amount: string | number) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(num)) return amount as string;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(num);
}

export default function LoanStats() {
  const { data, isLoading } = useQuery({
    queryKey: ['loans', { for: 'stats' }],
    queryFn: () => loanService.getLoans(),
  });

  const loans = (data?.loans || data?.data || data || []) as Array<{
    status: string;
    principal: string;
    outstandingPrincipal: string;
  }>;

  const totalPrincipal = loans.reduce((sum, l) => sum + (parseFloat(l.principal) || 0), 0);
  const totalOutstanding = loans.reduce((sum, l) => sum + (parseFloat(l.outstandingPrincipal) || 0), 0);
  const activeCount = loans.filter((l) => l.status?.toUpperCase() === 'ACTIVE').length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Total Principal</div>
        <div className="text-2xl font-semibold">{isLoading ? '—' : currency(totalPrincipal)}</div>
      </Card>
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Outstanding Balance</div>
        <div className="text-2xl font-semibold">{isLoading ? '—' : currency(totalOutstanding)}</div>
      </Card>
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Active Loans</div>
        <div className="text-2xl font-semibold">{isLoading ? '—' : activeCount}</div>
      </Card>
    </div>
  );
}
