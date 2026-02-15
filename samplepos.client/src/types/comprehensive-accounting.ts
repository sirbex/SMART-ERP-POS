/**
 * Comprehensive Accounting Types
 * 
 * Types for the comprehensive accounting system matching the backend C# models.
 * Integrates with existing invoice and customer systems.
 */

import Decimal from 'decimal.js';

/**
 * Comprehensive Invoice (matches C# Invoice model)
 */
export interface ComprehensiveInvoice {
    id: string;
    invoiceNumber: string;
    customerId: string;
    customerName: string;
    saleId?: string;
    invoiceDate: string;
    dueDate?: string;
    subtotal: string | Decimal;
    taxAmount: string | Decimal;
    totalAmount: string | Decimal;
    amountPaid: string | Decimal;
    outstandingBalance: string | Decimal;
    status: 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
    notes?: string;
    createdAt: string;
    updatedAt: string;

    // Navigation properties
    lineItems?: InvoiceLineItem[];
    paymentAllocations?: PaymentAllocation[];
}

/**
 * Invoice Line Item (matches C# InvoiceLineItem model)
 */
export interface InvoiceLineItem {
    id: string;
    invoiceId: string;
    productId: string;
    productName: string;
    productSku: string;
    description?: string;
    quantity: string | Decimal;
    unitPrice: string | Decimal;
    totalPrice: string | Decimal;
    taxAmount: string | Decimal;
    createdAt: string;
    updatedAt: string;
}

/**
 * Customer Payment (matches C# CustomerPayment model)
 */
export interface CustomerPayment {
    id: string;
    paymentNumber: string;
    customerId: string;
    customerName: string;
    paymentDate: string;
    amount: string | Decimal;
    paymentMethod: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'OTHER';
    reference?: string;
    allocatedAmount: string | Decimal;
    unallocatedAmount: string | Decimal;
    notes?: string;
    createdAt: string;
    updatedAt: string;

    // Navigation properties
    allocations?: PaymentAllocation[];
}

/**
 * Payment Allocation (matches C# PaymentAllocation model)
 */
export interface PaymentAllocation {
    id: string;
    customerPaymentId: string;
    invoiceId: string;
    invoiceNumber: string;
    allocationAmount: string | Decimal;
    createdAt: string;
    updatedAt: string;

    // Navigation properties
    customerPayment?: CustomerPayment;
    invoice?: ComprehensiveInvoice;
}

/**
 * Supplier (matches C# Supplier model from comprehensive system)
 */
export interface ComprehensiveSupplier {
    id: string;
    supplierNumber: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    contactPerson?: string;
    paymentTerms: string | number;
    creditLimit?: string | number;
    outstandingBalance?: string | number;
    taxId?: string;
    notes?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;

    // Navigation properties
    invoices?: SupplierInvoice[];
    payments?: SupplierPayment[];
}

/**
 * Supplier Invoice (matches C# SupplierInvoice model)
 */
export interface SupplierInvoice {
    id: string;
    invoiceNumber: string;
    supplierInvoiceNumber: string;
    supplierId: string;
    supplierName: string;
    invoiceDate: string;
    dueDate?: string;
    subtotal: string | Decimal;
    taxAmount: string | Decimal;
    totalAmount: string | Decimal;
    amountPaid: string | Decimal;
    outstandingBalance: string | Decimal;
    status: 'PENDING' | 'APPROVED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
    notes?: string;
    createdAt: string;
    updatedAt: string;

    // Navigation properties
    lineItems?: SupplierInvoiceLineItem[];
    paymentAllocations?: SupplierPaymentAllocation[];
}

/**
 * Supplier Invoice Line Item (matches C# SupplierInvoiceLineItem model)
 */
export interface SupplierInvoiceLineItem {
    id: string;
    supplierInvoiceId: string;
    productId?: string;
    productName: string;
    productSku?: string;
    description?: string;
    quantity: string | Decimal;
    unitPrice: string | Decimal;
    totalPrice: string | Decimal;
    taxAmount: string | Decimal;
    createdAt: string;
    updatedAt: string;
}

/**
 * Supplier Payment (matches C# SupplierPayment model)
 */
export interface SupplierPayment {
    id: string;
    paymentNumber: string;
    supplierId: string;
    supplierName: string;
    paymentDate: string;
    amount: string | Decimal;
    paymentMethod: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CHECK' | 'OTHER';
    reference?: string;
    allocatedAmount: string | Decimal;
    unallocatedAmount: string | Decimal;
    notes?: string;
    createdAt: string;
    updatedAt: string;

    // Navigation properties
    allocations?: SupplierPaymentAllocation[];
}

/**
 * Supplier Payment Allocation (matches C# SupplierPaymentAllocation model)
 */
export interface SupplierPaymentAllocation {
    id: string;
    supplierPaymentId: string;
    supplierInvoiceId: string;
    supplierInvoiceNumber: string;
    allocationAmount: string | Decimal;
    createdAt: string;
    updatedAt: string;

    // Navigation properties
    supplierPayment?: SupplierPayment;
    supplierInvoice?: SupplierInvoice;
}

/**
 * Customer Aging Report
 */
export interface CustomerAgingReport {
    customerId: string;
    customerName: string;
    current: string | Decimal;
    days30: string | Decimal;
    days60: string | Decimal;
    days90: string | Decimal;
    over90: string | Decimal;
    totalOutstanding: string | Decimal;
    overdueAmount: string | Decimal;
}

/**
 * Supplier Aging Report
 */
export interface SupplierAgingReport {
    supplierId: string;
    supplierName: string;
    current: string | Decimal;
    days30: string | Decimal;
    days60: string | Decimal;
    days90: string | Decimal;
    over90: string | Decimal;
    totalOutstanding: string | Decimal;
    overdueAmount: string | Decimal;
}

/**
 * DTOs for API requests
 */
export interface CreateCustomerPaymentRequest {
    customerId: string;
    amount: string | number;
    paymentMethod: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'OTHER';
    reference?: string;
    paymentDate: string;
    notes?: string;
    // Optional: specify invoice allocations
    allocations?: {
        invoiceId: string;
        amount: string | number;
    }[];
}

export interface CreateSupplierPaymentRequest {
    supplierId: string;
    amount: string | number;
    paymentMethod: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CHECK' | 'OTHER';
    reference?: string;
    paymentDate: string;
    notes?: string;
    // Optional: specify invoice allocations
    allocations?: {
        supplierInvoiceId: string;
        amount: string | number;
    }[];
}

export interface CreateInvoiceRequest {
    customerId: string;
    saleId?: string;
    dueDate?: string;
    notes?: string;
    lineItems: {
        productId: string;
        quantity: string | number;
        unitPrice: string | number;
        description?: string;
    }[];
}

export interface CreateSupplierInvoiceRequest {
    supplierId: string;
    supplierInvoiceNumber: string;
    invoiceDate: string;
    dueDate?: string;
    notes?: string;
    lineItems: {
        productId?: string;
        productName: string;
        productSku?: string;
        description?: string;
        quantity: string | number;
        unitPrice: string | number;
    }[];
}

/**
 * Payment method options
 */
export const CUSTOMER_PAYMENT_METHODS = [
    { value: 'CASH', label: 'Cash' },
    { value: 'CARD', label: 'Card' },
    { value: 'MOBILE_MONEY', label: 'Mobile Money' },
    { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
    { value: 'OTHER', label: 'Other' }
] as const;

export const SUPPLIER_PAYMENT_METHODS = [
    { value: 'CASH', label: 'Cash' },
    { value: 'CARD', label: 'Card' },
    { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
    { value: 'CHECK', label: 'Check' },
    { value: 'OTHER', label: 'Other' }
] as const;

/**
 * Invoice status options
 */
export const INVOICE_STATUSES = [
    { value: 'DRAFT', label: 'Draft', color: 'bg-gray-100 text-gray-800' },
    { value: 'ISSUED', label: 'Issued', color: 'bg-blue-100 text-blue-800' },
    { value: 'PARTIALLY_PAID', label: 'Partially Paid', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'PAID', label: 'Paid', color: 'bg-green-100 text-green-800' },
    { value: 'CANCELLED', label: 'Cancelled', color: 'bg-red-100 text-red-800' }
] as const;

/**
 * Supplier invoice status options
 */
export const SUPPLIER_INVOICE_STATUSES = [
    { value: 'PENDING', label: 'Pending', color: 'bg-gray-100 text-gray-800' },
    { value: 'APPROVED', label: 'Approved', color: 'bg-blue-100 text-blue-800' },
    { value: 'PARTIALLY_PAID', label: 'Partially Paid', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'PAID', label: 'Paid', color: 'bg-green-100 text-green-800' },
    { value: 'CANCELLED', label: 'Cancelled', color: 'bg-red-100 text-red-800' }
] as const;

/**
 * Supplier Payment Receipt - Returned after creating a payment with auto-allocation
 */
export interface SupplierPaymentReceipt {
    payment: {
        id: string;
        paymentNumber: string;
        paymentDate: string;
        paymentMethod: string;
        reference: string | null;
        notes: string | null;
        amount: number;
        allocatedAmount: number;
        unallocatedAmount: number;
    };
    supplier: {
        id: string;
        name: string;
        contactPerson: string | null;
        email: string | null;
        phone: string | null;
    };
    allocations: Array<{
        invoiceId: string;
        invoiceNumber: string;
        supplierInvoiceRef?: string | null;
        invoiceDate?: string | null;
        dueDate?: string | null;
        invoiceTotal: number;
        previouslyPaid: number;
        allocationAmount: number;
        newOutstanding: number;
        status: string;
        lineItems?: Array<{
            productName: string;
            description: string | null;
            quantity: number;
            unitCost: number;
            lineTotal: number;
            unitOfMeasure: string | null;
        }>;
    }>;
    summary: {
        totalPayment: number;
        totalAllocated: number;
        unallocatedBalance: number;
        invoicesPaid: number;
        invoicesPartiallyPaid: number;
        totalInvoicesAffected: number;
    };
    metadata: {
        createdAt: string;
        createdBy: string;
        receiptType: string;
    };
}