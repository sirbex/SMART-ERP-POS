import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { BankAccount } from '@/services/bankService';

function currency(amount: string | number) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(num)) return amount as string;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(num);
}

interface Props {
  account: BankAccount;
  onView?: (account: BankAccount) => void;
}

export default function BankAccountCard({ account, onView }: Props) {
  const statusVariant = (status: string) => {
    if (status === 'ACTIVE') return 'success';
    if (status === 'INACTIVE') return 'secondary';
    if (status === 'CLOSED') return 'destructive';
    return 'default';
  };

  const difference = parseFloat(account.bookBalance) - parseFloat(account.bankBalance);
  const hasDiscrepancy = Math.abs(difference) > 0.01;

  return (
    <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => onView?.(account)}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-lg font-semibold text-qb-gray-900">{account.bankName}</h3>
          <div className="text-sm text-muted-foreground">{account.accountNumber}</div>
          <div className="text-xs text-muted-foreground mt-1">{account.accountName}</div>
        </div>
        <Badge variant={statusVariant(account.status)}>{account.status}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-muted-foreground">Book Balance</div>
          <div className="font-medium">{currency(account.bookBalance)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Bank Balance</div>
          <div className="font-medium">{currency(account.bankBalance)}</div>
        </div>
      </div>

      {hasDiscrepancy && (
        <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
          <span className="text-yellow-800 font-medium">Discrepancy: {currency(difference)}</span>
        </div>
      )}

      <div className="mt-3 flex justify-between items-center text-xs text-muted-foreground">
        <div>Last Reconciled: {account.lastReconciled ? new Date(account.lastReconciled).toLocaleDateString() : 'Never'}</div>
        <div>{account.transactionsCount || 0} transactions</div>
      </div>

      {onView && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); onView(account); }}>
            View Details
          </Button>
        </div>
      )}
    </Card>
  );
}
