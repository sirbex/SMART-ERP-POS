/**
 * Quote Conversion Page
 * Convert quotation to sale with payment options
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth';
import quotationApi from '../../api/quotations';
import { formatCurrency } from '../../utils/currency';
import Layout from '../../components/Layout';
import type { ConvertQuotationInput } from '@shared/types/quotation';
import { getQuoteStatusBadge, isQuoteConvertible } from '@shared/types/quotation';

export default function QuoteConversionPage() {
  const { quoteNumber } = useParams<{ quoteNumber: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [paymentOption, setPaymentOption] = useState<'full' | 'partial' | 'none'>('full');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositMethod, setDepositMethod] = useState<'CASH' | 'CARD' | 'MOBILE_MONEY'>('CASH');
  const [conversionResult, setConversionResult] = useState<any>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showAlreadyConvertedDialog, setShowAlreadyConvertedDialog] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['quotation', quoteNumber],
    queryFn: () => quotationApi.getQuotationByNumber(quoteNumber!),
    enabled: !!quoteNumber,
  });

  const convertMutation = useMutation({
    mutationFn: (conversionData: ConvertQuotationInput) => quotationApi.convertQuotation(data!.quotation.id, conversionData),
    onSuccess: (response) => {
      // Invalidate quotations cache to refresh the list
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['quotation', quoteNumber] });

      setConversionResult(response);
      setShowSuccessDialog(true);
      toast.success('Quotation converted successfully!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to convert quotation');
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
  const totalAmount = quotation.totalAmount;
  const depositAmountNum = parseFloat(depositAmount) || 0;
  const remainingBalance = totalAmount - depositAmountNum;

  // Check if quotation can be converted
  const canConvert = isQuoteConvertible(quotation.status, quotation.validUntil, quotation.convertedToSaleId);
  const isAlreadyConverted = quotation.status === 'CONVERTED' || !!quotation.convertedToSaleId;

  const handleConvert = () => {
    // Defensive check: prevent conversion of already converted quotations
    if (isAlreadyConverted) {
      setShowAlreadyConvertedDialog(true);
      return;
    }

    // Check if quotation can be converted
    if (!canConvert) {
      if (quotation.status !== 'ACCEPTED') {
        toast.error(`Cannot convert quotation. Status must be ACCEPTED (current: ${quotation.status})`);
      } else {
        toast.error(`Cannot convert quotation. Quotation has expired (valid until: ${new Date(quotation.validUntil).toLocaleDateString()})`);
      }
      return;
    }

    if (paymentOption === 'partial' && (!depositAmount || depositAmountNum <= 0)) {
      toast.error('Please enter a valid deposit amount');
      return;
    }

    if (paymentOption === 'partial' && depositAmountNum > totalAmount) {
      toast.error('Deposit amount cannot exceed total amount');
      return;
    }

    if (!user) {
      toast.error('User not authenticated');
      return;
    }

    convertMutation.mutate({
      paymentOption,
      depositAmount: paymentOption === 'partial' ? depositAmountNum : paymentOption === 'full' ? totalAmount : undefined,
      depositMethod: paymentOption !== 'none' ? depositMethod : undefined,
      notes: undefined,
    });
  };

  return (
    <Layout>
      <div className="p-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-gray-900">Convert Quotation</h1>
            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${badge.color === 'gray' ? 'bg-gray-100 text-gray-800' : badge.color === 'blue' ? 'bg-blue-100 text-blue-800' : badge.color === 'green' ? 'bg-green-100 text-green-800' : badge.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' : badge.color === 'red' ? 'bg-red-100 text-red-800' : 'bg-purple-100 text-purple-800'}`}>
              {badge.label}
            </span>
          </div>
          <p className="text-gray-600">{quotation.quoteNumber} → Sale + Invoice</p>
        </div>

        {/* Already Converted Warning */}
        {isAlreadyConverted && (
          <div className="mb-6 bg-yellow-50 border-2 border-yellow-400 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-yellow-900 mb-2">⚠️ Already Converted</h3>
                <p className="text-yellow-800 mb-2">
                  This quotation has already been converted to a sale and cannot be converted again.
                </p>
                {quotation.convertedToSaleId && (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-medium text-yellow-900">Conversion Details:</p>
                    <div className="flex items-center gap-2 text-sm text-yellow-800">
                      <span>Sale:</span>
                      <span className="font-mono bg-yellow-100 px-2 py-1 rounded font-semibold">{quotation.convertedToSaleNumber || quotation.convertedToSaleId}</span>
                    </div>
                    {quotation.convertedAt && (
                      <div className="flex items-center gap-2 text-sm text-yellow-800">
                        <span>Converted:</span>
                        <span className="font-semibold">{new Date(quotation.convertedAt).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Cannot Convert Warning (for other reasons) */}
        {!canConvert && !isAlreadyConverted && (
          <div className="mb-6 bg-red-50 border-2 border-red-400 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-red-900 mb-2">❌ Cannot Convert</h3>
                <p className="text-red-800">
                  {quotation.status !== 'ACCEPTED'
                    ? `This quotation must be ACCEPTED before it can be converted. Current status: ${quotation.status}`
                    : `This quotation has expired. Valid until: ${new Date(quotation.validUntil).toLocaleDateString()}`
                  }
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Quote Summary */}
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Quotation Summary</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-sm text-gray-600">Customer</p>
              <p className="font-semibold">{quotation.customerName || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Items</p>
              <p className="font-semibold">{items.length} item(s)</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Valid Until</p>
              <p className="font-semibold">{new Date(quotation.validUntil).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Amount</p>
              <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalAmount)}</p>
            </div>
          </div>

          {/* Items Preview */}
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm font-medium text-gray-700 mb-2">Line Items:</p>
            <ul className="space-y-1">
              {items.slice(0, 3).map((item) => (
                <li key={item.id} className="text-sm text-gray-600">
                  • {item.description} × {item.quantity} = {formatCurrency(item.lineTotal)}
                </li>
              ))}
              {items.length > 3 && (
                <li className="text-sm text-gray-500 italic">
                  + {items.length - 3} more item(s)
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Payment Options */}
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Payment Option</h2>
          <div className="space-y-4">
            {/* Full Payment */}
            <label className={`flex items-start p-4 border-2 rounded-lg transition-colors ${!canConvert ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'} ${paymentOption === 'full' ? 'border-blue-600' : 'border-gray-200'}`}>
              <input
                type="radio"
                name="paymentOption"
                value="full"
                checked={paymentOption === 'full'}
                onChange={(e) => setPaymentOption(e.target.value as 'full')}
                className="mt-1"
                disabled={!canConvert}
              />
              <div className="ml-3 flex-1">
                <p className="font-semibold text-gray-900">Full Payment</p>
                <p className="text-sm text-gray-600">Customer pays the full amount now</p>
                <p className="text-sm text-blue-600 font-semibold mt-1">
                  Amount: {formatCurrency(totalAmount)}
                </p>
              </div>
            </label>

            {/* Partial Payment */}
            <label className={`flex items-start p-4 border-2 rounded-lg transition-colors ${!canConvert ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'} ${paymentOption === 'partial' ? 'border-blue-600' : 'border-gray-200'}`}>
              <input
                type="radio"
                name="paymentOption"
                value="partial"
                checked={paymentOption === 'partial'}
                onChange={(e) => setPaymentOption(e.target.value as 'partial')}
                className="mt-1"
                disabled={!canConvert}
              />
              <div className="ml-3 flex-1">
                <p className="font-semibold text-gray-900">Partial Payment (Deposit)</p>
                <p className="text-sm text-gray-600">Customer pays a deposit, remaining balance on credit</p>

                {paymentOption === 'partial' && (
                  <div className="mt-3 space-y-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Deposit Amount <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                        min="0"
                        max={totalAmount}
                        step="0.01"
                        disabled={!canConvert}
                      />
                    </div>
                    {depositAmountNum > 0 && (
                      <div className="text-sm">
                        <p className="text-gray-700">
                          Remaining Balance: <span className="font-semibold text-orange-600">{formatCurrency(remainingBalance)}</span>
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </label>

            {/* No Payment */}
            <label className={`flex items-start p-4 border-2 rounded-lg transition-colors ${!canConvert ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'} ${paymentOption === 'none' ? 'border-blue-600' : 'border-gray-200'}`}>
              <input
                type="radio"
                name="paymentOption"
                value="none"
                checked={paymentOption === 'none'}
                onChange={(e) => setPaymentOption(e.target.value as 'none')}
                className="mt-1"
                disabled={!canConvert}
              />
              <div className="ml-3 flex-1">
                <p className="font-semibold text-gray-900">No Payment (Credit Sale)</p>
                <p className="text-sm text-gray-600">Full amount on credit, no payment now</p>
                <p className="text-sm text-orange-600 font-semibold mt-1">
                  Balance Due: {formatCurrency(totalAmount)}
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Payment Method */}
        {paymentOption !== 'none' && (
          <div className="mb-6 bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Payment Method</h2>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setDepositMethod('CASH')}
                className={`p-4 border-2 rounded-lg font-semibold transition-colors ${depositMethod === 'CASH'
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-300 hover:border-gray-400'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                disabled={!canConvert}
              >
                💵 Cash
              </button>
              <button
                type="button"
                onClick={() => setDepositMethod('CARD')}
                className={`p-4 border-2 rounded-lg font-semibold transition-colors ${depositMethod === 'CARD'
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-300 hover:border-gray-400'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                disabled={!canConvert}
              >
                💳 Card
              </button>
              <button
                type="button"
                onClick={() => setDepositMethod('MOBILE_MONEY')}
                className={`p-4 border-2 rounded-lg font-semibold transition-colors ${depositMethod === 'MOBILE_MONEY'
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-300 hover:border-gray-400'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                disabled={!canConvert}
              >
                📱 Mobile Money
              </button>
            </div>
          </div>
        )}

        {/* Conversion Summary */}
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-3">Conversion Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-blue-800">Quotation:</span>
              <span className="font-semibold text-blue-900">{quotation.quoteNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-800">Will create:</span>
              <span className="font-semibold text-blue-900">Sale + Invoice</span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-800">Payment now:</span>
              <span className="font-semibold text-blue-900">
                {paymentOption === 'full' ? formatCurrency(totalAmount) : paymentOption === 'partial' ? formatCurrency(depositAmountNum) : formatCurrency(0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-blue-800">Invoice balance:</span>
              <span className="font-semibold text-blue-900">
                {paymentOption === 'full' ? formatCurrency(0) + ' (PAID)' : paymentOption === 'partial' ? formatCurrency(remainingBalance) + ' (PARTIALLY_PAID)' : formatCurrency(totalAmount) + ' (UNPAID)'}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => navigate(`/quotations/${quoteNumber}`)}
            className="flex-1 px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            disabled={convertMutation.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConvert}
            className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={convertMutation.isPending || !canConvert}
            title={!canConvert ? (isAlreadyConverted ? 'Already converted' : 'Cannot convert this quotation') : undefined}
          >
            {convertMutation.isPending ? 'Converting...' : !canConvert ? '✗ Cannot Convert' : '✓ Convert to Sale'}
          </button>
        </div>

        {/* Success Dialog */}
        {showSuccessDialog && conversionResult && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => navigate('/quotations')}>
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="text-center mb-6">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                  <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">✅ Conversion Successful!</h3>
                <p className="text-gray-600">Quote has been converted to sale and invoice</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Sale Number:</span>
                  <span className="font-bold text-blue-600">{conversionResult.sale?.saleNumber || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Invoice Number:</span>
                  <span className="font-bold text-purple-600">{conversionResult.invoice?.invoiceNumber || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total Amount:</span>
                  <span className="font-bold text-gray-900">{formatCurrency(quotation.totalAmount)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Status:</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${conversionResult.invoice?.status === 'PAID' ? 'bg-green-100 text-green-800' :
                    conversionResult.invoice?.status === 'PARTIALLY_PAID' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-orange-100 text-orange-800'
                    }`}>
                    {conversionResult.invoice?.status || 'COMPLETED'}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    if (conversionResult.sale?.saleNumber) {
                      window.open(`/sales/${conversionResult.sale.saleNumber}`, '_blank');
                    }
                  }}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  📄 View Sale Details
                </button>

                <button
                  onClick={() => {
                    if (conversionResult.invoice?.invoiceNumber) {
                      window.open(`/invoices/${conversionResult.invoice.invoiceNumber}`, '_blank');
                    }
                  }}
                  className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
                >
                  🧾 View Invoice
                </button>

                <button
                  onClick={() => {
                    setShowSuccessDialog(false);
                    navigate('/quotations');
                  }}
                  className="w-full px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                >
                  ← Back to Quotations
                </button>
              </div>

              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800 text-center">
                  💡 <span className="font-semibold">Tip:</span> Open links in new tabs to keep this view
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Already Converted Dialog - Permanent Modal */}
        {showAlreadyConvertedDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
              <div className="text-center mb-6">
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-yellow-100 mb-4">
                  <svg className="h-10 w-10 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">⚠️ Already Converted</h3>
                <p className="text-gray-600">This quotation has already been converted to a sale and cannot be converted again.</p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-yellow-900 mb-1">Conversion Details:</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm text-yellow-800 font-medium min-w-[80px]">Sale:</span>
                  <span className="text-sm font-mono bg-yellow-100 px-2 py-1 rounded text-yellow-900 font-semibold">
                    {quotation.convertedToSaleNumber || quotation.convertedToSaleId || 'N/A'}
                  </span>
                </div>
                {quotation.convertedToInvoiceId && (
                  <div className="flex items-start gap-2">
                    <span className="text-sm text-yellow-800 font-medium min-w-[80px]">Invoice:</span>
                    <span className="text-sm font-mono bg-yellow-100 px-2 py-1 rounded text-yellow-900 font-semibold">
                      {quotation.convertedToInvoiceNumber || quotation.convertedToInvoiceId}
                    </span>
                  </div>
                )}
                {quotation.convertedAt && (
                  <div className="flex items-start gap-2">
                    <span className="text-sm text-yellow-800 font-medium min-w-[80px]">Converted:</span>
                    <span className="text-sm text-yellow-900 font-semibold">
                      {new Date(quotation.convertedAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    setShowAlreadyConvertedDialog(false);
                    navigate('/quotations');
                  }}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  ← Back to Quotations
                </button>
                <button
                  onClick={() => setShowAlreadyConvertedDialog(false)}
                  className="w-full px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
