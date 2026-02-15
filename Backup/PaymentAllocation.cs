using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AccountingApi.Models
{
    /// <summary>
    /// Payment Allocation - Tracks how payments are allocated to specific invoices
    /// </summary>
    public class PaymentAllocation
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        /// <summary>
        /// Payment ID
        /// </summary>
        [Required]
        public Guid PaymentId { get; set; }

        /// <summary>
        /// Invoice ID being paid
        /// </summary>
        [Required]
        public Guid InvoiceId { get; set; }

        /// <summary>
        /// Amount allocated from payment to this invoice
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal AmountAllocated { get; set; }

        /// <summary>
        /// Allocation date
        /// </summary>
        [Required]
        public DateTime AllocationDate { get; set; } = DateTime.UtcNow;

        /// <summary>
        /// Notes for this allocation
        /// </summary>
        [StringLength(500)]
        public string? Notes { get; set; }

        /// <summary>
        /// Navigation properties
        /// </summary>
        public virtual CustomerPayment Payment { get; set; } = null!;
        public virtual Invoice Invoice { get; set; } = null!;
    }
}