/**
 * Distribution Module — Invoice List Page
 *
 * Lists all distribution invoices with status filters and clearing navigation.
 * Phase 4: AdaptivePage / Toolbar / DataGrid — same distributionApi commands.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import {
  AdaptiveDataGrid,
  AdaptivePage,
  AdaptiveToolbar,
  type AdaptiveDataColumn,
} from '../../components/adaptive';
import distributionApi, { type DistInvoice } from '../../api/distribution';
import { formatCurrency } from '../../utils/currency';

const STATUS_OPTIONS = ['ALL', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] as const;
const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-red-100 text-red-800',
  PARTIALLY_PAID: 'bg-yellow-100 text-yellow-800',
  PAID: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-600',
};

export default function DistInvoiceListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>('ALL');
  const limit = 25;

  const { data, isLoading } = useQuery({
    queryKey: ['dist-invoices', page, status],
    queryFn: () => distributionApi.listInvoices({
      page,
      limit,
      status: status === 'ALL' ? undefined : status,
    }),
  });

  const invoices = data?.data ?? [];
  const pagination = data?.pagination ?? { page: 1, limit, total: 0, totalPages: 0 };

  const columns = useMemo<AdaptiveDataColumn<DistInvoice>[]>(
    () => [
      {
        id: 'invoiceNumber',
        header: 'Invoice #',
        priority: 'primary',
        cardRole: 'title',
        cell: (inv) => (
          <span className="font-mono font-medium text-blue-700">{inv.invoiceNumber}</span>
        ),
      },
      {
        id: 'customerName',
        header: 'Customer',
        priority: 'primary',
        cardRole: 'subtitle',
        cell: (inv) => inv.customerName,
      },
      {
        id: 'status',
        header: 'Status',
        priority: 'primary',
        cardRole: 'status',
        align: 'center',
        cell: (inv) => (
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
              STATUS_COLORS[inv.status] ?? 'bg-gray-100'
            }`}
          >
            {inv.status.replace(/_/g, ' ')}
          </span>
        ),
      },
      {
        id: 'totalAmount',
        header: 'Total',
        priority: 'primary',
        cardRole: 'amount',
        align: 'right',
        cell: (inv) => (
          <span className="font-medium">{formatCurrency(inv.totalAmount)}</span>
        ),
      },
      {
        id: 'amountPaid',
        header: 'Paid',
        priority: 'secondary',
        cardRole: 'meta',
        align: 'right',
        cell: (inv) => (
          <span className="text-green-600">{formatCurrency(inv.amountPaid)}</span>
        ),
      },
      {
        id: 'amountDue',
        header: 'Due',
        priority: 'secondary',
        cardRole: 'meta',
        align: 'right',
        cell: (inv) => (
          <span className="font-bold text-red-600">{formatCurrency(inv.amountDue)}</span>
        ),
      },
      {
        id: 'orderNumber',
        header: 'Order',
        priority: 'detail',
        cardRole: 'meta',
        cell: (inv) => (
          <span className="font-mono text-xs text-gray-500">{inv.orderNumber}</span>
        ),
      },
      {
        id: 'issueDate',
        header: 'Issue Date',
        priority: 'detail',
        cardRole: 'meta',
        cell: (inv) => <span className="text-gray-500">{inv.issueDate}</span>,
      },
    ],
    [],
  );

  return (
    <Layout>
      <AdaptivePage
        className="p-4 lg:p-6"
        title="Distribution Invoices"
        description="Auto-generated from deliveries"
        primaryActions={
          <button
            type="button"
            onClick={() => navigate('/distribution/clearing')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium min-h-[var(--layout-touch-target)]"
          >
            Process Clearing
          </button>
        }
        toolbar={
          <AdaptiveToolbar
            secondaryLabel="Status"
            secondary={
              <div className="flex flex-wrap gap-1" data-dist-invoice-status="true">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setStatus(s);
                      setPage(1);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded transition min-h-[var(--layout-touch-target)] ${
                      status === s
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {s.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            }
          />
        }
      >
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : (
          <>
            <AdaptiveDataGrid
              rows={invoices}
              columns={columns}
              getRowId={(inv) => inv.id}
              emptyMessage="No invoices found"
              onRowClick={(inv) =>
                navigate(`/distribution/clearing?customerId=${inv.customerId}`)
              }
            />

            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between border-t pt-3 text-sm">
                <span className="text-gray-500">
                  Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50 min-h-[var(--layout-touch-target)]"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50 min-h-[var(--layout-touch-target)]"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </AdaptivePage>
    </Layout>
  );
}
