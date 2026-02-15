/* eslint-disable react/forbid-dom-props */
/**
 * Quote Detail View Page
 * Display full quotation details with actions
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

export default function QuoteDetailPage() {
  const { quoteNumber } = useParams<{ quoteNumber: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState<QuotationStatus>('DRAFT');
  const [statusNotes, setStatusNotes] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['quotation', quoteNumber],
    queryFn: () => quotationApi.getQuotationByNumber(quoteNumber!),
    enabled: !!quoteNumber,
  });

  // Fetch invoice settings for company info on quote print
  const { data: settingsData } = useQuery({
    queryKey: ['invoice-settings'],
    queryFn: async () => {
      const response = await api.settings.getInvoiceSettings();
      return response.data?.data;
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: QuotationStatus; notes?: string }) =>
      quotationApi.updateQuotationStatus(id, status, notes),
    onSuccess: () => {
      toast.success('Status updated successfully');
      queryClient.invalidateQueries({ queryKey: ['quotation', quoteNumber] });
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      setShowStatusModal(false);
      setStatusNotes('');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update status');
    },
  });

  const deleteQuoteMutation = useMutation({
    mutationFn: (id: string) => quotationApi.deleteQuotation(id),
    onSuccess: () => {
      toast.success('Quotation deleted successfully');
      navigate('/quotations');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to delete quotation');
    },
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="p-8 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
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
            <p className="text-red-600 text-sm mt-2">{(error as any)?.message || 'Quotation not found'}</p>
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

  const handleStatusChange = () => {
    if (!quotation.id) return;
    updateStatusMutation.mutate({
      id: quotation.id,
      status: newStatus,
      notes: statusNotes || undefined,
    });
  };

  const handleDelete = () => {
    if (!quotation.id) return;
    if (window.confirm('Are you sure you want to delete this quotation? This action cannot be undone.')) {
      deleteQuoteMutation.mutate(quotation.id);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    setTimeout(() => window.print(), 300);
  };

  return (
    <Layout>
      <style>{`
        @media print {
          /* Hide everything from Layout */
          .no-print { display: none !important; }
          aside { display: none !important; }
          nav { display: none !important; }
          header { display: none !important; }
          .min-h-screen.bg-gray-50.flex > aside { display: none !important; }
          .min-h-screen.bg-gray-50.flex > div > header { display: none !important; }
          
          /* Print utility classes */
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          
          /* Show print header */
          .print-header { display: block !important; }
          
          /* Page setup */
          @page {
            margin: 1.5cm;
            size: A4 portrait;
          }
          
          body {
            background: white !important;
            margin: 0;
            padding: 0;
            font-size: 10pt;
            line-height: 1.4;
          }
          
          /* Main content */
          .print-content {
            width: 100%;
            max-width: none;
            padding: 0 !important;
            margin: 0 !important;
          }
          
          /* Typography */
          h2 { font-size: 12pt !important; margin: 0.4rem 0 0.3rem 0 !important; font-weight: 600 !important; }
          h3 { font-size: 10pt !important; margin: 0.3rem 0 !important; }
          p, div { margin-bottom: 0.1rem !important; line-height: 1.25 !important; }
          
          /* Spacing - tighter */
          .space-y-4 > * + *, .space-y-3 > * + *, .space-y-2 > * + * { margin-top: 0.2rem !important; }
          .mb-6, .mb-8 { margin-bottom: 0.3rem !important; }
          .p-6 { padding: 0.3rem !important; }
          .mt-6 { margin-top: 0.3rem !important; }
          .pt-6 { padding-top: 0.3rem !important; }
          
          /* Tables - compact */
          table {
            width: 100%;
            border-collapse: collapse;
            page-break-inside: auto;
            font-size: 9pt;
            margin: 0.2rem 0 !important;
          }
          thead { display: table-header-group; }
          tbody tr { page-break-inside: avoid; }
          th, td {
            padding: 0.2rem 0.4rem !important;
            border: 1px solid #e5e7eb !important;
            text-align: left;
          }
          th {
            background-color: #f8fafc !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            font-weight: 600;
            font-size: 8pt;
            text-transform: uppercase;
            letter-spacing: 0.02em;
          }
          
          /* Sections */
          .print-section { page-break-inside: auto; margin-bottom: 0.3rem !important; }
          .border-t { border-top: 1px solid #e5e7eb !important; padding-top: 0.2rem !important; margin-top: 0.2rem !important; }
          .shadow { box-shadow: none !important; }
          .rounded-lg { border-radius: 0 !important; }
          .bg-white { background: white !important; border: none !important; padding: 0.2rem !important; }
          .bg-gray-50 { background: white !important; }
          .bg-yellow-50 { display: none !important; } /* Hide internal notes on print */
          .bg-green-50 { display: none !important; } /* Hide conversion info on print */
          
          /* Totals section */
          .w-80 { width: 200px !important; }

          /* Print layout classes */
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
          .print-status-green { color: #16a34a; }
          .print-status-blue { color: #2563eb; }
          .print-status-default { color: #64748b; }
          .print-bill-title { font-size: 11pt; font-weight: 600; margin-bottom: 4px; color: #374151; }
          .print-bill-name { margin: 0; font-weight: 500; }
          .print-bill-detail { margin: 0; font-size: 9pt; color: #6b7280; }
          .print-footer-box { margin-top: 1rem; padding-top: 0.5rem; border-top: 1px solid #e5e7eb; text-align: center; }
          .print-footer-text { font-size: 9pt; color: #64748b; margin: 0; font-style: italic; }
          .print-footer-small { font-size: 8pt; color: #94a3b8; margin: 4px 0 0 0; }
        }
        
        @media screen {
          .print-header { display: none; }
          .hidden { display: none; }
        }
      `}</style>

      <div className="p-8 max-w-7xl mx-auto print-content">
        {/* Print Header (hidden on screen) - Professional layout */}
        <div className="print-header print-header-box">
          <div className="print-flex-row">
            {/* Company Info - Left */}
            <div className="print-col">
              <h1 className="print-company-name">
                {settingsData?.companyName || 'Company Name'}
              </h1>
              {settingsData?.companyAddress && (
                <p className="print-meta">{settingsData.companyAddress}</p>
              )}
              {settingsData?.companyPhone && (
                <p className="print-meta">Tel: {settingsData.companyPhone}</p>
              )}
              {settingsData?.companyEmail && (
                <p className="print-meta">Email: {settingsData.companyEmail}</p>
              )}
              {settingsData?.companyTin && (
                <p className="print-meta">TIN: {settingsData.companyTin}</p>
              )}
            </div>

            {/* Document Title - Center */}
            <div className="print-col-center">
              <h2 className="print-doc-title">
                QUOTATION
              </h2>
              <p className="print-doc-number">
                {quotation.quoteNumber}
              </p>
            </div>

            {/* Quote Details - Right */}
            <div className="print-col-right">
              <table className="print-detail-table">
                <tbody>
                  <tr>
                    <td className="print-detail-label">Date:</td>
                    <td className="print-detail-value">{new Date(quotation.createdAt).toLocaleDateString()}</td>
                  </tr>
                  <tr>
                    <td className="print-detail-label">Valid Until:</td>
                    <td className="print-detail-value">{new Date(quotation.validUntil).toLocaleDateString()}</td>
                  </tr>
                  <tr>
                    <td className="print-detail-label">Status:</td>
                    <td className={`print-detail-value-bold ${badge.color === 'green' ? 'print-status-green' : badge.color === 'blue' ? 'print-status-blue' : 'print-status-default'}`}>{badge.label}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="mb-6 flex items-center justify-between no-print">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900">{quotation.quoteNumber}</h1>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${badge.color === 'gray' ? 'bg-gray-100 text-gray-800' : badge.color === 'blue' ? 'bg-blue-100 text-blue-800' : badge.color === 'green' ? 'bg-green-100 text-green-800' : badge.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' : badge.color === 'red' ? 'bg-red-100 text-red-800' : 'bg-purple-100 text-purple-800'}`}>
                {badge.label}
              </span>
            </div>
            <p className="text-gray-600 mt-1">
              {quotation.quoteType === 'quick' ? 'Quick Quote' : 'Standard Quotation'} · Created {age}
            </p>
          </div>
          <button
            onClick={() => navigate('/quotations')}
            className="px-4 py-2 text-gray-700 hover:text-gray-900"
          >
            ← Back to Quotations
          </button>
        </div>

        {/* Action Buttons */}
        <div className="mb-6 flex gap-3 flex-wrap no-print">
          {canConvert && (
            <button
              onClick={() => navigate(`/quotations/${quoteNumber}/convert`)}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
            >
              Convert to Sale
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => navigate(`/quotations/${quoteNumber}/edit`)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Edit
            </button>
          )}
          <button
            onClick={handlePrint}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            title="Print quotation"
          >
            🖨️ Print
          </button>
          <button
            onClick={handleExportPDF}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            title="Export as PDF"
          >
            📄 Export PDF
          </button>
          <button
            onClick={() => setShowStatusModal(true)}
            className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Change Status
          </button>
          {quotation.status === 'DRAFT' && (
            <button
              onClick={handleDelete}
              className="px-6 py-3 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
              disabled={deleteQuoteMutation.isPending}
            >
              {deleteQuoteMutation.isPending ? 'Deleting...' : 'Delete'}
            </button>
          )}
        </div>

        {/* Expiry Warning */}
        {daysUntilExpiry <= 7 && daysUntilExpiry > 0 && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800 font-semibold">⚠️ Expiring Soon</p>
            <p className="text-yellow-700 text-sm">This quotation will expire in {daysUntilExpiry} days.</p>
          </div>
        )}

        {daysUntilExpiry <= 0 && quotation.status !== 'EXPIRED' && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 font-semibold">❌ Expired</p>
            <p className="text-red-700 text-sm">This quotation has expired. Update validity dates to reactivate.</p>
          </div>
        )}

        {/* Customer Information */}
        <div className="mb-6 bg-white rounded-lg shadow p-6 print-section">
          <h2 className="text-xl font-semibold mb-4 no-print">Customer Information</h2>
          {/* Print-only compact customer section */}
          <div className="hidden print:block">
            <h3 className="print-bill-title">Bill To:</h3>
            <p className="print-bill-name">{quotation.customerName || 'N/A'}</p>
            {quotation.customerPhone && <p className="print-bill-detail">{quotation.customerPhone}</p>}
            {quotation.customerEmail && <p className="print-bill-detail">{quotation.customerEmail}</p>}
          </div>
          {/* Screen-only detailed view */}
          <div className="grid grid-cols-2 gap-4 print:hidden">
            <div>
              <p className="text-sm text-gray-600">Customer Name</p>
              <p className="font-semibold">{quotation.customerName || 'N/A'}</p>
            </div>
            {quotation.customerPhone && (
              <div>
                <p className="text-sm text-gray-600">Phone</p>
                <p className="font-semibold">{quotation.customerPhone}</p>
              </div>
            )}
            {quotation.customerEmail && (
              <div>
                <p className="text-sm text-gray-600">Email</p>
                <p className="font-semibold">{quotation.customerEmail}</p>
              </div>
            )}
          </div>
        </div>

        {/* Quote Details - Screen only (print header already has this info) */}
        <div className="mb-6 bg-white rounded-lg shadow p-6 print-section no-print">
          <h2 className="text-xl font-semibold mb-4">Quotation Details</h2>
          <div className="grid grid-cols-2 gap-4">
            {quotation.reference && (
              <div>
                <p className="text-sm text-gray-600">Reference</p>
                <p className="font-semibold">{quotation.reference}</p>
              </div>
            )}
            {quotation.description && (
              <div>
                <p className="text-sm text-gray-600">Description</p>
                <p className="font-semibold">{quotation.description}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-600">Valid From</p>
              <p className="font-semibold">{new Date(quotation.validFrom).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Valid Until</p>
              <p className="font-semibold">{new Date(quotation.validUntil).toLocaleDateString()}</p>
            </div>
          </div>
        </div>

        {/* Line Items */}
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

        {/* Terms & Conditions */}
        {(quotation.termsAndConditions || quotation.paymentTerms || quotation.deliveryTerms) && (
          <div className="mb-6 bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Terms & Conditions</h2>
            <div className="space-y-3">
              {quotation.paymentTerms && (
                <div>
                  <p className="text-sm font-medium text-gray-700">Payment Terms</p>
                  <p className="text-gray-900">{quotation.paymentTerms}</p>
                </div>
              )}
              {quotation.deliveryTerms && (
                <div>
                  <p className="text-sm font-medium text-gray-700">Delivery Terms</p>
                  <p className="text-gray-900">{quotation.deliveryTerms}</p>
                </div>
              )}
              {quotation.termsAndConditions && (
                <div>
                  <p className="text-sm font-medium text-gray-700">Terms & Conditions</p>
                  <p className="text-gray-900 whitespace-pre-wrap">{quotation.termsAndConditions}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Internal Notes */}
        {quotation.internalNotes && (
          <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h3 className="font-semibold text-yellow-900 mb-2">Internal Notes</h3>
            <p className="text-yellow-800 whitespace-pre-wrap">{quotation.internalNotes}</p>
          </div>
        )}

        {/* Conversion Info */}
        {quotation.convertedToSaleId && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-6">
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
              <p className="text-green-700 text-sm">
                Converted on {new Date(quotation.convertedAt).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Print Footer (hidden on screen) */}
        <div className="print-header print-footer-box">
          {settingsData?.footerText && (
            <p className="print-footer-text">
              {settingsData.footerText}
            </p>
          )}
          {settingsData?.paymentInstructions && (
            <p className="print-footer-small">
              {settingsData.paymentInstructions}
            </p>
          )}
        </div>

        {/* Status Change Modal */}
        {showStatusModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => { setShowStatusModal(false); setStatusNotes(''); }}>
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-xl font-semibold mb-4">Change Status</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">New Status</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as QuotationStatus)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    aria-label="Select new status"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="SENT">Sent</option>
                    <option value="ACCEPTED">Accepted</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                  <textarea
                    value={statusNotes}
                    onChange={(e) => setStatusNotes(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="Add a note about this status change..."
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowStatusModal(false);
                      setStatusNotes('');
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    disabled={updateStatusMutation.isPending}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleStatusChange}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    disabled={updateStatusMutation.isPending}
                  >
                    {updateStatusMutation.isPending ? 'Updating...' : 'Update Status'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
