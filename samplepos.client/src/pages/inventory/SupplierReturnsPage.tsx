/**
 * Supplier Returns worklist — all RGRNs across suppliers.
 * Nested under Receiving: Inventory → Goods Receipts → Returns.
 * Route: /inventory/goods-receipts/returns
 *
 * Chrome inherits AdaptivePage / AdaptiveToolbar / AdaptiveFacetChips SSOT
 * (same contract as Goods Receipts / Movement History).
 */
import { useEffect, useMemo, useState } from 'react';
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
  AdaptivePage,
  AdaptiveToolbar,
  AdaptiveSearch,
  AdaptiveFacetChips,
  AdaptiveKpiStrip,
  AdaptiveRowActions,
} from '../../components/adaptive';
import {
  ADAPTIVE_PAGE_PAD_CLASS,
  ADAPTIVE_TOOLBAR_CARD_CLASS,
  ADAPTIVE_WORKLIST_DENSITY,
  ADAPTIVE_WORKLIST_SEARCH_DEBOUNCE_MS,
} from '../../lib/adaptiveDashboard';
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
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState<AttentionFilter>(SUPPLIER_RETURNS_DEFAULT_FILTER);
  const limit = 50;

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSearch(search.trim()),
      ADAPTIVE_WORKLIST_SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const listParams = useMemo(() => {
    const base: {
      page: number;
      limit: number;
      search?: string;
      status?: string;
      needsAttention?: boolean;
    } = { page, limit };
    if (debouncedSearch) base.search = debouncedSearch;
    if (filter === 'attention') base.needsAttention = true;
    if (filter === 'draft') base.status = 'DRAFT';
    if (filter === 'posted') base.status = 'POSTED';
    return base;
  }, [page, debouncedSearch, filter]);

  const { data, isLoading, isFetching, error, refetch } = useReturnGrns(listParams);
  const postRgrn = usePostReturnGrn();
  const createCn = useCreateCreditNoteFromReturn();

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

  return (
    <div data-testid="supplier-returns-worklist" data-supplier-returns-page="true">
      <AdaptivePage
        className={ADAPTIVE_PAGE_PAD_CLASS}
        hideTitle={embedded}
        title={embedded ? undefined : 'Supplier returns'}
        description={
          embedded
            ? undefined
            : 'All return-to-supplier documents (RGRN) across suppliers.'
        }
        densityOverride={ADAPTIVE_WORKLIST_DENSITY}
        toolbarInline={!embedded}
        toolbar={
          <div className={ADAPTIVE_TOOLBAR_CARD_CLASS} data-returns-filters="true">
            <AdaptiveToolbar
              modeOverride="compact"
              leading={
                <AdaptiveSearch
                  value={search}
                  onChange={setSearch}
                  placeholder="RGRN #, GR #, supplier, reason…"
                  label="Search supplier returns"
                  presentationOverride="compact"
                />
              }
              facets={
                <AdaptiveFacetChips
                  aria-label="Return status"
                  items={[
                    {
                      id: 'attention',
                      label: 'Needs credit note',
                      tone: 'amber',
                      active: filter === 'attention',
                      onSelect: () => {
                        setFilter('attention');
                        setPage(1);
                      },
                    },
                    {
                      id: 'all',
                      label: 'All returns',
                      tone: 'neutral',
                      active: filter === 'all',
                      onSelect: () => {
                        setFilter('all');
                        setPage(1);
                      },
                    },
                    {
                      id: 'posted',
                      label: 'Posted',
                      tone: 'emerald',
                      active: filter === 'posted',
                      onSelect: () => {
                        setFilter('posted');
                        setPage(1);
                      },
                    },
                    {
                      id: 'draft',
                      label: 'Draft',
                      tone: 'slate',
                      active: filter === 'draft',
                      onSelect: () => {
                        setFilter('draft');
                        setPage(1);
                      },
                    },
                  ]}
                />
              }
              more={
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => refetch()}
                    disabled={isFetching}
                    data-returns-refresh="true"
                  >
                    Refresh
                  </button>
                  <Link to="/accounting/credit-debit-notes" role="menuitem">
                    Credit notes
                  </Link>
                </>
              }
            />
          </div>
        }
      >
        <AdaptiveKpiStrip
          items={[
            { id: 'page-rows', label: 'Rows (page)', value: rows.length },
            { id: 'total', label: 'Total matching', value: total },
            {
              id: 'open-scn',
              label: 'Open (no SCN)',
              value: attentionCount,
              valueClassName: 'text-rose-800',
            },
          ]}
        />

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
                  const rowActions = [
                    ...(row.status === 'DRAFT'
                      ? [
                          {
                            id: 'post',
                            label: 'Post return',
                            tone: 'warning' as const,
                            appearance: 'link' as const,
                            disabled: postRgrn.isPending,
                            onClick: () =>
                              postRgrn.mutate(row.id, {
                                onSuccess: () => toast.success(`${row.returnGrnNumber} posted`),
                                onError: (err) =>
                                  handleApiError(err, { fallback: 'Failed to post return' }),
                              }),
                          },
                        ]
                      : []),
                    ...(canCreateCn
                      ? [
                          {
                            id: 'scn',
                            label: 'Create credit note',
                            tone: 'primary' as const,
                            appearance: 'link' as const,
                            disabled: createCn.isPending,
                            onClick: () =>
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
                              }),
                          },
                        ]
                      : []),
                    ...(row.hasCreditNote
                      ? [
                          {
                            id: 'open-cn',
                            label: 'Open credit notes',
                            tone: 'muted' as const,
                            appearance: 'link' as const,
                            onClick: () => {
                              window.location.assign('/accounting/credit-debit-notes');
                            },
                          },
                        ]
                      : []),
                  ];
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
                        <AdaptiveRowActions actions={rowActions} />
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
      </AdaptivePage>
    </div>
  );
}
