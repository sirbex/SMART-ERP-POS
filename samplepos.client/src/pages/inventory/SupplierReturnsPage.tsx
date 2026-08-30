/**
 * Supplier Returns worklist — all RGRNs across suppliers.
 * Nested under Receiving: Inventory → Goods Receipts → Returns.
 * Route: /inventory/goods-receipts/returns
 */
import { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import {
  useCreateCreditNoteFromReturn,
  usePostReturnGrn,
  useReturnGrns,
  unwrapReturnGrnListPayload,
  type ReturnGrnRecord,
} from '../../hooks/useReturnGrn';
import { formatCurrency } from '../../utils/currency';
import { handleApiError } from '../../utils/errorHandler';
import { Button } from '../../components/ui/button';
import {
  canCreateSupplierCreditNoteFromReturn,
  isSupplierReturnNeedsAttention,
  resolveSupplierReturnActionStatus,
  supplierReturnActionLabel,
  SUPPLIER_RETURNS_DEFAULT_FILTER,
  type SupplierReturnActionStatus,
} from '@shared/domain/supplierReturnWorklist';
import type { ReceivingWorkbenchContext } from './ReceivingWorkbench';

type AttentionFilter = 'attention' | 'all' | 'draft' | 'posted';

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return d.includes('T') ? d.slice(0, 10) : d;
}

function actionBadge(row: ReturnGrnRecord): { label: string; className: string; hint: string } {
  const status: SupplierReturnActionStatus =
    row.actionStatus &&
    ['DRAFT', 'NEED_BILL', 'NEED_SCN', 'HAS_SCN', 'COMPLETE'].includes(row.actionStatus)
      ? row.actionStatus
      : resolveSupplierReturnActionStatus(row);

  const styles: Record<SupplierReturnActionStatus, string> = {
    DRAFT: 'bg-slate-100 text-slate-800',
    NEED_BILL: 'bg-amber-100 text-amber-900',
    NEED_SCN: 'bg-rose-100 text-rose-900',
    HAS_SCN: 'bg-blue-100 text-blue-900',
    COMPLETE: 'bg-emerald-100 text-emerald-900',
  };
  const hints: Record<SupplierReturnActionStatus, string> = {
    DRAFT: 'Post the return to reduce stock.',
    NEED_BILL: 'Deprecated — uninvoiced returns do not require a bill.',
    NEED_SCN: 'Create a supplier credit note to clear return clearing (2160) / AP.',
    HAS_SCN: 'SCN exists — apply it to open bills under Credit / Debit Notes if still open.',
    COMPLETE: row.hasSupplierBill
      ? 'Return settled (SCN applied).'
      : 'Uninvoiced return/reversal — stock and GR/IR cleared; no bill or credit note needed.',
  };
  return {
    label: supplierReturnActionLabel(row, status),
    className: styles[status],
    hint: hints[status],
  };
}

export default function SupplierReturnsPage() {
  const workbench = useOutletContext<ReceivingWorkbenchContext | null>();
  const embedded = Boolean(workbench?.embedded);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filter, setFilter] = useState<AttentionFilter>(SUPPLIER_RETURNS_DEFAULT_FILTER);
  const limit = 50;

  const listParams = useMemo(() => {
    const base: {
      page: number;
      limit: number;
      search?: string;
      status?: string;
      needsAttention?: boolean;
    } = { page, limit };
    if (search.trim()) base.search = search.trim();
    if (filter === 'attention') base.needsAttention = true;
    if (filter === 'draft') base.status = 'DRAFT';
    if (filter === 'posted') base.status = 'POSTED';
    return base;
  }, [page, search, filter]);

  const { data, isLoading, isFetching, error, refetch } = useReturnGrns(listParams);
  const createCn = useCreateCreditNoteFromReturn();
  const postRgrn = usePostReturnGrn();

  const { rows, pagination: listPagination } = useMemo(
    () => unwrapReturnGrnListPayload(data),
    [data],
  );

  const total = Number(listPagination?.total) || rows.length;
  const totalPages = Math.max(
    1,
    Number(listPagination?.totalPages) || Math.ceil(total / limit) || 1,
  );
  const attentionCount = rows.filter((r) => isSupplierReturnNeedsAttention(r)).length;

  const applySearch = () => {
    setPage(1);
    setSearch(searchInput);
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto" data-testid="supplier-returns-worklist">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          {!embedded && (
            <h1 className="text-2xl font-bold text-gray-900">Supplier returns</h1>
          )}
          {embedded ? (
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Return worklist</h2>
              <p className="text-slate-600 mt-0.5 text-sm max-w-2xl">
                Posted returns waiting for a supplier credit note — all suppliers. Default filter keeps
                open clearing items (2160) on top.
              </p>
            </div>
          ) : (
            <p className="text-gray-600 mt-1 max-w-2xl text-sm sm:text-base">
              All return-to-supplier documents (RGRN) across suppliers. Prefer Inventory → Goods
              Receipts → Returns.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            Refresh
          </Button>
          <Link
            to="/accounting/credit-debit-notes"
            className="inline-flex items-center justify-center h-10 px-4 py-2 rounded-md text-sm font-medium border border-slate-200 bg-white hover:bg-slate-100"
          >
            Credit notes
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3 items-end">
        <label className="text-sm flex-1 min-w-[200px]">
          <span className="block text-gray-600 mb-1">Search</span>
          <input
            className="w-full border rounded-md px-3 py-2 bg-white"
            placeholder="RGRN #, GR #, supplier, reason…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch();
            }}
            data-testid="supplier-returns-search"
          />
        </label>
        <Button type="button" variant="outline" onClick={applySearch}>
          Search
        </Button>
        <label className="text-sm">
          <span className="block text-gray-600 mb-1">Show</span>
          <select
            className="border rounded-md px-3 py-2 bg-white min-w-[180px]"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value as AttentionFilter);
              setPage(1);
            }}
            data-testid="supplier-returns-filter"
          >
            <option value="attention">Needs credit note</option>
            <option value="all">All returns</option>
            <option value="posted">Posted only</option>
            <option value="draft">Draft only</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-white border rounded-xl p-4">
          <div className="text-xs uppercase text-gray-500">Rows (page)</div>
          <div className="text-2xl font-semibold">{rows.length}</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-2xl font-semibold">{total}</div>
          <div className="text-xs uppercase text-gray-500">Total matching</div>
        </div>
        <div className="bg-white border rounded-xl p-4 col-span-2 sm:col-span-1">
          <div className="text-xs uppercase text-gray-500">On this page open (no SCN)</div>
          <div className="text-2xl font-semibold text-rose-800">{attentionCount}</div>
        </div>
      </div>

      {error && (
        <p className="mb-3 text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
          {(error as Error).message || 'Failed to load supplier returns'}
        </p>
      )}

      <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3 font-medium">Return</th>
                <th className="px-3 py-3 font-medium">Date</th>
                <th className="px-3 py-3 font-medium">Supplier</th>
                <th className="px-3 py-3 font-medium">Source GR</th>
                <th className="px-3 py-3 font-medium text-right">Amount</th>
                <th className="px-3 py-3 font-medium">Next step</th>
                <th className="px-3 py-3 font-medium">Bill / SCN</th>
                <th className="px-3 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-gray-500">
                    Loading supplier returns…
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-gray-500">
                    {filter === 'attention'
                      ? 'No posted returns waiting for a credit note.'
                      : 'No supplier returns match these filters.'}
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const badge = actionBadge(row);
                const canCreateCn = canCreateSupplierCreditNoteFromReturn(row);
                return (
                  <tr
                    key={row.id}
                    className="hover:bg-slate-50/80"
                    data-testid={`rgrn-row-${row.returnGrnNumber}`}
                  >
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-900">{row.returnGrnNumber}</div>
                      <div className="text-xs text-slate-500 max-w-[220px] truncate" title={row.reason}>
                        {row.reason || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatDate(row.returnDate)}</td>
                    <td className="px-3 py-3">{row.supplierName || '—'}</td>
                    <td className="px-3 py-3">
                      <Link
                        to="/inventory/goods-receipts"
                        className="text-teal-700 hover:underline font-medium"
                        title="Open Receipts tab for this GR"
                      >
                        {row.grNumber || row.grnNumber || '—'}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                      {formatCurrency(Number(row.totalAmount) || 0)}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex text-xs font-medium px-2 py-1 rounded-full ${badge.className}`}
                        title={badge.hint}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">
                      <div>Bill: {row.supplierBillNumber || (row.hasSupplierBill ? 'yes' : '—')}</div>
                      <div>
                        SCN:{' '}
                        {row.creditNoteNumber
                          ? `${row.creditNoteNumber}${row.creditNoteStatus ? ` (${row.creditNoteStatus})` : ''}`
                          : '—'}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1.5 min-w-[140px]">
                        {row.status === 'DRAFT' && (
                          <button
                            type="button"
                            className="text-xs px-2 py-1.5 rounded-md bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50"
                            disabled={postRgrn.isPending}
                            data-testid={`post-${row.returnGrnNumber}`}
                            onClick={() =>
                              postRgrn.mutate(row.id, {
                                onSuccess: () => toast.success(`${row.returnGrnNumber} posted`),
                                onError: (err) =>
                                  handleApiError(err, { fallback: 'Failed to post return' }),
                              })
                            }
                          >
                            Post return
                          </button>
                        )}
                        {canCreateCn && (
                          <button
                            type="button"
                            className="text-xs px-2 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                            disabled={createCn.isPending}
                            data-testid={`create-scn-${row.returnGrnNumber}`}
                            onClick={() =>
                              createCn.mutate(row.id, {
                                onSuccess: (res) => {
                                  const num = (
                                    res as {
                                      data?: { data?: { creditNoteNumber?: string } };
                                    }
                                  )?.data?.data?.creditNoteNumber;
                                  toast.success(
                                    `Credit note ${num ?? ''} created. Apply it under Credit Notes if needed.`,
                                    { duration: 6000 },
                                  );
                                },
                                onError: (err) =>
                                  handleApiError(err, {
                                    fallback: 'Failed to create credit note',
                                  }),
                              })
                            }
                          >
                            Create credit note
                          </button>
                        )}
                        {row.hasCreditNote && (
                          <Link
                            to="/accounting/credit-debit-notes"
                            className="text-xs px-2 py-1.5 rounded-md border border-slate-200 bg-white text-slate-800 text-center hover:bg-slate-50"
                          >
                            Open credit notes
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
        <span>
          Page {page} of {totalPages}
          {isFetching ? ' · updating…' : ''}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
