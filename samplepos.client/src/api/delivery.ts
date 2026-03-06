/**
 * Delivery API Client
 * API methods for delivery tracking and management
 */

import apiClient from '../utils/api';
import type {
  DeliveryOrder,
  DeliveryRoute,
  CreateDeliveryOrderRequest,
  UpdateDeliveryStatusRequest,
  CreateDeliveryRouteRequest,
  DeliveryOrderQuery,
  DeliveryRouteQuery,
} from '@shared/types/delivery';

export interface DeliveryOrderListResponse {
  orders: DeliveryOrder[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface DeliveryRouteListResponse {
  routes: DeliveryRoute[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface DeliveryAnalytics {
  totalDeliveries: number;
  completedDeliveries: number;
  failedDeliveries: number;
  pendingDeliveries: number;
  inTransitDeliveries: number;
  averageDeliveryTime?: number;
  deliverySuccessRate: number;
  totalRevenue: number;
  totalCost: number;
}

const deliveryApi = {
  // ── Delivery Orders ──────────────────────────────────────

  async createOrder(data: CreateDeliveryOrderRequest): Promise<DeliveryOrder> {
    const response = await apiClient.post('/delivery/orders', data);
    return response.data.data;
  },

  async getOrder(identifier: string): Promise<DeliveryOrder> {
    const response = await apiClient.get(`/delivery/orders/${identifier}`);
    return response.data.data;
  },

  async searchOrders(query?: DeliveryOrderQuery): Promise<DeliveryOrderListResponse> {
    const response = await apiClient.get('/delivery/orders', { params: query });
    return {
      orders: response.data.data || [],
      pagination: response.data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 },
    };
  },

  async updateStatus(identifier: string, data: UpdateDeliveryStatusRequest): Promise<DeliveryOrder> {
    const response = await apiClient.patch(`/delivery/orders/${identifier}/status`, data);
    return response.data.data;
  },

  async assignDriver(orderId: string, driverId: string): Promise<DeliveryOrder> {
    const response = await apiClient.post(`/delivery/orders/${orderId}/assign-driver`, { driverId });
    return response.data.data;
  },

  // ── Tracking ─────────────────────────────────────────────

  async trackDelivery(trackingNumber: string): Promise<DeliveryOrder> {
    const response = await apiClient.get(`/delivery/track/${trackingNumber}`);
    return response.data.data;
  },

  // ── Delivery Routes ──────────────────────────────────────

  async createRoute(data: CreateDeliveryRouteRequest): Promise<DeliveryRoute> {
    const response = await apiClient.post('/delivery/routes', data);
    return response.data.data;
  },

  async getRoute(id: string): Promise<DeliveryRoute> {
    const response = await apiClient.get(`/delivery/routes/${id}`);
    return response.data.data;
  },

  async searchRoutes(query?: DeliveryRouteQuery): Promise<DeliveryRouteListResponse> {
    const response = await apiClient.get('/delivery/routes', { params: query });
    return {
      routes: response.data.data || [],
      pagination: response.data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 },
    };
  },

  // ── Analytics ────────────────────────────────────────────

  async getAnalytics(dateFrom?: string, dateTo?: string): Promise<DeliveryAnalytics> {
    const response = await apiClient.get('/delivery/analytics/summary', {
      params: { dateFrom, dateTo },
    });
    return response.data.data;
  },

  // ── Tally-Style: Create from Sale ─────────────────────

  async getDeliverableSales(search?: string): Promise<DeliverableSale[]> {
    const response = await apiClient.get('/delivery/deliverable-sales', {
      params: search ? { search } : {},
    });
    return response.data.data || [];
  },

  async createOrderFromSale(saleId: string, data: {
    deliveryAddress: string;
    deliveryContactName?: string;
    deliveryContactPhone?: string;
    specialInstructions?: string;
    deliveryFee?: number;
    deliveryDate?: string;
  }): Promise<DeliveryOrder> {
    const response = await apiClient.post(`/delivery/orders/from-sale/${saleId}`, data);
    return response.data.data;
  },
};

export interface DeliverableSale {
  id: string;
  sale_number: string;
  sale_date: string;
  total_amount: string;
  payment_method: string;
  customer_id: string;
  customer_name: string;
  customer_phone?: string;
  customer_address?: string;
  item_count: string;
}

export default deliveryApi;
