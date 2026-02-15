using AccountingApi.Models;
using AccountingApi.Services;
using AccountingApi.DTOs;

namespace AccountingApi.Interfaces
{
    public interface IInvoiceService
    {
        Task<Invoice> CreateInvoiceFromSaleAsync(
            Guid saleId,
            Guid customerId, 
            string customerName,
            decimal subtotal,
            decimal taxAmount,
            decimal totalAmount,
            List<InvoiceLineItemRequest> lineItems,
            bool isCreditSale = false,
            string paymentTerms = "DUE_ON_RECEIPT");

        Task<Invoice?> GetInvoiceByIdAsync(Guid invoiceId);
        
        Task<(List<Invoice> invoices, int totalCount)> GetCustomerInvoicesAsync(
            Guid customerId, int page = 1, int pageSize = 20, string status = "ALL");
        
        Task<List<Invoice>> GetOverdueInvoicesAsync();
        
        Task<List<AgingReportItem>> GetAccountsReceivableAgingAsync();
    }

    public interface IPaymentService
    {
        Task<CustomerPayment> ProcessCustomerPaymentAsync(
            Guid customerId,
            string customerName,
            decimal amount,
            string paymentMethod,
            string? reference,
            List<PaymentAllocationRequest>? allocations = null,
            string? notes = null);

        Task AllocatePaymentToInvoicesAsync(CustomerPayment payment, List<PaymentAllocationRequest> allocations);
        
        Task AutoAllocatePaymentAsync(CustomerPayment payment);
        
        Task<CustomerPayment?> GetPaymentByIdAsync(Guid paymentId);
        
        Task<(List<CustomerPayment> payments, int totalCount)> GetCustomerPaymentsAsync(
            Guid customerId, int page = 1, int pageSize = 20);
        
        Task<List<CustomerPayment>> GetUnallocatedPaymentsAsync(Guid? customerId = null);
        
        Task<bool> ReversePaymentAsync(Guid paymentId, string reason);
    }

    public interface ISupplierService
    {
        Task<Supplier> CreateSupplierAsync(CreateSupplierRequest request);
        Task<Supplier?> GetSupplierByIdAsync(Guid supplierId);
        Task<(List<Supplier> suppliers, int totalCount)> GetSuppliersAsync(int page = 1, int pageSize = 20, bool activeOnly = true);
        Task<Supplier> UpdateSupplierAsync(Guid supplierId, UpdateSupplierRequest request);
        Task<bool> DeactivateSupplierAsync(Guid supplierId);
    }

    public interface ISupplierInvoiceService
    {
        Task<SupplierInvoice> CreateSupplierInvoiceAsync(CreateSupplierInvoiceRequest request);
        Task<SupplierInvoice?> GetSupplierInvoiceByIdAsync(Guid invoiceId);
        Task<(List<SupplierInvoice> invoices, int totalCount)> GetSupplierInvoicesAsync(
            Guid? supplierId = null, int page = 1, int pageSize = 20, string status = "ALL");
        Task<List<SupplierInvoice>> GetOverdueSupplierInvoicesAsync();
        Task<SupplierInvoice> ApproveSupplierInvoiceAsync(Guid invoiceId, Guid approvedById);
        Task<bool> RejectSupplierInvoiceAsync(Guid invoiceId, string reason);
    }

    public interface ISupplierPaymentService
    {
        Task<SupplierPayment> ProcessSupplierPaymentAsync(
            Guid supplierId,
            decimal amount,
            string paymentMethod,
            string? reference,
            List<SupplierPaymentAllocationRequest>? allocations = null,
            string? notes = null);

        Task<SupplierPayment?> GetSupplierPaymentByIdAsync(Guid paymentId);
        
        Task<(List<SupplierPayment> payments, int totalCount)> GetSupplierPaymentsAsync(
            Guid supplierId, int page = 1, int pageSize = 20);
        
        Task<bool> ReverseSupplierPaymentAsync(Guid paymentId, string reason);
    }
}