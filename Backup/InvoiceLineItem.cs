using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AccountingApi.Models
{
    /// <summary>
    /// Invoice Line Items - Individual products/services on invoices
    /// </summary>
    public class InvoiceLineItem
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        /// <summary>
        /// Parent invoice ID
        /// </summary>
        [Required]
        public Guid InvoiceId { get; set; }

        /// <summary>
        /// Product ID from POS system
        /// </summary>
        [Required]
        public Guid ProductId { get; set; }

        /// <summary>
        /// Product name (cached for performance)
        /// </summary>
        [Required]
        [StringLength(200)]
        public string ProductName { get; set; } = string.Empty;

        /// <summary>
        /// Product SKU/Code
        /// </summary>
        [StringLength(50)]
        public string? ProductCode { get; set; }

        /// <summary>
        /// Quantity sold
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal Quantity { get; set; }

        /// <summary>
        /// Unit price at time of sale
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal UnitPrice { get; set; }

        /// <summary>
        /// Unit cost at time of sale (for COGS tracking)
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal UnitCost { get; set; }

        /// <summary>
        /// Line total before tax (Quantity * UnitPrice)
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal LineTotal { get; set; }

        /// <summary>
        /// Tax rate applied (as decimal, e.g., 0.18 for 18%)
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal TaxRate { get; set; } = 0;

        /// <summary>
        /// Tax amount for this line item
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal TaxAmount { get; set; } = 0;

        /// <summary>
        /// Total line amount including tax
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal LineTotalWithTax { get; set; }

        /// <summary>
        /// COGS for this line item (Quantity * UnitCost)
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal COGS { get; set; }

        /// <summary>
        /// Gross profit for this line item (LineTotal - COGS)
        /// </summary>
        [Column(TypeName = "decimal(18,6)")]
        public decimal GrossProfit { get; set; }

        /// <summary>
        /// Navigation property to parent invoice
        /// </summary>
        public virtual Invoice Invoice { get; set; } = null!;
    }
}