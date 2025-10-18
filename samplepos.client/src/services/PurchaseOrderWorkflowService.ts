/**
 * Enhanced Purchase Order Workflow Service
 * Integrates with the backend workflow API for automatic order progression
 */

import api from '../config/api.config';
import type { PurchaseOrder } from '../models/BatchInventory';

export interface OrderWorkflowResponse {
  success: boolean;
  message: string;
  order?: PurchaseOrder;
  emailSent?: boolean;
  confirmationUrl?: string;
  tracking?: DeliveryTracking[];
}

export interface DeliveryTracking {
  id: string;
  purchaseOrderId: string;
  status: string;
  timestamp: string;
  description: string;
  location: string;
  estimatedDelivery?: string;
}

class PurchaseOrderWorkflowService {
  private static instance: PurchaseOrderWorkflowService;

  private constructor() {}

  static getInstance(): PurchaseOrderWorkflowService {
    if (!PurchaseOrderWorkflowService.instance) {
      PurchaseOrderWorkflowService.instance = new PurchaseOrderWorkflowService();
    }
    return PurchaseOrderWorkflowService.instance;
  }

  /**
   * Send purchase order internally for processing
   */
  async sendOrderInternally(orderId: string, options?: {
    expectedDeliveryDate?: string;
  }): Promise<OrderWorkflowResponse> {
    try {
      const response = await api.post(`/purchase-workflow/orders/${orderId}/send`, {
        expectedDeliveryDate: options?.expectedDeliveryDate
      });

      return response.data;
    } catch (error: any) {
      console.error('Error sending order:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to send order'
      };
    }
  }

  /**
   * Get order details for manual confirmation
   */
  async getOrderDetails(orderId: string): Promise<OrderWorkflowResponse> {
    try {
      const response = await api.get(`/purchase-workflow/orders/${orderId}/details`);
      return response.data;
    } catch (error: any) {
      console.error('Error getting order details:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to get order details'
      };
    }
  }

  /**
   * Manually confirm order reception
   */
  async confirmOrderManually(orderId: string, confirmedBy: string, notes?: string): Promise<OrderWorkflowResponse> {
    try {
      const response = await api.post(`/purchase-workflow/orders/${orderId}/confirm`, {
        confirmedBy,
        notes
      });

      return response.data;
    } catch (error: any) {
      console.error('Error confirming order:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to confirm order'
      };
    }
  }

  /**
   * Get orders with enhanced workflow information
   */
  async getOrdersWithWorkflow(): Promise<PurchaseOrder[]> {
    try {
      const response = await api.get('/purchase-workflow/orders');
      return response.data.orders || [];
    } catch (error) {
      console.error('Error fetching orders with workflow:', error);
      return [];
    }
  }

  /**
   * Get delivery tracking information for an order
   */
  async getOrderTracking(orderId: string): Promise<DeliveryTracking[]> {
    try {
      const response = await api.get(`/purchase-workflow/orders/${orderId}/tracking`);
      return response.data.tracking || [];
    } catch (error) {
      console.error('Error fetching order tracking:', error);
      return [];
    }
  }

  /**
   * Update delivery status (for delivery services)
   */
  async updateDeliveryStatus(
    orderId: string, 
    status: string, 
    location?: string, 
    description?: string, 
    estimatedDelivery?: string
  ): Promise<OrderWorkflowResponse> {
    try {
      const response = await api.post(`/purchase-workflow/orders/${orderId}/delivery-update`, {
        status,
        location,
        description,
        estimatedDelivery
      });

      return response.data;
    } catch (error: any) {
      console.error('Error updating delivery status:', error);
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to update delivery status'
      };
    }
  }

  /**
   * Check if order can be sent (has supplier email, etc.)
   */
  canSendOrder(order: PurchaseOrder): { canSend: boolean; reason?: string } {
    if (order.status !== 'draft') {
      return { canSend: false, reason: 'Order is not in draft status' };
    }

    if (!order.items || order.items.length === 0) {
      return { canSend: false, reason: 'Order has no items' };
    }

    if (!order.supplierId) {
      return { canSend: false, reason: 'No supplier selected' };
    }

    return { canSend: true };
  }

  /**
   * Get order status display information
   */
  getStatusInfo(order: PurchaseOrder & { deliveryStatus?: string }): {
    display: string;
    color: 'default' | 'destructive' | 'secondary' | 'outline';
    description: string;
  } {
    const statusMap = {
      draft: {
        display: 'DRAFT',
        color: 'secondary' as const,
        description: 'Order is being prepared'
      },
      sent: {
        display: 'SENT',
        color: 'outline' as const,
        description: 'Order sent to supplier, awaiting confirmation'
      },
      confirmed: {
        display: 'CONFIRMED',
        color: 'default' as const,
        description: 'Supplier confirmed order, ready for receiving'
      },
      partial: {
        display: 'PARTIAL',
        color: 'destructive' as const,
        description: 'Partially received, some items pending'
      },
      received: {
        display: 'RECEIVED',
        color: 'default' as const,
        description: 'All items received successfully'
      },
      cancelled: {
        display: 'CANCELLED',
        color: 'secondary' as const,
        description: 'Order was cancelled'
      }
    };

    return statusMap[order.status] || statusMap.draft;
  }

  /**
   * Get delivery status display information
   */
  getDeliveryStatusInfo(deliveryStatus?: string): {
    display: string;
    color: string;
    icon: string;
  } {
    const statusMap: Record<string, any> = {
      pending: { display: 'Pending', color: '#6c757d', icon: '⏳' },
      order_sent: { display: 'Order Sent', color: '#007bff', icon: '📤' },
      confirmed: { display: 'Confirmed', color: '#28a745', icon: '✅' },
      preparing: { display: 'Preparing', color: '#ffc107', icon: '📦' },
      in_transit: { display: 'In Transit', color: '#17a2b8', icon: '🚚' },
      delivered: { display: 'Delivered', color: '#28a745', icon: '📥' },
      delayed: { display: 'Delayed', color: '#dc3545', icon: '⚠️' }
    };

    return statusMap[deliveryStatus || 'pending'] || statusMap.pending;
  }

  /**
   * Simulate supplier confirmation (for testing)
   */
  async simulateSupplierConfirmation(orderId: string): Promise<boolean> {
    try {
      // This would normally be done by the supplier clicking the email link
      await api.get(`/purchase-workflow/confirm/${orderId}?token=demo-token`);
      return true;
    } catch (error) {
      console.error('Error simulating supplier confirmation:', error);
      return false;
    }
  }
}

export default PurchaseOrderWorkflowService;