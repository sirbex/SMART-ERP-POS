/**
 * Quotation API Client
 * API methods for quotation system
 */

import apiClient from '../utils/api';
import type {
  Quotation,
  QuotationDetail,
  QuotationListResponse,
  CreateQuotationInput,
  CreateQuickQuoteInput,
  UpdateQuotationInput,
  ConvertQuotationInput,
  ConvertQuotationResponse,
  QuotationFilters,
  QuotationStatus,
} from '@shared/types/quotation';

export const quotationApi = {
  /**
   * Create standard quotation
   */
  async createQuotation(data: CreateQuotationInput): Promise<QuotationDetail> {
    const response = await apiClient.post('/quotations', data);
    return response.data.data;
  },

  /**
   * Create quick quote from POS
   */
  async createQuickQuote(data: CreateQuickQuoteInput): Promise<QuotationDetail> {
    const response = await apiClient.post('/pos/quote', data);
    return response.data.data;
  },

  /**
   * List quotations with filters and pagination
   */
  async listQuotations(filters?: QuotationFilters): Promise<QuotationListResponse> {
    const response = await apiClient.get('/quotations', { params: filters });
    return response.data.data;
  },

  /**
   * Get quotation by ID
   */
  async getQuotationById(id: string): Promise<QuotationDetail> {
    const response = await apiClient.get(`/quotations/${id}`);
    return response.data.data;
  },

  /**
   * Get quotation by quote number
   */
  async getQuotationByNumber(quoteNumber: string): Promise<QuotationDetail> {
    const response = await apiClient.get(`/quotations/number/${quoteNumber}`);
    return response.data.data;
  },

  /**
   * Update quotation
   */
  async updateQuotation(id: string, data: UpdateQuotationInput): Promise<Quotation> {
    const response = await apiClient.put(`/quotations/${id}`, data);
    return response.data.data;
  },

  /**
   * Update quotation status
   */
  async updateQuotationStatus(
    id: string,
    status: QuotationStatus,
    notes?: string
  ): Promise<Quotation> {
    const response = await apiClient.put(`/quotations/${id}/status`, { status, notes });
    return response.data.data;
  },

  /**
   * Convert quotation to sale + invoice
   */
  async convertQuotation(
    id: string,
    data: ConvertQuotationInput
  ): Promise<ConvertQuotationResponse> {
    const response = await apiClient.post(`/quotations/${id}/convert`, data);
    return response.data.data;
  },

  /**
   * Delete quotation (DRAFT only)
   */
  async deleteQuotation(id: string): Promise<void> {
    await apiClient.delete(`/quotations/${id}`);
  },

  /**
   * Permanently delete a cancelled quotation (admin only)
   */
  async permanentlyDeleteQuotation(id: string): Promise<void> {
    await apiClient.delete(`/quotations/${id}?permanent=true`);
  },

  /**
   * Update item-level decisions (accept/reject per line)
   */
  async updateItemDecisions(
    quotationId: string,
    decisions: Array<{ itemId: string; status: 'ACCEPTED' | 'REJECTED'; rejectionReason?: string }>
  ): Promise<unknown[]> {
    const response = await apiClient.put(`/quotations/${quotationId}/items/decisions`, { decisions });
    return response.data.data;
  },

  /**
   * Expire overdue quotations (admin trigger)
   */
  async expireOverdue(): Promise<{ expiredCount: number }> {
    const response = await apiClient.post('/quotations/expire');
    return response.data.data;
  },

  /**
   * Load quote items to POS cart (helper for frontend)
   */
  async loadQuoteToPOS(quoteNumber: string): Promise<QuotationDetail> {
    return this.getQuotationByNumber(quoteNumber);
  },
};

export default quotationApi;
