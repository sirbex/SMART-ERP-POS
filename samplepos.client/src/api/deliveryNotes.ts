/**
 * Delivery Notes API Client
 * Wholesale flow: Quotation → Delivery Notes → Invoice
 * Endpoints: /api/delivery-notes/*
 */

import apiClient from '../utils/api';

// ── Types ─────────────────────────────────────────────────

export type DeliveryNoteStatus = 'DRAFT' | 'POSTED';

export interface DeliveryNote {
  id: string;
  deliveryNoteNumber: string;
  quotationId: string;
  customerId: string;
  customerName: string | null;
  status: DeliveryNoteStatus;
  deliveryDate: string;
  warehouseNotes: string | null;
  deliveryAddress: string | null;
  driverName: string | null;
  vehicleNumber: string | null;
  totalAmount: number;
  postedAt: string | null;
  postedById: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryNoteLine {
  id: string;
  deliveryNoteId: string;
  quotationItemId: string;
  productId: string;
  batchId: string | null;
  uomId: string | null;
  uomName: string | null;
  quantityDelivered: number;
  unitPrice: number;
  lineTotal: number;
  unitCost: number | null;
  description: string | null;
  conversionFactor: number | null;
  baseUomName: string | null;
  createdAt: string;
}

export interface DeliveryNoteWithLines extends DeliveryNote {
  lines: DeliveryNoteLine[];
  quotationNumber?: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
}

export interface CreateDeliveryNoteLine {
  quotationItemId: string;
  productId: string;
  batchId?: string | null;
  uomId?: string | null;
  uomName?: string | null;
  quantityDelivered: number;
  unitPrice: number;
  unitCost?: number | null;
  description?: string;
}

export interface CreateDeliveryNoteInput {
  quotationId: string;
  deliveryDate?: string;
  warehouseNotes?: string;
  deliveryAddress?: string;
  driverName?: string;
  vehicleNumber?: string;
  lines: CreateDeliveryNoteLine[];
}

export interface FulfillmentItem {
  quotationItemId: string;
  description: string;
  ordered: number;
  delivered: number;
  remaining: number;
}

export interface FulfillmentStatus {
  quotationId: string;
  items: FulfillmentItem[];
  overallStatus: 'NOT_STARTED' | 'PARTIAL' | 'FULFILLED';
}

export interface DeliveryNoteListItem extends DeliveryNote {
  quotationNumber?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
}

export interface DeliveryNoteListResponse {
  data: DeliveryNoteListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ── API Client ────────────────────────────────────────────

const deliveryNotesApi = {
  async create(data: CreateDeliveryNoteInput): Promise<DeliveryNoteWithLines> {
    const response = await apiClient.post('/delivery-notes', data);
    return response.data.data;
  },

  async post(id: string): Promise<DeliveryNoteWithLines> {
    const response = await apiClient.post(`/delivery-notes/${id}/post`);
    return response.data.data;
  },

  async getById(id: string): Promise<DeliveryNoteWithLines> {
    const response = await apiClient.get(`/delivery-notes/${id}`);
    return response.data.data;
  },

  async getByNumber(dnNumber: string): Promise<DeliveryNoteWithLines> {
    const response = await apiClient.get(`/delivery-notes/number/${dnNumber}`);
    return response.data.data;
  },

  async list(params?: {
    page?: number;
    limit?: number;
    quotationId?: string;
    customerId?: string;
    status?: DeliveryNoteStatus;
  }): Promise<DeliveryNoteListResponse> {
    const response = await apiClient.get('/delivery-notes', { params });
    return response.data.data;
  },

  async getFulfillment(quotationId: string): Promise<FulfillmentStatus> {
    const response = await apiClient.get(`/delivery-notes/quotation/${quotationId}/fulfillment`);
    return response.data.data;
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/delivery-notes/${id}`);
  },

  async createInvoice(id: string): Promise<Record<string, unknown>> {
    const response = await apiClient.post(`/delivery-notes/${id}/invoice`);
    return response.data.data;
  },

  getPdfUrl(id: string): string {
    return `/delivery-notes/${id}/pdf`;
  },
};

export default deliveryNotesApi;
