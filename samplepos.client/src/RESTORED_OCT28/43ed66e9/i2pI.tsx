import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import loanService, { type LoanDetails as LoanDetailsType, type LoanRepayment, type InterestAccrual } from '@/services/loanService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import LoanStatusBadge from './LoanStatusBadge';
import RepaymentDialog from './RepaymentDialog';
import AmortizationTable from './AmortizationTable';

function currency(amount: string | number) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(num)) return amount as string;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(num);
}

interface Props {
  loanId: string;
}

export default function LoanDetails({ loanId }: Props) {
  const [repayOpen, setRepayOpen] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['loan', loanId],
    queryFn: () => loanService.getLoan(loanId),
  });

  const details: LoanDetailsType | undefined = data?.loan;

  const accrueMutation = useMutation({
    mutationFn: (toDate?: string) => loanService.accrueInterest(loanId, toDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loan', loanId] });
      queryClient.invalidateQueries({ queryKey: ['loans'] });
    },
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading loan details...</div>;
  if (error) return <div className="text-sm text-red-600">Failed to load loan details.</div>;
  if (!details) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">{details.loanNumber}</div>
          <h2 className="text-xl font-semibold text-qb-gray-900">{details.borrowerName}</h2>
          <div className="text-xs text-muted-foreground mt-1 capitalize">{details.borrowerType}</div>
        </div>
        <LoanStatusBadge status={details.status} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Outstanding Principal</div>
          <div className="text-lg font-semibold">{currency(details.outstandingPrincipal)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Outstanding Interest</div>
          <div className="text-lg font-semibold">{currency(details.outstandingInterest)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Total Paid</div>
          <div className="text-lg font-semibold">{currency(details.totalPaid)}</div>
        </Card>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={() => setRepayOpen(true)}>Record Repayment</Button>
        <Button size="sm" variant="secondary" onClick={() => accrueMutation.mutate()}>Accrue Interest</Button>
        <Button size="sm" variant={showSchedule ? 'secondary' : 'outline'} onClick={() => setShowSchedule((s) => !s)}>
          {showSchedule ? 'Hide Schedule' : 'View Amortization'}
        </Button>
      </div>

      {showSchedule && (
        <AmortizationTable loanId={loanId} />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-sm font-semibold mb-3">Recent Repayments</div>
          <div className="space-y-2">
            {details.recentRepayments?.length ? (
              details.recentRepayments.map((r: LoanRepayment) => (
                <div key={r.id} className="flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{currency(r.amount)}</div>
                    <div className="text-xs text-muted-foreground">{new Date(r.paymentDate).toLocaleDateString()} • {r.paymentMethod}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">P: {currency(r.principalAmount)} | I: {currency(r.interestAmount)}</div>
                </div>
              ))
            ) : (
              <div className="text-xs text-muted-foreground">No repayments yet.</div>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold mb-3">Recent Interest Accruals</div>
          <div className="space-y-2">
            {details.recentAccruals?.length ? (
              details.recentAccruals.map((a: InterestAccrual) => (
                <div key={a.id} className="flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{currency(a.interestAmount)}</div>
                    <div className="text-xs text-muted-foreground">{new Date(a.accrualDate).toLocaleDateString()}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">Days: {a.daysAccrued} • Balance: {currency(a.outstandingPrincipal)}</div>
                </div>
              ))
            ) : (
              <div className="text-xs text-muted-foreground">No accruals yet.</div>
            )}
          </div>
        </Card>
      </div>

      <RepaymentDialog loanId={loanId} open={repayOpen} onOpenChange={setRepayOpen} />
    </div>
  );
}
