import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import LoanStatusBadge from './LoanStatusBadge';
import type { Loan } from '@/services/loanService';
import { format } from 'date-fns';

function currency(amount: string | number) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(num)) return amount as string;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(num);
}

interface Props {
  loan: Loan;
  onView?: (loan: Loan) => void;
}

export default function LoanCard({ loan, onView }: Props) {
  return (
    <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => onView?.(loan)}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-muted-foreground">{loan.loanNumber}</div>
          <h3 className="text-lg font-semibold text-qb-gray-900">{loan.borrowerName}</h3>
          <div className="text-xs text-muted-foreground mt-1 capitalize">{loan.borrowerType}</div>
        </div>
        <LoanStatusBadge status={loan.status} />
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
        <div>
          <div className="text-muted-foreground">Principal</div>
          <div className="font-medium">{currency(loan.principal)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Outstanding</div>
          <div className="font-medium">{currency(loan.outstandingPrincipal)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Rate</div>
          <div className="font-medium">{(parseFloat(loan.interestRate) * 100).toFixed(2)}%</div>
        </div>
        <div>
          <div className="text-muted-foreground">Term</div>
          <div className="font-medium">{loan.term} months</div>
        </div>
      </div>

      <div className="flex justify-between items-center mt-4 text-xs text-muted-foreground">
        <div>Start: {loan.startDate ? format(new Date(loan.startDate), 'MMM d, yyyy') : '-'}</div>
        <div>Last Payment: {loan.lastPaymentDate ? format(new Date(loan.lastPaymentDate), 'MMM d, yyyy') : '-'}</div>
      </div>

      {onView && (
        <div className="mt-4 flex justify-end">
          <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); onView(loan); }}>
            View Details
          </Button>
        </div>
      )}
    </Card>
  );
}
