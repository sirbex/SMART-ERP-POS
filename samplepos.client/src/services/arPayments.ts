import { api } from '../utils/api';

export interface ArCustomerPayment {
  id: string;
  paymentNumber: string;
  customerId: string;
  customerName?: string;
  paymentDate: string;
  paymentMethod: string;
  totalAmount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  status: string;
  reference: string | null;
  notes: string | null;
  createdById?: string | null;
  createdByName?: string | null;
}

export interface ArOpenInvoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  amountDue: number;
  status: string;
  documentType: string;
}

export interface ArPaymentAllocation {
  id: string;
  paymentId: string;
  invoiceId: string;
  amountAllocated: number;
  allocationType: string;
  status: string;
  allocationDate: string;
}

export const arPaymentService = {
  async list(params?: { customerId?: string; search?: string }) {
    const { data } = await api.get<{ success: boolean; data: ArCustomerPayment[] }>('/ar-payments', {
      params,
    });
    return data.data ?? [];
  },

  async getOpenInvoices(customerId: string) {
    const { data } = await api.get<{ success: boolean; data: ArOpenInvoice[] }>(
      `/ar-payments/customer/${customerId}/open-invoices`,
    );
    return data.data ?? [];
  },

  async getPayment(paymentId: string) {
    const { data } = await api.get<{
      success: boolean;
      data: { payment: ArCustomerPayment; allocations: ArPaymentAllocation[] };
    }>(`/ar-payments/${paymentId}`);
    return data.data;
  },

  async createPayment(body: {
    customerId: string;
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    reference?: string;
    notes?: string;
    autoAllocate?: boolean;
    allocationType?: 'MANUAL' | 'FIFO' | 'EXACT' | 'DUE_DATE';
    allocations?: { invoiceId: string; amount: number }[];
  }) {
    const { data } = await api.post<{ success: boolean; data: unknown }>('/ar-payments', body);
    return data;
  },

  async allocatePayment(
    paymentId: string,
    allocations: { invoiceId: string; amount: number }[],
    allocationType: 'MANUAL' | 'FIFO' = 'MANUAL',
  ) {
    const { data } = await api.post<{ success: boolean; data: unknown }>(
      `/ar-payments/${paymentId}/allocate`,
      { allocations, allocationType: allocationType === 'FIFO' ? 'FIFO' : 'MANUAL' },
    );
    return data;
  },

  async reverseAllocation(allocationId: string) {
    const { data } = await api.post<{ success: boolean; data: unknown }>(
      `/ar-payments/allocations/${allocationId}/reverse`,
    );
    return data;
  },
};
