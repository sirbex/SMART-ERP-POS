using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AccountingApi.Models
{
    /// <summary>
    /// Supplier Invoices - Bills received from suppliers for goods/services
    /// </summary>
    public class SupplierInvoice
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        /// <summary>
        /// Our internal bill number
        /// </summary>
        [Required]
        [StringLength(50)]
        public string BillNumber { get; set; } = string.Empty;

        /// <summary>
        /// Supplier's invoice number
        /// </summary>
        [Required]
        [StringLength(50)]
        public string SupplierInvoiceNumber { get; set; } = string.Empty;

        /// <summary>
        /// Supplier ID
        /// </summary>
        [Required]
        public Guid SupplierId { get; set; }

        /// <summary>
        /// Supplier name (cached)
        /// </summary>
        [Required]
        [StringLength(200)]
        public string SupplierName { get; set; } = string.Empty;

        /// <summary>
        /// Purchase Order ID (if from PO system)
        /// </summary>
        public Guid? PurchaseOrderId { get; set; }

        /// <summary>
        /// Purchase Order Number (cached)
        /// </summary>
        [StringLength(50)]
        public string? PurchaseOrderNumber { get; set; }

        /// <summary>
        /// Invoice date from supplier
        /// </summary>
        [Required]
        public DateTime InvoiceDate { get; set; }

        /// <summary>
        /// Date we received the invoice
        /// </summary>
        [Required]
        public DateTime ReceivedDate { get; set; }

        /// <summary>
        /// Payment due date
        /// </summary>
        [Required]
        public DateTime DueDate { get; set; }

        /// <summary>
        /// Subtotal before tax
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal Subtotal { get; set; }

        /// <summary>
        /// Tax amount
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal TaxAmount { get; set; }

        /// <summary>
        /// Total invoice amount
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal TotalAmount { get; set; }

        /// <summary>
        /// Amount paid so far
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal AmountPaid { get; set; } = 0;

        /// <summary>
        /// Outstanding balance
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal OutstandingBalance { get; set; }

        /// <summary>
        /// Invoice status: PENDING_APPROVAL, APPROVED, PAID, PARTIALLY_PAID, OVERDUE, REJECTED
        /// </summary>
        [Required]
        [StringLength(20)]
        public string Status { get; set; } = "PENDING_APPROVAL";

        /// <summary>
        /// Invoice description/memo
        /// </summary>
        [StringLength(1000)]
        public string? Description { get; set; }

        /// <summary>
        /// Reference to ledger transaction
        /// </summary>
        public Guid? LedgerTransactionId { get; set; }

        /// <summary>
        /// Days overdue (computed)
        /// </summary>
        public int DaysOverdue => DateTime.Now > DueDate ? (int)(DateTime.Now - DueDate).TotalDays : 0;

        /// <summary>
        /// Created timestamp
        /// </summary>
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        /// <summary>
        /// Last updated timestamp
        /// </summary>
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        /// <summary>
        /// Navigation properties
        /// </summary>
        public virtual Supplier Supplier { get; set; } = null!;
        public virtual ICollection<SupplierInvoiceLineItem> LineItems { get; set; } = new List<SupplierInvoiceLineItem>();
        public virtual ICollection<SupplierPaymentAllocation> PaymentAllocations { get; set; } = new List<SupplierPaymentAllocation>();
    }
}