/**
 * Pricing API Client
 * API methods for pricing engine management
 */

import apiClient from '../utils/api';
import type {
  ProductCategory,
  CreateProductCategoryInput,
  UpdateProductCategoryInput,
  CustomerGroupOption,
  PriceRule,
  CreatePriceRuleInput,
  UpdatePriceRuleInput,
  ResolvedPrice,
  BulkPriceResult,
  PriceRuleFilters,
  CategoryFilters,
  PaginationMeta,
} from '../types/pricing';

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export const pricingApi = {
  // ── Customer Groups (read-only) ──────────────────────

  async listCustomerGroups(isActive?: boolean): Promise<CustomerGroupOption[]> {
    const params: Record<string, string> = {};
    if (isActive !== undefined) params.isActive = String(isActive);
    const response = await apiClient.get('/pricing/customer-groups', { params });
    return response.data.data;
  },

  // ── Product Categories ───────────────────────────────

  async listCategories(filters?: CategoryFilters): Promise<PaginatedResponse<ProductCategory>> {
    const response = await apiClient.get('/pricing/categories', { params: filters });
    return { data: response.data.data, pagination: response.data.pagination };
  },

  async getCategoryById(id: string): Promise<ProductCategory> {
    const response = await apiClient.get(`/pricing/categories/${id}`);
    return response.data.data;
  },

  async createCategory(data: CreateProductCategoryInput): Promise<ProductCategory> {
    const response = await apiClient.post('/pricing/categories', data);
    return response.data.data;
  },

  async updateCategory(id: string, data: UpdateProductCategoryInput): Promise<ProductCategory> {
    const response = await apiClient.put(`/pricing/categories/${id}`, data);
    return response.data.data;
  },

  // ── Price Rules ──────────────────────────────────────

  async listRules(filters?: PriceRuleFilters): Promise<PaginatedResponse<PriceRule>> {
    const response = await apiClient.get('/pricing/rules', { params: filters });
    return { data: response.data.data, pagination: response.data.pagination };
  },

  async getRuleById(id: string): Promise<PriceRule> {
    const response = await apiClient.get(`/pricing/rules/${id}`);
    return response.data.data;
  },

  async createRule(data: CreatePriceRuleInput): Promise<PriceRule> {
    const response = await apiClient.post('/pricing/rules', data);
    return response.data.data;
  },

  async updateRule(id: string, data: UpdatePriceRuleInput): Promise<PriceRule> {
    const response = await apiClient.put(`/pricing/rules/${id}`, data);
    return response.data.data;
  },

  async deleteRule(id: string): Promise<void> {
    await apiClient.delete(`/pricing/rules/${id}`);
  },

  // ── Price Calculation ────────────────────────────────

  async calculatePrice(
    productId: string,
    quantity?: number,
    customerId?: string,
    customerGroupId?: string,
  ): Promise<ResolvedPrice> {
    const params: Record<string, string> = { productId };
    if (quantity !== undefined) params.quantity = String(quantity);
    if (customerId) params.customerId = customerId;
    if (customerGroupId) params.customerGroupId = customerGroupId;
    const response = await apiClient.get('/pricing/price', { params });
    return response.data.data;
  },

  async calculateBulkPrices(
    items: Array<{ productId: string; quantity?: number }>,
    customerId?: string,
    customerGroupId?: string,
  ): Promise<BulkPriceResult[]> {
    const response = await apiClient.post('/pricing/price/bulk', {
      items: items.map(i => ({ productId: i.productId, quantity: i.quantity ?? 1 })),
      customerId,
      customerGroupId,
    });
    return response.data.data;
  },
};
