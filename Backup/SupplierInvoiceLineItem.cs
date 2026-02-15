using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AccountingApi.Models
{
    /// <summary>
    /// Supplier Invoice Line Items - Individual items on supplier invoices
    /// </summary>
    public class SupplierInvoiceLineItem
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        /// <summary>
        /// Parent supplier invoice ID
        /// </summary>
        [Required]
        public Guid SupplierInvoiceId { get; set; }

        /// <summary>
        /// Product ID (if applicable)
        /// </summary>
        public Guid? ProductId { get; set; }

        /// <summary>
        /// Item description
        /// </summary>
        [Required]
        [StringLength(200)]
        public string Description { get; set; } = string.Empty;

        /// <summary>
        /// Item code/SKU
        /// </summary>
        [StringLength(50)]
        public string? ItemCode { get; set; }

        /// <summary>
        /// Quantity purchased
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal Quantity { get; set; }

        /// <summary>
        /// Unit cost
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal UnitCost { get; set; }

        /// <summary>
        /// Line total (Quantity * UnitCost)
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal LineTotal { get; set; }

        /// <summary>
        /// Tax rate applied
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal TaxRate { get; set; } = 0;

        /// <summary>
        /// Tax amount for this line
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal TaxAmount { get; set; } = 0;

        /// <summary>
        /// Total line amount including tax
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal LineTotalWithTax { get; set; }

        /// <summary>
        /// Expense account to charge this to
        /// </summary>
        public Guid? ExpenseAccountId { get; set; }

        /// <summary>
        /// Navigation properties
        /// </summary>
        public virtual SupplierInvoice SupplierInvoice { get; set; } = null!;
        public virtual Account? ExpenseAccount { get; set; }
    }
}