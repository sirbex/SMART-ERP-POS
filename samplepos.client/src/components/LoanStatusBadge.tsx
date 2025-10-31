import { Badge } from '@/components/ui/badge';

export type LoanStatus = 'ACTIVE' | 'COMPLETED' | 'PAID_OFF' | 'DEFAULTED' | 'WRITTEN_OFF' | string;

interface Props {
  status: LoanStatus;
  className?: string;
}

const statusVariant = (status: string): 'default' | 'success' | 'secondary' | 'destructive' => {
  const s = status?.toUpperCase();
  if (s === 'ACTIVE') return 'default';
  if (s === 'COMPLETED' || s === 'PAID_OFF') return 'success';
  if (s === 'DEFAULTED') return 'destructive';
  if (s === 'WRITTEN_OFF') return 'secondary';
  return 'default';
};

export default function LoanStatusBadge({ status, className }: Props) {
  return <Badge variant={statusVariant(status)} className={className}>{status.replace('_', ' ')}</Badge>;
}
