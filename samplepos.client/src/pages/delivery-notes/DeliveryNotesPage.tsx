/**
 * Wholesale Delivery Notes Page
 * Flow: WHOLESALE Quotation → Delivery Note(s) → Invoice
 * Tabs: List | Create from Quotation | Detail View
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout';
import deliveryNotesApi from '../../api/deliveryNotes';
import quotationApi from '../../api/quotations';
import { formatCurrency } from '../../utils/currency';
import { downloadFile } from '../../utils/download';
import { DocumentFlowButton } from '../../components/shared/DocumentFlowButton';
import type {
  DeliveryNoteWithLines,
  DeliveryNoteListItem,
  DeliveryNoteStatus,
  CreateDeliveryNoteLine,
} from '../../api/deliveryNotes';
import type { Quotation, QuotationItem } from '@shared/types/quotation';

// ── Status helpers ─────────────────────────────────────────

const STATUS_COLORS: Record<DeliveryNoteStatus, string> = {
  DRAFT: 'bg-yellow-100 text-yellow-800',
  POSTED: 'bg-green-100 text-green-800',
};

// ── Main Page ──────────────────────────────────────────────

type ViewMode = 'list' | 'create' | 'detail';

export default function DeliveryNotesPage() {
  const [view, setView] = useState<ViewMode>('list');
  const [selectedDnId, setSelectedDnId] = useState<string | null>(null);
  const [selectedQuotationId, setSelectedQuotationId] = useState<string | null>(null);

  const openDetail = (dn: { id: string }) => {
    setSelectedDnId(dn.id);
    setView('detail');
  };

  const openCreate = (quotationId?: string) => {
    setSelectedQuotationId(quotationId || null);
    setView('create');
  };

  const backToList = () => {
    setView('list');
    setSelectedDnId(null);
    setSelectedQuotationId(null);
  };

  return (
    <Layout>
      <div className="p-6 lg:p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Wholesale Delivery Notes</h1>
          <p className="text-gray-600 mt-1">
            Create delivery notes from wholesale quotations, post to move stock, then invoice
          </p>
        </div>

        {view === 'list' && (
          <DeliveryNotesList onViewDetail={openDetail} onCreateNew={openCreate} />
        )}
        {view === 'create' && (
          <CreateDeliveryNote
            preselectedQuotationId={selectedQuotationId}
            onBack={backToList}
            onCreated={(dn) => {
              setSelectedDnId(dn.id);
              setView('detail');
            }}
          />
        )}
        {view === 'detail' && selectedDnId && (
          <DeliveryNoteDetail
            deliveryNoteId={selectedDnId}
            onBack={backToList}
          />
        )}
      </div>
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════
// LIST VIEW
// ═══════════════════════════════════════════════════════════

function DeliveryNotesList({
  onViewDetail,
  onCreateNew,
}: {
  onViewDetail: (dn: DeliveryNoteListItem) => void;
  onCreateNew: (quotationId?: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<DeliveryNoteStatus | 'ALL'>('ALL');

  const { data, isLoading, error } = useQuery({
    queryKey: ['delivery-notes', page, statusFilter],
    queryFn: () =>
      deliveryNotesApi.list({
        page,
        limit: 20,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      }),
  });

  const deliveryNotes = data?.data || [];
  const pagination = data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 };

  return (
    <>
      {/* Actions Bar */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {(['ALL', 'DRAFT', 'POSTED'] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === s
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              {s === 'ALL' ? 'All' : s}
            </button>
          ))}
        </div>
        <button
          onClick={() => onCreateNew()}
          className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold shadow-sm transition-colors"
        >
          + New Delivery Note
        </button>
      </div>

      {/* Loading / Error */}
      {isLoading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <p className="text-gray-600 mt-4">Loading delivery notes...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-800 font-semibold">Failed to load delivery notes</p>
          <p className="text-red-600 text-sm mt-2">{(error as Error).message}</p>
        </div>
      )}

      {/* Table */}
      {!isLoading && !error && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">DN #</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Quotation</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Customer</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Date</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700">Amount</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Status</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deliveryNotes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-500">
                      No delivery notes yet. Create one from a wholesale quotation.
                    </td>
                  </tr>
                ) : (
                  deliveryNotes.map((dn) => (
                    <tr key={dn.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => onViewDetail(dn)}>
                      <td className="py-3 px-4 font-mono text-sm font-semibold text-blue-700">
                        {dn.deliveryNoteNumber}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {dn.quotationNumber || '-'}
                      </td>
                      <td className="py-3 px-4 text-sm">{dn.customerName || '-'}</td>
                      <td className="py-3 px-4 text-sm text-gray-600">{dn.deliveryDate}</td>
                      <td className="py-3 px-4 text-sm text-right font-semibold">
                        {formatCurrency(dn.totalAmount)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[dn.status]}`}>
                          {dn.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); onViewDetail(dn); }}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-gray-600">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 text-sm border rounded disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                  className="px-3 py-1 text-sm border rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// CREATE VIEW
// ═══════════════════════════════════════════════════════════

function CreateDeliveryNote({
  preselectedQuotationId,
  onBack,
  onCreated,
}: {
  preselectedQuotationId: string | null;
  onBack: () => void;
  onCreated: (dn: DeliveryNoteWithLines) => void;
}) {
  const queryClient = useQueryClient();
  const [selectedQuotation, setSelectedQuotation] = useState<{ quotation: Quotation; items: QuotationItem[] } | null>(null);
  const [quotationSearch, setQuotationSearch] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [driverName, setDriverName] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [warehouseNotes, setWarehouseNotes] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [lineQuantities, setLineQuantities] = useState<Record<string, number>>({});
  const fulfillmentAppliedForRef = useRef<string | null>(null);

  // Search wholesale quotations
  const { data: quotationsData } = useQuery({
    queryKey: ['quotations-wholesale-search', quotationSearch],
    queryFn: () => quotationApi.listQuotations({ searchTerm: quotationSearch || undefined, limit: 50 }),
    enabled: !selectedQuotation,
  });

  // Filter to WHOLESALE only (excluding CONVERTED & CANCELLED)
  const wholesaleQuotations = useMemo(() => {
    const all = quotationsData?.quotations || [];
    return all.filter(
      (q) =>
        (q as Quotation & { fulfillmentMode?: string }).fulfillmentMode === 'WHOLESALE' &&
        q.status !== 'CONVERTED' &&
        q.status !== 'CANCELLED'
    );
  }, [quotationsData]);

  // Load preselected quotation
  const { data: preselectedData } = useQuery({
    queryKey: ['quotation-detail', preselectedQuotationId],
    queryFn: () => quotationApi.getQuotationById(preselectedQuotationId!),
    enabled: !!preselectedQuotationId && !selectedQuotation,
  });

  // Auto-select preselected
  useEffect(() => {
    if (preselectedData && !selectedQuotation) {
      const q = preselectedData;
      setSelectedQuotation(q);
      // Initialize quantities
      const initial: Record<string, number> = {};
      q.items.forEach((item) => {
        if (item.productType !== 'service') {
          initial[item.id] = item.quantity;
        }
      });
      setLineQuantities(initial);
    }
  }, [preselectedData, selectedQuotation]);

  // Load fulfillment when quotation selected
  const { data: fulfillmentData } = useQuery({
    queryKey: ['dn-fulfillment', selectedQuotation?.quotation.id],
    queryFn: () => deliveryNotesApi.getFulfillment(selectedQuotation!.quotation.id),
    enabled: !!selectedQuotation,
  });

  useEffect(() => {
    if (fulfillmentData && selectedQuotation && fulfillmentAppliedForRef.current !== selectedQuotation.quotation.id) {
      fulfillmentAppliedForRef.current = selectedQuotation.quotation.id;
      // Adjust initial quantities to remaining
      const updated: Record<string, number> = {};
      selectedQuotation.items.forEach((item) => {
        if (item.productType === 'service') return;
        const fi = fulfillmentData.items.find((f) => f.quotationItemId === item.id);
        const remaining = fi ? fi.remaining : item.quantity;
        updated[item.id] = Math.max(0, remaining);
      });
      setLineQuantities(updated);
    }
  }, [fulfillmentData, selectedQuotation]);

  const selectQuotation = async (quotation: Quotation) => {
    try {
      const detail = await quotationApi.getQuotationById(quotation.id);
      setSelectedQuotation(detail);
      const initial: Record<string, number> = {};
      detail.items.forEach((item) => {
        if (item.productType !== 'service') {
          initial[item.id] = item.quantity;
        }
      });
      setLineQuantities(initial);
      setQuotationSearch('');
    } catch {
      toast.error('Failed to load quotation details');
    }
  };

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof deliveryNotesApi.create>[0]) => deliveryNotesApi.create(data),
    onSuccess: (dn) => {
      queryClient.invalidateQueries({ queryKey: ['delivery-notes'] });
      queryClient.invalidateQueries({ queryKey: ['dn-fulfillment'] });
      toast.success(`Delivery note ${dn.deliveryNoteNumber} created`);
      onCreated(dn);
    },
    onError: (error: Error) => {
      const msg = (error as { response?: { data?: { error?: string } } }).response?.data?.error || error.message;
      toast.error(msg);
    },
  });

  const handleCreate = () => {
    if (!selectedQuotation) return;

    const lines: CreateDeliveryNoteLine[] = selectedQuotation.items
      .filter((item) => item.productType !== 'service' && (lineQuantities[item.id] || 0) > 0)
      .map((item) => ({
        quotationItemId: item.id,
        productId: item.productId || '',
        uomId: item.uomId,
        uomName: item.uomName,
        quantityDelivered: lineQuantities[item.id] || 0,
        unitPrice: item.unitPrice,
        unitCost: item.unitCost ?? undefined,
        description: item.description,
      }));

    if (lines.length === 0) {
      toast.error('Add at least one item with quantity > 0');
      return;
    }

    createMutation.mutate({
      quotationId: selectedQuotation.quotation.id,
      deliveryDate,
      driverName: driverName || undefined,
      vehicleNumber: vehicleNumber || undefined,
      warehouseNotes: warehouseNotes || undefined,
      deliveryAddress: deliveryAddress || undefined,
      lines,
    });
  };

  return (
    <>
      <button onClick={onBack} className="mb-4 text-gray-600 hover:text-gray-900 text-sm">
        ← Back to Delivery Notes
      </button>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-6">Create Delivery Note from Wholesale Quotation</h2>

        {/* Quotation Selection */}
        {!selectedQuotation ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search Wholesale Quotations
            </label>
            <input
              type="text"
              value={quotationSearch}
              onChange={(e) => setQuotationSearch(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
              placeholder="Search by quote number or customer name..."
              autoFocus
            />
            <div className="mt-4 max-h-80 overflow-y-auto">
              {wholesaleQuotations.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No wholesale quotations found. Create one with &quot;Wholesale&quot; fulfillment mode.
                </p>
              ) : (
                wholesaleQuotations.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => selectQuotation(q)}
                    className="w-full text-left px-4 py-3 border-b hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-mono font-semibold text-blue-700">{q.quoteNumber}</span>
                        <span className="ml-3 text-gray-600">{q.customerName || 'No customer'}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold">{formatCurrency(q.totalAmount)}</span>
                        <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700">
                          WHOLESALE
                        </span>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Selected Quotation Header */}
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
              <div>
                <span className="font-mono font-semibold text-blue-700 text-lg">
                  {selectedQuotation.quotation.quoteNumber}
                </span>
                <span className="ml-3 text-gray-700">{selectedQuotation.quotation.customerName}</span>
                <span className="ml-3 font-semibold">{formatCurrency(selectedQuotation.quotation.totalAmount)}</span>
              </div>
              <button
                onClick={() => { setSelectedQuotation(null); fulfillmentAppliedForRef.current = null; }}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Change Quotation
              </button>
            </div>

            {/* Fulfillment Progress */}
            {fulfillmentData && fulfillmentData.overallStatus !== 'NOT_STARTED' && (
              <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="font-semibold text-green-800 mb-2">
                  Fulfillment: {fulfillmentData.overallStatus === 'FULFILLED' ? 'Fully Delivered' : 'Partially Delivered'}
                </p>
                <div className="space-y-1">
                  {fulfillmentData.items.map((fi) => (
                    <div key={fi.quotationItemId} className="flex justify-between text-sm">
                      <span className="text-gray-700">{fi.description}</span>
                      <span className={fi.remaining === 0 ? 'text-green-600 font-medium' : 'text-orange-600'}>
                        {fi.delivered}/{fi.ordered} delivered
                        {fi.remaining > 0 && ` (${fi.remaining} remaining)`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Delivery Details */}
            <div className="mb-6 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Date</label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Driver Name</label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Number</label>
                <input
                  type="text"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Address</label>
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse Notes</label>
              <textarea
                value={warehouseNotes}
                onChange={(e) => setWarehouseNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                rows={2}
                placeholder="Optional picking/packing notes"
              />
            </div>

            {/* Line Items */}
            <h3 className="text-lg font-semibold mb-3">Items to Deliver</h3>
            <div className="overflow-x-auto mb-6">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Item</th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-gray-700">Ordered</th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-gray-700">Already Delivered</th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-gray-700">Remaining</th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-gray-700">Deliver Now</th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-gray-700">Unit Price</th>
                    <th className="text-right py-2 px-3 text-sm font-semibold text-gray-700">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedQuotation.items
                    .filter((item) => item.productType !== 'service')
                    .map((item) => {
                      const fi = fulfillmentData?.items.find((f) => f.quotationItemId === item.id);
                      const delivered = fi?.delivered || 0;
                      const remaining = fi ? fi.remaining : item.quantity;
                      const qty = lineQuantities[item.id] || 0;

                      return (
                        <tr key={item.id} className="border-b">
                          <td className="py-2 px-3">
                            <div className="font-medium">{item.description}</div>
                            {item.sku && <div className="text-xs text-gray-500">SKU: {item.sku}</div>}
                          </td>
                          <td className="py-2 px-3 text-right">{item.quantity}</td>
                          <td className="py-2 px-3 text-right text-gray-600">{delivered}</td>
                          <td className="py-2 px-3 text-right">
                            <span className={remaining === 0 ? 'text-green-600 font-medium' : 'text-orange-600 font-medium'}>
                              {remaining}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right">
                            <input
                              type="number"
                              min={0}
                              max={remaining}
                              step="any"
                              value={qty}
                              onChange={(e) =>
                                setLineQuantities((prev) => ({
                                  ...prev,
                                  [item.id]: Math.min(Number(e.target.value) || 0, remaining),
                                }))
                              }
                              className="w-24 px-2 py-1 border border-gray-300 rounded text-right focus:ring-2 focus:ring-blue-500"
                              disabled={remaining === 0}
                            />
                          </td>
                          <td className="py-2 px-3 text-right">{formatCurrency(item.unitPrice)}</td>
                          <td className="py-2 px-3 text-right font-semibold">
                            {formatCurrency(qty * item.unitPrice)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={onBack}
                className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="px-8 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-semibold disabled:opacity-50 shadow-sm"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Delivery Note'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// DETAIL VIEW
// ═══════════════════════════════════════════════════════════

function DeliveryNoteDetail({
  deliveryNoteId,
  onBack,
}: {
  deliveryNoteId: string;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();

  const { data: dn, isLoading, error, refetch } = useQuery({
    queryKey: ['delivery-note-detail', deliveryNoteId],
    queryFn: () => deliveryNotesApi.getById(deliveryNoteId),
  });

  const postMutation = useMutation({
    mutationFn: () => deliveryNotesApi.post(deliveryNoteId),
    onSuccess: (posted) => {
      toast.success(`${posted.deliveryNoteNumber} posted — stock deducted`);
      queryClient.invalidateQueries({ queryKey: ['delivery-notes'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-note-detail', deliveryNoteId] });
      refetch();
    },
    onError: (error: Error) => {
      const msg = (error as { response?: { data?: { error?: string } } }).response?.data?.error || error.message;
      toast.error(msg);
    },
  });

  const invoiceMutation = useMutation({
    mutationFn: () => deliveryNotesApi.createInvoice(deliveryNoteId),
    onSuccess: () => {
      toast.success('Invoice created successfully');
      queryClient.invalidateQueries({ queryKey: ['delivery-notes'] });
      queryClient.invalidateQueries({ queryKey: ['delivery-note-detail', deliveryNoteId] });
      refetch();
    },
    onError: (error: Error) => {
      const msg = (error as { response?: { data?: { error?: string } } }).response?.data?.error || error.message;
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deliveryNotesApi.remove(deliveryNoteId),
    onSuccess: () => {
      toast.success('Draft delivery note deleted');
      queryClient.invalidateQueries({ queryKey: ['delivery-notes'] });
      onBack();
    },
    onError: (error: Error) => {
      const msg = (error as { response?: { data?: { error?: string } } }).response?.data?.error || error.message;
      toast.error(msg);
    },
  });

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (error || !dn) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-800 font-semibold">Failed to load delivery note</p>
        <button onClick={onBack} className="mt-4 px-4 py-2 bg-gray-600 text-white rounded-lg">
          Back
        </button>
      </div>
    );
  }

  return (
    <>
      <button onClick={onBack} className="mb-4 text-gray-600 hover:text-gray-900 text-sm">
        ← Back to Delivery Notes
      </button>

      <div className="bg-white rounded-lg shadow p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{dn.deliveryNoteNumber}</h2>
            <p className="text-gray-600 mt-1">
              Quotation: <span className="font-mono font-semibold">{dn.quotationNumber || dn.quotationId}</span>
              {dn.customerName && <span className="ml-3">· {dn.customerName}</span>}
            </p>
          </div>
          <span className={`px-4 py-2 rounded-full text-sm font-bold ${STATUS_COLORS[dn.status]}`}>
            {dn.status}
          </span>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div>
            <p className="text-sm text-gray-500">Delivery Date</p>
            <p className="font-medium">{dn.deliveryDate}</p>
          </div>
          {dn.driverName && (
            <div>
              <p className="text-sm text-gray-500">Driver</p>
              <p className="font-medium">{dn.driverName}</p>
            </div>
          )}
          {dn.vehicleNumber && (
            <div>
              <p className="text-sm text-gray-500">Vehicle</p>
              <p className="font-medium">{dn.vehicleNumber}</p>
            </div>
          )}
          {dn.deliveryAddress && (
            <div>
              <p className="text-sm text-gray-500">Address</p>
              <p className="font-medium">{dn.deliveryAddress}</p>
            </div>
          )}
          {dn.postedAt && (
            <div>
              <p className="text-sm text-gray-500">Posted At</p>
              <p className="font-medium">{new Date(dn.postedAt).toLocaleString()}</p>
            </div>
          )}
        </div>

        {dn.warehouseNotes && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm font-medium text-yellow-800">Warehouse Notes</p>
            <p className="text-yellow-700">{dn.warehouseNotes}</p>
          </div>
        )}

        {/* Lines */}
        <h3 className="text-lg font-semibold mb-3">Delivery Lines</h3>
        <div className="overflow-x-auto mb-6">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Item</th>
                <th className="text-right py-2 px-3 text-sm font-semibold text-gray-700">Qty Delivered</th>
                <th className="text-right py-2 px-3 text-sm font-semibold text-gray-700">Unit Price</th>
                <th className="text-right py-2 px-3 text-sm font-semibold text-gray-700">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {dn.lines.map((line) => (
                <tr key={line.id} className="border-b">
                  <td className="py-2 px-3">
                    <div className="font-medium">{line.description || line.productId}</div>
                    {line.uomName && <div className="text-xs text-gray-500">{line.uomName}</div>}
                  </td>
                  <td className="py-2 px-3 text-right">{line.quantityDelivered}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(line.unitPrice)}</td>
                  <td className="py-2 px-3 text-right font-semibold">{formatCurrency(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2">
                <td colSpan={3} className="py-3 px-3 text-right font-bold text-lg">Total:</td>
                <td className="py-3 px-3 text-right font-bold text-lg">{formatCurrency(dn.totalAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t">
          <button
            onClick={async () => {
              try {
                await downloadFile(
                  deliveryNotesApi.getPdfUrl(dn.id),
                  `delivery-note-${dn.deliveryNoteNumber}.pdf`
                );
              } catch (err) {
                toast.error((err as Error).message || 'Failed to download PDF');
              }
            }}
            className="px-5 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Export PDF
          </button>
          <DocumentFlowButton entityType="DELIVERY_NOTE" entityId={deliveryNoteId} size="sm" />
          {dn.status === 'DRAFT' && (
            <>
              <button
                onClick={() => {
                  if (confirm(`Post ${dn.deliveryNoteNumber}? This will deduct stock and cannot be undone.`)) {
                    postMutation.mutate();
                  }
                }}
                disabled={postMutation.isPending}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold disabled:opacity-50"
              >
                {postMutation.isPending ? 'Posting...' : 'Post Delivery Note'}
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete draft ${dn.deliveryNoteNumber}?`)) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending}
                className="px-6 py-3 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
              >
                Delete Draft
              </button>
            </>
          )}
          {dn.status === 'POSTED' && !dn.invoiceId && (
            <button
              onClick={() => {
                if (confirm(`Create invoice from ${dn.deliveryNoteNumber}?`)) {
                  invoiceMutation.mutate();
                }
              }}
              disabled={invoiceMutation.isPending}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-50"
            >
              {invoiceMutation.isPending ? 'Creating Invoice...' : 'Create Invoice from DN'}
            </button>
          )}
          {dn.status === 'POSTED' && dn.invoiceId && (
            <span className="px-4 py-3 bg-green-50 text-green-800 rounded-lg font-semibold border border-green-200">
              ✓ Invoiced as {dn.invoiceNumber}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
