/**
 * CustomerQuotationsTab — Customer Center: quotations history for a single
 * customer with a bucket filter (Open / Converted / All).
 *
 * Reuses the existing `GET /quotations` endpoint with `customerId` + `openOnly`
 * (the SSOT filter introduced in P1). No new backend endpoint is needed —
 * see `quotationRepository.listQuotations` for the canonical filter logic.
 *
 * Bucket semantics:
 *  - Open      → `openOnly: true`  → excludes CONVERTED/CANCELLED/EXPIRED/REJECTED
 *  - Converted → `status: 'CONVERTED'`
 *  - All       → no status filter (every quote ever raised for the customer)
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { quotationApi } from '../../api/quotations';
import {
  getQuoteStatusBadge,
  normalizeStatus,
  type Quotation,
} from '@shared/types/quotation';
import { formatCurrency } from '../../utils/currency';

export type CustomerQuotationsBucket = 'open' | 'converted' | 'all';

type Bucket = CustomerQuotationsBucket;

interface Props {
  customerId: string;
}

/**
 * Pure mapping from UI bucket → server filter payload. Exported so the
 * mapping (the actual business contract with the server) can be unit-tested
 * without rendering the React tree. Keep in sync with backend
 * `QuotationListFiltersSchema` in `shared/zod/quotation.ts`.
 */
export function bucketToQuotationFilters(
  bucket: Bucket,
  customerId: string,
  limit = 50,
): { customerId: string; limit: number; openOnly?: boolean; status?: string } {
  if (bucket === 'open') return { customerId, limit, openOnly: true };
  if (bucket === 'converted') return { customerId, limit, status: 'CONVERTED' };
  return { customerId, limit };
}

const BUCKET_LABEL: Record<Bucket, string> = {
  open: 'Open',
  converted: 'Converted',
  all: 'All',
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  gray: 'bg-gray-100 text-gray-800',
  blue: 'bg-blue-100 text-blue-800',
  green: 'bg-green-100 text-green-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  red: 'bg-red-100 text-red-800',
  purple: 'bg-purple-100 text-purple-800',
};

export function CustomerQuotationsTab({ customerId }: Props) {
  const [bucket, setBucket] = useState<Bucket>('open');

  const filters = useMemo(
    () => bucketToQuotationFilters(bucket, customerId),
    [bucket, customerId],
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['customer-quotations', customerId, bucket],
    queryFn: () => quotationApi.listQuotations(filters),
    enabled: Boolean(customerId),
  });

  const quotations = data?.quotations ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4" data-testid="customer-quotations-tab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Quotations</h3>
          <p className="text-xs text-gray-500 mt-1">
            All quotes ever raised for this customer. Use the bucket filter to focus.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white shadow-sm" role="tablist" aria-label="Quotation bucket">
          {(['open', 'converted', 'all'] as Bucket[]).map((b) => (
            <button
              key={b}
              type="button"
              role="tab"
              aria-selected={bucket === b}
              onClick={() => setBucket(b)}
              className={`px-3 py-1.5 text-sm font-medium first:rounded-l-lg last:rounded-r-lg transition-colors ${
                bucket === b
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {BUCKET_LABEL[b]}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-gray-500">Loading quotations…</div>
      ) : isError ? (
        <div className="text-center py-10 text-red-600">
          Failed to load quotations
          {error instanceof Error ? `: ${error.message}` : ''}
        </div>
      ) : quotations.length === 0 ? (
        <div className="text-center py-10 text-gray-500">
          {bucket === 'open'
            ? 'No open quotations for this customer.'
            : bucket === 'converted'
            ? 'No converted quotations for this customer.'
            : 'This customer has no quotation history.'}
        </div>
      ) : (
        <>
          <div className="text-xs text-gray-500" data-testid="customer-quotations-count">
            {total} {total === 1 ? 'quotation' : 'quotations'}
          </div>
          <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Quote #</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Valid Until</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {quotations.map((q: Quotation) => {
                  const badge = getQuoteStatusBadge(q.status);
                  const badgeClass = STATUS_BADGE_CLASS[badge.color] ?? STATUS_BADGE_CLASS.gray;
                  const normalized = normalizeStatus(q.status);
                  return (
                    <tr key={q.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium text-blue-700">
                        <Link to={`/quotations/${q.id}`} className="hover:underline">
                          {q.quoteNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-700">{q.quoteType}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">
                        {q.validFrom ? new Date(q.validFrom).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-700">
                        {q.validUntil ? new Date(q.validUntil).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${badgeClass}`} data-status={normalized}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-gray-900">
                        {formatCurrency(Number(q.totalAmount || 0))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default CustomerQuotationsTab;
