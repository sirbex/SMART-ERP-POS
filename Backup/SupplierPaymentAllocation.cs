using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AccountingApi.Models
{
    /// <summary>
    /// Supplier Payment Allocation - Tracks how payments are allocated to supplier invoices
    /// </summary>
    public class SupplierPaymentAllocation
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        /// <summary>
        /// Supplier payment ID
        /// </summary>
        [Required]
        public Guid SupplierPaymentId { get; set; }

        /// <summary>
        /// Supplier invoice ID being paid
        /// </summary>
        [Required]
        public Guid SupplierInvoiceId { get; set; }

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
        public virtual SupplierPayment SupplierPayment { get; set; } = null!;
        public virtual SupplierInvoice SupplierInvoice { get; set; } = null!;
    }
}