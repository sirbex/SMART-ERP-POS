import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../utils/api';
import { toastApiError } from '../utils/errorHandler';
import toast from 'react-hot-toast';
import {
  unwrapGrirAutoMatchPayload,
  unwrapGrirListPayload,
  unwrapGrirOpenPayload,
} from '@shared/domain/grirClearingSsot';

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
    taxSummary: (start?: string, end?: string) => ['wht', 'tax-summary', start, end] as const,
    register: (start?: string, end?: string, side?: string) =>
      ['wht', 'register', start, end, side] as const,
    liability: (start?: string, end?: string) => ['wht', 'liability', start, end] as const,
  },
  vatRemittance: {
    all: ['vat-remittance'] as const,
    enabled: () => ['vat-remittance', 'enabled'] as const,
    worksheet: (from?: string, to?: string) => ['vat-remittance', 'worksheet', from, to] as const,
  },
  badDebt: {
    all: ['bad-debt'] as const,
    enabled: () => ['bad-debt', 'enabled'] as const,
    workqueue: (params?: { minAgeDays?: number; customerId?: string }) =>
      ['bad-debt', 'workqueue', params] as const,
    documents: (params?: { limit?: number }) => ['bad-debt', 'documents', params] as const,
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
    onError: (err) => toastApiError(err),
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
    onError: (err) => toastApiError(err),
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
    onError: (err) => toastApiError(err),
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
    onError: (err) => toastApiError(err),
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
    onError: (err) => toastApiError(err),
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
      return unwrapGrirOpenPayload(res.data);
    },
  });
}

export function useGrirSearch(query: string) {
  return useQuery({
    queryKey: [...accountingKeys.grirClearing.all, 'search', query],
    queryFn: async () => {
      const res = await api.grirClearing.search(query);
      return unwrapGrirListPayload(res.data);
    },
    enabled: query.length >= 2,
  });
}

export function useGrirBalance() {
  return useQuery({
    queryKey: accountingKeys.grirClearing.balance(),
    queryFn: async () => {
      const res = await api.grirClearing.getBalance();
      const body = res.data as { success?: boolean; data?: unknown; error?: string };
      if (body?.success === false) {
        throw new Error(body.error || 'Failed to load GR/IR balance');
      }
      return body?.data;
    },
  });
}

export function useGrirResiduals(enabled = true) {
  return useQuery({
    queryKey: [...accountingKeys.grirClearing.all, 'residuals'],
    queryFn: async () => {
      const res = await api.grirClearing.getResiduals({ limit: 100 });
      const body = res.data as { success?: boolean; data?: unknown; error?: string };
      if (body?.success === false) {
        throw new Error(body.error || 'Failed to load GR/IR residuals');
      }
      return body?.data as {
        items: Array<{
          referenceNumber: string;
          referenceType: string;
          netCr: number;
          firstDate: string | null;
          lastDate: string | null;
          txnCount: number;
          description: string | null;
          recommendedMethod: 'TO_PRICE_VARIANCE' | 'TO_RETURN_CLEARING' | 'RECLASS_FROM_EXPENSE';
          reasonCode: string;
        }>;
        trueGlBalance: number;
      };
    },
    enabled,
  });
}

export function useGrirMatchCandidates(
  supplierId?: string,
  tolerancePercent?: number,
  enabled = true,
) {
  return useQuery({
    queryKey: [...accountingKeys.grirClearing.all, 'candidates', supplierId, tolerancePercent],
    queryFn: async () => {
      const res = await api.grirClearing.getMatchCandidates({
        ...(supplierId ? { supplierId } : {}),
        ...(tolerancePercent != null ? { tolerancePercent } : {}),
      });
      return unwrapGrirListPayload(res.data);
    },
    enabled,
  });
}

export function useGrirGrItems(grId: string | null) {
  return useQuery({
    queryKey: [...accountingKeys.grirClearing.all, 'gr-items', grId],
    queryFn: async () => {
      const res = await api.grirClearing.getGrItems(grId!);
      return unwrapGrirListPayload(res.data);
    },
    enabled: !!grId,
  });
}

export function useGrirHistory(poId: string | null) {
  return useQuery({
    queryKey: [...accountingKeys.grirClearing.all, 'history', poId],
    queryFn: async () => {
      const res = await api.grirClearing.getHistory(poId!);
      return unwrapGrirListPayload(res.data);
    },
    enabled: !!poId,
  });
}

export function useClearGrirItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { grId: string; invoiceId: string; date?: string }) => {
      const res = await api.grirClearing.clearItem(data);
      const body = res.data as { success?: boolean; data?: unknown; error?: string };
      if (body?.success === false) {
        throw new Error(body.error || 'Failed to clear GR/IR item');
      }
      return body?.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.grirClearing.all });
    },
    onError: (err) => toastApiError(err, 'Failed to clear GR/IR item'),
  });
}

export function useClearGrirResidual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      referenceNumber: string;
      method: 'TO_PRICE_VARIANCE' | 'TO_RETURN_CLEARING' | 'RECLASS_FROM_EXPENSE';
      amount?: number;
      notes?: string;
    }) => {
      const res = await api.grirClearing.clearResidual(data);
      const body = res.data as { success?: boolean; data?: unknown; error?: string };
      if (body?.success === false) {
        throw new Error(body.error || 'Failed to clear GR/IR residual');
      }
      return body?.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.grirClearing.all });
      toast.success('GR/IR residual cleared (no extra AP)');
    },
    onError: (err) => toastApiError(err, 'Failed to clear GR/IR residual'),
  });
}

export function useGrirAutoMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data?: { supplierId?: string; tolerancePercent?: number }) => {
      const res = await api.grirClearing.autoMatch(data);
      return unwrapGrirAutoMatchPayload(res.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.grirClearing.all });
    },
    onError: (err) => toastApiError(err, 'Auto-match failed'),
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
    mutationFn: (data: {
      levelNumber: number;
      name: string;
      daysOverdue: number;
      feeAmount: number;
      letterTemplate: string;
      blockFurtherCredit?: boolean;
    }) => api.dunning.createLevel(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.dunning.all });
      toast.success('Dunning level created');
    },
    onError: (err) => toastApiError(err),
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
    onError: (err) => toastApiError(err),
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
    mutationFn: (data: {
      code: string;
      name: string;
      rate: number;
      appliesTo?: string;
      appliesToSuppliers?: boolean;
      appliesToCustomers?: boolean;
    }) => api.wht.createType(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.wht.all });
      toast.success('WHT type created');
    },
    onError: (err) => toastApiError(err),
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

export function useRemitWht() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      amount: number;
      date: string;
      reference: string;
      paymentAccountCode: string;
      payableAccountCode?: string;
    }) => api.wht.remit(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.wht.all });
      toast.success('WHT remittance posted');
    },
    onError: (err) => toastApiError(err),
  });
}

export function useVatRemittanceEnabled() {
  return useQuery({
    queryKey: accountingKeys.vatRemittance.enabled(),
    queryFn: async () => {
      const res = await api.vatRemittance.getEnabled();
      return res.data?.data as {
        enabled: boolean;
        vatRemittanceDocumentEnabled: boolean;
        treasuryDocumentEnabled: boolean;
      };
    },
  });
}

export function useVatRemittanceWorksheet(periodFrom: string, periodTo: string, enabled = true) {
  return useQuery({
    queryKey: accountingKeys.vatRemittance.worksheet(periodFrom, periodTo),
    enabled: enabled && !!periodFrom && !!periodTo && periodFrom <= periodTo,
    queryFn: async () => {
      const res = await api.vatRemittance.getWorksheet({ periodFrom, periodTo });
      return res.data?.data as {
        enabled: boolean;
        periodFrom: string;
        periodTo: string;
        documentNetVatPayable: number;
        netOutputTax: number;
        netInputTax: number;
        alreadyRemitted: number;
        availableVatPayable: number;
        glTaxPayable2300: number;
        defaultPaymentAccountCode: string;
        decision: 'B';
        note: string;
      };
    },
  });
}

export function useRemitVat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      periodFrom: string;
      periodTo: string;
      amount: number;
      transactionDate: string;
      paymentAccountCode: string;
      authorityReference: string;
      memo?: string;
      postImmediately?: boolean;
    }) => api.vatRemittance.remit(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.vatRemittance.all });
      qc.invalidateQueries({ queryKey: accountingKeys.wht.all });
      toast.success('VAT remittance posted');
    },
    onError: (err) => toastApiError(err),
  });
}

export function useBadDebtEnabled() {
  return useQuery({
    queryKey: accountingKeys.badDebt.enabled(),
    queryFn: async () => {
      const res = await api.badDebt.getEnabled();
      return res.data?.data as { enabled: boolean; badDebtWriteoffEnabled: boolean };
    },
  });
}

export function useBadDebtWorkqueue(params?: { minAgeDays?: number; customerId?: string; limit?: number }) {
  return useQuery({
    queryKey: accountingKeys.badDebt.workqueue(params),
    queryFn: async () => {
      const res = await api.badDebt.getWorkqueue(params);
      return res.data?.data as {
        asOf: string;
        lines: Array<{
          invoiceId: string;
          invoiceNumber: string;
          customerId: string;
          customerName: string;
          dueDate: string | null;
          amountDue: number;
          ageDays: number;
          status: string;
        }>;
        summary: { totalLines: number; totalDue: number };
      };
    },
  });
}

export function useBadDebtDocuments(params?: { limit?: number; includeReversed?: boolean }) {
  return useQuery({
    queryKey: accountingKeys.badDebt.documents(params),
    queryFn: async () => {
      const res = await api.badDebt.listDocuments(params);
      return res.data?.data as Array<{
        id: string;
        documentNumber: string;
        customerId: string;
        totalAmount: number;
        reasonCode: string;
        writeoffDate: string;
        postedAt: string | null;
        reversedByDocumentId: string | null;
        lines: Array<{ invoiceId: string; writeoffAmount: number }>;
      }>;
    },
  });
}

export function usePostBadDebtWriteoff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      customerId: string;
      writeoffDate?: string;
      reasonCode: string;
      expenseAccountCode?: string;
      memo?: string;
      lines: Array<{ invoiceId: string; writeoffAmount: number; memo?: string }>;
    }) => {
      const res = await api.badDebt.writeoff(data);
      return res.data?.data as {
        id: string;
        documentNumber: string;
        totalAmount: number;
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.badDebt.all });
      toast.success('Bad debt write-off posted');
    },
    onError: (err) => toastApiError(err),
  });
}

export function useReverseBadDebtWriteoff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { id: string; reason?: string }) => {
      const res = await api.badDebt.reverse(data.id, { reason: data.reason });
      return res.data?.data as {
        original: { documentNumber: string };
        reversal: { documentNumber: string };
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.badDebt.all });
      toast.success('Write-off reversed');
    },
    onError: (err) => toastApiError(err),
  });
}

export function useRecoverWhtReceivable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      amount: number;
      date: string;
      reference: string;
      paymentAccountCode: string;
      receivableAccountCode?: string;
    }) => api.wht.recover(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.wht.all });
      toast.success('Tax Receivable recovery posted');
    },
    onError: (err) => toastApiError(err),
  });
}

export function useWhtCertificates(params?: {
  startDate?: string;
  endDate?: string;
  supplierId?: string;
  customerId?: string;
}) {
  return useQuery({
    queryKey: [...accountingKeys.wht.certificates(), params],
    queryFn: async () => {
      const res = await api.wht.getCertificates(params);
      return res.data?.data;
    },
  });
}

export function useTaxComplianceSummary(startDate: string, endDate: string, enabled = true) {
  return useQuery({
    queryKey: accountingKeys.wht.taxSummary(startDate, endDate),
    queryFn: async () => {
      const res = await api.reports.getTaxComplianceSummary({ startDate, endDate });
      return res.data?.data;
    },
    enabled: enabled && !!startDate && !!endDate,
  });
}

export function useWhtRegisterReport(
  startDate: string,
  endDate: string,
  side?: 'SUPPLIER' | 'CUSTOMER',
  enabled = true,
) {
  return useQuery({
    queryKey: accountingKeys.wht.register(startDate, endDate, side),
    queryFn: async () => {
      const res = await api.reports.getWhtRegister({ startDate, endDate, side });
      return res.data?.data;
    },
    enabled: enabled && !!startDate && !!endDate,
  });
}

export function useTaxLiabilityReport(startDate: string, endDate: string, enabled = true) {
  return useQuery({
    queryKey: accountingKeys.wht.liability(startDate, endDate),
    queryFn: async () => {
      const res = await api.reports.getTaxLiability({ startDate, endDate });
      return res.data?.data;
    },
    enabled: enabled && !!startDate && !!endDate,
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
    onError: (err) => toastApiError(err),
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
      depreciationMethod?: string; depreciationStartDate?: string;
      /** PURCHASE = bought now (requires paymentMethod). OPENING = pre-ERP (no paymentMethod). */
      mode: 'PURCHASE' | 'OPENING';
      /** Required when mode=PURCHASE. Must be omitted when mode=OPENING. */
      paymentMethod?: 'CASH' | 'BANK' | 'AP';
      location?: string; serialNumber?: string;
    }) =>
      api.assets.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.assets.all });
      toast.success('Asset created');
    },
    onError: (err) => toastApiError(err),
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
    onError: (err) => toastApiError(err),
  });
}

export function useDisposeAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { assetId: string; disposalDate: string; disposalAmount: number }) =>
      api.assets.dispose(data.assetId, { disposalDate: data.disposalDate, disposalAmount: data.disposalAmount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.assets.all });
      toast.success('Asset disposed and GL posted');
    },
    onError: (err) => toastApiError(err),
  });
}

export function useCutoverPreview() {
  return useMutation({
    mutationFn: (data: { cutoverDate: string }) => api.assets.cutoverPreview(data),
    onError: (err) => toastApiError(err),
  });
}

export function useApplyCutoverCorrections() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { cutoverDate: string }) => api.assets.cutoverApply(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountingKeys.assets.all });
      toast.success('Cutover corrections applied — GL entries reversed and Opening Balance Equity credited');
    },
    onError: (err) => toastApiError(err),
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
    onError: (err) => toastApiError(err),
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
    onError: (err) => toastApiError(err),
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
    onError: (err) => toastApiError(err),
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
    onError: (err) => toastApiError(err),
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
    onError: (err) => toastApiError(err),
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
    onError: (err) => toastApiError(err),
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
    onError: (err) => toastApiError(err),
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
    onError: (err) => toastApiError(err),
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
    onError: (err) => toastApiError(err),
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
    onError: (err) => toastApiError(err),
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
    onError: (err) => toastApiError(err),
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
