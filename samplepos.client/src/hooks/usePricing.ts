/**
 * React Query hooks for Pricing Engine API
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pricingApi } from '../api/pricing';
import type {
  CreateProductCategoryInput,
  UpdateProductCategoryInput,
  CreatePriceRuleInput,
  UpdatePriceRuleInput,
  PriceRuleFilters,
  CategoryFilters,
} from '../types/pricing';

// ============================================================================
// Query Key Factory
// ============================================================================

export const pricingKeys = {
  all: ['pricing'] as const,

  // Categories
  categories: () => [...pricingKeys.all, 'categories'] as const,
  categoryList: (filters: CategoryFilters) => [...pricingKeys.categories(), 'list', filters] as const,
  categoryDetail: (id: string) => [...pricingKeys.categories(), 'detail', id] as const,

  // Customer Groups
  customerGroups: () => [...pricingKeys.all, 'customerGroups'] as const,

  // Price Rules
  rules: () => [...pricingKeys.all, 'rules'] as const,
  ruleList: (filters: PriceRuleFilters) => [...pricingKeys.rules(), 'list', filters] as const,
  ruleDetail: (id: string) => [...pricingKeys.rules(), 'detail', id] as const,
};

// ============================================================================
// Customer Groups (read-only)
// ============================================================================

export function useCustomerGroups(isActive?: boolean) {
  return useQuery({
    queryKey: [...pricingKeys.customerGroups(), isActive],
    queryFn: () => pricingApi.listCustomerGroups(isActive),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// ============================================================================
// Product Categories
// ============================================================================

export function useCategories(filters: CategoryFilters = {}) {
  return useQuery({
    queryKey: pricingKeys.categoryList(filters),
    queryFn: () => pricingApi.listCategories(filters),
    staleTime: 60000,
  });
}

export function useCategoryDetail(id: string) {
  return useQuery({
    queryKey: pricingKeys.categoryDetail(id),
    queryFn: () => pricingApi.getCategoryById(id),
    enabled: !!id,
    staleTime: 60000,
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProductCategoryInput) => pricingApi.createCategory(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pricingKeys.categories() });
    },
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProductCategoryInput }) =>
      pricingApi.updateCategory(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pricingKeys.categories() });
    },
  });
}

// ============================================================================
// Price Rules
// ============================================================================

export function usePriceRules(filters: PriceRuleFilters = {}) {
  return useQuery({
    queryKey: pricingKeys.ruleList(filters),
    queryFn: () => pricingApi.listRules(filters),
    staleTime: 20000,
  });
}

export function usePriceRuleDetail(id: string) {
  return useQuery({
    queryKey: pricingKeys.ruleDetail(id),
    queryFn: () => pricingApi.getRuleById(id),
    enabled: !!id,
    staleTime: 60000,
  });
}

export function useCreatePriceRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePriceRuleInput) => pricingApi.createRule(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pricingKeys.rules() });
    },
  });
}

export function useUpdatePriceRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePriceRuleInput }) =>
      pricingApi.updateRule(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pricingKeys.rules() });
    },
  });
}

export function useDeletePriceRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pricingApi.deleteRule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pricingKeys.rules() });
    },
  });
}
