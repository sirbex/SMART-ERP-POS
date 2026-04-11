import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../utils/api';
import toast from 'react-hot-toast';

// ── Query Key Factories ──────────────────────────────────────────────

export const accountingKeys = {
  costCenters: {
    all: ['cost-centers'] as const,
    list: (params?: { parent_id?: string }) => ['cost-centers', 'list', params] as const,
    detail: (id: string) => ['cost-centers', 'detail', id] as const,
    hierarchy: () => ['cost-centers', 'hierarchy'] as const,
    report: (id: string) => ['cost-centers', 'report', id] as const,
  },
  periodControl: {
    all: ['period-control'] as const,
    byYear: (year: number) => ['period-control', year] as const,
  },
  grirClearing: {
    all: ['grir-clearing'] as const,
    open: (supplierId?: string) => ['grir-clearing', 'open', supplierId] as const,
    balance: () => ['grir-clearing', 'balance'] as const,
  },
  dunning: {
    all: ['dunning'] as const,
    levels: () => ['dunning', 'levels'] as const,
    history: (customerId: string) => ['dunning', 'history', customerId] as const,
  },
  wht: {
    all: ['wht'] as const,
    types: () => ['wht', 'types'] as const,
    balance: () => ['wht', 'balance'] as const,
    certificates: () => ['wht', 'certificates'] as const,
  },
  assets: {
    all: ['assets'] as const,
    categories: () => ['assets', 'categories'] as const,
    list: (params?: { categoryId?: string; status?: string }) => ['assets', 'list', params] as const,
    detail: (id: string) => ['assets', 'detail', id] as const,
    schedule: (id: string) => ['assets', 'schedule', id] as const,
  },
  jeApproval: {
    all: ['je-approval'] as const,
    rules: () => ['je-approval', 'rules'] as const,
    pending: () => ['je-approval', 'pending'] as const,
  },
  paymentProgram: {
    all: ['payment-program'] as const,
    list: () => ['payment-program', 'list'] as const,
    detail: (id: string) => ['payment-program', 'detail', id] as const,
  },
  currency: {
    all: ['currency'] as const,
    list: () => ['currency', 'list'] as const,
    config: () => ['currency', 'config'] as const,
    rates: () => ['currency', 'rates'] as const,
  },
  enterprise: {
    all: ['enterprise-accounting'] as const,
    fiscalYear: (year: number) => ['enterprise-accounting', 'fiscal-year', year] as const,
    taxes: (scope?: string) => ['enterprise-accounting', 'taxes', scope] as const,
    unreconciled: (accountCode: string) => ['enterprise-accounting', 'unreconciled', accountCode] as const,
    suggestions: (accountCode: string) => ['enterprise-accounting', 'suggestions', accountCode] as const,
    lockDates: () => ['enterprise-accounting', 'lock-dates'] as const,
    revaluationPreview: (date: string) => ['enterprise-accounting', 'revaluation', date] as const,
    integrity: () => ['enterprise-accounting', 'integrity'] as const,
    agedReceivables: (date?: string) => ['enterprise-accounting', 'aged-receivables', date] as const,
    agedPayables: (date?: string) => ['enterprise-accounting', 'aged-payables', date] as const,
  },
};

// ── Cost Centers ─────────────────────────────────────────────────────

export function useCostCenters(params?: { parent_id?: string }) {
  return useQuery({
    queryKey: accountingKeys.costCenters.list(params),
    queryFn: async () => {
      const res = await api.costCenters.list(params);
      return res.data?.data;
    },
  });
}

export function useCostCenterHierarchy() {
  return useQuery({
    queryKey: accountingKeys.costCenters.hierarchy(),
    queryFn: async () => {
      const res = await api.costCenters.getHierarchy();
      return res.data?.data;
    },
  });
}

export function useCostCenterReport(id: string, params?: { startDate?: string; endDate?: string }) {
  return useQuery({
    queryKey: accountingKeys.costCenters.report(id),
    queryFn: async () => {
      const res = await api.costCenters.getReport(id, params);
      return res.data?.data;
    },
    enabled: !!id,
  });
}

export function useCreateCostCenter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { code: string; name: string; description?: string; parentId?: string; managerId?: string }) =>
      api.costCenters.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.costCenters.all });
      toast.success('Cost center created');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useUpdateCostCenter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; description?: string; isActive?: boolean } }) =>
      api.costCenters.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.costCenters.all });
      toast.success('Cost center updated');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

// ── Period Control ───────────────────────────────────────────────────

export function usePeriodsByYear(year: number) {
  return useQuery({
    queryKey: accountingKeys.periodControl.byYear(year),
    queryFn: async () => {
      const res = await api.periodControl.getByYear(year);
      return res.data?.data;
    },
  });
}

export function useOpenPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (periodId: string) => api.periodControl.openPeriod(periodId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.periodControl.all });
      toast.success('Period opened');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useClosePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (periodId: string) => api.periodControl.closePeriod(periodId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.periodControl.all });
      toast.success('Period closed');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useCreateSpecialPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ year, data }: { year: number; data: { name: string; startDate: string; endDate: string; periodType?: string } }) =>
      api.periodControl.createSpecial(year, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.periodControl.all });
      toast.success('Special period created');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

// ── GR/IR Clearing ──────────────────────────────────────────────────

export interface GrirOpenFilters {
  supplierId?: string;
  poNumber?: string;
  grNumber?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export function useGrirOpenItems(filters?: GrirOpenFilters) {
  return useQuery({
    queryKey: [...accountingKeys.grirClearing.all, 'open', filters],
    queryFn: async () => {
      const res = await api.grirClearing.getOpenItems(filters);
      return res.data?.data;
    },
  });
}

export function useGrirSearch(query: string) {
  return useQuery({
    queryKey: [...accountingKeys.grirClearing.all, 'search', query],
    queryFn: async () => {
      const res = await api.grirClearing.search(query);
      return res.data?.data;
    },
    enabled: query.length >= 2,
  });
}

export function useGrirBalance() {
  return useQuery({
    queryKey: accountingKeys.grirClearing.balance(),
    queryFn: async () => {
      const res = await api.grirClearing.getBalance();
      return res.data?.data;
    },
  });
}

export function useGrirMatchCandidates(supplierId?: string) {
  return useQuery({
    queryKey: [...accountingKeys.grirClearing.all, 'candidates', supplierId],
    queryFn: async () => {
      const res = await api.grirClearing.getMatchCandidates(supplierId ? { supplierId } : undefined);
      return res.data?.data;
    },
  });
}

export function useGrirGrItems(grId: string | null) {
  return useQuery({
    queryKey: [...accountingKeys.grirClearing.all, 'gr-items', grId],
    queryFn: async () => {
      const res = await api.grirClearing.getGrItems(grId!);
      return res.data?.data;
    },
    enabled: !!grId,
  });
}

export function useGrirHistory(poId: string | null) {
  return useQuery({
    queryKey: [...accountingKeys.grirClearing.all, 'history', poId],
    queryFn: async () => {
      const res = await api.grirClearing.getHistory(poId!);
      return res.data?.data;
    },
    enabled: !!poId,
  });
}

export function useClearGrirItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { grId: string; invoiceId: string; date?: string }) =>
      api.grirClearing.clearItem(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.grirClearing.all });
      toast.success('GR/IR item cleared');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useGrirAutoMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data?: { supplierId?: string; tolerancePercent?: number }) =>
      api.grirClearing.autoMatch(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.grirClearing.all });
      toast.success('Auto-match complete');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

// ── Dunning ─────────────────────────────────────────────────────────

export function useDunningLevels() {
  return useQuery({
    queryKey: accountingKeys.dunning.levels(),
    queryFn: async () => {
      const res = await api.dunning.getLevels();
      return res.data?.data;
    },
  });
}

export function useCreateDunningLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { levelNumber: number; daysOverdue: number; feeAmount: number; letterTemplate: string; blockDelivery?: boolean }) =>
      api.dunning.createLevel(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.dunning.all });
      toast.success('Dunning level created');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useDunningAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { asOfDate: string; customerId?: string }) =>
      api.dunning.analyze(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.dunning.all });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useDunningHistory(customerId: string) {
  return useQuery({
    queryKey: accountingKeys.dunning.history(customerId),
    queryFn: async () => {
      const res = await api.dunning.getHistory(customerId);
      return res.data?.data;
    },
    enabled: !!customerId,
  });
}

// ── Withholding Tax ─────────────────────────────────────────────────

export function useWhtTypes() {
  return useQuery({
    queryKey: accountingKeys.wht.types(),
    queryFn: async () => {
      const res = await api.wht.getTypes();
      return res.data?.data;
    },
  });
}

export function useCreateWhtType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { code: string; name: string; rate: number; appliesToSuppliers?: boolean; appliesToCustomers?: boolean }) =>
      api.wht.createType(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.wht.all });
      toast.success('WHT type created');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useWhtBalance(params?: { startDate?: string; endDate?: string }) {
  return useQuery({
    queryKey: accountingKeys.wht.balance(),
    queryFn: async () => {
      const res = await api.wht.getBalance(params);
      return res.data?.data;
    },
  });
}

// ── Asset Accounting ────────────────────────────────────────────────

export function useAssetCategories() {
  return useQuery({
    queryKey: accountingKeys.assets.categories(),
    queryFn: async () => {
      const res = await api.assets.getCategories();
      return res.data?.data;
    },
  });
}

export function useCreateAssetCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      code: string; name: string; usefulLifeMonths: number; depreciationMethod: string;
      depreciationRate?: number; assetAccountCode?: string; depreciationAccountCode?: string; accumDepreciationAccountCode?: string;
    }) =>
      api.assets.createCategory(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.assets.all });
      toast.success('Asset category created');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useAssets(params?: { categoryId?: string; status?: string }) {
  return useQuery({
    queryKey: accountingKeys.assets.list(params),
    queryFn: async () => {
      const res = await api.assets.list(params);
      return res.data?.data;
    },
  });
}

export function useCreateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string; categoryId: string; acquisitionDate: string; acquisitionCost: number;
      description?: string; salvageValue?: number; usefulLifeMonths?: number;
      depreciationMethod?: string; depreciationStartDate?: string; paymentMethod?: string;
      location?: string; serialNumber?: string;
    }) =>
      api.assets.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.assets.all });
      toast.success('Asset created');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useRunDepreciation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { year: number; month: number }) =>
      api.assets.runDepreciation(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.assets.all });
      toast.success('Depreciation run completed');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

// ── JE Approval ─────────────────────────────────────────────────────

export function useJeApprovalRules() {
  return useQuery({
    queryKey: accountingKeys.jeApproval.rules(),
    queryFn: async () => {
      const res = await api.jeApproval.getRules();
      return res.data?.data;
    },
  });
}

export function useCreateJeApprovalRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { minAmount: number; requiredRole: string; description?: string }) =>
      api.jeApproval.createRule(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.jeApproval.all });
      toast.success('Approval rule created');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function usePendingApprovals() {
  return useQuery({
    queryKey: accountingKeys.jeApproval.pending(),
    queryFn: async () => {
      const res = await api.jeApproval.getPending();
      return res.data?.data;
    },
  });
}

export function useApproveEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, notes }: { entryId: string; notes?: string }) =>
      api.jeApproval.approve(entryId, { notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.jeApproval.all });
      toast.success('Entry approved');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useRejectEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, reason }: { entryId: string; reason: string }) =>
      api.jeApproval.reject(entryId, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.jeApproval.all });
      toast.success('Entry rejected');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

// ── Payment Program ─────────────────────────────────────────────────

export function usePaymentPrograms() {
  return useQuery({
    queryKey: accountingKeys.paymentProgram.list(),
    queryFn: async () => {
      const res = await api.paymentProgram.list();
      return res.data?.data;
    },
  });
}

export function useCreatePaymentRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { runDate: string; paymentMethod?: string; supplierId?: string }) =>
      api.paymentProgram.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.paymentProgram.all });
      toast.success('Payment run created');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useExecutePaymentRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.paymentProgram.execute(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.paymentProgram.all });
      toast.success('Payment run executed');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

// ── Multi-Currency ──────────────────────────────────────────────────

export function useCurrencies() {
  return useQuery({
    queryKey: accountingKeys.currency.list(),
    queryFn: async () => {
      const res = await api.currency.list();
      return res.data?.data;
    },
  });
}

export function useCurrencyConfig() {
  return useQuery({
    queryKey: accountingKeys.currency.config(),
    queryFn: async () => {
      const res = await api.currency.getConfig();
      return res.data?.data;
    },
  });
}

export function useSetExchangeRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { fromCurrency: string; toCurrency: string; rate: number; effectiveDate: string }) =>
      api.currency.setRate(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.currency.all });
      toast.success('Exchange rate saved');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useUpdateCurrencyConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { functionalCurrency: string; reportingCurrency?: string; exchangeRateType?: string }) =>
      api.currency.updateConfig(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.currency.all });
      toast.success('Currency config updated');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

// ── Enterprise Accounting ───────────────────────────────────────────

export function useFiscalYearStatus(year: number) {
  return useQuery({
    queryKey: accountingKeys.enterprise.fiscalYear(year),
    queryFn: async () => {
      const res = await api.enterprise.fiscalYearStatus(year);
      return res.data?.data;
    },
  });
}

export function useCloseFiscalYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { year: number; closingDate?: string }) =>
      api.enterprise.closeFiscalYear(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.enterprise.all });
      toast.success('Fiscal year closed successfully');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useTaxDefinitions(scope?: string) {
  return useQuery({
    queryKey: accountingKeys.enterprise.taxes(scope),
    queryFn: async () => {
      const res = await api.enterprise.listTaxes(scope);
      return res.data?.data;
    },
  });
}

export function useUnreconciledItems(accountCode: string) {
  return useQuery({
    queryKey: accountingKeys.enterprise.unreconciled(accountCode),
    queryFn: async () => {
      const res = await api.enterprise.unreconciledItems(accountCode);
      return res.data?.data;
    },
    enabled: !!accountCode,
  });
}

export function useReconciliationSuggestions(accountCode: string) {
  return useQuery({
    queryKey: accountingKeys.enterprise.suggestions(accountCode),
    queryFn: async () => {
      const res = await api.enterprise.reconciliationSuggestions(accountCode);
      return res.data?.data;
    },
    enabled: !!accountCode,
  });
}

export function useReconcileEntries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { entryIds: string[]; writeOffAmount?: number; writeOffAccountCode?: string }) =>
      api.enterprise.reconcileEntries(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.enterprise.all });
      toast.success('Entries reconciled');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useLockDates() {
  return useQuery({
    queryKey: accountingKeys.enterprise.lockDates(),
    queryFn: async () => {
      const res = await api.enterprise.getLockDates();
      return res.data?.data;
    },
  });
}

export function useSetLockDates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { advisorLockDate?: string | null; hardLockDate?: string | null }) =>
      api.enterprise.setLockDates(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.enterprise.lockDates() });
      toast.success('Lock dates updated');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useRevaluationPreview(date: string) {
  return useQuery({
    queryKey: accountingKeys.enterprise.revaluationPreview(date),
    queryFn: async () => {
      const res = await api.enterprise.revaluationPreview(date);
      return res.data?.data;
    },
    enabled: !!date,
  });
}

export function useExecuteRevaluation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { revaluationDate: string; autoReverse?: boolean }) =>
      api.enterprise.executeRevaluation(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.enterprise.all });
      toast.success('Currency revaluation completed');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}

export function useGLIntegrityAudit() {
  return useQuery({
    queryKey: accountingKeys.enterprise.integrity(),
    queryFn: async () => {
      const res = await api.enterprise.fullAudit();
      return res.data?.data;
    },
    enabled: false, // Only run on demand
  });
}

export function useAgedReceivables(asOfDate?: string) {
  return useQuery({
    queryKey: accountingKeys.enterprise.agedReceivables(asOfDate),
    queryFn: async () => {
      const res = await api.enterprise.agedReceivables(asOfDate);
      return res.data?.data;
    },
  });
}

export function useAgedPayables(asOfDate?: string) {
  return useQuery({
    queryKey: accountingKeys.enterprise.agedPayables(asOfDate),
    queryFn: async () => {
      const res = await api.enterprise.agedPayables(asOfDate);
      return res.data?.data;
    },
  });
}
