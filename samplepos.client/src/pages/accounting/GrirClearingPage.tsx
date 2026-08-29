import { useState, useMemo, useRef, useEffect } from 'react';
import {
  useGrirOpenItems,
  useGrirBalance,
  useGrirSearch,
  useGrirMatchCandidates,
  useGrirGrItems,
  useGrirHistory,
  useClearGrirItem,
  useGrirAutoMatch,
  useGrirResiduals,
  useClearGrirResidual,
  type GrirOpenFilters,
} from '../../hooks/useAccountingModules';
import { useTransactionGuard, ZINDEX } from '../../hooks/useTransactionGuard';
import type { GuardHandle } from '../../hooks/useTransactionGuard';
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
import { DatePicker } from '../../components/ui/date-picker';
import {
  canShowManualClearAction,
  F13_DEFAULT_TOLERANCE_PERCENT,
  grirClearingStatusLabel,
  grirResidualMethodLabel,
  GRIR_HELP,
  GRIR_PAGE_SUBTITLE,
  GRIR_RESIDUAL_CLEAR_METHOD_OPTIONS,
  isResidualClearMethodAllowed,
  OPEN_STATUS_FILTER_OPTIONS,
  parseF13TolerancePercent,
  resolveResidualClearMethod,
  residualClearMethodBlockedReason,
  type GrirResidualClearMethod,
} from '@shared/domain/grirClearingSsot';
import { getStructuredErrorMessage } from '../../utils/errorHandler';
import { HelpTrigger } from '../../components/ui/HelpTrigger';

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
  trueGlBalance?: number;
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
    UNMATCHED: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: <Clock className="h-3 w-3" /> },
    PARTIALLY_MATCHED: { bg: 'bg-blue-100', text: 'text-blue-700', icon: <ArrowRightLeft className="h-3 w-3" /> },
    MATCHED: { bg: 'bg-green-100', text: 'text-green-700', icon: <CheckCircle2 className="h-3 w-3" /> },
    VARIANCE: { bg: 'bg-red-100', text: 'text-red-700', icon: <AlertTriangle className="h-3 w-3" /> },
    CLEARED: { bg: 'bg-green-100', text: 'text-green-700', icon: <CheckCircle2 className="h-3 w-3" /> },
  };
  const s = cfg[status] || { bg: 'bg-gray-100', text: 'text-gray-600', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${s.bg} ${s.text}`}>
      {s.icon}
      {grirClearingStatusLabel(status)}
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
  zIndex,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  wide?: boolean;
  children: React.ReactNode;
  zIndex?: number;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 flex items-start justify-center pt-16 px-4" style={{ zIndex: zIndex ?? 50 }} role="dialog" aria-modal="true" aria-label={title}>
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
  const [activeTab, setActiveTab] = useState<'worklist' | 'search' | 'candidates' | 'residuals'>('worklist');
  /** Per-row method override keyed by referenceNumber (defaults to recommended). */
  const [residualMethodByRef, setResidualMethodByRef] = useState<
    Record<string, GrirResidualClearMethod>
  >({});
  const [clearingResidualRef, setClearingResidualRef] = useState<string | null>(null);

  // ── Modal state ──────────────────────────────────────────────────
  const [clearingModal, setClearingModal] = useState<GrirOpenItem | null>(null);
  const [autoMatchModal, setAutoMatchModal] = useState(false);
  const [drillDownGrId, setDrillDownGrId] = useState<string | null>(null);
  const [historyPoId, setHistoryPoId] = useState<string | null>(null);

  // ── Transaction Guards ────────────────────────────────────────────
  const { openGuard: openClearGuard, closeGuard: closeClearGuard } = useTransactionGuard();
  const clearGuardRef = useRef<GuardHandle | null>(null);
  useEffect(() => {
    if (clearingModal) {
      clearGuardRef.current = openClearGuard({ cancellable: false, label: 'Manual GR/IR clearing' });
      return () => { if (clearGuardRef.current) { closeClearGuard(clearGuardRef.current.id); clearGuardRef.current = null; } };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearingModal]);
  const { openGuard: openAutoGuard, closeGuard: closeAutoGuard } = useTransactionGuard();
  const autoGuardRef = useRef<GuardHandle | null>(null);
  useEffect(() => {
    if (autoMatchModal) {
      autoGuardRef.current = openAutoGuard({ cancellable: false, label: 'Automatic GR/IR clearing' });
      return () => { if (autoGuardRef.current) { closeAutoGuard(autoGuardRef.current.id); autoGuardRef.current = null; } };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMatchModal]);
  const { openGuard: openDrillGuard, closeGuard: closeDrillGuard } = useTransactionGuard();
  const drillGuardRef = useRef<GuardHandle | null>(null);
  useEffect(() => {
    if (drillDownGrId) {
      drillGuardRef.current = openDrillGuard({ cancellable: true, label: 'View 3-way match' });
      return () => { if (drillGuardRef.current) { closeDrillGuard(drillGuardRef.current.id); drillGuardRef.current = null; } };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drillDownGrId]);
  const { openGuard: openHistoryGuard, closeGuard: closeHistoryGuard } = useTransactionGuard();
  const historyGuardRef = useRef<GuardHandle | null>(null);
  useEffect(() => {
    if (historyPoId) {
      historyGuardRef.current = openHistoryGuard({ cancellable: true, label: 'View clearing history' });
      return () => { if (historyGuardRef.current) { closeHistoryGuard(historyGuardRef.current.id); historyGuardRef.current = null; } };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyPoId]);

  const [autoMatchSupplier, setAutoMatchSupplier] = useState('');
  const [autoMatchTolerance, setAutoMatchTolerance] = useState(String(F13_DEFAULT_TOLERANCE_PERCENT));

  // ── Queries ──────────────────────────────────────────────────────
  const activeFilters = useMemo(() => ({ ...filters, page, limit: 50 }), [filters, page]);
  const { data: openData, isLoading: loadingOpen, isError: openError, error: openLoadError, refetch: refetchOpen } =
    useGrirOpenItems(activeFilters);
  const { data: balanceData, isError: balanceError, error: balanceLoadError, refetch: refetchBalance } =
    useGrirBalance();
  const {
    data: residualsData,
    isLoading: loadingResiduals,
    isError: residualsError,
    error: residualsLoadError,
    refetch: refetchResiduals,
  } = useGrirResiduals(activeTab === 'residuals');
  const { data: searchResults, isLoading: loadingSearch, isError: searchError, error: searchLoadError } =
    useGrirSearch(searchQuery);
  const { data: candidatesData, isLoading: loadingCandidates, isError: candidatesError, error: candidatesLoadError } =
    useGrirMatchCandidates(
      autoMatchSupplier || undefined,
      parseF13TolerancePercent(autoMatchTolerance),
      activeTab === 'candidates' || autoMatchModal,
    );
  const { data: grItemsData, isLoading: loadingGrItems, isError: grItemsError, error: grItemsLoadError } =
    useGrirGrItems(drillDownGrId);
  const { data: historyData, isLoading: loadingHistory, isError: historyError, error: historyLoadError } =
    useGrirHistory(historyPoId);

  // ── Mutations ────────────────────────────────────────────────────
  const clearItem = useClearGrirItem();
  const clearResidual = useClearGrirResidual();
  const autoMatch = useGrirAutoMatch();

  // ── Derived data ─────────────────────────────────────────────────
  const items: GrirOpenItem[] = useMemo(() => {
    if (!openData || !Array.isArray(openData.rows)) return [];
    return openData.rows as GrirOpenItem[];
  }, [openData]);

  const pagination = useMemo(() => {
    if (openData?.pagination) {
      return {
        total: openData.pagination.total,
        totalPages: openData.pagination.totalPages,
      };
    }
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
      trueGlBalance: 0,
    };
  }, [balanceData]);

  const residualItems = useMemo(() => residualsData?.items ?? [], [residualsData]);
  const ledgerBalance = residualsData?.trueGlBalance ?? balance.trueGlBalance ?? 0;

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
    const q = searchInput.trim();
    if (q.length < 2) {
      toast.error('Enter at least 2 characters to search');
      return;
    }
    setSearchQuery(q);
    setActiveTab('search');
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

  const confirmClearResidual = (
    referenceNumber: string,
    method: GrirResidualClearMethod,
    netCr: number,
    recommended: GrirResidualClearMethod,
  ) => {
    const effective = resolveResidualClearMethod(method, netCr, recommended);
    const blocked = residualClearMethodBlockedReason(effective, netCr);
    if (blocked) {
      toast.error(blocked);
      return;
    }
    setClearingResidualRef(referenceNumber);
    clearResidual.mutate(
      { referenceNumber, method: effective, notes: `Manual residual clear from GR/IR UI` },
      {
        onSettled: () => setClearingResidualRef(null),
        onSuccess: () => {
          setResidualMethodByRef((prev) => {
            const next = { ...prev };
            delete next[referenceNumber];
            return next;
          });
          refetchResiduals();
        },
      },
    );
  };

  const runAutoMatch = () => {
    autoMatch.mutate(
      {
        supplierId: autoMatchSupplier || undefined,
        tolerancePercent: parseF13TolerancePercent(autoMatchTolerance),
      },
      {
        onSuccess: (result) => {
          setAutoMatchModal(false);
          toast.success(
            `Auto-match: ${result.matched} matched, ${result.withVariance} with variance, ${result.skipped} skipped`,
          );
          if (result.failures && result.failures.length > 0) {
            const preview = result.failures
              .slice(0, 3)
              .map((f) => `${f.grNumber} ↔ ${f.invoiceNumber}: ${f.error}`)
              .join(' · ');
            toast.error(
              `${result.failures.length} pair(s) failed${preview ? ` — ${preview}` : ''}`,
              { duration: 8000 },
            );
          }
        },
      },
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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">GR/IR Clearing</h1>
            <HelpTrigger title={GRIR_HELP.page.title} size="compact">
              <p>{GRIR_HELP.page.summary}</p>
              <ul className="list-disc pl-4 space-y-1">
                {GRIR_HELP.page.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </HelpTrigger>
          </div>
          <p className="text-sm text-gray-500 mt-1">{GRIR_PAGE_SUBTITLE}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              refetchOpen();
              refetchBalance();
              if (activeTab === 'residuals') refetchResiduals();
            }}
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

      {(openError || balanceError) && (
        <QueryError
          message={getStructuredErrorMessage(
            openError ? openLoadError : balanceLoadError,
            'Failed to load GR/IR clearing data',
          )}
          onRetry={() => {
            if (openError) refetchOpen();
            if (balanceError) refetchBalance();
          }}
        />
      )}

      {/* ── Balance Summary Cards ───────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <SummaryCard
          label="True GL 2150"
          value={fmtDecimal(typeof ledgerBalance === 'number' ? ledgerBalance : balance.trueGlBalance)}
          color={Number(ledgerBalance || balance.trueGlBalance || 0) === 0 ? 'text-green-600' : 'text-orange-700'}
          sub="CR − DR (ledger)"
        />
        <SummaryCard label="Subledger Gap" value={fmt(balance.clearingBalance)} color="text-orange-600" sub="MR11 math" />
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
              label="Supplier"
              value={filters.supplierId || ''}
              onChange={(v) => setFilters({ ...filters, supplierId: v || undefined })}
              placeholder="Name, code, or UUID"
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
                {OPEN_STATUS_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
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
      <div className="border-b flex gap-1 flex-wrap">
        {(['worklist', 'residuals', 'search', 'candidates'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === tab
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            {tab === 'worklist' && 'MR11 — Work List'}
            {tab === 'residuals' && `GL Residuals${residualItems.length ? ` (${residualItems.length})` : ''}`}
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
          error={openError ? getStructuredErrorMessage(openLoadError, 'Failed to load open items') : null}
          onRetry={refetchOpen}
          onClear={handleClear}
          onDrillDown={(grId) => setDrillDownGrId(grId)}
          onHistory={(poId) => setHistoryPoId(poId)}
        />
      )}

      {activeTab === 'residuals' && (
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-amber-50 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-sm font-medium text-amber-900 inline-flex items-center gap-1.5">
              Ledger residuals (2150)
              <HelpTrigger title={GRIR_HELP.residuals.title} size="compact">
                <p>{GRIR_HELP.residuals.when}</p>
                <p className="font-medium pt-1">Clear methods</p>
                <ul className="list-disc pl-4 space-y-1">
                  {GRIR_HELP.residuals.methods.map((m) => (
                    <li key={m.label}>
                      <strong>{m.label}</strong> — {m.detail}
                    </li>
                  ))}
                </ul>
                <p className="pt-1">{GRIR_HELP.residuals.note}</p>
              </HelpTrigger>
            </span>
            <span className="text-xs text-amber-800 ml-auto">
              One Clear per row — method defaults to the system recommendation
            </span>
          </div>
          {loadingResiduals ? (
            <LoadingState message="Loading residuals..." />
          ) : residualsError ? (
            <QueryError
              message={getStructuredErrorMessage(residualsLoadError, 'Failed to load GL residuals')}
              onRetry={refetchResiduals}
            />
          ) : residualItems.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="h-8 w-8" />} message="No open GL residuals on 2150" />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2 text-right">Net CR (2150)</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2">Method</th>
                    <th className="px-3 py-2">Last date</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {residualItems.map((row) => {
                    const allowedMethods = GRIR_RESIDUAL_CLEAR_METHOD_OPTIONS.filter((opt) =>
                      isResidualClearMethodAllowed(opt.value, row.netCr),
                    );
                    const selected = resolveResidualClearMethod(
                      residualMethodByRef[row.referenceNumber] ?? row.recommendedMethod,
                      row.netCr,
                      row.recommendedMethod,
                    );
                    const pending = clearResidual.isPending && clearingResidualRef === row.referenceNumber;
                    return (
                    <tr key={`${row.referenceType}:${row.referenceNumber}`} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-xs">{row.referenceNumber}</td>
                      <td className="px-3 py-2 text-xs">{row.referenceType}</td>
                      <td className={`px-3 py-2 text-right font-medium ${row.netCr >= 0 ? 'text-orange-700' : 'text-blue-700'}`}>
                        {fmtDecimal(row.netCr)}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-600">{row.reasonCode}</td>
                      <td className="px-3 py-2">
                        <select
                          value={selected}
                          onChange={(e) =>
                            setResidualMethodByRef((prev) => ({
                              ...prev,
                              [row.referenceNumber]: e.target.value as GrirResidualClearMethod,
                            }))
                          }
                          className="text-xs border rounded px-2 py-1 bg-white max-w-[11rem]"
                          aria-label={`Clear method for ${row.referenceNumber}`}
                        >
                          {allowedMethods.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                              {opt.value === row.recommendedMethod ? ' ★' : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-xs">{fmtDate(row.lastDate)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          disabled={pending || !isResidualClearMethodAllowed(selected, row.netCr)}
                          onClick={() =>
                            confirmClearResidual(
                              row.referenceNumber,
                              selected,
                              row.netCr,
                              row.recommendedMethod,
                            )
                          }
                          title={`Clear with ${grirResidualMethodLabel(selected)}`}
                          className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {pending ? 'Clearing…' : 'Clear'}
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'search' && (
        <>
          {loadingSearch ? (
            <LoadingState message="Searching..." />
          ) : searchError ? (
            <QueryError
              message={getStructuredErrorMessage(searchLoadError, 'Search failed')}
              onRetry={() => setSearchQuery((q) => q)}
            />
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
          error={candidatesError ? getStructuredErrorMessage(candidatesLoadError, 'Failed to load candidates') : null}
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
      <Modal open={!!clearingModal} onClose={() => setClearingModal(null)} title="Manual Clearing — MR11N" zIndex={clearGuardRef.current?.panelZIndex ?? ZINDEX.PANEL}>
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
                    Variance will be posted to Price Variance account (5020).
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
      <Modal open={autoMatchModal} onClose={() => setAutoMatchModal(false)} title="Automatic Clearing — F.13" zIndex={autoGuardRef.current?.panelZIndex ?? ZINDEX.PANEL}>
        <div className="space-y-4">
          <div className="flex items-start gap-2 text-sm text-gray-600">
            <span>Match GR↔bill pairs within tolerance.</span>
            <HelpTrigger title={GRIR_HELP.autoMatch.title} size="compact">
              <p>{GRIR_HELP.autoMatch.body}</p>
            </HelpTrigger>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Supplier (optional)</label>
              <input
                type="text"
                value={autoMatchSupplier}
                onChange={(e) => setAutoMatchSupplier(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="Name, code, or UUID — leave blank for all"
              />
            </div>
            <div>
              <label className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 mb-1">
                Tolerance %
                <HelpTrigger title={GRIR_HELP.tolerance.title} size="compact">
                  <p>{GRIR_HELP.tolerance.body}</p>
                </HelpTrigger>
              </label>
              <input
                type="number"
                value={autoMatchTolerance}
                onChange={(e) => setAutoMatchTolerance(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                min="0"
                max="100"
                step="0.5"
              />
            </div>
          </div>

          <div className={`rounded-lg p-3 border ${candidates.length === 0 ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
            {loadingCandidates ? (
              <p className="text-sm text-gray-600">Loading candidates…</p>
            ) : (
              <p className={`text-sm ${candidates.length === 0 ? 'text-amber-800' : 'text-blue-700'}`}>
                <strong>Preview:</strong> {candidates.length} candidate pair{candidates.length === 1 ? '' : 's'} found.
                {' '}{candidates.filter((c) => c.isExactMatch).length} exact,{' '}
                {candidates.filter((c) => !c.isExactMatch).length} with variance (within {autoMatchTolerance || '0'}%).
              </p>
            )}
            {candidates.length === 0 && !loadingCandidates && (
              <p className="text-xs text-amber-700 mt-2 inline-flex items-center gap-1.5 flex-wrap">
                <span>No pairs to match.</span>
                <HelpTrigger title={GRIR_HELP.autoMatchEmpty.title} size="compact">
                  <p>{GRIR_HELP.autoMatchEmpty.body}</p>
                </HelpTrigger>
              </p>
            )}
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
      <Modal open={!!drillDownGrId} onClose={() => setDrillDownGrId(null)} title="3-Way Match — Line Items" wide zIndex={drillGuardRef.current?.panelZIndex ?? ZINDEX.PANEL}>
        {loadingGrItems ? (
          <LoadingState message="Loading line items..." />
        ) : grItemsError ? (
          <QueryError message={getStructuredErrorMessage(grItemsLoadError, 'Failed to load line items')} />
        ) : grItems.length === 0 ? (
          <EmptyState icon={<FileCheck className="h-8 w-8" />} message="No line item details available" />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Comparing GR received quantities/prices against PO ordered values.
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
      <Modal open={!!historyPoId} onClose={() => setHistoryPoId(null)} title="Clearing History" zIndex={historyGuardRef.current?.panelZIndex ?? ZINDEX.PANEL}>
        {loadingHistory ? (
          <LoadingState message="Loading history..." />
        ) : historyError ? (
          <QueryError message={getStructuredErrorMessage(historyLoadError, 'Failed to load clearing history')} />
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
      {type === 'date' ? (
        <DatePicker
          value={value}
          onChange={onChange}
          placeholder={placeholder || label}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg text-sm"
          placeholder={placeholder}
        />
      )}
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

function QueryError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex flex-wrap items-center gap-2">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button type="button" onClick={() => onRetry()} className="underline font-medium hover:text-red-900">
          Retry
        </button>
      )}
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
  error,
  onRetry,
  onClear,
  onDrillDown,
  onHistory,
}: {
  items: GrirOpenItem[];
  isLoading: boolean;
  error?: string | null;
  onRetry?: () => void;
  onClear: (item: GrirOpenItem) => void;
  onDrillDown: (grId: string) => void;
  onHistory: (poId: string) => void;
}) {
  if (isLoading) return <LoadingState message="Loading open items..." />;

  if (error) {
    return <QueryError message={error} onRetry={onRetry} />;
  }

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
                  {canShowManualClearAction({ clearingStatus: item.clearingStatus, invoiceId: item.invoiceId }) && (
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
  error,
  supplierFilter,
  onSupplierChange,
}: {
  candidates: MatchCandidate[];
  isLoading: boolean;
  error?: string | null;
  supplierFilter: string;
  onSupplierChange: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      {error && <QueryError message={error} />}
      <div className="flex items-center gap-4">
        <div className="flex-1 max-w-xs">
          <input
            type="text"
            value={supplierFilter}
            onChange={(e) => onSupplierChange(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
            placeholder="Filter by supplier name, code, or UUID..."
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
