/* eslint-disable react/forbid-dom-props */
/**
 * Quote Detail View Page — Static Timeline Layout
 *
 * Static sections: header, customer, items, totals, terms/notes.
 * All delivery-note and fulfillment details open in Drawers.
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import quotationApi from '../../api/quotations';
import { api } from '../../utils/api';
import { formatCurrency } from '../../utils/currency';
import Layout from '../../components/Layout';
import {
  getQuoteStatusBadge,
  calculateQuoteAge,
  getDaysUntilExpiry,
  isQuoteEditable,
  isQuoteConvertible,
} from '@shared/types/quotation';
import type { QuotationStatus } from '@shared/types/quotation';
import { AxiosError } from 'axios';
import deliveryNotesApi from '../../api/deliveryNotes';
import type { DeliveryNoteWithLines } from '../../api/deliveryNotes';
import DeliveryNoteDrawer from '../../components/quotations/DeliveryNoteDrawer';
import CreateDeliveryNoteDrawer from '../../components/quotations/CreateDeliveryNoteDrawer';
import FulfillmentDrawer from '../../components/quotations/FulfillmentDrawer';

interface InvoiceSettings {
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyTin?: string;
  footerText?: string;
  paymentInstructions?: string;
}

export default function QuoteDetailPage() {
  const { quoteNumber } = useParams<{ quoteNumber: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [statusNotes, setStatusNotes] = useState('');

  // Drawer state
  const [selectedDnId, setSelectedDnId] = useState<string | null>(null);
  const [showCreateDN, setShowCreateDN] = useState(false);
  const [showFulfillment, setShowFulfillment] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['quotation', quoteNumber],
    queryFn: () => quotationApi.getQuotationByNumber(quoteNumber!),
    enabled: !!quoteNumber,
  });

  const { data: settingsData } = useQuery({
    queryKey: ['invoice-settings'],
    queryFn: async (): Promise<InvoiceSettings | undefined> => {
      const response = await api.settings.getInvoiceSettings();
      return response.data?.data as InvoiceSettings | undefined;
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: QuotationStatus; notes?: string }) =>
      quotationApi.updateQuotationStatus(id, status, notes),
    onSuccess: () => {
      toast.success('Status updated successfully');
      queryClient.invalidateQueries({ queryKey: ['quotation', quoteNumber] });
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      setShowCancelModal(false);
      setStatusNotes('');
    },
    onError: (error: Error) => {
      toast.error((error as AxiosError<{ error?: string }>).response?.data?.error || 'Failed to update status');
    },
  });

  // ── Wholesale queries ──
  const quotationId = data?.quotation?.id;
  const isWholesaleQuote = data?.quotation?.fulfillmentMode === 'WHOLESALE';

  const { data: fulfillmentData } = useQuery({
    queryKey: ['dn-fulfillment', quotationId],
    queryFn: () => deliveryNotesApi.getFulfillment(quotationId!),
    enabled: isWholesaleQuote && !!quotationId,
  });

  const { data: dnListData } = useQuery({
    queryKey: ['quotation-dns', quotationId],
    queryFn: () => deliveryNotesApi.list({ quotationId: quotationId!, limit: 50 }),
    enabled: isWholesaleQuote && !!quotationId,
  });

  // ── Loading / Error ──
  if (isLoading) {
    return (
      <Layout>
        <div className="p-8 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <p className="text-gray-600 mt-4">Loading quotation...</p>
        </div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout>
        <div className="p-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-800 font-semibold">Failed to load quotation</p>
            <p className="text-red-600 text-sm mt-2">{(error as Error)?.message || 'Quotation not found'}</p>
            <button
              onClick={() => navigate('/quotations')}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Back to Quotations
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  const { quotation, items } = data;
  const badge = getQuoteStatusBadge(quotation.status);
  const age = calculateQuoteAge(quotation.createdAt);
  const daysUntilExpiry = getDaysUntilExpiry(quotation.validUntil);
  const canEdit = isQuoteEditable(quotation.status);
  const canConvert = isQuoteConvertible(quotation.status, quotation.validUntil, quotation.convertedToSaleId);

  // ── Wholesale derived data ──
  const existingDns: DeliveryNoteWithLines[] = dnListData?.data || [];
  const fulfillment = fulfillmentData;
  const fulfillmentItems = fulfillment?.items ||
    (items || []).filter(i => i.productType !== 'service').map(i => ({
      quotationItemId: i.id,
      description: i.description,
      ordered: i.quantity,
      delivered: 0,
      remaining: i.quantity,
    }));

  const totalOrdered = fulfillmentItems.reduce((s, i) => s + i.ordered, 0);
  const totalDelivered = fulfillmentItems.reduce((s, i) => s + i.delivered, 0);
  const deliveryPct = totalOrdered > 0 ? Math.round((totalDelivered / totalOrdered) * 100) : 0;

  const handleCancelQuote = () => {
    if (!quotation.id) return;
    updateStatusMutation.mutate({
      id: quotation.id,
      status: 'CANCELLED' as QuotationStatus,
      notes: statusNotes || undefined,
    });
  };

  return (
    <Layout>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          aside, nav, header { display: none !important; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          .print-header { display: block !important; }
          @page { margin: 1.5cm; size: A4 portrait; }
          body { background: white !important; margin: 0; padding: 0; font-size: 10pt; line-height: 1.4; }
          .print-content { width: 100%; max-width: none; padding: 0 !important; margin: 0 !important; }
          h2 { font-size: 12pt !important; margin: 0.4rem 0 0.3rem 0 !important; }
          h3 { font-size: 10pt !important; margin: 0.3rem 0 !important; }
          p, div { margin-bottom: 0.1rem !important; line-height: 1.25 !important; }
          .space-y-4 > * + *, .space-y-3 > * + *, .space-y-2 > * + * { margin-top: 0.2rem !important; }
          .mb-6, .mb-8 { margin-bottom: 0.3rem !important; }
          .p-6 { padding: 0.3rem !important; }
          table { width: 100%; border-collapse: collapse; font-size: 9pt; margin: 0.2rem 0 !important; }
          th, td { padding: 0.2rem 0.4rem !important; border: 1px solid #e5e7eb !important; text-align: left; }
          th { background-color: #f8fafc !important; print-color-adjust: exact; font-weight: 600; font-size: 8pt; text-transform: uppercase; }
          .shadow { box-shadow: none !important; }
          .rounded-lg { border-radius: 0 !important; }
          .bg-white { background: white !important; border: none !important; padding: 0.2rem !important; }
          .bg-gray-50, .bg-yellow-50, .bg-green-50 { background: white !important; }
          .w-80 { width: 200px !important; }
          .print-header-box { margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 2px solid #1e40af; }
          .print-flex-row { display: flex; justify-content: space-between; align-items: flex-start; }
          .print-col { flex: 1; }
          .print-col-center { flex: 1; text-align: center; }
          .print-col-right { flex: 1; text-align: right; }
          .print-company-name { font-size: 18pt; font-weight: bold; margin: 0 0 2px 0; color: #1e293b; }
          .print-meta { font-size: 9pt; color: #64748b; margin: 0; }
          .print-doc-title { font-size: 16pt; font-weight: bold; margin: 0; color: #1e40af; letter-spacing: 0.1em; }
          .print-doc-number { font-size: 12pt; font-weight: 600; margin: 4px 0 0 0; color: #1e293b; }
          .print-detail-table { margin-left: auto; border: none; font-size: 9pt; }
          .print-detail-label { border: none; padding: 1px 8px; color: #64748b; text-align: right; }
          .print-detail-value { border: none; padding: 1px 0; font-weight: 500; text-align: right; }
          .print-detail-value-bold { border: none; padding: 1px 0; font-weight: 600; text-align: right; }
          .print-bill-title { font-size: 11pt; font-weight: 600; margin-bottom: 4px; color: #374151; }
          .print-bill-name { margin: 0; font-weight: 500; }
          .print-bill-detail { margin: 0; font-size: 9pt; color: #6b7280; }
          .print-footer-box { margin-top: 1rem; padding-top: 0.5rem; border-top: 1px solid #e5e7eb; text-align: center; }
          .print-footer-text { font-size: 9pt; color: #64748b; margin: 0; font-style: italic; }
          .print-footer-small { font-size: 8pt; color: #94a3b8; margin: 4px 0 0 0; }
        }
        @media screen {
          .print-header { display: none; }
        }
      `}</style>

      <div className="p-8 max-w-5xl mx-auto print-content">
        {/* ─── Print Header (hidden on screen) ─── */}
        <div className="print-header print-header-box">
          <div className="print-flex-row">
            <div className="print-col">
              <h1 className="print-company-name">{settingsData?.companyName || 'Company Name'}</h1>
              {settingsData?.companyAddress && <p className="print-meta">{settingsData.companyAddress}</p>}
              {settingsData?.companyPhone && <p className="print-meta">Tel: {settingsData.companyPhone}</p>}
              {settingsData?.companyEmail && <p className="print-meta">Email: {settingsData.companyEmail}</p>}
              {settingsData?.companyTin && <p className="print-meta">TIN: {settingsData.companyTin}</p>}
            </div>
            <div className="print-col-center">
              <h2 className="print-doc-title">QUOTATION</h2>
              <p className="print-doc-number">{quotation.quoteNumber}</p>
            </div>
            <div className="print-col-right">
              <table className="print-detail-table">
                <tbody>
                  <tr><td className="print-detail-label">Date:</td><td className="print-detail-value">{new Date(quotation.createdAt).toLocaleDateString()}</td></tr>
                  <tr><td className="print-detail-label">Valid Until:</td><td className="print-detail-value">{new Date(quotation.validUntil).toLocaleDateString()}</td></tr>
                  <tr><td className="print-detail-label">Status:</td><td className="print-detail-value-bold">{badge.label}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── 1. Page Header ── */}
        <div className="mb-8 no-print">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-gray-900">{quotation.quoteNumber}</h1>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${badge.color === 'gray' ? 'bg-gray-100 text-gray-800' :
                    badge.color === 'blue' ? 'bg-blue-100 text-blue-800' :
                      badge.color === 'green' ? 'bg-green-100 text-green-800' :
                        badge.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                          badge.color === 'red' ? 'bg-red-100 text-red-800' :
                            'bg-purple-100 text-purple-800'
                  }`}>
                  {badge.label}
                </span>
                {isWholesaleQuote && (
                  <span className="px-3 py-1 rounded-full text-sm font-semibold bg-orange-100 text-orange-800">Wholesale</span>
                )}
              </div>
              <p className="text-gray-600 mt-1">
                {quotation.quoteType === 'quick' ? 'Quick Quote' : 'Standard Quotation'} · Created {age}
              </p>
            </div>
            <button onClick={() => navigate('/quotations')} className="px-4 py-2 text-gray-700 hover:text-gray-900">
              ← Back
            </button>
          </div>
        </div>

        {/* ── 2. Action Bar ── */}
        <div className="mb-6 flex gap-3 flex-wrap no-print">
          {canConvert && quotation.fulfillmentMode !== 'WHOLESALE' && (
            <button
              onClick={() => { localStorage.setItem('loadQuoteNumber', quotation.quoteNumber); navigate('/pos'); }}
              className="px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold text-sm"
            >
              Convert to Sale
            </button>
          )}
          {isWholesaleQuote && quotation.status !== 'CANCELLED' && quotation.status !== 'CONVERTED' && fulfillment?.overallStatus !== 'FULFILLED' && (
            <button
              onClick={() => setShowCreateDN(true)}
              className="px-5 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-semibold text-sm"
            >
              + Delivery Note
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => navigate(`/quotations/${quoteNumber}/edit`)}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
            >
              Edit
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
          >
            🖨️ Print
          </button>
          {canEdit && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="px-5 py-2.5 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 text-sm"
            >
              Cancel Quote
            </button>
          )}
        </div>

        {/* ── 3. Alerts ── */}
        {daysUntilExpiry <= 7 && daysUntilExpiry > 0 && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 no-print">
            <p className="text-yellow-800 font-semibold">⚠️ Expiring in {daysUntilExpiry} days</p>
          </div>
        )}
        {daysUntilExpiry <= 0 && quotation.status !== 'CONVERTED' && quotation.status !== 'CANCELLED' && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 no-print">
            <p className="text-red-800 font-semibold">❌ Expired — update validity to reactivate</p>
          </div>
        )}

        {/* ── 4. Customer ── */}
        <div className="mb-6 bg-white rounded-lg shadow p-6 print-section">
          <h2 className="text-xl font-semibold mb-4 no-print">Customer Information</h2>
          <div className="hidden print:block">
            <h3 className="print-bill-title">Bill To:</h3>
            <p className="print-bill-name">{quotation.customerName || 'N/A'}</p>
            {quotation.customerPhone && <p className="print-bill-detail">{quotation.customerPhone}</p>}
            {quotation.customerEmail && <p className="print-bill-detail">{quotation.customerEmail}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4 print:hidden">
            <div>
              <p className="text-sm text-gray-600">Customer Name</p>
              <p className="font-semibold">{quotation.customerName || 'N/A'}</p>
            </div>
            {quotation.customerPhone && (
              <div><p className="text-sm text-gray-600">Phone</p><p className="font-semibold">{quotation.customerPhone}</p></div>
            )}
            {quotation.customerEmail && (
              <div><p className="text-sm text-gray-600">Email</p><p className="font-semibold">{quotation.customerEmail}</p></div>
            )}
          </div>
        </div>

        {/* ── 5. Quote Details (screen only) ── */}
        <div className="mb-6 bg-white rounded-lg shadow p-6 no-print">
          <h2 className="text-xl font-semibold mb-4">Quotation Details</h2>
          <div className="grid grid-cols-2 gap-4">
            {quotation.reference && (
              <div><p className="text-sm text-gray-600">Reference</p><p className="font-semibold">{quotation.reference}</p></div>
            )}
            {quotation.description && (
              <div><p className="text-sm text-gray-600">Description</p><p className="font-semibold">{quotation.description}</p></div>
            )}
            <div><p className="text-sm text-gray-600">Valid From</p><p className="font-semibold">{new Date(quotation.validFrom).toLocaleDateString()}</p></div>
            <div><p className="text-sm text-gray-600">Valid Until</p><p className="font-semibold">{new Date(quotation.validUntil).toLocaleDateString()}</p></div>
          </div>
        </div>

        {/* ── 6. Line Items ── */}
        <div className="mb-6 bg-white rounded-lg shadow p-6 print-section">
          <h2 className="text-xl font-semibold mb-4">Line Items</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b">
                <tr>
                  <th className="text-left py-3 px-2">#</th>
                  <th className="text-left py-3 px-2">Description</th>
                  <th className="text-right py-3 px-2">Qty</th>
                  <th className="text-right py-3 px-2">Unit Price</th>
                  <th className="text-right py-3 px-2">Tax</th>
                  <th className="text-right py-3 px-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b">
                    <td className="py-3 px-2">{item.lineNumber}</td>
                    <td className="py-3 px-2">
                      <div className="font-medium">{item.description}</div>
                      {item.sku && <div className="text-sm text-gray-500">SKU: {item.sku}</div>}
                      {item.notes && <div className="text-sm text-gray-500">{item.notes}</div>}
                    </td>
                    <td className="py-3 px-2 text-right">{item.quantity}</td>
                    <td className="py-3 px-2 text-right">{formatCurrency(item.unitPrice)}</td>
                    <td className="py-3 px-2 text-right">{item.taxRate}%</td>
                    <td className="py-3 px-2 text-right font-semibold">{formatCurrency(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="mt-6 pt-6 border-t flex justify-end">
            <div className="w-80 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-700">Subtotal:</span>
                <span className="font-semibold">{formatCurrency(quotation.subtotal)}</span>
              </div>
              {quotation.discountAmount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Discount:</span>
                  <span className="font-semibold">-{formatCurrency(quotation.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-700">Tax:</span>
                <span className="font-semibold">{formatCurrency(quotation.taxAmount)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-2 border-t">
                <span>Total:</span>
                <span>{formatCurrency(quotation.totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 7. Wholesale Timeline (static cards) ── */}
        {isWholesaleQuote && (
          <div className="mb-6 no-print">
            {/* Fulfillment summary card */}
            <div className="bg-white rounded-lg shadow p-6 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-semibold">📦 Delivery Progress</h2>
                <button
                  onClick={() => setShowFulfillment(true)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  View Details →
                </button>
              </div>
              <div className="flex items-center gap-4 mb-2">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${fulfillment?.overallStatus === 'FULFILLED' ? 'bg-green-100 text-green-800' :
                    fulfillment?.overallStatus === 'PARTIAL' ? 'bg-orange-100 text-orange-800' :
                      'bg-gray-100 text-gray-800'
                  }`}>
                  {fulfillment?.overallStatus === 'FULFILLED' ? 'Fully Delivered' :
                    fulfillment?.overallStatus === 'PARTIAL' ? 'Partially Delivered' :
                      'Not Started'}
                </span>
                <span className="text-sm text-gray-600">{totalDelivered} / {totalOrdered} units · {deliveryPct}%</span>
              </div>
              <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${deliveryPct === 100 ? 'bg-green-500' : 'bg-orange-500'}`}
                  style={{ width: `${deliveryPct}%` }}
                />
              </div>
            </div>

            {/* Delivery Notes list — static rows, click opens drawer */}
            {existingDns.length > 0 && (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b bg-gray-50">
                  <h2 className="text-lg font-semibold">Delivery Notes ({existingDns.length})</h2>
                </div>
                <div className="divide-y">
                  {existingDns.map((dn) => (
                    <button
                      key={dn.id}
                      type="button"
                      onClick={() => setSelectedDnId(dn.id)}
                      className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${dn.status === 'POSTED' ? 'bg-green-100' : 'bg-yellow-100'
                          }`}>
                          <svg className={`w-4 h-4 ${dn.status === 'POSTED' ? 'text-green-600' : 'text-yellow-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-blue-700">{dn.deliveryNoteNumber}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${dn.status === 'POSTED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                              }`}>
                              {dn.status}
                            </span>
                            {(dn as DeliveryNoteWithLines).invoiceNumber && (
                              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-700">
                                {(dn as DeliveryNoteWithLines).invoiceNumber}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mt-0.5">{dn.deliveryDate}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-900">{formatCurrency(dn.totalAmount)}</span>
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 8. Terms & Conditions ── */}
        {(quotation.termsAndConditions || quotation.paymentTerms || quotation.deliveryTerms) && (
          <div className="mb-6 bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Terms & Conditions</h2>
            <div className="space-y-3">
              {quotation.paymentTerms && (
                <div><p className="text-sm font-medium text-gray-700">Payment Terms</p><p className="text-gray-900">{quotation.paymentTerms}</p></div>
              )}
              {quotation.deliveryTerms && (
                <div><p className="text-sm font-medium text-gray-700">Delivery Terms</p><p className="text-gray-900">{quotation.deliveryTerms}</p></div>
              )}
              {quotation.termsAndConditions && (
                <div><p className="text-sm font-medium text-gray-700">Terms & Conditions</p><p className="text-gray-900 whitespace-pre-wrap">{quotation.termsAndConditions}</p></div>
              )}
            </div>
          </div>
        )}

        {/* ── 9. Internal Notes ── */}
        {quotation.internalNotes && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-6 no-print">
            <h3 className="font-semibold text-yellow-900 mb-2">Internal Notes</h3>
            <p className="text-yellow-800 whitespace-pre-wrap">{quotation.internalNotes}</p>
          </div>
        )}

        {/* ── 10. Conversion Info ── */}
        {quotation.convertedToSaleId && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-6 no-print">
            <h3 className="font-semibold text-green-900 mb-2">✓ Converted to Sale</h3>
            <p className="text-green-800">
              Sale: <span className="font-mono font-semibold">{quotation.convertedToSaleNumber || quotation.convertedToSaleId}</span>
            </p>
            {quotation.convertedToInvoiceId && (
              <p className="text-green-800">
                Invoice: <span className="font-mono font-semibold">{quotation.convertedToInvoiceNumber || quotation.convertedToInvoiceId}</span>
              </p>
            )}
            {quotation.convertedAt && (
              <p className="text-green-700 text-sm">Converted on {new Date(quotation.convertedAt).toLocaleString()}</p>
            )}
          </div>
        )}

        {/* ── Print Footer ── */}
        <div className="print-header print-footer-box">
          {settingsData?.footerText && <p className="print-footer-text">{settingsData.footerText}</p>}
          {settingsData?.paymentInstructions && <p className="print-footer-small">{settingsData.paymentInstructions}</p>}
        </div>

        {/* ── Cancel Quote Modal ── */}
        {showCancelModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 no-print" onClick={() => { setShowCancelModal(false); setStatusNotes(''); }}>
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-xl font-semibold mb-2 text-red-700">Cancel Quotation</h3>
              <p className="text-gray-600 mb-4">
                Are you sure you want to cancel <strong>{quotation.quoteNumber}</strong>? This cannot be undone.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason (Optional)</label>
                  <textarea
                    value={statusNotes}
                    onChange={(e) => setStatusNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="Why is this quote being cancelled?"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowCancelModal(false); setStatusNotes(''); }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    disabled={updateStatusMutation.isPending}
                  >
                    Keep Open
                  </button>
                  <button
                    onClick={handleCancelQuote}
                    className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    disabled={updateStatusMutation.isPending}
                  >
                    {updateStatusMutation.isPending ? 'Cancelling...' : 'Cancel Quote'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Drawers (rendered outside the page flow) ═══ */}
      <DeliveryNoteDrawer
        dnId={selectedDnId}
        quotationId={quotationId}
        quoteNumber={quoteNumber}
        onClose={() => setSelectedDnId(null)}
      />

      {quotationId && (
        <CreateDeliveryNoteDrawer
          open={showCreateDN}
          onClose={() => setShowCreateDN(false)}
          quotationId={quotationId}
          quoteNumber={quoteNumber}
          items={items}
          fulfillmentItems={fulfillmentItems}
        />
      )}

      <FulfillmentDrawer
        open={showFulfillment}
        onClose={() => setShowFulfillment(false)}
        quoteNumber={quoteNumber}
        overallStatus={fulfillment?.overallStatus}
        fulfillmentItems={fulfillmentItems}
      />
    </Layout>
  );
}
