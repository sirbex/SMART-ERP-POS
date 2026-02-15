namespace AccountingApi.DTOs
{
    public class CreateSupplierRequest
    {
        public string SupplierCode { get; set; } = string.Empty;
        public string CompanyName { get; set; } = string.Empty;
        public string? ContactName { get; set; }
        public string? Email { get; set; }
        public string? Phone { get; set; }
        public string? Address { get; set; }
        public string? City { get; set; }
        public string? Country { get; set; }
        public string? TaxId { get; set; }
        public string PaymentTerms { get; set; } = "NET_30";
        public decimal CreditLimit { get; set; } = 0;
        public string? Notes { get; set; }
    }

    public class UpdateSupplierRequest
    {
        public string? CompanyName { get; set; }
        public string? ContactName { get; set; }
        public string? Email { get; set; }
        public string? Phone { get; set; }
        public string? Address { get; set; }
        public string? City { get; set; }
        public string? Country { get; set; }
        public string? TaxId { get; set; }
        public string? PaymentTerms { get; set; }
        public decimal? CreditLimit { get; set; }
        public string? Notes { get; set; }
    }

    public class CreateSupplierInvoiceRequest
    {
        public string SupplierInvoiceNumber { get; set; } = string.Empty;
        public Guid SupplierId { get; set; }
        public Guid? PurchaseOrderId { get; set; }
        public DateTime InvoiceDate { get; set; }
        public DateTime? DueDate { get; set; }
        public decimal Subtotal { get; set; }
        public decimal TaxAmount { get; set; }
        public decimal TotalAmount { get; set; }
        public string? Description { get; set; }
        public List<CreateSupplierInvoiceLineItemRequest> LineItems { get; set; } = new();
    }

    public class CreateSupplierInvoiceLineItemRequest
    {
        public Guid? ProductId { get; set; }
        public string Description { get; set; } = string.Empty;
        public string? ItemCode { get; set; }
        public decimal Quantity { get; set; }
        public decimal UnitCost { get; set; }
        public decimal TaxRate { get; set; } = 0;
        public Guid? ExpenseAccountId { get; set; }
    }

    public class SupplierPaymentAllocationRequest
    {
        public Guid SupplierInvoiceId { get; set; }
        public decimal Amount { get; set; }
        public string? Notes { get; set; }
    }
}