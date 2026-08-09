import { useMemo } from 'react';
import { Check, Eye, Sparkles, XCircle } from 'lucide-react';
import {
  AdaptiveDataGrid,
  type AdaptiveDataColumn,
} from '../adaptive/AdaptiveDataGrid';
import { Badge, Button } from '../ui/temp-ui-components';
import { ResponsiveActionBar } from '../ui/ResponsiveActionBar';
import { formatCurrency } from '../../utils/currency';
import { formatTimestampDate } from '../../utils/businessDate';
import type {
  CreditDebitNote,
  SupplierCreditDebitNote,
} from '../../services/creditDebitNoteService';
import {
  isNoteDraftStatus,
  isReturnGrnCreditNote,
  supplierNoteStatusLabel,
} from '@shared/utils/creditDebitNoteSsot';

function isSupplierPosted(status: string): boolean {
  return status === 'POSTED' || status === 'APPLIED';
}

type CustomerNotesAdaptiveGridProps = {
  notes: CreditDebitNote[];
  onView: (note: CreditDebitNote) => void;
  onPost: (id: string) => void;
  onCancel: (id: string) => void;
};

export function CustomerNotesAdaptiveGrid({
  notes,
  onView,
  onPost,
  onCancel,
}: CustomerNotesAdaptiveGridProps) {
  const columns = useMemo((): AdaptiveDataColumn<CreditDebitNote>[] => [
    {
      id: 'number',
      header: 'Note #',
      priority: 'primary',
      cardRole: 'title',
      cell: (note) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-blue-700 break-all">{note.invoiceNumber}</span>
          <Badge variant={note.documentType === 'CREDIT_NOTE' ? 'destructive' : 'default'}>
            {note.documentType === 'CREDIT_NOTE' ? 'Credit Note' : 'Debit Note'}
          </Badge>
        </div>
      ),
    },
    {
      id: 'party',
      header: 'Customer',
      priority: 'secondary',
      cardRole: 'subtitle',
      cell: (note) => note.customerName,
    },
    {
      id: 'status',
      header: 'Status',
      priority: 'primary',
      cardRole: 'status',
      cell: (note) => (
        <Badge variant={note.status === 'Posted' ? 'default' : 'secondary'}>{note.status}</Badge>
      ),
    },
    {
      id: 'ref',
      header: 'Ref',
      priority: 'detail',
      cardRole: 'meta',
      cell: (note) => note.referenceInvoiceNumber || '—',
    },
    {
      id: 'date',
      header: 'Date',
      priority: 'secondary',
      cardRole: 'meta',
      cell: (note) => formatTimestampDate(note.issueDate),
    },
    {
      id: 'tax',
      header: 'Tax',
      priority: 'detail',
      cardRole: 'meta',
      align: 'right',
      cell: (note) => formatCurrency(note.taxAmount),
    },
    {
      id: 'total',
      header: 'Total',
      priority: 'primary',
      cardRole: 'amount',
      align: 'right',
      cell: (note) => <span className="font-semibold">{formatCurrency(note.totalAmount)}</span>,
    },
    {
      id: 'reason',
      header: 'Reason',
      priority: 'detail',
      cardRole: 'hidden',
      cell: (note) => note.reason || '—',
    },
  ], []);

  return (
    <AdaptiveDataGrid
      rows={notes}
      columns={columns}
      getRowId={(n) => n.id}
      emptyMessage="No notes found"
      renderRowActions={(note) => (
        <ResponsiveActionBar divider={false} className="sm:justify-center">
          <Button variant="outline" size="sm" onClick={() => onView(note)}>
            <Eye className="h-4 w-4 shrink-0" />
            <span className="ml-2 sm:hidden">View</span>
          </Button>
          {note.status === 'Draft' && (
            <Button
              size="sm"
              onClick={() => onPost(note.id)}
              className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Check className="h-4 w-4 shrink-0" />
              Post
            </Button>
          )}
          {note.status === 'Posted' && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onCancel(note.id)}
              className="flex items-center gap-1"
            >
              <XCircle className="h-4 w-4 shrink-0" />
              Cancel
            </Button>
          )}
        </ResponsiveActionBar>
      )}
    />
  );
}

type SupplierNotesAdaptiveGridProps = {
  notes: SupplierCreditDebitNote[];
  highlightNoteId?: string | null;
  applyingNoteId?: string | null;
  onView: (note: SupplierCreditDebitNote) => void;
  onPost: (note: SupplierCreditDebitNote) => void;
  onCancel: (id: string) => void;
  onApplyFifo: (id: string) => void;
};

export function SupplierNotesAdaptiveGrid({
  notes,
  highlightNoteId,
  applyingNoteId,
  onView,
  onPost,
  onCancel,
  onApplyFifo,
}: SupplierNotesAdaptiveGridProps) {
  const columns = useMemo((): AdaptiveDataColumn<SupplierCreditDebitNote>[] => [
    {
      id: 'number',
      header: 'Note #',
      priority: 'primary',
      cardRole: 'title',
      cell: (note) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-blue-700 break-all">{note.invoiceNumber}</span>
          <Badge variant={note.documentType === 'SUPPLIER_CREDIT_NOTE' ? 'destructive' : 'default'}>
            {note.documentType === 'SUPPLIER_CREDIT_NOTE' ? 'Credit Note' : 'Debit Note'}
          </Badge>
        </div>
      ),
    },
    {
      id: 'party',
      header: 'Supplier',
      priority: 'secondary',
      cardRole: 'subtitle',
      cell: (note) => note.supplierName || 'Unknown supplier',
    },
    {
      id: 'status',
      header: 'Status',
      priority: 'primary',
      cardRole: 'status',
      cell: (note) => (
        <div className="flex flex-wrap gap-1 justify-end sm:justify-start">
          <Badge
            variant={
              note.status === 'APPLIED' || isSupplierPosted(note.status) ? 'default' : 'secondary'
            }
          >
            {supplierNoteStatusLabel({
              status: note.status,
              referenceInvoiceNumber: note.referenceInvoiceNumber,
            })}
          </Badge>
          {note.documentType === 'SUPPLIER_CREDIT_NOTE'
            && note.status === 'POSTED'
            && note.outstandingBalance > 0
            && isReturnGrnCreditNote(note) && (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                Apply to bill required
              </Badge>
            )}
          {isNoteDraftStatus(note.status) && (
            <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800">
              Needs posting
            </Badge>
          )}
          {note.documentType === 'SUPPLIER_CREDIT_NOTE'
            && note.status === 'POSTED'
            && note.outstandingBalance > 0 && (
              <Badge variant="outline" className="border-purple-300 bg-purple-50 text-purple-700">
                On-account: {formatCurrency(note.outstandingBalance)}
              </Badge>
            )}
        </div>
      ),
    },
    {
      id: 'ref',
      header: 'Ref',
      priority: 'detail',
      cardRole: 'meta',
      cell: (note) => note.referenceInvoiceNumber || '—',
    },
    {
      id: 'date',
      header: 'Date',
      priority: 'secondary',
      cardRole: 'meta',
      cell: (note) => formatTimestampDate(note.issueDate),
    },
    {
      id: 'tax',
      header: 'Tax',
      priority: 'detail',
      cardRole: 'meta',
      align: 'right',
      cell: (note) => formatCurrency(note.taxAmount),
    },
    {
      id: 'balance',
      header: 'On-account',
      priority: 'secondary',
      cardRole: 'meta',
      align: 'right',
      cell: (note) => (
        note.documentType === 'SUPPLIER_CREDIT_NOTE' && note.outstandingBalance > 0
          ? formatCurrency(note.outstandingBalance)
          : '—'
      ),
    },
    {
      id: 'total',
      header: 'Total',
      priority: 'primary',
      cardRole: 'amount',
      align: 'right',
      cell: (note) => <span className="font-semibold">{formatCurrency(note.totalAmount)}</span>,
    },
    {
      id: 'reason',
      header: 'Reason',
      priority: 'detail',
      cardRole: 'hidden',
      cell: (note) => note.reason || '—',
    },
  ], []);

  return (
    <AdaptiveDataGrid
      rows={notes}
      columns={columns}
      getRowId={(n) => n.id}
      emptyMessage="No supplier notes found"
      rowClassName={(note) => (
        highlightNoteId === note.id ? 'ring-2 ring-amber-400 border-amber-300' : undefined
      )}
      renderRowActions={(note) => (
        <ResponsiveActionBar divider={false} className="sm:justify-center">
          <Button variant="outline" size="sm" onClick={() => onView(note)}>
            <Eye className="h-4 w-4 shrink-0" />
            <span className="ml-2 sm:hidden">View</span>
          </Button>
          {isNoteDraftStatus(note.status) && (
            <Button
              size="sm"
              onClick={() => onPost(note)}
              className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Check className="h-4 w-4 shrink-0" />
              Post to GL
            </Button>
          )}
          {(note.status === 'POSTED' || note.status === 'APPLIED') && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onCancel(note.id)}
              className="flex items-center gap-1"
            >
              <XCircle className="h-4 w-4 shrink-0" />
              Cancel
            </Button>
          )}
          {note.documentType === 'SUPPLIER_CREDIT_NOTE'
            && note.status === 'POSTED'
            && note.outstandingBalance > 0 && (
              <Button
                size="sm"
                onClick={() => onApplyFifo(note.id)}
                disabled={applyingNoteId === note.id}
                className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Sparkles className="h-4 w-4 shrink-0" />
                {applyingNoteId === note.id ? 'Applying…' : 'Apply to Open Bills'}
              </Button>
            )}
        </ResponsiveActionBar>
      )}
    />
  );
}
