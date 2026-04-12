/**
 * Quote Conversion Page
 * Redirects to POS with the quote pre-loaded.
 * Kept as a guard page for direct URL access — shows warnings for
 * already-converted / expired / cancelled quotes.
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import quotationApi from '../../api/quotations';
import { formatCurrency } from '../../utils/currency';
import Layout from '../../components/Layout';
import { getQuoteStatusBadge, isQuoteConvertible } from '@shared/types/quotation';
import { formatTimestampDate } from '../../utils/businessDate';

export default function QuoteConversionPage() {
  const { quoteNumber } = useParams<{ quoteNumber: string }>();
  const navigate = useNavigate();
  const [redirected, setRedirected] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['quotation', quoteNumber],
    queryFn: () => quotationApi.getQuotationByNumber(quoteNumber!),
    enabled: !!quoteNumber,
  });

  // Redirect to POS once data is loaded and quote is convertible
  useEffect(() => {
    if (!data || redirected) return;
    const { quotation } = data;
    const canConvert = isQuoteConvertible(quotation.status, quotation.validUntil, quotation.convertedToSaleId);

    if (canConvert && quoteNumber) {
      setRedirected(true);
      localStorage.setItem('loadQuoteNumber', quoteNumber);
      toast.success(`Loading ${quoteNumber} into POS...`);
      navigate('/pos', { replace: true });
    }
  }, [data, quoteNumber, navigate, redirected]);

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

  const { quotation } = data;
  const badge = getQuoteStatusBadge(quotation.status);
  const isAlreadyConverted = quotation.status === 'CONVERTED' || !!quotation.convertedToSaleId;
  const canConvert = isQuoteConvertible(quotation.status, quotation.validUntil, quotation.convertedToSaleId);

  // If convertible, the useEffect above will redirect — show loading in the meantime
  if (canConvert) {
    return (
      <Layout>
        <div className="p-8 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          <p className="text-gray-600 mt-4">Redirecting to POS...</p>
        </div>
      </Layout>
    );
  }

  // Cannot convert — show explanation
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
          <p className="text-gray-600">{quotation.quoteNumber}</p>
        </div>

        {/* Already Converted Warning */}
        {isAlreadyConverted && (
          <div className="mb-6 bg-yellow-50 border-2 border-yellow-400 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-yellow-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-yellow-900 mb-2">Already Converted</h3>
                <p className="text-yellow-800 mb-2">
                  This quotation has already been converted to a sale and cannot be converted again.
                </p>
                {quotation.convertedToSaleId && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm text-yellow-800">
                      <span>Sale:</span>
                      <span className="font-mono bg-yellow-100 px-2 py-1 rounded font-semibold">{quotation.convertedToSaleNumber || quotation.convertedToSaleId}</span>
                    </div>
                    {quotation.convertedAt && (
                      <div className="flex items-center gap-2 text-sm text-yellow-800">
                        <span>Converted:</span>
                        <span className="font-semibold">{formatTimestamp(quotation.convertedAt)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Cannot Convert Warning (expired / cancelled) */}
        {!isAlreadyConverted && (
          <div className="mb-6 bg-red-50 border-2 border-red-400 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-red-900 mb-2">Cannot Convert</h3>
                <p className="text-red-800">
                  {quotation.status === 'CANCELLED'
                    ? 'This quotation has been cancelled and cannot be converted.'
                    : `This quotation has expired (valid until: ${formatTimestampDate(quotation.validUntil)}). Update validity dates to reactivate.`
                  }
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Quote Summary */}
        <div className="mb-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Quotation Summary</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Customer</p>
              <p className="font-semibold">{quotation.customerName || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Amount</p>
              <p className="text-2xl font-bold text-blue-600">{formatCurrency(quotation.totalAmount)}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={() => navigate(`/quotations/${quoteNumber}`)}
            className="flex-1 px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            ← Back to Quote
          </button>
          <button
            onClick={() => navigate('/quotations')}
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            ← Back to Quotations
          </button>
        </div>
      </div>
    </Layout>
  );
}
