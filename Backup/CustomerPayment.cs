using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AccountingApi.Models
{
    /// <summary>
    /// Customer Payments - Tracks all payments received from customers
    /// </summary>
    public class CustomerPayment
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
        /// Customer ID from POS system
        /// </summary>
        [Required]
        public Guid CustomerId { get; set; }

        /// <summary>
        /// Customer name (cached)
        /// </summary>
        [Required]
        [StringLength(200)]
        public string CustomerName { get; set; } = string.Empty;

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
        /// Payment method: CASH, CARD, BANK_TRANSFER, MOBILE_MONEY, CHECK
        /// </summary>
        [Required]
        [StringLength(20)]
        public string PaymentMethod { get; set; } = string.Empty;

        /// <summary>
        /// Bank reference or transaction reference
        /// </summary>
        [StringLength(100)]
        public string? Reference { get; set; }

        /// <summary>
        /// Payment notes/memo
        /// </summary>
        [StringLength(500)]
        public string? Notes { get; set; }

        /// <summary>
        /// Amount allocated to invoices
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal AmountAllocated { get; set; } = 0;

        /// <summary>
        /// Unallocated amount (can be used for future invoices or deposits)
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal UnallocatedAmount { get; set; }

        /// <summary>
        /// Payment status: CLEARED, PENDING, BOUNCED, CANCELLED
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
        /// Navigation property for payment allocations
        /// </summary>
        public virtual ICollection<PaymentAllocation> PaymentAllocations { get; set; } = new List<PaymentAllocation>();
    }
}