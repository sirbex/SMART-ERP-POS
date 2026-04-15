import { useState, useMemo } from 'react';
import {
  useGrirOpenItems,
  useGrirBalance,
  useGrirSearch,
  useGrirMatchCandidates,
  useGrirGrItems,
  useGrirHistory,
  useClearGrirItem,
  useGrirAutoMatch,
  type GrirOpenFilters,
} from '../../hooks/useAccountingModules';
import {
  Search,
  FileCheck,
  ArrowRightLeft,
  Zap,
  ChevronDown,
  ChevronRight,
  X,
  Filter,
  RefreshCcw,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  History,
  ChevronLeft,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Types (matching backend service output) ─────────────────────────

interface GrirOpenItem {
  id: string;
  grNumber: string;
  grDate: string | null;
  poId: string;
  poNumber: string;
  poStatus: string;
  supplierId: string;
  supplierName: string;
  supplierCode: string;
  grAmount: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  invoiceAmount: number | null;
  invoiceStatus: string | null;
  daysSinceGr: number | null;
  clearingStatus: string;
  variance: number | null;
}

interface ClearingBalanceSummary {
  totalGrValue: number;
  totalInvoicedValue: number;
  clearingBalance: number;
  outstandingCount: number;
  partiallyMatchedCount: number;
  fullyMatchedCount: number;
  varianceCount: number;
  oldestUnmatchedDays: number | null;
  avgClearingDays: number | null;
}

interface MatchCandidate {
  grId: string;
  grNumber: string;
  grDate: string | null;
  poId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  grAmount: number;
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  invoiceAmount: number;
  amountDiff: number;
  isExactMatch: boolean;
}

interface GrItemDetail {
  productId: string;
  productName: string;
  sku: string;
  receivedQuantity: number;
  costPrice: number;
  lineTotal: number;
  poUnitPrice: number;
  poQuantity: number;
  priceVariance: number;
  quantityVariance: number;
}

// ─── Formatting Helpers ──────────────────────────────────────────────

const fmt = (val: number | null | undefined) =>
  typeof val === 'number'
    ? val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : '—';

const fmtDecimal = (val: number | null | undefined) =>
  typeof val === 'number'
    ? val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';

const fmtDate = (val: string | null | undefined) => {
  if (!val) return '—';
  return val.slice(0, 10);
};

// ─── Status Badge ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    OPEN: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: <Clock className="h-3 w-3" /> },
    PARTIALLY_MATCHED: { bg: 'bg-blue-100', text: 'text-blue-700', icon: <ArrowRightLeft className="h-3 w-3" /> },
    MATCHED: { bg: 'bg-green-100', text: 'text-green-700', icon: <CheckCircle2 className="h-3 w-3" /> },
    VARIANCE: { bg: 'bg-red-100', text: 'text-red-700', icon: <AlertTriangle className="h-3 w-3" /> },
  };
  const s = cfg[status] || { bg: 'bg-gray-100', text: 'text-gray-600', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${s.bg} ${s.text}`}>
      {s.icon}
      {status.replace('_', ' ')}
    </span>
  );
}

// ─── Modal Wrapper ───────────────────────────────────────────────────

function Modal({
  open,
  onClose,
  title,
  wide,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative bg-white rounded-lg shadow-xl ${wide ? 'max-w-5xl' : 'max-w-2xl'} w-full max-h-[80vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═════════════════════════════════════════════════════════════════════

export default function GrirClearingPage() {
  // ── Filter state ─────────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<GrirOpenFilters>({});
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'worklist' | 'search' | 'candidates'>('worklist');

  // ── Modal state ──────────────────────────────────────────────────
  const [clearingModal, setClearingModal] = useState<GrirOpenItem | null>(null);
  const [autoMatchModal, setAutoMatchModal] = useState(false);
  const [drillDownGrId, setDrillDownGrId] = useState<string | null>(null);
  const [historyPoId, setHistoryPoId] = useState<string | null>(null);
  const [autoMatchSupplier, setAutoMatchSupplier] = useState('');
  const [autoMatchTolerance, setAutoMatchTolerance] = useState('2');

  // ── Queries ──────────────────────────────────────────────────────
  const activeFilters = useMemo(() => ({ ...filters, page, limit: 50 }), [filters, page]);
  const { data: openData, isLoading: loadingOpen, refetch: refetchOpen } = useGrirOpenItems(activeFilters);
  const { data: balanceData } = useGrirBalance();
  const { data: searchResults, isLoading: loadingSearch } = useGrirSearch(searchQuery);
  const { data: candidatesData, isLoading: loadingCandidates } = useGrirMatchCandidates(
    autoMatchSupplier || undefined
  );
  const { data: grItemsData, isLoading: loadingGrItems } = useGrirGrItems(drillDownGrId);
  const { data: historyData, isLoading: loadingHistory } = useGrirHistory(historyPoId);

  // ── Mutations ────────────────────────────────────────────────────
  const clearItem = useClearGrirItem();
  const autoMatch = useGrirAutoMatch();

  // ── Derived data ─────────────────────────────────────────────────
  const items: GrirOpenItem[] = useMemo(() => {
    const raw = openData as { data?: GrirOpenItem[] } | GrirOpenItem[] | undefined;
    if (Array.isArray(raw)) return raw;
    if (raw && 'data' in raw && Array.isArray(raw.data)) return raw.data;
    return [];
  }, [openData]);

  const pagination = useMemo(() => {
    const raw = openData as { total?: number; page?: number; limit?: number; totalPages?: number } | undefined;
    if (raw && 'total' in raw) return { total: raw.total || 0, totalPages: raw.totalPages || 1 };
    return { total: items.length, totalPages: 1 };
  }, [openData, items.length]);

  const balance: ClearingBalanceSummary = useMemo(() => {
    const b = balanceData as ClearingBalanceSummary | undefined;
    return b || {
      totalGrValue: 0,
      totalInvoicedValue: 0,
      clearingBalance: 0,
      outstandingCount: 0,
      partiallyMatchedCount: 0,
      fullyMatchedCount: 0,
      varianceCount: 0,
      oldestUnmatchedDays: null,
      avgClearingDays: null,
    };
  }, [balanceData]);

  const searchItems: GrirOpenItem[] = useMemo(
    () => (Array.isArray(searchResults) ? searchResults : []),
    [searchResults]
  );

  const candidates: MatchCandidate[] = useMemo(
    () => (Array.isArray(candidatesData) ? candidatesData : []),
    [candidatesData]
  );

  const grItems: GrItemDetail[] = useMemo(
    () => (Array.isArray(grItemsData) ? grItemsData : []),
    [grItemsData]
  );

  const history = useMemo(() => (Array.isArray(historyData) ? historyData : []), [historyData]);

  // ── Handlers ─────────────────────────────────────────────────────

  const handleSearch = () => {
    if (searchInput.trim().length >= 2) {
      setSearchQuery(searchInput.trim());
      setActiveTab('search');
    }
  };

  const handleClear = (item: GrirOpenItem) => {
    if (!item.invoiceId) {
      toast.error('No invoice linked — cannot clear this item');
      return;
    }
    setClearingModal(item);
  };

  const confirmClear = () => {
    if (!clearingModal?.invoiceId) return;
    clearItem.mutate(
      { grId: clearingModal.id, invoiceId: clearingModal.invoiceId },
      {
        onSuccess: () => {
          setClearingModal(null);
          toast.success('Item cleared — GL postings created');
        },
      }
    );
  };

  const runAutoMatch = () => {
    const tolerance = parseFloat(autoMatchTolerance);
    autoMatch.mutate(
      {
        supplierId: autoMatchSupplier || undefined,
        tolerancePercent: isNaN(tolerance) ? 2 : tolerance,
      },
      {
        onSuccess: (res) => {
          setAutoMatchModal(false);
          const result = (res as { data?: { data?: { matched?: number; withVariance?: number; skipped?: number } } })?.data?.data;
          if (result) {
            toast.success(
              `Auto-match: ${result.matched ?? 0} matched, ${result.withVariance ?? 0} with variance, ${result.skipped ?? 0} skipped`
            );
          }
        },
      }
    );
  };

  const resetFilters = () => {
    setFilters({});
    setPage(1);
  };

  // ═════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">GR/IR Clearing</h1>
          <p className="text-sm text-gray-500 mt-1">
            SAP MR11 — Match goods receipts with supplier invoices
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetchOpen()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
          >
            <RefreshCcw className="h-4 w-4" /> Refresh
          </button>
          <button
            onClick={() => setAutoMatchModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Zap className="h-4 w-4" /> Auto-Match (F.13)
          </button>
        </div>
      </div>

      {/* ── Balance Summary Cards ───────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <SummaryCard label="Clearing Balance" value={fmt(balance.clearingBalance)} color="text-orange-600" sub="Account 2150" />
        <SummaryCard label="GR Value (Uncleared)" value={fmt(balance.totalGrValue)} color="text-blue-600" sub={`${balance.outstandingCount} items`} />
        <SummaryCard label="Invoiced Value" value={fmt(balance.totalInvoicedValue)} color="text-green-600" sub={`${balance.fullyMatchedCount} matched`} />
        <SummaryCard label="Variances" value={String(balance.varianceCount)} color="text-red-600" sub={`${balance.partiallyMatchedCount} partial`} />
        <SummaryCard
          label="Aging"
          value={balance.oldestUnmatchedDays != null ? `${balance.oldestUnmatchedDays}d` : '—'}
          color="text-purple-600"
          sub={balance.avgClearingDays != null ? `Avg: ${balance.avgClearingDays}d` : 'No data'}
        />
      </div>

      {/* ── Search Bar (SAP F4 style) ───────────────────────────── */}
      <div className="bg-white border rounded-lg p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Search by PO number, GR number, supplier name, or invoice..."
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-4 py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900"
          >
            Search
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 ${showFilters ? 'bg-gray-100' : ''
              }`}
          >
            <Filter className="h-4 w-4" /> Filters
            {showFilters ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        </div>

        {/* ── Advanced Filters ───────────────────────────────────── */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FilterInput
              label="Supplier ID"
              value={filters.supplierId || ''}
              onChange={(v) => setFilters({ ...filters, supplierId: v || undefined })}
              placeholder="Supplier UUID or name"
            />
            <FilterInput
              label="PO Number"
              value={filters.poNumber || ''}
              onChange={(v) => setFilters({ ...filters, poNumber: v || undefined })}
              placeholder="PO-2026-..."
            />
            <FilterInput
              label="GR Number"
              value={filters.grNumber || ''}
              onChange={(v) => setFilters({ ...filters, grNumber: v || undefined })}
              placeholder="GR-2026-..."
            />
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <select
                value={filters.status || ''}
                onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="">All Statuses</option>
                <option value="OPEN">Open</option>
                <option value="PARTIALLY_MATCHED">Partially Matched</option>
                <option value="MATCHED">Matched</option>
                <option value="VARIANCE">Variance</option>
              </select>
            </div>
            <FilterInput
              label="Date From"
              type="date"
              value={filters.dateFrom || ''}
              onChange={(v) => setFilters({ ...filters, dateFrom: v || undefined })}
            />
            <FilterInput
              label="Date To"
              type="date"
              value={filters.dateTo || ''}
              onChange={(v) => setFilters({ ...filters, dateTo: v || undefined })}
            />
            <div className="flex items-end">
              <button onClick={resetFilters} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">
                Clear All
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Tab Bar ─────────────────────────────────────────────── */}
      <div className="border-b flex gap-1">
        {(['worklist', 'search', 'candidates'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === tab
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            {tab === 'worklist' && 'MR11 — Work List'}
            {tab === 'search' && `Search Results${searchItems.length > 0 ? ` (${searchItems.length})` : ''}`}
            {tab === 'candidates' && `Match Candidates${candidates.length > 0 ? ` (${candidates.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* ── Tab Content ─────────────────────────────────────────── */}
      {activeTab === 'worklist' && (
        <OpenItemsTable
          items={items}
          isLoading={loadingOpen}
          onClear={handleClear}
          onDrillDown={(grId) => setDrillDownGrId(grId)}
          onHistory={(poId) => setHistoryPoId(poId)}
        />
      )}

      {activeTab === 'search' && (
        <>
          {loadingSearch ? (
            <LoadingState message="Searching..." />
          ) : searchItems.length === 0 ? (
            <EmptyState icon={<Search className="h-8 w-8" />} message={searchQuery ? 'No results found' : 'Enter a search term and press Enter'} />
          ) : (
            <OpenItemsTable
              items={searchItems}
              isLoading={false}
              onClear={handleClear}
              onDrillDown={(grId) => setDrillDownGrId(grId)}
              onHistory={(poId) => setHistoryPoId(poId)}
            />
          )}
        </>
      )}

      {activeTab === 'candidates' && (
        <CandidatesTab
          candidates={candidates}
          isLoading={loadingCandidates}
          supplierFilter={autoMatchSupplier}
          onSupplierChange={setAutoMatchSupplier}
        />
      )}

      {/* ── Pagination ──────────────────────────────────────────── */}
      {activeTab === 'worklist' && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between bg-white border rounded-lg px-4 py-3 shadow-sm">
          <span className="text-sm text-gray-600">
            Page {page} of {pagination.totalPages} · {pagination.total} total items
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages}
              className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MODALS                                                    */}
      {/* ═══════════════════════════════════════════════════════════ */}

      {/* ── Manual Clearing Modal (MR11N) ───────────────────────── */}
      <Modal open={!!clearingModal} onClose={() => setClearingModal(null)} title="Manual Clearing — MR11N">
        {clearingModal && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Clear GR against invoice. GL postings will be created automatically.
            </p>

            <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4">
              <DetailField label="PO Number" value={clearingModal.poNumber} />
              <DetailField label="Supplier" value={clearingModal.supplierName} />
              <DetailField label="GR Number" value={clearingModal.grNumber} />
              <DetailField label="GR Date" value={fmtDate(clearingModal.grDate)} />
              <DetailField label="GR Amount" value={fmtDecimal(clearingModal.grAmount)} highlight="blue" />
              <DetailField label="Invoice Number" value={clearingModal.invoiceNumber || '—'} />
              <DetailField label="Invoice Date" value={fmtDate(clearingModal.invoiceDate)} />
              <DetailField label="Invoice Amount" value={fmtDecimal(clearingModal.invoiceAmount)} highlight="green" />
            </div>

            {/* Variance preview */}
            {clearingModal.invoiceAmount != null && (
              <div className={`rounded-lg p-4 ${clearingModal.grAmount === clearingModal.invoiceAmount
                ? 'bg-green-50 border border-green-200'
                : 'bg-yellow-50 border border-yellow-200'
                }`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {clearingModal.grAmount === clearingModal.invoiceAmount ? (
                      <span className="text-green-700 flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" /> Exact Match — No Variance
                      </span>
                    ) : (
                      <span className="text-yellow-700 flex items-center gap-1">
                        <AlertTriangle className="h-4 w-4" /> Variance Detected
                      </span>
                    )}
                  </span>
                  <span className="text-lg font-bold">
                    {fmtDecimal(clearingModal.grAmount - (clearingModal.invoiceAmount ?? 0))}
                  </span>
                </div>
                {clearingModal.grAmount !== clearingModal.invoiceAmount && (
                  <p className="text-xs text-yellow-600 mt-1">
                    Variance will be posted to Price Variance account (5020) per SAP standard.
                  </p>
                )}
              </div>
            )}

            {/* GL Preview */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500 uppercase">
                GL Postings Preview
              </div>
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Account</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Debit</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-4 py-2">2150 — GR/IR Clearing</td>
                    <td className="px-4 py-2 text-right font-medium">
                      {fmtDecimal(clearingModal.invoiceAmount ?? clearingModal.grAmount)}
                    </td>
                    <td className="px-4 py-2 text-right">—</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2">2100 — Accounts Payable</td>
                    <td className="px-4 py-2 text-right">—</td>
                    <td className="px-4 py-2 text-right font-medium">
                      {fmtDecimal(clearingModal.invoiceAmount ?? clearingModal.grAmount)}
                    </td>
                  </tr>
                  {clearingModal.invoiceAmount != null && clearingModal.grAmount !== clearingModal.invoiceAmount && (
                    <tr className="bg-yellow-50">
                      <td className="px-4 py-2">5020 — Price Variance</td>
                      {clearingModal.grAmount > clearingModal.invoiceAmount ? (
                        <>
                          <td className="px-4 py-2 text-right">—</td>
                          <td className="px-4 py-2 text-right font-medium text-red-600">
                            {fmtDecimal(clearingModal.grAmount - clearingModal.invoiceAmount)}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2 text-right font-medium text-red-600">
                            {fmtDecimal(clearingModal.invoiceAmount - clearingModal.grAmount)}
                          </td>
                          <td className="px-4 py-2 text-right">—</td>
                        </>
                      )}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setClearingModal(null)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmClear}
                disabled={clearItem.isPending}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <ClipboardCheck className="h-4 w-4 inline mr-1" />
                {clearItem.isPending ? 'Posting...' : 'Clear & Post GL'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Auto-Match Modal (F.13) ─────────────────────────────── */}
      <Modal open={autoMatchModal} onClose={() => setAutoMatchModal(false)} title="Automatic Clearing — F.13">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Automatically match goods receipts with supplier invoices.
            Matched pairs will be cleared with GL postings. Items within the tolerance
            threshold will be matched with variance postings to account 5020.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Supplier (optional)</label>
              <input
                type="text"
                value={autoMatchSupplier}
                onChange={(e) => setAutoMatchSupplier(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="Filter by supplier ID..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tolerance %</label>
              <input
                type="number"
                value={autoMatchTolerance}
                onChange={(e) => setAutoMatchTolerance(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                min="0"
                max="100"
                step="0.5"
              />
              <p className="text-xs text-gray-400 mt-1">
                Items within this % difference will be matched with variance posting.
              </p>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-700">
              <strong>Preview:</strong> {candidates.length} candidate pairs found.
              {' '}{candidates.filter((c) => c.isExactMatch).length} exact matches,{' '}
              {candidates.filter((c) => !c.isExactMatch).length} with variance.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setAutoMatchModal(false)}
              className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={runAutoMatch}
              disabled={autoMatch.isPending || candidates.length === 0}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Zap className="h-4 w-4 inline mr-1" />
              {autoMatch.isPending ? 'Matching...' : `Run Auto-Match (${candidates.length})`}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── 3-Way Match Drill-Down Modal ────────────────────────── */}
      <Modal open={!!drillDownGrId} onClose={() => setDrillDownGrId(null)} title="3-Way Match — Line Items" wide>
        {loadingGrItems ? (
          <LoadingState message="Loading line items..." />
        ) : grItems.length === 0 ? (
          <EmptyState icon={<FileCheck className="h-8 w-8" />} message="No line item details available" />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Comparing GR received quantities/prices against PO ordered values (SAP ME23N style).
            </p>
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Product</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">SKU</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">PO Qty</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">GR Qty</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Qty Var</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">PO Price</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">GR Price</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Price Var</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {grItems.map((item) => (
                  <tr key={item.productId} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{item.productName}</td>
                    <td className="px-4 py-2 text-gray-500">{item.sku}</td>
                    <td className="px-4 py-2 text-right">{fmtDecimal(item.poQuantity)}</td>
                    <td className="px-4 py-2 text-right">{fmtDecimal(item.receivedQuantity)}</td>
                    <td className={`px-4 py-2 text-right font-medium ${item.quantityVariance !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {item.quantityVariance !== 0 ? fmtDecimal(item.quantityVariance) : '✓'}
                    </td>
                    <td className="px-4 py-2 text-right">{fmtDecimal(item.poUnitPrice)}</td>
                    <td className="px-4 py-2 text-right">{fmtDecimal(item.costPrice)}</td>
                    <td className={`px-4 py-2 text-right font-medium ${item.priceVariance !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {item.priceVariance !== 0 ? fmtDecimal(item.priceVariance) : '✓'}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">{fmtDecimal(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* ── Clearing History Modal ───────────────────────────────── */}
      <Modal open={!!historyPoId} onClose={() => setHistoryPoId(null)} title="Clearing History">
        {loadingHistory ? (
          <LoadingState message="Loading history..." />
        ) : history.length === 0 ? (
          <EmptyState icon={<History className="h-8 w-8" />} message="No clearing history for this PO" />
        ) : (
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">PO Amount</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">GR Amount</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Invoice Amount</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Variance</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.map((h: Record<string, unknown>, idx: number) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{fmtDate(h.matchedAt as string | null)}</td>
                  <td className="px-4 py-2 text-right">{fmtDecimal(h.poAmount as number | null)}</td>
                  <td className="px-4 py-2 text-right">{fmtDecimal(h.grAmount as number | null)}</td>
                  <td className="px-4 py-2 text-right">{fmtDecimal(h.invoiceAmount as number | null)}</td>
                  <td className="px-4 py-2 text-right font-medium">{fmtDecimal(h.variance as number | null)}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={(h.status as string) || 'OPEN'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═════════════════════════════════════════════════════════════════════

function SummaryCard({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm min-w-0">
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-sm sm:text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1 truncate">{sub}</div>
    </div>
  );
}

function FilterInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border rounded-lg text-sm"
        placeholder={placeholder}
      />
    </div>
  );
}

function DetailField({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number | null | undefined;
  highlight?: 'blue' | 'green' | 'red';
}) {
  const colorCls = highlight === 'blue'
    ? 'text-blue-700'
    : highlight === 'green'
      ? 'text-green-700'
      : highlight === 'red'
        ? 'text-red-700'
        : 'text-gray-900';
  return (
    <div>
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className={`text-sm font-medium ${colorCls}`}>{value || '—'}</div>
    </div>
  );
}

function LoadingState({ message }: { message: string }) {
  return <div className="text-center py-12 text-gray-500 text-sm">{message}</div>;
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="text-center py-12 text-gray-400">
      <div className="mx-auto mb-2 flex justify-center">{icon}</div>
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ─── Open Items Table ────────────────────────────────────────────────

function OpenItemsTable({
  items,
  isLoading,
  onClear,
  onDrillDown,
  onHistory,
}: {
  items: GrirOpenItem[];
  isLoading: boolean;
  onClear: (item: GrirOpenItem) => void;
  onDrillDown: (grId: string) => void;
  onHistory: (poId: string) => void;
}) {
  if (isLoading) return <LoadingState message="Loading open items..." />;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<FileCheck className="h-8 w-8" />}
        message="No open GR/IR items. All goods receipts are cleared."
      />
    );
  }

  return (
    <div className="bg-white border rounded-lg shadow-sm overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PO Number</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">GR #</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">GR Date</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">GR Amount</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Inv Amount</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Variance</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Days</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.poNumber}</td>
              <td className="px-4 py-3 text-sm text-gray-600">
                <div>{item.supplierName}</div>
                <div className="text-xs text-gray-400">{item.supplierCode}</div>
              </td>
              <td className="px-4 py-3 text-sm text-gray-700">{item.grNumber}</td>
              <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(item.grDate)}</td>
              <td className="px-4 py-3 text-sm text-right font-medium text-blue-700">{fmt(item.grAmount)}</td>
              <td className="px-4 py-3 text-sm text-gray-700">{item.invoiceNumber || '—'}</td>
              <td className="px-4 py-3 text-sm text-right font-medium text-green-700">
                {item.invoiceAmount != null ? fmt(item.invoiceAmount) : '—'}
              </td>
              <td className={`px-4 py-3 text-sm text-right font-medium ${item.variance != null && item.variance !== 0 ? 'text-red-600' : 'text-gray-400'
                }`}>
                {item.variance != null ? fmtDecimal(item.variance) : '—'}
              </td>
              <td className="px-4 py-3 text-sm text-center">
                {item.daysSinceGr != null ? (
                  <span className={`text-xs ${item.daysSinceGr > 30 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                    {item.daysSinceGr}d
                  </span>
                ) : '—'}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={item.clearingStatus} />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => onDrillDown(item.id)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50"
                    title="3-Way Match Details"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onHistory(item.poId)}
                    className="p-1.5 text-gray-400 hover:text-purple-600 rounded hover:bg-purple-50"
                    title="Clearing History"
                  >
                    <History className="h-4 w-4" />
                  </button>
                  {item.clearingStatus !== 'MATCHED' && item.invoiceId && (
                    <button
                      onClick={() => onClear(item)}
                      className="p-1.5 text-gray-400 hover:text-green-600 rounded hover:bg-green-50"
                      title="Clear Item (MR11N)"
                    >
                      <ClipboardCheck className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Match Candidates Tab ────────────────────────────────────────────

function CandidatesTab({
  candidates,
  isLoading,
  supplierFilter,
  onSupplierChange,
}: {
  candidates: MatchCandidate[];
  isLoading: boolean;
  supplierFilter: string;
  onSupplierChange: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1 max-w-xs">
          <input
            type="text"
            value={supplierFilter}
            onChange={(e) => onSupplierChange(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
            placeholder="Filter by supplier ID..."
          />
        </div>
        <div className="text-sm text-gray-500">
          {candidates.filter((c) => c.isExactMatch).length} exact ·{' '}
          {candidates.filter((c) => !c.isExactMatch).length} with variance
        </div>
      </div>

      {isLoading ? (
        <LoadingState message="Loading candidates..." />
      ) : candidates.length === 0 ? (
        <EmptyState icon={<ArrowRightLeft className="h-8 w-8" />} message="No auto-match candidates found" />
      ) : (
        <div className="bg-white border rounded-lg shadow-sm overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PO</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">GR #</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">GR Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Inv Amount</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Diff</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {candidates.map((c, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium">{c.poNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{c.supplierName}</td>
                  <td className="px-4 py-3 text-sm">{c.grNumber}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-blue-700">{fmt(c.grAmount)}</td>
                  <td className="px-4 py-3 text-sm">{c.invoiceNumber}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-green-700">{fmt(c.invoiceAmount)}</td>
                  <td className={`px-4 py-3 text-sm text-right font-medium ${c.amountDiff !== 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {fmtDecimal(c.amountDiff)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.isExactMatch ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Exact
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-yellow-600">
                        <AlertTriangle className="h-3.5 w-3.5" /> Variance
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
