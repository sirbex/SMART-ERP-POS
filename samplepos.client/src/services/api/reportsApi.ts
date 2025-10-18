/**
 * Reports API
 * 
 * Handles financial and business reporting (aging, profitability, cash flow, AR summary).
 * Aligned with backend endpoints in SamplePOS.Server/src/modules/reports.ts
 * 
 * @module services/api/reportsApi
 */

import api from '@/config/api.config';
import { useQuery } from '@tanstack/react-query';
import type { ApiResponse } from '@/types/backend';

// ===================================================================
// TYPE DEFINITIONS
// ===================================================================

/**
 * Aging report bucket
 */
export interface AgingBucket {
  customerId: string;
  customerName: string;
  current: number;
  days1_30: number;
  days31_60: number;
  days61_90: number;
  over90: number;
  total: number;
}

/**
 * Aging report response
 */
export interface AgingReport {
  asOfDate: string;
  buckets: AgingBucket[];
  summary: {
    totalCurrent: number;
    totalDays1_30: number;
    totalDays31_60: number;
    totalDays61_90: number;
    totalOver90: number;
    grandTotal: number;
  };
}

/**
 * Query parameters for aging report
 */
export interface GetAgingReportParams {
  asOfDate?: string; // ISO date, defaults to today
  customerId?: string; // Optional: filter to specific customer
}

/**
 * Customer statement line item
 */
export interface StatementLineItem {
  date: string;
  type: 'SALE' | 'PAYMENT' | 'CREDIT' | 'ADJUSTMENT';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

/**
 * Customer statement response
 */
export interface CustomerStatement {
  customerId: string;
  customerName: string;
  statementDate: string;
  startDate: string;
  endDate: string;
  openingBalance: number;
  closingBalance: number;
  lineItems: StatementLineItem[];
  summary: {
    totalDebits: number;
    totalCredits: number;
    netChange: number;
  };
}

/**
 * Query parameters for customer statement
 */
export interface GetCustomerStatementParams {
  startDate: string; // ISO date
  endDate: string; // ISO date
  includeZeroBalance?: boolean;
}

/**
 * Profitability report by product/category
 */
export interface ProfitabilityItem {
  productId?: string;
  productName?: string;
  categoryId?: string;
  categoryName?: string;
  revenue: number;
  cost: number;
  profit: number;
  profitMargin: number;
  quantitySold: number;
}

/**
 * Profitability report response
 */
export interface ProfitabilityReport {
  startDate: string;
  endDate: string;
  items: ProfitabilityItem[];
  summary: {
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
    overallMargin: number;
  };
}

/**
 * Query parameters for profitability report
 */
export interface GetProfitabilityReportParams {
  startDate: string; // ISO date
  endDate: string; // ISO date
  groupBy?: 'PRODUCT' | 'CATEGORY'; // Default: PRODUCT
}

/**
 * Cash flow period data
 */
export interface CashFlowPeriod {
  period: string; // e.g., "2024-01" for monthly
  cashIn: number;
  cashOut: number;
  netCashFlow: number;
  cumulativeCashFlow: number;
}

/**
 * Cash flow report response
 */
export interface CashFlowReport {
  startDate: string;
  endDate: string;
  periods: CashFlowPeriod[];
  summary: {
    totalCashIn: number;
    totalCashOut: number;
    netCashFlow: number;
    openingCash: number;
    closingCash: number;
  };
}

/**
 * Query parameters for cash flow report
 */
export interface GetCashFlowReportParams {
  startDate: string; // ISO date
  endDate: string; // ISO date
  periodType?: 'DAILY' | 'WEEKLY' | 'MONTHLY'; // Default: MONTHLY
}

/**
 * AR (Accounts Receivable) summary response
 */
export interface ARSummaryReport {
  asOfDate: string;
  totalOutstanding: number;
  totalCurrent: number;
  totalOverdue: number;
  numberOfCustomersWithBalance: number;
  numberOfOverdueCustomers: number;
  averageDaysToPayment: number;
  agingSummary: {
    current: number;
    days1_30: number;
    days31_60: number;
    days61_90: number;
    over90: number;
  };
  topCustomersByBalance: Array<{
    customerId: string;
    customerName: string;
    balance: number;
    overdueAmount: number;
  }>;
}

// ===================================================================
// API FUNCTIONS
// ===================================================================

/**
 * Get accounts receivable aging report
 * GET /api/reports/aging
 */
export const getAgingReport = async (params?: GetAgingReportParams): Promise<AgingReport> => {
  const { data } = await api.get<ApiResponse<AgingReport>>('/reports/aging', { params });
  return data.data;
};

/**
 * Get customer statement for a specific period
 * GET /api/reports/customer-statement/:id
 */
export const getCustomerStatement = async (
  customerId: string,
  params: GetCustomerStatementParams
): Promise<CustomerStatement> => {
  const { data } = await api.get<ApiResponse<CustomerStatement>>(
    `/reports/customer-statement/${customerId}`,
    { params }
  );
  return data.data;
};

/**
 * Get profitability analysis report
 * GET /api/reports/profitability
 */
export const getProfitabilityReport = async (
  params: GetProfitabilityReportParams
): Promise<ProfitabilityReport> => {
  const { data } = await api.get<ApiResponse<ProfitabilityReport>>('/reports/profitability', {
    params,
  });
  return data.data;
};

/**
 * Get cash flow report
 * GET /api/reports/cash-flow
 */
export const getCashFlowReport = async (
  params: GetCashFlowReportParams
): Promise<CashFlowReport> => {
  const { data } = await api.get<ApiResponse<CashFlowReport>>('/reports/cash-flow', { params });
  return data.data;
};

/**
 * Get AR (Accounts Receivable) summary
 * GET /api/reports/ar-summary
 */
export const getARSummaryReport = async (): Promise<ARSummaryReport> => {
  const { data } = await api.get<ApiResponse<ARSummaryReport>>('/reports/ar-summary');
  return data.data;
};

// ===================================================================
// REACT QUERY HOOKS
// ===================================================================

/**
 * Hook to get aging report
 * @example
 * const { data: agingReport } = useAgingReport({ asOfDate: '2024-01-31' });
 */
export function useAgingReport(params?: GetAgingReportParams) {
  return useQuery({
    queryKey: ['agingReport', params],
    queryFn: () => getAgingReport(params),
    staleTime: 300000, // 5 minutes - reports are expensive
  });
}

/**
 * Hook to get customer statement
 * @example
 * const { data: statement } = useCustomerStatement('customer-123', {
 *   startDate: '2024-01-01',
 *   endDate: '2024-01-31'
 * });
 */
export function useCustomerStatement(
  customerId: string | null | undefined,
  params: GetCustomerStatementParams
) {
  return useQuery({
    queryKey: ['customerStatement', customerId, params],
    queryFn: () => getCustomerStatement(customerId!, params),
    enabled: !!customerId && !!params.startDate && !!params.endDate,
    staleTime: 300000,
  });
}

/**
 * Hook to get profitability report
 * @example
 * const { data: profitReport } = useProfitabilityReport({
 *   startDate: '2024-01-01',
 *   endDate: '2024-01-31',
 *   groupBy: 'CATEGORY'
 * });
 */
export function useProfitabilityReport(params: GetProfitabilityReportParams) {
  return useQuery({
    queryKey: ['profitabilityReport', params],
    queryFn: () => getProfitabilityReport(params),
    enabled: !!params.startDate && !!params.endDate,
    staleTime: 300000,
  });
}

/**
 * Hook to get cash flow report
 * @example
 * const { data: cashFlowReport } = useCashFlowReport({
 *   startDate: '2024-01-01',
 *   endDate: '2024-12-31',
 *   periodType: 'MONTHLY'
 * });
 */
export function useCashFlowReport(params: GetCashFlowReportParams) {
  return useQuery({
    queryKey: ['cashFlowReport', params],
    queryFn: () => getCashFlowReport(params),
    enabled: !!params.startDate && !!params.endDate,
    staleTime: 300000,
  });
}

/**
 * Hook to get AR summary report
 * @example
 * const { data: arSummary } = useARSummaryReport();
 */
export function useARSummaryReport() {
  return useQuery({
    queryKey: ['arSummaryReport'],
    queryFn: () => getARSummaryReport(),
    staleTime: 300000,
  });
}

// Export everything as a namespace for convenience
export const reportsApi = {
  getAgingReport,
  getCustomerStatement,
  getProfitabilityReport,
  getCashFlowReport,
  getARSummaryReport,
};
