using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AccountingApi.Models
{
    /// <summary>
    /// Supplier - Vendors from whom we purchase goods and services
    /// </summary>
    public class Supplier
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        /// <summary>
        /// Supplier code (e.g., SUPP001)
        /// </summary>
        [Required]
        [StringLength(50)]
        public string SupplierCode { get; set; } = string.Empty;

        /// <summary>
        /// Supplier company name
        /// </summary>
        [Required]
        [StringLength(200)]
        public string CompanyName { get; set; } = string.Empty;

        /// <summary>
        /// Contact person name
        /// </summary>
        [StringLength(100)]
        public string? ContactName { get; set; }

        /// <summary>
        /// Email address
        /// </summary>
        [StringLength(100)]
        public string? Email { get; set; }

        /// <summary>
        /// Phone number
        /// </summary>
        [StringLength(20)]
        public string? Phone { get; set; }

        /// <summary>
        /// Full address
        /// </summary>
        [StringLength(500)]
        public string? Address { get; set; }

        /// <summary>
        /// City
        /// </summary>
        [StringLength(100)]
        public string? City { get; set; }

        /// <summary>
        /// Country
        /// </summary>
        [StringLength(100)]
        public string? Country { get; set; }

        /// <summary>
        /// Tax ID/VAT number
        /// </summary>
        [StringLength(50)]
        public string? TaxId { get; set; }

        /// <summary>
        /// Payment terms (NET_30, NET_15, etc.)
        /// </summary>
        [StringLength(50)]
        public string PaymentTerms { get; set; } = "NET_30";

        /// <summary>
        /// Credit limit granted by supplier
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal CreditLimit { get; set; } = 0;

        /// <summary>
        /// Current outstanding payables
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal OutstandingPayables { get; set; } = 0;

        /// <summary>
        /// Total purchases year-to-date
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal YearToDatePurchases { get; set; } = 0;

        /// <summary>
        /// Whether supplier is active
        /// </summary>
        public bool IsActive { get; set; } = true;

        /// <summary>
        /// Last transaction date
        /// </summary>
        public DateTime? LastTransactionDate { get; set; }

        /// <summary>
        /// Notes about supplier
        /// </summary>
        [StringLength(1000)]
        public string? Notes { get; set; }

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
        public virtual ICollection<SupplierInvoice> SupplierInvoices { get; set; } = new List<SupplierInvoice>();
        public virtual ICollection<SupplierPayment> SupplierPayments { get; set; } = new List<SupplierPayment>();
    }
}