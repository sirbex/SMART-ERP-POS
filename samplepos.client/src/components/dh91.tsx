import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import bankService, { type BankAccount, type BankTransaction } from '@/services/bankService';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import RecordTransactionDialog from './RecordTransactionDialog';

function currency(amount: string | number) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (Number.isNaN(num)) return amount as string;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(num);
}

interface Props {
  account: BankAccount;
}

export default function BankAccountDetails({ account }: Props) {
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set());
  const [txnDialogOpen, setTxnDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['bank-account', account.id],
    queryFn: () => bankService.getBankAccount(account.id),
  });

  const details = data?.account;
  const transactions: BankTransaction[] = data?.transactions || [];

  const toggleTransaction = (id: string) => {
    setSelectedTransactions(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading account details...</div>;
  if (!details) return null;

  const difference = parseFloat(details.bookBalance) - parseFloat(details.bankBalance);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-qb-gray-900">{details.bankName}</h2>
          <div className="text-sm text-muted-foreground">{details.accountNumber} • {details.accountName}</div>
        </div>
        <Badge variant={details.status === 'ACTIVE' ? 'success' : 'secondary'}>{details.status}</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Book Balance</div>
          <div className="text-lg font-semibold">{currency(details.bookBalance)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Bank Balance</div>
          <div className="text-lg font-semibold">{currency(details.bankBalance)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Difference</div>
          <div className={`text-lg font-semibold ${Math.abs(difference) > 0.01 ? 'text-yellow-700' : 'text-green-700'}`}>
            {currency(difference)}
          </div>
        </Card>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={() => setTxnDialogOpen(true)}>Record Transaction</Button>
        <Button size="sm" variant="secondary">Start Reconciliation</Button>
        <Button size="sm" variant="outline" disabled={selectedTransactions.size === 0}>
          Mark {selectedTransactions.size} as Reconciled
        </Button>
      </div>

      <Card className="p-4">
        <div className="text-sm font-semibold mb-3">Recent Transactions</div>
        {transactions.length > 0 ? (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((txn) => (
                  <TableRow key={txn.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedTransactions.has(txn.id)}
                        onCheckedChange={() => toggleTransaction(txn.id)}
                        disabled={txn.isReconciled}
                      />
                    </TableCell>
                    <TableCell>{new Date(txn.transactionDate).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div>{txn.description}</div>
                      {txn.reference && <div className="text-xs text-muted-foreground">{txn.reference}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{txn.type}</Badge>
                    </TableCell>
                    <TableCell className={`text-right font-medium ${txn.type === 'DEPOSIT' || txn.type === 'INTEREST' ? 'text-green-700' : 'text-red-700'}`}>
                      {txn.type === 'DEPOSIT' || txn.type === 'INTEREST' ? '+' : '-'}{currency(txn.amount)}
                    </TableCell>
                    <TableCell>
                      {txn.isReconciled ? (
                        <Badge variant="success">Reconciled</Badge>
                      ) : (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground text-center py-6">No transactions yet.</div>
        )}
      </Card>

      <RecordTransactionDialog
        bankAccountId={account.id}
        open={txnDialogOpen}
        onOpenChange={setTxnDialogOpen}
      />
    </div>
  );
}
