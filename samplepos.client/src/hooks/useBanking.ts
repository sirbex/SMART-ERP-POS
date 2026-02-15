/**
 * BANKING HOOKS
 * 
 * React Query hooks for banking module operations.
 * Follows existing hook patterns in the codebase.
 * Types imported from shared/types/banking.ts (single source of truth)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Import types from single source of truth
import type {
    BankAccount,
    BankTransaction,
    BankCategory,
    BankPattern,
    BankAlert,
    BankStatement,
    BankStatementLine,
    BankTemplate,
    CreateBankAccountDto,
    CreateBankTransactionDto,
    CreateTransferDto,
} from '@shared/types/banking';

const API_BASE = '/api/banking';

// Re-export types for convenience
export type {
    BankAccount,
    BankTransaction,
    BankCategory,
    BankPattern,
    BankAlert,
    BankStatement,
    BankStatementLine,
    BankTemplate,
    CreateBankAccountDto,
    CreateBankTransactionDto,
    CreateTransferDto,
};

// Alias for backwards compatibility in existing components
export type StatementLine = BankStatementLine;

// ---------------------------------------------------------------------------
// API FUNCTIONS
// ---------------------------------------------------------------------------

const bankingApi = {
    // Bank Accounts
    getAccounts: async (includeInactive = false): Promise<BankAccount[]> => {
        const response = await fetch(`${API_BASE}/accounts?includeInactive=${includeInactive}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
        });
        if (!response.ok) throw new Error('Failed to fetch bank accounts');
        const result = await response.json();
        return result.data || [];
    },

    getAccount: async (id: string): Promise<BankAccount> => {
        const response = await fetch(`${API_BASE}/accounts/${id}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
        });
        if (!response.ok) throw new Error('Failed to fetch bank account');
        const result = await response.json();
        return result.data;
    },

    createAccount: async (data: {
        name: string;
        accountNumber?: string;
        bankName?: string;
        branch?: string;
        glAccountId: string;
        openingBalance?: number;
        isDefault?: boolean;
    }): Promise<BankAccount> => {
        const response = await fetch(`${API_BASE}/accounts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to create bank account');
        }
        const result = await response.json();
        return result.data;
    },

    updateAccount: async (id: string, data: Partial<{
        name: string;
        accountNumber: string;
        bankName: string;
        branch: string;
        glAccountId: string;
        isDefault: boolean;
        isActive: boolean;
    }>): Promise<BankAccount> => {
        const response = await fetch(`${API_BASE}/accounts/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to update bank account');
        }
        const result = await response.json();
        return result.data;
    },

    // Transactions
    getTransactions: async (params: {
        bankAccountId?: string;
        startDate?: string;
        endDate?: string;
        type?: string;
        categoryId?: string;
        isReconciled?: boolean;
        limit?: number;
        offset?: number;
    } = {}): Promise<{ transactions: BankTransaction[]; total: number }> => {
        const searchParams = new URLSearchParams();
        if (params.bankAccountId) searchParams.append('bankAccountId', params.bankAccountId);
        if (params.startDate) searchParams.append('startDate', params.startDate);
        if (params.endDate) searchParams.append('endDate', params.endDate);
        if (params.type) searchParams.append('type', params.type);
        if (params.categoryId) searchParams.append('categoryId', params.categoryId);
        if (params.isReconciled !== undefined) searchParams.append('isReconciled', String(params.isReconciled));
        if (params.limit) searchParams.append('limit', String(params.limit));
        if (params.offset) searchParams.append('offset', String(params.offset));

        const response = await fetch(`${API_BASE}/transactions?${searchParams}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
        });
        if (!response.ok) throw new Error('Failed to fetch transactions');
        const result = await response.json();
        return { transactions: result.data || [], total: result.total || 0 };
    },

    createTransaction: async (data: {
        bankAccountId: string;
        transactionDate: string;
        type: 'DEPOSIT' | 'WITHDRAWAL' | 'FEE' | 'INTEREST';
        categoryId?: string;
        description: string;
        reference?: string;
        amount: number;
        contraAccountId?: string;
    }): Promise<BankTransaction> => {
        const response = await fetch(`${API_BASE}/transactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to create transaction');
        }
        const result = await response.json();
        return result.data;
    },

    createTransfer: async (data: {
        fromAccountId: string;
        toAccountId: string;
        transactionDate: string;
        amount: number;
        description?: string;
        reference?: string;
    }): Promise<{ withdrawal: BankTransaction; deposit: BankTransaction }> => {
        const response = await fetch(`${API_BASE}/transfers`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to create transfer');
        }
        const result = await response.json();
        return result.data;
    },

    reverseTransaction: async (id: string, reason: string): Promise<BankTransaction> => {
        const response = await fetch(`${API_BASE}/transactions/${id}/reverse`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify({ reason })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to reverse transaction');
        }
        const result = await response.json();
        return result.data;
    },

    // Categories
    getCategories: async (): Promise<BankCategory[]> => {
        const response = await fetch(`${API_BASE}/categories`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
        });
        if (!response.ok) throw new Error('Failed to fetch categories');
        const result = await response.json();
        return result.data || [];
    },

    // Templates
    getTemplates: async (): Promise<BankTemplate[]> => {
        const response = await fetch(`${API_BASE}/templates`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
        });
        if (!response.ok) throw new Error('Failed to fetch templates');
        const result = await response.json();
        return result.data || [];
    },

    createTemplate: async (data: {
        name: string;
        bankName?: string;
        columnMappings: BankTemplate['columnMappings'];
        skipHeaderRows?: number;
        skipFooterRows?: number;
        delimiter?: string;
    }): Promise<BankTemplate> => {
        const response = await fetch(`${API_BASE}/templates`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to create template');
        }
        const result = await response.json();
        return result.data;
    },

    // Statement Import
    importStatement: async (data: {
        bankAccountId: string;
        templateId: string;
        csvContent: string;
        statementDate: string;
        fileName: string;
        periodStart?: string;
        periodEnd?: string;
    }): Promise<{
        statementId: string;
        statementNumber: string;
        totalLines: number;
        parsedLines: StatementLine[];
    }> => {
        const response = await fetch(`${API_BASE}/statements/import`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to import statement');
        }
        const result = await response.json();
        return result.data;
    },

    getStatementLines: async (statementId: string, status?: string): Promise<StatementLine[]> => {
        const params = new URLSearchParams();
        if (status) params.append('status', status);

        const response = await fetch(`${API_BASE}/statements/${statementId}/lines?${params}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
        });
        if (!response.ok) throw new Error('Failed to fetch statement lines');
        const result = await response.json();
        return result.data || [];
    },

    processStatementLine: async (lineId: string, data: {
        action: 'CREATE' | 'MATCH' | 'SKIP';
        transactionId?: string;
        categoryId?: string;
        contraAccountId?: string;
        skipReason?: string;
    }): Promise<any> => {
        const response = await fetch(`${API_BASE}/statements/lines/${lineId}/process`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to process statement line');
        }
        const result = await response.json();
        return result.data;
    },

    completeStatement: async (statementId: string): Promise<void> => {
        const response = await fetch(`${API_BASE}/statements/${statementId}/complete`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to complete statement');
        }
    },

    // Reconciliation
    reconcileTransactions: async (data: {
        bankAccountId: string;
        transactionIds: string[];
        statementBalance: number;
    }): Promise<{ reconciledCount: number; newBalance: number }> => {
        const response = await fetch(`${API_BASE}/reconcile`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to reconcile');
        }
        const result = await response.json();
        return result.data;
    },

    // Patterns
    findMatchingPatterns: async (description: string, transactionType?: 'CREDIT' | 'DEBIT'): Promise<BankPattern[]> => {
        const params = new URLSearchParams({ description });
        if (transactionType) params.append('transactionType', transactionType);

        const response = await fetch(`${API_BASE}/patterns/match?${params}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
        });
        if (!response.ok) throw new Error('Failed to find matching patterns');
        const result = await response.json();
        return result.data || [];
    },

    learnPattern: async (data: {
        descriptionPattern: string;
        categoryId: string;
        accountId?: string;
        priority?: number;
        transactionType?: 'CREDIT' | 'DEBIT';
        notes?: string;
    }): Promise<BankPattern> => {
        const response = await fetch(`${API_BASE}/patterns`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to learn pattern');
        }
        const result = await response.json();
        return result.data;
    },

    updatePatternFeedback: async (patternId: string, wasCorrect: boolean): Promise<void> => {
        const response = await fetch(`${API_BASE}/patterns/${patternId}/feedback`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify({ wasCorrect })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to update pattern feedback');
        }
    },

    // Alerts
    getAlerts: async (status = 'NEW'): Promise<BankAlert[]> => {
        const response = await fetch(`${API_BASE}/alerts?status=${status}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
        });
        if (!response.ok) throw new Error('Failed to fetch alerts');
        const result = await response.json();
        return result.data || [];
    },

    updateAlertStatus: async (id: string, status: string, notes?: string): Promise<void> => {
        const response = await fetch(`${API_BASE}/alerts/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify({ status, notes })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to update alert');
        }
    }
};

// ---------------------------------------------------------------------------
// HOOKS
// ---------------------------------------------------------------------------

// Bank Accounts
export function useBankAccounts(includeInactive = false) {
    return useQuery({
        queryKey: ['bankAccounts', { includeInactive }],
        queryFn: () => bankingApi.getAccounts(includeInactive),
        staleTime: 0,
        refetchOnMount: 'always'
    });
}

export function useBankAccount(id: string | null) {
    return useQuery({
        queryKey: ['bankAccount', id],
        queryFn: () => bankingApi.getAccount(id!),
        enabled: !!id,
        staleTime: 0,
        refetchOnMount: 'always'
    });
}

export function useCreateBankAccount() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: bankingApi.createAccount,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
        }
    });
}

export function useUpdateBankAccount() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Parameters<typeof bankingApi.updateAccount>[1] }) =>
            bankingApi.updateAccount(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
        }
    });
}

// Transactions
export function useBankTransactions(params: Parameters<typeof bankingApi.getTransactions>[0] = {}) {
    return useQuery({
        queryKey: ['bankTransactions', params],
        queryFn: () => bankingApi.getTransactions(params),
        staleTime: 0,
        refetchOnMount: 'always'
    });
}

export function useCreateBankTransaction() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: bankingApi.createTransaction,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
            queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
        }
    });
}

export function useCreateBankTransfer() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: bankingApi.createTransfer,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
            queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
        }
    });
}

export function useReverseBankTransaction() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) =>
            bankingApi.reverseTransaction(id, reason),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
            queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
        }
    });
}

// Categories
export function useBankCategories() {
    return useQuery({
        queryKey: ['bankCategories'],
        queryFn: bankingApi.getCategories,
        staleTime: 0,
        refetchOnMount: 'always'
    });
}

// Templates
export function useBankTemplates() {
    return useQuery({
        queryKey: ['bankTemplates'],
        queryFn: bankingApi.getTemplates,
        staleTime: 0,
        refetchOnMount: 'always'
    });
}

export function useCreateBankTemplate() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: bankingApi.createTemplate,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bankTemplates'] });
        }
    });
}

// Statement Import
export function useImportStatement() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: bankingApi.importStatement,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
        }
    });
}

export function useStatementLines(statementId: string | null, status?: string) {
    return useQuery({
        queryKey: ['statementLines', statementId, status],
        queryFn: () => bankingApi.getStatementLines(statementId!, status),
        enabled: !!statementId,
        staleTime: 0,
        refetchOnMount: 'always'
    });
}

export function useProcessStatementLine() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ lineId, data }: { lineId: string; data: Parameters<typeof bankingApi.processStatementLine>[1] }) =>
            bankingApi.processStatementLine(lineId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['statementLines'] });
            queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
            queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
        }
    });
}

export function useCompleteStatement() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: bankingApi.completeStatement,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['statementLines'] });
        }
    });
}

// Reconciliation
export function useReconcileTransactions() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: bankingApi.reconcileTransactions,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bankTransactions'] });
            queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
        }
    });
}

// Alerts
export function useBankAlerts(status = 'NEW') {
    return useQuery({
        queryKey: ['bankAlerts', status],
        queryFn: () => bankingApi.getAlerts(status),
        staleTime: 0,
        refetchOnMount: 'always'
    });
}

export function useUpdateBankAlert() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
            bankingApi.updateAlertStatus(id, status, notes),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bankAlerts'] });
        }
    });
}

// ---------------------------------------------------------------------------
// PATTERNS
// ---------------------------------------------------------------------------

export function useFindMatchingPatterns(description: string, transactionType?: 'CREDIT' | 'DEBIT') {
    return useQuery({
        queryKey: ['bankPatterns', 'match', description, transactionType],
        queryFn: () => bankingApi.findMatchingPatterns(description, transactionType),
        enabled: !!description && description.length >= 3
    });
}

export function useLearnPattern() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: bankingApi.learnPattern,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bankPatterns'] });
        }
    });
}

export function usePatternFeedback() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ patternId, wasCorrect }: { patternId: string; wasCorrect: boolean }) =>
            bankingApi.updatePatternFeedback(patternId, wasCorrect),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bankPatterns'] });
        }
    });
}

// ---------------------------------------------------------------------------
// RECURRING RULES
// ---------------------------------------------------------------------------

export interface BankRecurringRule {
    id: string;
    name: string;
    bankAccountId: string;
    bankAccountName?: string;
    matchRules: {
        descriptionContains?: string[];
        descriptionRegex?: string;
        amountMin?: number;
        amountMax?: number;
    };
    frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
    expectedDay: number;
    expectedAmount: number;
    tolerancePercent: number;
    categoryId?: string;
    categoryName?: string;
    contraAccountId?: string;
    contraAccountName?: string;
    lastMatchedAt?: string;
    lastMatchedAmount?: number;
    nextExpectedAt?: string;
    missCount: number;
    isActive: boolean;
    createdBy?: string;
    createdAt: string;
}

const recurringRulesApi = {
    getAll: async (bankAccountId?: string): Promise<BankRecurringRule[]> => {
        const url = bankAccountId
            ? `${API_BASE}/recurring-rules?bankAccountId=${bankAccountId}`
            : `${API_BASE}/recurring-rules`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        });
        if (!response.ok) throw new Error('Failed to fetch recurring rules');
        const result = await response.json();
        return result.data || [];
    },

    getById: async (id: string): Promise<BankRecurringRule> => {
        const response = await fetch(`${API_BASE}/recurring-rules/${id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        });
        if (!response.ok) throw new Error('Failed to fetch recurring rule');
        const result = await response.json();
        return result.data;
    },

    create: async (data: {
        name: string;
        bankAccountId: string;
        matchRules: BankRecurringRule['matchRules'];
        frequency: BankRecurringRule['frequency'];
        expectedDay: number;
        expectedAmount: number;
        tolerancePercent?: number;
        categoryId?: string;
        contraAccountId?: string;
    }): Promise<BankRecurringRule> => {
        const response = await fetch(`${API_BASE}/recurring-rules`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to create recurring rule');
        }
        const result = await response.json();
        return result.data;
    },

    update: async (id: string, data: Partial<{
        name: string;
        matchRules: BankRecurringRule['matchRules'];
        frequency: BankRecurringRule['frequency'];
        expectedDay: number;
        expectedAmount: number;
        tolerancePercent: number;
        categoryId: string | null;
        contraAccountId: string | null;
        isActive: boolean;
    }>): Promise<BankRecurringRule> => {
        const response = await fetch(`${API_BASE}/recurring-rules/${id}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to update recurring rule');
        }
        const result = await response.json();
        return result.data;
    },

    delete: async (id: string): Promise<void> => {
        const response = await fetch(`${API_BASE}/recurring-rules/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        });
        if (!response.ok) throw new Error('Failed to delete recurring rule');
    },

    checkOverdue: async (): Promise<{ alertsCreated: number }> => {
        const response = await fetch(`${API_BASE}/recurring-rules/check-overdue`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        });
        if (!response.ok) throw new Error('Failed to check overdue recurring');
        const result = await response.json();
        return result.data;
    }
};

export function useRecurringRules(bankAccountId?: string) {
    return useQuery({
        queryKey: ['recurringRules', bankAccountId],
        queryFn: () => recurringRulesApi.getAll(bankAccountId)
    });
}

export function useRecurringRule(id: string | null) {
    return useQuery({
        queryKey: ['recurringRule', id],
        queryFn: () => recurringRulesApi.getById(id!),
        enabled: !!id
    });
}

export function useCreateRecurringRule() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: recurringRulesApi.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['recurringRules'] });
        }
    });
}

export function useUpdateRecurringRule() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Parameters<typeof recurringRulesApi.update>[1] }) =>
            recurringRulesApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['recurringRules'] });
            queryClient.invalidateQueries({ queryKey: ['recurringRule'] });
        }
    });
}

export function useDeleteRecurringRule() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: recurringRulesApi.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['recurringRules'] });
        }
    });
}

export function useCheckOverdueRecurring() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: recurringRulesApi.checkOverdue,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bankAlerts'] });
        }
    });
}

// ---------------------------------------------------------------------------
// LOW BALANCE SETTINGS
// ---------------------------------------------------------------------------

const lowBalanceApi = {
    setThreshold: async (bankAccountId: string, threshold: number, enabled: boolean): Promise<void> => {
        const response = await fetch(`${API_BASE}/accounts/${bankAccountId}/low-balance-settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify({ threshold, enabled })
        });
        if (!response.ok) throw new Error('Failed to set low balance threshold');
    },

    checkLowBalances: async (): Promise<{ alertsCreated: number }> => {
        const response = await fetch(`${API_BASE}/check-low-balances`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        });
        if (!response.ok) throw new Error('Failed to check low balances');
        const result = await response.json();
        return result.data;
    }
};

export function useSetLowBalanceThreshold() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ bankAccountId, threshold, enabled }: { bankAccountId: string; threshold: number; enabled: boolean }) =>
            lowBalanceApi.setThreshold(bankAccountId, threshold, enabled),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bankAccounts'] });
        }
    });
}

export function useCheckLowBalances() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: lowBalanceApi.checkLowBalances,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bankAlerts'] });
        }
    });
}

// ---------------------------------------------------------------------------
// REPORTS
// ---------------------------------------------------------------------------

export interface BankAccountSummary {
    id: string;
    name: string;
    bankName?: string;
    currentBalance: number;
    lastReconciledBalance?: number;
    lastReconciledAt?: string;
    unreconciledCount: number;
    totalDepositsThisMonth: number;
    totalWithdrawalsThisMonth: number;
}

export interface BankActivityReport {
    accountId: string;
    accountName: string;
    periodStart: string;
    periodEnd: string;
    openingBalance: number;
    closingBalance: number;
    totalDeposits: number;
    totalWithdrawals: number;
    transactionCount: number;
    categories: Array<{
        categoryId: string;
        categoryName: string;
        categoryCode: string;
        direction: 'IN' | 'OUT';
        totalAmount: number;
        transactionCount: number;
    }>;
}

export interface CashPositionReport {
    asOfDate: string;
    accounts: Array<{
        id: string;
        name: string;
        bankName?: string;
        balance: number;
        lastReconciled?: string;
        unreconciledAmount: number;
    }>;
    totalCashBalance: number;
    totalUnreconciledAmount: number;
}

const reportsApi = {
    getAccountSummaries: async (): Promise<BankAccountSummary[]> => {
        const response = await fetch(`${API_BASE}/reports/account-summaries`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        });
        if (!response.ok) throw new Error('Failed to fetch account summaries');
        const result = await response.json();
        return result.data || [];
    },

    getActivityReport: async (accountId: string, periodStart: string, periodEnd: string): Promise<BankActivityReport> => {
        const response = await fetch(
            `${API_BASE}/reports/activity/${accountId}?periodStart=${periodStart}&periodEnd=${periodEnd}`,
            { headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` } }
        );
        if (!response.ok) throw new Error('Failed to fetch activity report');
        const result = await response.json();
        return result.data;
    },

    getCashPosition: async (asOfDate?: string): Promise<CashPositionReport> => {
        const url = asOfDate
            ? `${API_BASE}/reports/cash-position?asOfDate=${asOfDate}`
            : `${API_BASE}/reports/cash-position`;
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        });
        if (!response.ok) throw new Error('Failed to fetch cash position');
        const result = await response.json();
        return result.data;
    }
};

export function useAccountSummaries() {
    return useQuery({
        queryKey: ['bankAccountSummaries'],
        queryFn: reportsApi.getAccountSummaries
    });
}

export function useActivityReport(accountId: string | null, periodStart: string, periodEnd: string) {
    return useQuery({
        queryKey: ['bankActivityReport', accountId, periodStart, periodEnd],
        queryFn: () => reportsApi.getActivityReport(accountId!, periodStart, periodEnd),
        enabled: !!accountId && !!periodStart && !!periodEnd
    });
}

export function useCashPositionReport(asOfDate?: string) {
    return useQuery({
        queryKey: ['cashPositionReport', asOfDate],
        queryFn: () => reportsApi.getCashPosition(asOfDate)
    });
}