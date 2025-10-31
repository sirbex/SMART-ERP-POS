import { useQuery } from '@tanstack/react-query';
import loanService from '@/services/loanService';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function currency(amount: string | number) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(num)) return amount as string;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(num);
}

interface Props { loanId: string }

export default function AmortizationTable({ loanId }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['loan', loanId, 'schedule'],
    queryFn: () => loanService.getAmortizationSchedule(loanId),
  });

  if (isLoading) return <Card className="p-4 text-sm text-muted-foreground">Loading schedule...</Card>;
  if (error) return <Card className="p-4 text-sm text-red-600">Failed to load schedule.</Card>;

  const schedule = data?.schedule;
  if (!schedule) return null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Monthly Payment</div>
          <div className="text-lg font-semibold">{currency(schedule.monthlyPayment)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Total Interest</div>
          <div className="text-lg font-semibold">{currency(schedule.totalInterest)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Total Payment</div>
          <div className="text-lg font-semibold">{currency(schedule.totalPayment)}</div>
        </Card>
      </div>

      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead className="text-right">Principal</TableHead>
              <TableHead className="text-right">Interest</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedule.payments.map((p) => (
              <TableRow key={p.paymentNumber}>
                <TableCell>{p.paymentNumber}</TableCell>
                <TableCell>{new Date(p.dueDate).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">{currency(p.principal)}</TableCell>
                <TableCell className="text-right">{currency(p.interest)}</TableCell>
                <TableCell className="text-right">{currency(p.totalPayment)}</TableCell>
                <TableCell className="text-right">{currency(p.remainingBalance)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
