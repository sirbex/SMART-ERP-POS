using AccountingApi.Models;
using AccountingApi.Interfaces;
using Microsoft.EntityFrameworkCore;
using AccountingApi.Data;

namespace AccountingApi.Services
{
    public class InvoiceService : IInvoiceService
    {
        private readonly AccountingDbContext _context;
        private readonly ILedgerPostingService _ledgerPostingService;
        private readonly ILogger<InvoiceService> _logger;

        public InvoiceService(
            AccountingDbContext context,
            ILedgerPostingService ledgerPostingService,
            ILogger<InvoiceService> logger)
        {
            _context = context;
            _ledgerPostingService = ledgerPostingService;
            _logger = logger;
        }

        /// <summary>
        /// Create invoice from POS sale with proper accounting entries
        /// </summary>
        public async Task<Invoice> CreateInvoiceFromSaleAsync(
            Guid saleId,
            Guid customerId,
            string customerName,
            decimal subtotal,
            decimal taxAmount,
            decimal totalAmount,
            List<InvoiceLineItemRequest> lineItems,
            bool isCreditSale = false,
            string paymentTerms = "DUE_ON_RECEIPT")
        {
            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                // Generate invoice number
                var invoiceNumber = await GenerateInvoiceNumberAsync();

                // Create invoice
                var invoice = new Invoice
                {
                    InvoiceNumber = invoiceNumber,
                    CustomerId = customerId,
                    CustomerName = customerName,
                    SaleId = saleId,
                    InvoiceDate = DateTime.UtcNow,
                    DueDate = CalculateDueDate(paymentTerms),
                    Subtotal = subtotal,
                    TaxAmount = taxAmount,
                    TotalAmount = totalAmount,
                    OutstandingBalance = isCreditSale ? totalAmount : 0, // If cash sale, balance is 0
                    AmountPaid = isCreditSale ? 0 : totalAmount, // If cash sale, fully paid
                    Status = isCreditSale ? "SENT" : "PAID",
                    PaymentTerms = paymentTerms,
                    IsCreditSale = isCreditSale
                };

                _context.Invoices.Add(invoice);
                await _context.SaveChangesAsync();

                // Add line items
                decimal totalCOGS = 0;
                foreach (var item in lineItems)
                {
                    var lineItem = new InvoiceLineItem
                    {
                        InvoiceId = invoice.Id,
                        ProductId = item.ProductId,
                        ProductName = item.ProductName,
                        ProductCode = item.ProductCode,
                        Quantity = item.Quantity,
                        UnitPrice = item.UnitPrice,
                        UnitCost = item.UnitCost,
                        LineTotal = item.Quantity * item.UnitPrice,
                        TaxRate = item.TaxRate,
                        TaxAmount = item.Quantity * item.UnitPrice * item.TaxRate,
                        LineTotalWithTax = item.Quantity * item.UnitPrice * (1 + item.TaxRate),
                        COGS = item.Quantity * item.UnitCost,
                        GrossProfit = (item.Quantity * item.UnitPrice) - (item.Quantity * item.UnitCost)
                    };

                    totalCOGS += lineItem.COGS;
                    _context.InvoiceLineItems.Add(lineItem);
                }

                await _context.SaveChangesAsync();

                // Create accounting entries
                if (isCreditSale)
                {
                    // Credit sale: Dr. Accounts Receivable, Cr. Sales Revenue
                    var arTransaction = await _ledgerPostingService.CreateInvoicePostingAsync(
                        invoice.Id, totalAmount, customerId, $"Invoice {invoiceNumber}");
                    invoice.LedgerTransactionId = arTransaction.Id;
                }
                else
                {
                    // Cash sale: Dr. Cash, Cr. Sales Revenue
                    var cashTransaction = await _ledgerPostingService.CreateCashSalePostingAsync(
                        invoice.Id, totalAmount, $"Cash Sale - Invoice {invoiceNumber}");
                    invoice.LedgerTransactionId = cashTransaction.Id;
                }

                // COGS entry: Dr. COGS, Cr. Inventory
                if (totalCOGS > 0)
                {
                    await _ledgerPostingService.CreateCOGSPostingAsync(
                        saleId, totalCOGS, $"COGS for Invoice {invoiceNumber}");
                }

                // Update customer account if credit sale
                if (isCreditSale)
                {
                    await UpdateCustomerReceivablesAsync(customerId, customerName, totalAmount);
                }

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                _logger.LogInformation("Created invoice {InvoiceNumber} for customer {CustomerId}, amount {Amount}",
                    invoiceNumber, customerId, totalAmount);

                return invoice;
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Failed to create invoice for sale {SaleId}", saleId);
                throw;
            }
        }

        /// <summary>
        /// Get invoice by ID with line items
        /// </summary>
        public async Task<Invoice?> GetInvoiceByIdAsync(Guid invoiceId)
        {
            return await _context.Invoices
                .Include(i => i.LineItems)
                .Include(i => i.PaymentAllocations)
                .FirstOrDefaultAsync(i => i.Id == invoiceId);
        }

        /// <summary>
        /// Get invoices for customer with pagination
        /// </summary>
        public async Task<(List<Invoice> invoices, int totalCount)> GetCustomerInvoicesAsync(
            Guid customerId, int page = 1, int pageSize = 20, string status = "ALL")
        {
            var query = _context.Invoices
                .Where(i => i.CustomerId == customerId);

            if (status != "ALL")
            {
                query = query.Where(i => i.Status == status);
            }

            var totalCount = await query.CountAsync();

            var invoices = await query
                .OrderByDescending(i => i.InvoiceDate)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Include(i => i.LineItems)
                .ToListAsync();

            return (invoices, totalCount);
        }

        /// <summary>
        /// Get overdue invoices for collections
        /// </summary>
        public async Task<List<Invoice>> GetOverdueInvoicesAsync()
        {
            var today = DateTime.UtcNow.Date;
            return await _context.Invoices
                .Where(i => i.DueDate < today && i.OutstandingBalance > 0)
                .Include(i => i.LineItems)
                .OrderBy(i => i.DueDate)
                .ToListAsync();
        }

        /// <summary>
        /// Get aging report for accounts receivable
        /// </summary>
        public async Task<List<AgingReportItem>> GetAccountsReceivableAgingAsync()
        {
            var today = DateTime.UtcNow.Date;

            var invoices = await _context.Invoices
                .Where(i => i.OutstandingBalance > 0)
                .Select(i => new
                {
                    i.CustomerId,
                    i.CustomerName,
                    i.OutstandingBalance,
                    i.DueDate
                })
                .ToListAsync();

            // Calculate days overdue in memory (PostgreSQL doesn't have DateDiffDay)
            var invoicesWithAging = invoices.Select(i => new
            {
                i.CustomerId,
                i.CustomerName, 
                i.OutstandingBalance,
                DaysOverdue = today > i.DueDate ? (int)(today - i.DueDate).TotalDays : 0
            });

            var agingReport = invoicesWithAging
                .GroupBy(i => new { i.CustomerId, i.CustomerName })
                .Select(g => new AgingReportItem
                {
                    CustomerId = g.Key.CustomerId,
                    CustomerName = g.Key.CustomerName,
                    TotalOutstanding = g.Sum(x => x.OutstandingBalance),
                    Current = g.Where(x => x.DaysOverdue <= 0).Sum(x => x.OutstandingBalance),
                    Days1To30 = g.Where(x => x.DaysOverdue > 0 && x.DaysOverdue <= 30).Sum(x => x.OutstandingBalance),
                    Days31To60 = g.Where(x => x.DaysOverdue > 30 && x.DaysOverdue <= 60).Sum(x => x.OutstandingBalance),
                    Days61To90 = g.Where(x => x.DaysOverdue > 60 && x.DaysOverdue <= 90).Sum(x => x.OutstandingBalance),
                    Over90Days = g.Where(x => x.DaysOverdue > 90).Sum(x => x.OutstandingBalance)
                })
                .OrderByDescending(x => x.TotalOutstanding)
                .ToList();

            return agingReport;
        }

        private async Task<string> GenerateInvoiceNumberAsync()
        {
            var year = DateTime.UtcNow.Year;
            var prefix = $"INV-{year}-";

            var lastInvoice = await _context.Invoices
                .Where(i => i.InvoiceNumber.StartsWith(prefix))
                .OrderByDescending(i => i.InvoiceNumber)
                .FirstOrDefaultAsync();

            int nextNumber = 1;
            if (lastInvoice != null)
            {
                var lastNumberStr = lastInvoice.InvoiceNumber.Substring(prefix.Length);
                if (int.TryParse(lastNumberStr, out int lastNumber))
                {
                    nextNumber = lastNumber + 1;
                }
            }

            return $"{prefix}{nextNumber:D5}";
        }

        private DateTime CalculateDueDate(string paymentTerms)
        {
            var baseDate = DateTime.UtcNow.Date;
            return paymentTerms switch
            {
                "DUE_ON_RECEIPT" => baseDate,
                "NET_7" => baseDate.AddDays(7),
                "NET_15" => baseDate.AddDays(15),
                "NET_30" => baseDate.AddDays(30),
                "NET_45" => baseDate.AddDays(45),
                "NET_60" => baseDate.AddDays(60),
                _ => baseDate
            };
        }

        private async Task UpdateCustomerReceivablesAsync(Guid customerId, string customerName, decimal amount)
        {
            var customerAccount = await _context.CustomerAccounts
                .FirstOrDefaultAsync(ca => ca.CustomerId == customerId);

            if (customerAccount == null)
            {
                // Create customer account if it doesn't exist
                customerAccount = new CustomerAccount
                {
                    CustomerId = customerId,
                    CustomerName = customerName,
                    IsActive = true
                };
                _context.CustomerAccounts.Add(customerAccount);
            }

            customerAccount.OutstandingReceivables += amount;
            customerAccount.LastTransactionDate = DateTime.UtcNow;
            customerAccount.UpdatedAt = DateTime.UtcNow;
        }
    }

    // Supporting classes
    public class InvoiceLineItemRequest
    {
        public Guid ProductId { get; set; }
        public string ProductName { get; set; } = string.Empty;
        public string? ProductCode { get; set; }
        public decimal Quantity { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal UnitCost { get; set; }
        public decimal TaxRate { get; set; } = 0;
    }

    public class AgingReportItem
    {
        public Guid CustomerId { get; set; }
        public string CustomerName { get; set; } = string.Empty;
        public decimal TotalOutstanding { get; set; }
        public decimal Current { get; set; }
        public decimal Days1To30 { get; set; }
        public decimal Days31To60 { get; set; }
        public decimal Days61To90 { get; set; }
        public decimal Over90Days { get; set; }
    }
}