import { useQuery } from '@tanstack/react-query';
import bankService from '@/services/bankService';
import type { BankAccount } from '@/services/bankService';
import BankAccountCard from './BankAccountCard';
import { Card } from '@/components/ui/card';

interface Props {
  onSelectAccount?: (account: BankAccount) => void;
}

export default function BankAccountsList({ onSelectAccount }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => bankService.getBankAccounts({ status: 'ACTIVE' }),
  });

  const accounts: BankAccount[] = data?.accounts || data?.data || data || [];

  return (
    <div className="space-y-4">
      {isLoading && <div className="text-sm text-muted-foreground p-4">Loading bank accounts...</div>}
      {error && (
        <div className="text-sm text-red-600 p-4">Error loading bank accounts. Please try again.</div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {accounts?.map((account: BankAccount) => (
          <BankAccountCard key={account.id} account={account} onView={onSelectAccount} />
        ))}
      </div>

      {!isLoading && accounts?.length === 0 && (
        <Card className="p-6 text-center text-muted-foreground">
          No bank accounts found. Create one to get started.
        </Card>
      )}
    </div>
  );
}
