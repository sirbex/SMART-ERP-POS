import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Expense,
  CreateExpenseData,
  UpdateExpenseData,
  ExpenseFilter
} from '@shared/types/expense';

const API_BASE = '/api/expenses';

// API functions
const expenseApi = {
  // Get all expenses with optional filters
  getExpenses: async (filter: ExpenseFilter = {}): Promise<{
    expenses: Expense[];
    total: number;
    summary?: { totalAmount: number; count: number; byStatus?: Record<string, { count: number; total: number }>; byCategory?: Record<string, { count: number; total: number }> };
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }> => {
    const params = new URLSearchParams();

    if (filter.status) params.append('status', filter.status);
    if (filter.category) params.append('category', filter.category);
    if (filter.startDate) params.append('startDate', filter.startDate);
    if (filter.endDate) params.append('endDate', filter.endDate);
    if (filter.minAmount) params.append('minAmount', filter.minAmount.toString());
    if (filter.maxAmount) params.append('maxAmount', filter.maxAmount.toString());
    if (filter.search) params.append('search', filter.search);
    if (filter.page) params.append('page', filter.page.toString());
    if (filter.limit) params.append('limit', filter.limit.toString());
    if (filter.includeSummary) params.append('includeSummary', 'true');

    const response = await fetch(`${API_BASE}?${params}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch expenses');
    }

    const result = await response.json();
    // Handle nested response structure: { success, data: { data, pagination } }
    const responseData = result.data || result;
    return {
      expenses: responseData.data || [],
      total: responseData.pagination?.total || 0,
      summary: responseData.summary,
      pagination: responseData.pagination || { total: 0, page: 1, limit: 20, totalPages: 0 }
    };
  },

  // Get single expense by ID or expense number
  getExpense: async (id: string): Promise<Expense> => {
    const response = await fetch(`${API_BASE}/${id}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch expense');
    }

    const result = await response.json();
    return result.data;
  },

  // Create new expense
  createExpense: async (data: CreateExpenseData): Promise<Expense> => {
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create expense');
    }

    const result = await response.json();
    return result.data;
  },

  // Update expense
  updateExpense: async (id: string, data: UpdateExpenseData): Promise<Expense> => {
    const response = await fetch(`${API_BASE}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update expense');
    }

    const result = await response.json();
    return result.data;
  },

  // Delete expense
  deleteExpense: async (id: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete expense');
    }
  },

  // Submit expense for approval
  submitExpense: async (id: string): Promise<Expense> => {
    const token = localStorage.getItem('auth_token');

    // Debug: log the token value
    console.log('[submitExpense] Token from localStorage:', token ? `${token.substring(0, 20)}...` : 'NULL/UNDEFINED');
    console.log('[submitExpense] Token length:', token?.length || 0);

    // Check for missing, null, undefined, or literal string "undefined"
    if (!token || token === 'undefined' || token === 'null' || token.length < 20) {
      console.error('[submitExpense] Invalid token detected, clearing auth state');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      localStorage.removeItem('auth-store');
      throw new Error('Session expired. Please log in again.');
    }

    const response = await fetch(`${API_BASE}/${id}/submit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[submitExpense] Server returned error:', error);
      throw new Error(error.error || 'Failed to submit expense');
    }

    const result = await response.json();
    return result.data;
  },

  // Approve expense
  approveExpense: async (id: string, notes?: string): Promise<Expense> => {
    const response = await fetch(`${API_BASE}/${id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      },
      body: JSON.stringify({ notes })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to approve expense');
    }

    const result = await response.json();
    return result.data;
  },

  // Reject expense
  rejectExpense: async (id: string, reason: string): Promise<Expense> => {
    const response = await fetch(`${API_BASE}/${id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      },
      body: JSON.stringify({ reason })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to reject expense');
    }

    const result = await response.json();
    return result.data;
  },

  // Mark expense as paid
  markAsPaid: async ({ id, paymentAccountId }: { id: string; paymentAccountId?: string }): Promise<Expense> => {
    const response = await fetch(`${API_BASE}/${id}/mark-paid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      },
      body: JSON.stringify({
        payment_account_id: paymentAccountId
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to mark expense as paid');
    }

    const result = await response.json();
    return result.data;
  },

  // Get expenses by category
  getExpensesByCategory: async (startDate?: string, endDate?: string): Promise<{
    category: string;
    total: number;
    count: number;
  }[]> => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const response = await fetch(`${API_BASE}/by-category?${params}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch category data');
    }

    const result = await response.json();
    return result.data;
  },

  // Get expenses by month
  getExpensesByMonth: async (year: number): Promise<{
    month: number;
    total: number;
    count: number;
  }[]> => {
    const response = await fetch(`${API_BASE}/by-month/${year}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch monthly data');
    }

    const result = await response.json();
    return result.data;
  },

  // Get expenses summary
  getExpensesSummary: async (filter: ExpenseFilter = {}): Promise<{
    totalAmount: number;
    count: number;
    byStatus: Record<string, { count: number; total: number }>;
    byCategory: Record<string, { count: number; total: number }>;
  }> => {
    const params = new URLSearchParams();

    if (filter.status) params.append('status', filter.status);
    if (filter.category) params.append('category', filter.category);
    if (filter.startDate) params.append('startDate', filter.startDate);
    if (filter.endDate) params.append('endDate', filter.endDate);
    if (filter.minAmount) params.append('minAmount', filter.minAmount.toString());
    if (filter.maxAmount) params.append('maxAmount', filter.maxAmount.toString());

    const response = await fetch(`${API_BASE}/summary?${params}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch summary');
    }

    const result = await response.json();
    return result.data;
  },

  // Get payment accounts (cash/bank accounts for expense payment source)
  getPaymentAccounts: async (): Promise<{
    id: string;
    code: string;
    name: string;
    type: string;
  }[]> => {
    const response = await fetch(`${API_BASE}/payment-accounts`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch payment accounts');
    }

    const result = await response.json();
    // Normalize snake_case to camelCase
    return (result.data || []).map((acc: { id: string; account_code?: string; code?: string; account_name?: string; name?: string; account_type?: string; type?: string }) => ({
      id: acc.id,
      code: acc.account_code || acc.code,
      name: acc.account_name || acc.name,
      type: acc.account_type || acc.type
    }));
  }
};

// React Query hooks
export const useExpenses = (filter: ExpenseFilter = {}) => {
  return useQuery({
    queryKey: ['expenses', filter],
    queryFn: () => expenseApi.getExpenses(filter),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useExpense = (id: string) => {
  return useQuery({
    queryKey: ['expense', id],
    queryFn: () => expenseApi.getExpense(id),
    enabled: !!id,
  });
};

export const usePaymentAccounts = () => {
  return useQuery({
    queryKey: ['payment-accounts'],
    queryFn: expenseApi.getPaymentAccounts,
    staleTime: 30 * 60 * 1000, // 30 minutes - accounts don't change often
  });
};

export const useCreateExpense = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: expenseApi.createExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
};

export const useUpdateExpense = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateExpenseData }) =>
      expenseApi.updateExpense(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense', id] });
    },
  });
};

export const useDeleteExpense = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: expenseApi.deleteExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
    },
  });
};

export const useSubmitExpense = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: expenseApi.submitExpense,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense', id] });
    },
  });
};

export const useApproveExpense = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      expenseApi.approveExpense(id, notes),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense', id] });
    },
  });
};

export const useRejectExpense = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      expenseApi.rejectExpense(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense', id] });
    },
  });
};

export const useMarkAsPaid = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: expenseApi.markAsPaid,
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expense', id] });
    },
  });
};

export const useExpensesByCategory = (startDate?: string, endDate?: string) => {
  return useQuery({
    queryKey: ['expenses-by-category', startDate, endDate],
    queryFn: () => expenseApi.getExpensesByCategory(startDate, endDate),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const useExpensesByMonth = (year: number) => {
  return useQuery({
    queryKey: ['expenses-by-month', year],
    queryFn: () => expenseApi.getExpensesByMonth(year),
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
};

export const useExpensesSummary = (filter: ExpenseFilter = {}) => {
  return useQuery({
    queryKey: ['expenses-summary', filter],
    queryFn: () => expenseApi.getExpensesSummary(filter),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};