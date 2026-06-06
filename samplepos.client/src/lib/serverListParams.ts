/** Server-side list query params — sort/filter applies across full dataset, not current page. */
export interface ServerListParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  outstandingOnly?: boolean;
  balanceGt?: number;
  stockGt?: boolean;
  paymentTerms?: string;
}

/** Serialize for axios/fetch query string. */
export function toServerListQuery(params: ServerListParams): Record<string, string | number> {
  const q: Record<string, string | number> = {};
  if (params.page != null) q.page = params.page;
  if (params.limit != null) q.limit = params.limit;
  if (params.search) q.search = params.search;
  if (params.sortBy) q.sortBy = params.sortBy;
  if (params.sortOrder) q.sortOrder = params.sortOrder;
  if (params.outstandingOnly) q.outstandingOnly = 'true';
  if (params.balanceGt != null && params.balanceGt > 0) q.balanceGt = params.balanceGt;
  if (params.stockGt) q.stockGt = 'true';
  if (params.paymentTerms) q.paymentTerms = params.paymentTerms;
  return q;
}
