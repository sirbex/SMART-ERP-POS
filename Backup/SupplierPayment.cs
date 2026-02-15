using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AccountingApi.Models
{
    /// <summary>
    /// Supplier Payments - Payments made to suppliers
    /// </summary>
    public class SupplierPayment
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        /// <summary>
        /// Payment reference number
        /// </summary>
        [Required]
        [StringLength(50)]
        public string PaymentNumber { get; set; } = string.Empty;

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
        /// Payment date
        /// </summary>
        [Required]
        public DateTime PaymentDate { get; set; }

        /// <summary>
        /// Total payment amount
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal Amount { get; set; }

        /// <summary>
        /// Payment method: BANK_TRANSFER, CHECK, CASH, CARD
        /// </summary>
        [Required]
        [StringLength(20)]
        public string PaymentMethod { get; set; } = string.Empty;

        /// <summary>
        /// Bank reference or check number
        /// </summary>
        [StringLength(100)]
        public string? Reference { get; set; }

        /// <summary>
        /// Payment notes
        /// </summary>
        [StringLength(500)]
        public string? Notes { get; set; }

        /// <summary>
        /// Amount allocated to invoices
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal AmountAllocated { get; set; } = 0;

        /// <summary>
        /// Unallocated amount (prepayments)
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal UnallocatedAmount { get; set; }

        /// <summary>
        /// Payment status: CLEARED, PENDING, CANCELLED
        /// </summary>
        [Required]
        [StringLength(20)]
        public string Status { get; set; } = "CLEARED";

        /// <summary>
        /// Reference to ledger transaction
        /// </summary>
        public Guid? LedgerTransactionId { get; set; }

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
        public virtual ICollection<SupplierPaymentAllocation> PaymentAllocations { get; set; } = new List<SupplierPaymentAllocation>();
    }
}