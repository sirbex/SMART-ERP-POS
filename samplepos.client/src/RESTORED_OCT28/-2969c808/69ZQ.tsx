import { useQuery } from '@tanstack/react-query';
import loanService, { Loan } from '@/services/loanService';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import LoanCard from './LoanCard';
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';

interface Props {
  filter?: 'all' | 'ACTIVE' | 'COMPLETED' | 'PAID_OFF' | 'DEFAULTED' | 'WRITTEN_OFF';
  onSelectLoan?: (loan: Loan) => void;
}

export default function LoansList({ filter = 'all', onSelectLoan }: Props) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(filter);

  const { data, isLoading, error } = useQuery({
    queryKey: ['loans', { status: status === 'all' ? undefined : status }],
    queryFn: () => loanService.getLoans({ status: status === 'all' ? undefined : status }),
  });

  const filtered = useMemo(() => {
    const loans: Loan[] = data?.loans || data?.data || data || [];
    if (!search) return loans;
    const s = search.toLowerCase();
    return loans.filter((l) =>
      [l.borrowerName, l.loanNumber, l.borrowerType].some((v) => v?.toLowerCase().includes(s))
    );
  }, [data, search]);

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex gap-2 items-center">
          <Input
            placeholder="Search by borrower or loan #"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="PAID_OFF">Paid Off</SelectItem>
              <SelectItem value="DEFAULTED">Defaulted</SelectItem>
              <SelectItem value="WRITTEN_OFF">Written Off</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {isLoading && <div className="text-sm text-muted-foreground p-4">Loading loans...</div>}
      {error && (
        <div className="text-sm text-red-600 p-4">Error loading loans. Please try again.</div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered?.map((loan: Loan) => (
          <LoanCard key={loan.id} loan={loan} onView={onSelectLoan} />)
        )}
      </div>

      {!isLoading && filtered?.length === 0 && (
        <div className="text-sm text-muted-foreground p-4">No loans found.</div>
      )}
    </div>
  );
}
