using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AccountingApi.Models
{
    /// <summary>
    /// Customer Invoices - Tracks all sales invoices and their status
    /// </summary>
    public class Invoice
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        /// <summary>
        /// Invoice number (e.g., INV-2025-00001)
        /// </summary>
        [Required]
        [StringLength(50)]
        public string InvoiceNumber { get; set; } = string.Empty;

        /// <summary>
        /// Customer ID from the POS system
        /// </summary>
        [Required]
        public Guid CustomerId { get; set; }

        /// <summary>
        /// Customer name (cached for performance)
        /// </summary>
        [Required]
        [StringLength(200)]
        public string CustomerName { get; set; } = string.Empty;

        /// <summary>
        /// Sale ID from the POS system (for reference)
        /// </summary>
        public Guid? SaleId { get; set; }

        /// <summary>
        /// Invoice date
        /// </summary>
        [Required]
        public DateTime InvoiceDate { get; set; }

        /// <summary>
        /// Due date for payment
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
        /// Total invoice amount (subtotal + tax)
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal TotalAmount { get; set; }

        /// <summary>
        /// Amount paid so far
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal AmountPaid { get; set; } = 0;

        /// <summary>
        /// Outstanding balance (TotalAmount - AmountPaid)
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal OutstandingBalance { get; set; }

        /// <summary>
        /// Invoice status: DRAFT, SENT, PAID, PARTIALLY_PAID, OVERDUE, CANCELLED
        /// </summary>
        [Required]
        [StringLength(20)]
        public string Status { get; set; } = "DRAFT";

        /// <summary>
        /// Payment terms (NET_30, NET_15, DUE_ON_RECEIPT, etc.)
        /// </summary>
        [StringLength(50)]
        public string? PaymentTerms { get; set; }

        /// <summary>
        /// Invoice notes/memo
        /// </summary>
        [StringLength(1000)]
        public string? Notes { get; set; }

        /// <summary>
        /// Whether this is a credit sale or cash sale
        /// </summary>
        public bool IsCreditSale { get; set; } = false;

        /// <summary>
        /// Reference to ledger transaction ID
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
        /// Navigation property for invoice line items
        /// </summary>
        public virtual ICollection<InvoiceLineItem> LineItems { get; set; } = new List<InvoiceLineItem>();

        /// <summary>
        /// Navigation property for payment allocations against this invoice
        /// </summary>
        public virtual ICollection<PaymentAllocation> PaymentAllocations { get; set; } = new List<PaymentAllocation>();
    }
}