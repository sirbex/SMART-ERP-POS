/**
 * Comprehensive Accounting API Service
 * 
 * API client methods for interacting with the comprehensive accounting system.
 * Integrates with existing system through proper API routing.
 * 
 * NOTE: Supplier-related APIs use Node.js backend directly (not C# proxy)
 */

import { api } from './api';

// Use the main API instance with /accounting/comprehensive prefix for Node.js proxy (C# API)
const comprehensiveApi = {
    get: (url: string, config?: any) => api.get(`/accounting/comprehensive${url}`, config),
    post: (url: string, data?: any, config?: any) => api.post(`/accounting/comprehensive${url}`, data, config),
    put: (url: string, data?: any, config?: any) => api.put(`/accounting/comprehensive${url}`, data, config),
    patch: (url: string, data?: any, config?: any) => api.patch(`/accounting/comprehensive${url}`, data, config),
    delete: (url: string, config?: any) => api.delete(`/accounting/comprehensive${url}`, config)
};

// Direct Node.js API for supplier-related operations
const supplierApi = {
    get: (url: string, config?: any) => api.get(`/supplier-payments${url}`, config),
    post: (url: string, data?: any, config?: any) => api.post(`/supplier-payments${url}`, data, config),
    put: (url: string, data?: any, config?: any) => api.put(`/supplier-payments${url}`, data, config),
    delete: (url: string, config?: any) => api.delete(`/supplier-payments${url}`, config)
};

// Direct Node.js API for suppliers list
const suppliersApi = {
    get: (url: string, config?: any) => api.get(`/suppliers${url}`, config),
    post: (url: string, data?: any, config?: any) => api.post(`/suppliers${url}`, data, config),
    put: (url: string, data?: any, config?: any) => api.put(`/suppliers${url}`, data, config),
    delete: (url: string, config?: any) => api.delete(`/suppliers${url}`, config)
};
import type {
    ComprehensiveInvoice,
    CustomerPayment,
    PaymentAllocation,
    ComprehensiveSupplier,
    SupplierInvoice,
    SupplierPayment,
    SupplierPaymentAllocation,
    CustomerAgingReport,
    SupplierAgingReport,
    CreateCustomerPaymentRequest,
    CreateSupplierPaymentRequest,
    CreateInvoiceRequest,
    CreateSupplierInvoiceRequest,
    SupplierPaymentReceipt
} from '../types/comprehensive-accounting';
import type { ApiResponse, PaginatedResponse } from '../types/api';

/**
 * Invoice Management
 */
export const comprehensiveInvoiceService = {
    // Get all customer invoices with pagination
    async getCustomerInvoices(params?: {
        page?: number;
        limit?: number;
        customerId?: string;
        status?: string;
        search?: string;
    }): Promise<PaginatedResponse<ComprehensiveInvoice>> {
        const response = await comprehensiveApi.get('/invoices', { params });
        return response.data;
    },

    // Get invoice by ID
    async getInvoice(id: string): Promise<ApiResponse<ComprehensiveInvoice>> {
        const response = await comprehensiveApi.get(`/invoices/${id}`);
        return response.data;
    },

    // Create new invoice
    async createInvoice(data: CreateInvoiceRequest): Promise<ApiResponse<ComprehensiveInvoice>> {
        const response = await comprehensiveApi.post('/invoices', data);
        return response.data;
    },

    // Update invoice
    async updateInvoice(id: string, data: Partial<CreateInvoiceRequest>): Promise<ApiResponse<ComprehensiveInvoice>> {
        const response = await comprehensiveApi.put(`/invoices/${id}`, data);
        return response.data;
    },

    // Void invoice
    async voidInvoice(id: string): Promise<ApiResponse<ComprehensiveInvoice>> {
        const response = await comprehensiveApi.patch(`/invoices/${id}/void`);
        return response.data;
    },

    // Get customer aging report - uses reports module, not C# API
    async getCustomerAging(): Promise<ApiResponse<CustomerAgingReport[]>> {
        const response = await api.get('/reports/customer-aging');
        // The reports API returns { success: true, data: { data: [...] } }
        if (response.data?.success && response.data?.data?.data) {
            return { success: true, data: response.data.data.data };
        }
        return response.data;
    }
};

/**
 * Customer Payment Management
 */
export const customerPaymentService = {
    // Get all customer payments
    async getCustomerPayments(params?: {
        page?: number;
        limit?: number;
        customerId?: string;
        paymentMethod?: string;
        search?: string;
    }): Promise<PaginatedResponse<CustomerPayment>> {
        const response = await comprehensiveApi.get('/customer-payments', { params });
        return response.data;
    },

    // Get payment by ID
    async getCustomerPayment(id: string): Promise<ApiResponse<CustomerPayment>> {
        const response = await comprehensiveApi.get(`/customer-payments/${id}`);
        return response.data;
    },

    // Create customer payment
    async createCustomerPayment(data: CreateCustomerPaymentRequest): Promise<ApiResponse<CustomerPayment>> {
        const response = await comprehensiveApi.post('/customer-payments', data);
        return response.data;
    },

    // Update customer payment
    async updateCustomerPayment(id: string, data: Partial<CreateCustomerPaymentRequest>): Promise<ApiResponse<CustomerPayment>> {
        const response = await comprehensiveApi.put(`/customer-payments/${id}`, data);
        return response.data;
    },

    // Delete customer payment
    async deleteCustomerPayment(id: string): Promise<ApiResponse<void>> {
        const response = await comprehensiveApi.delete(`/customer-payments/${id}`);
        return response.data;
    },

    // Get unallocated customer payments
    async getUnallocatedPayments(customerId?: string): Promise<ApiResponse<CustomerPayment[]>> {
        const response = await comprehensiveApi.get('/customer-payments/unallocated', {
            params: customerId ? { customerId } : undefined
        });
        return response.data;
    },

    // Get customer's outstanding invoices
    async getOutstandingInvoices(customerId: string): Promise<ApiResponse<ComprehensiveInvoice[]>> {
        const response = await comprehensiveApi.get(`/customers/${customerId}/outstanding-invoices`);
        return response.data;
    }
};

/**
 * Payment Allocation Management
 */
export const paymentAllocationService = {
    // Allocate payment to invoice
    async allocatePayment(data: {
        customerPaymentId: string;
        invoiceId: string;
        amount: number;
    }): Promise<ApiResponse<PaymentAllocation>> {
        const response = await comprehensiveApi.post('/payment-allocations', data);
        return response.data;
    },

    // Remove payment allocation
    async removeAllocation(id: string): Promise<ApiResponse<void>> {
        const response = await comprehensiveApi.delete(`/payment-allocations/${id}`);
        return response.data;
    },

    // Get payment allocations for a payment
    async getPaymentAllocations(paymentId: string): Promise<ApiResponse<PaymentAllocation[]>> {
        const response = await comprehensiveApi.get(`/customer-payments/${paymentId}/allocations`);
        return response.data;
    },

    // Auto-allocate payment (let system decide allocation)
    async autoAllocatePayment(paymentId: string): Promise<ApiResponse<PaymentAllocation[]>> {
        const response = await comprehensiveApi.post(`/customer-payments/${paymentId}/auto-allocate`);
        return response.data;
    }
};

/**
 * Supplier Management - Uses Node.js backend directly
 */
export const comprehensiveSupplierService = {
    // Get all suppliers
    async getSuppliers(params?: {
        page?: number;
        limit?: number;
        search?: string;
        isActive?: boolean;
    }): Promise<PaginatedResponse<ComprehensiveSupplier>> {
        const response = await suppliersApi.get('', { params });
        // Transform response to match expected format
        const data = response.data;
        const pagination = data.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 };
        return {
            items: data.data || [],
            total: pagination.total,
            page: pagination.page,
            limit: pagination.limit,
            totalPages: pagination.totalPages
        };
    },

    // Get supplier by ID
    async getSupplier(id: string): Promise<ApiResponse<ComprehensiveSupplier>> {
        const response = await suppliersApi.get(`/${id}`);
        return response.data;
    },

    // Create supplier
    async createSupplier(data: {
        name: string;
        email?: string;
        phone?: string;
        address?: string;
        contactPerson?: string;
        paymentTerms: string;
        taxId?: string;
    }): Promise<ApiResponse<ComprehensiveSupplier>> {
        const response = await suppliersApi.post('', data);
        return response.data;
    },

    // Update supplier
    async updateSupplier(id: string, data: Partial<ComprehensiveSupplier>): Promise<ApiResponse<ComprehensiveSupplier>> {
        const response = await suppliersApi.put(`/${id}`, data);
        return response.data;
    },

    // Deactivate supplier
    async deactivateSupplier(id: string): Promise<ApiResponse<ComprehensiveSupplier>> {
        const response = await suppliersApi.delete(`/${id}`);
        return response.data;
    },

    // Get supplier aging report (still uses C# for complex accounting)
    async getSupplierAging(): Promise<ApiResponse<SupplierAgingReport[]>> {
        const response = await comprehensiveApi.get('/supplier-aging');
        return response.data;
    }
};

/**
 * Supplier Invoice Management - Uses Node.js backend directly
 */
export const supplierInvoiceService = {
    // Get all supplier invoices
    async getSupplierInvoices(params?: {
        page?: number;
        limit?: number;
        supplierId?: string;
        status?: string;
        search?: string;
    }): Promise<PaginatedResponse<SupplierInvoice>> {
        const response = await supplierApi.get('/invoices', { params });
        const data = response.data;
        const pagination = data.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 };
        return {
            items: data.items || [],
            total: pagination.total,
            page: pagination.page,
            limit: pagination.limit,
            totalPages: pagination.totalPages
        };
    },

    // Get supplier invoice by ID
    async getSupplierInvoice(id: string): Promise<ApiResponse<SupplierInvoice>> {
        const response = await supplierApi.get(`/invoices/${id}`);
        return response.data;
    },

    // Create supplier invoice
    async createSupplierInvoice(data: CreateSupplierInvoiceRequest): Promise<ApiResponse<SupplierInvoice>> {
        const response = await supplierApi.post('/invoices', data);
        return response.data;
    },

    // Update supplier invoice
    async updateSupplierInvoice(id: string, data: Partial<CreateSupplierInvoiceRequest>): Promise<ApiResponse<SupplierInvoice>> {
        const response = await supplierApi.put(`/invoices/${id}`, data);
        return response.data;
    },

    // Delete supplier invoice
    async deleteSupplierInvoice(id: string): Promise<ApiResponse<SupplierInvoice>> {
        const response = await supplierApi.delete(`/invoices/${id}`);
        return response.data;
    }
};

/**
 * Supplier Payment Management - Uses Node.js backend directly
 */
export const supplierPaymentService = {
    // Get all supplier payments
    async getSupplierPayments(params?: {
        page?: number;
        limit?: number;
        supplierId?: string;
        paymentMethod?: string;
        search?: string;
    }): Promise<PaginatedResponse<SupplierPayment>> {
        const response = await supplierApi.get('/payments', { params });
        const data = response.data;
        const pagination = data.pagination || { page: 1, limit: 50, total: 0, totalPages: 0 };
        return {
            items: data.items || [],
            total: pagination.total,
            page: pagination.page,
            limit: pagination.limit,
            totalPages: pagination.totalPages
        };
    },

    // Get supplier payment by ID
    async getSupplierPayment(id: string): Promise<ApiResponse<SupplierPayment>> {
        const response = await supplierApi.get(`/payments/${id}`);
        return response.data;
    },

    // Create supplier payment - returns receipt with allocation details
    async createSupplierPayment(data: CreateSupplierPaymentRequest): Promise<ApiResponse<SupplierPaymentReceipt>> {
        const response = await supplierApi.post('/payments', data);
        return response.data;
    },

    // Update supplier payment
    async updateSupplierPayment(id: string, data: Partial<CreateSupplierPaymentRequest>): Promise<ApiResponse<SupplierPayment>> {
        const response = await supplierApi.put(`/payments/${id}`, data);
        return response.data;
    },

    // Delete supplier payment
    async deleteSupplierPayment(id: string): Promise<ApiResponse<void>> {
        const response = await supplierApi.delete(`/payments/${id}`);
        return response.data;
    },

    // Get supplier's outstanding invoices
    async getOutstandingInvoices(supplierId: string): Promise<ApiResponse<SupplierInvoice[]>> {
        const response = await supplierApi.get(`/suppliers/${supplierId}/outstanding-invoices`);
        return response.data;
    },

    // Auto-allocate supplier payment
    async autoAllocatePayment(paymentId: string): Promise<ApiResponse<SupplierPaymentAllocation[]>> {
        const response = await supplierApi.post(`/payments/${paymentId}/auto-allocate`);
        return response.data;
    }
};

/**
 * Supplier Payment Allocation Management - Uses Node.js backend directly
 */
export const supplierPaymentAllocationService = {
    // Allocate supplier payment to invoice
    async allocatePayment(data: {
        supplierPaymentId: string;
        supplierInvoiceId: string;
        amount: number;
    }): Promise<ApiResponse<SupplierPaymentAllocation>> {
        const response = await supplierApi.post('/allocations', data);
        return response.data;
    },

    // Remove supplier payment allocation
    async removeAllocation(id: string): Promise<ApiResponse<void>> {
        const response = await supplierApi.delete(`/allocations/${id}`);
        return response.data;
    },

    // Get supplier payment allocations
    async getPaymentAllocations(paymentId: string): Promise<ApiResponse<SupplierPaymentAllocation[]>> {
        const response = await supplierApi.get(`/payments/${paymentId}/allocations`);
        return response.data;
    }
};