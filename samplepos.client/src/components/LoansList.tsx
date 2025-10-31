import { useQuery } from '@tanstack/react-query';
import loanService from '@/services/loanService';
import type { Loan } from '@/services/loanService';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import LoanCard from './LoanCard';
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  filter?: 'all' | 'ACTIVE' | 'COMPLETED' | 'PAID_OFF' | 'DEFAULTED' | 'WRITTEN_OFF';
  onSelectLoan?: (loan: Loan) => void;
}

export default function LoansList({ filter = 'all', onSelectLoan }: Props) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(filter);
  const [borrowerType, setBorrowerType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const limit = 12;

  const { data, isLoading, error } = useQuery({
    queryKey: ['loans', { status: status === 'all' ? undefined : status, borrowerType: borrowerType === 'all' ? undefined : borrowerType, page, limit, sortBy, sortOrder }],
    queryFn: () => loanService.getLoans({ 
      status: status === 'all' ? undefined : status,
      borrowerType: borrowerType === 'all' ? undefined : borrowerType,
      page, 
      limit 
    }),
  });

  const loans: Loan[] = data?.loans || data?.data || data || [];
  const totalCount = data?.total || data?.count || loans.length;
  const totalPages = Math.ceil(totalCount / limit);

  const filtered = useMemo(() => {
    let result = [...loans];
    
    // Client-side search filter
    if (search) {
      const s = search.toLowerCase();
      result = result.filter((l) =>
        [l.borrowerName, l.loanNumber, l.borrowerType].some((v) => v?.toLowerCase().includes(s))
      );
    }

    // Client-side sorting (backup if backend doesn't support)
    result.sort((a, b) => {
      let aVal: any = a[sortBy as keyof Loan];
      let bVal: any = b[sortBy as keyof Loan];
      
      if (sortBy === 'principal' || sortBy === 'outstandingPrincipal') {
        aVal = parseFloat(aVal || '0');
        bVal = parseFloat(bVal || '0');
      } else if (sortBy === 'startDate' || sortBy === 'createdAt') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [loans, search, sortBy, sortOrder]);

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <Input
            placeholder="Search by borrower or loan #"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-64"
          />
          
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="PAID_OFF">Paid Off</SelectItem>
              <SelectItem value="DEFAULTED">Defaulted</SelectItem>
              <SelectItem value="WRITTEN_OFF">Written Off</SelectItem>
            </SelectContent>
          </Select>

          <Select value={borrowerType} onValueChange={setBorrowerType}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="Borrower" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Borrowers</SelectItem>
              <SelectItem value="customer">Customer</SelectItem>
              <SelectItem value="supplier">Supplier</SelectItem>
              <SelectItem value="employee">Employee</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-full md:w-48">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt">Date Created</SelectItem>
              <SelectItem value="startDate">Start Date</SelectItem>
              <SelectItem value="borrowerName">Borrower Name</SelectItem>
              <SelectItem value="principal">Principal</SelectItem>
              <SelectItem value="outstandingPrincipal">Outstanding</SelectItem>
            </SelectContent>
          </Select>

          <Button 
            variant="outline" 
            size="icon"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="shrink-0"
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </Button>
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

      {totalPages > 1 && (
        <Card className="p-3 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({totalCount} total)
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
