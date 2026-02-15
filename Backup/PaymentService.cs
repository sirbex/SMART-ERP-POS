using AccountingApi.Models;
using AccountingApi.Interfaces;
using Microsoft.EntityFrameworkCore;
using AccountingApi.Data;

namespace AccountingApi.Services
{
    public class PaymentService : IPaymentService
    {
        private readonly AccountingDbContext _context;
        private readonly ILedgerPostingService _ledgerPostingService;
        private readonly ILogger<PaymentService> _logger;

        public PaymentService(
            AccountingDbContext context,
            ILedgerPostingService ledgerPostingService,
            ILogger<PaymentService> logger)
        {
            _context = context;
            _ledgerPostingService = ledgerPostingService;
            _logger = logger;
        }

        /// <summary>
        /// Process customer payment and allocate to invoices
        /// </summary>
        public async Task<CustomerPayment> ProcessCustomerPaymentAsync(
            Guid customerId,
            string customerName,
            decimal amount,
            string paymentMethod,
            string? reference,
            List<PaymentAllocationRequest>? allocations = null,
            string? notes = null)
        {
            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                // Generate payment number
                var paymentNumber = await GeneratePaymentNumberAsync();

                // Create payment record
                var payment = new CustomerPayment
                {
                    PaymentNumber = paymentNumber,
                    CustomerId = customerId,
                    CustomerName = customerName,
                    PaymentDate = DateTime.UtcNow,
                    Amount = amount,
                    PaymentMethod = paymentMethod,
                    Reference = reference,
                    Notes = notes,
                    UnallocatedAmount = amount // Initially all unallocated
                };

                _context.CustomerPayments.Add(payment);
                await _context.SaveChangesAsync();

                // Create accounting entry: Dr. Cash/Bank, Cr. Accounts Receivable
                var ledgerTransaction = await _ledgerPostingService.CreatePaymentPostingAsync(
                    payment.Id, amount, customerId, paymentMethod, $"Payment {paymentNumber}");

                payment.LedgerTransactionId = ledgerTransaction.Id;

                // Allocate payment to invoices
                if (allocations != null && allocations.Any())
                {
                    await AllocatePaymentToInvoicesAsync(payment, allocations);
                }
                else
                {
                    // Auto-allocate to oldest invoices first (FIFO)
                    await AutoAllocatePaymentAsync(payment);
                }

                // Update customer account balances
                await UpdateCustomerAccountForPaymentAsync(customerId, customerName, payment);

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                _logger.LogInformation("Processed payment {PaymentNumber} for customer {CustomerId}, amount {Amount}",
                    paymentNumber, customerId, amount);

                return payment;
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Failed to process payment for customer {CustomerId}", customerId);
                throw;
            }
        }

        /// <summary>
        /// Allocate payment amount to specific invoices
        /// </summary>
        public async Task AllocatePaymentToInvoicesAsync(CustomerPayment payment, List<PaymentAllocationRequest> allocations)
        {
            decimal totalAllocated = 0;

            foreach (var allocation in allocations)
            {
                var invoice = await _context.Invoices
                    .FirstOrDefaultAsync(i => i.Id == allocation.InvoiceId);

                if (invoice == null)
                {
                    throw new ArgumentException($"Invoice {allocation.InvoiceId} not found");
                }

                if (invoice.CustomerId != payment.CustomerId)
                {
                    throw new ArgumentException($"Invoice {allocation.InvoiceId} does not belong to customer {payment.CustomerId}");
                }

                // Ensure allocation doesn't exceed outstanding balance or available payment amount
                var maxAllocation = Math.Min(invoice.OutstandingBalance, payment.UnallocatedAmount);
                var allocationAmount = Math.Min(allocation.Amount, maxAllocation);

                if (allocationAmount > 0)
                {
                    // Create allocation record
                    var paymentAllocation = new PaymentAllocation
                    {
                        PaymentId = payment.Id,
                        InvoiceId = invoice.Id,
                        AmountAllocated = allocationAmount,
                        AllocationDate = DateTime.UtcNow,
                        Notes = allocation.Notes
                    };

                    _context.PaymentAllocations.Add(paymentAllocation);

                    // Update invoice
                    invoice.AmountPaid += allocationAmount;
                    invoice.OutstandingBalance -= allocationAmount;
                    invoice.Status = invoice.OutstandingBalance <= 0 ? "PAID" : "PARTIALLY_PAID";
                    invoice.UpdatedAt = DateTime.UtcNow;

                    totalAllocated += allocationAmount;
                }
            }

            // Update payment allocation amounts
            payment.AmountAllocated += totalAllocated;
            payment.UnallocatedAmount -= totalAllocated;
        }

        /// <summary>
        /// Auto-allocate payment to oldest invoices first (FIFO)
        /// </summary>
        public async Task AutoAllocatePaymentAsync(CustomerPayment payment)
        {
            var outstandingInvoices = await _context.Invoices
                .Where(i => i.CustomerId == payment.CustomerId && i.OutstandingBalance > 0)
                .OrderBy(i => i.DueDate) // Oldest due date first
                .ThenBy(i => i.InvoiceDate)
                .ToListAsync();

            decimal remainingAmount = payment.UnallocatedAmount;

            foreach (var invoice in outstandingInvoices)
            {
                if (remainingAmount <= 0) break;

                var allocationAmount = Math.Min(invoice.OutstandingBalance, remainingAmount);

                var paymentAllocation = new PaymentAllocation
                {
                    PaymentId = payment.Id,
                    InvoiceId = invoice.Id,
                    AmountAllocated = allocationAmount,
                    AllocationDate = DateTime.UtcNow,
                    Notes = "Auto-allocated"
                };

                _context.PaymentAllocations.Add(paymentAllocation);

                // Update invoice
                invoice.AmountPaid += allocationAmount;
                invoice.OutstandingBalance -= allocationAmount;
                invoice.Status = invoice.OutstandingBalance <= 0 ? "PAID" : "PARTIALLY_PAID";
                invoice.UpdatedAt = DateTime.UtcNow;

                remainingAmount -= allocationAmount;
            }

            // Update payment allocation
            var totalAllocated = payment.UnallocatedAmount - remainingAmount;
            payment.AmountAllocated += totalAllocated;
            payment.UnallocatedAmount = remainingAmount;
        }

        /// <summary>
        /// Get payment by ID with allocations
        /// </summary>
        public async Task<CustomerPayment?> GetPaymentByIdAsync(Guid paymentId)
        {
            return await _context.CustomerPayments
                .Include(p => p.PaymentAllocations)
                    .ThenInclude(pa => pa.Invoice)
                .FirstOrDefaultAsync(p => p.Id == paymentId);
        }

        /// <summary>
        /// Get payments for customer with pagination
        /// </summary>
        public async Task<(List<CustomerPayment> payments, int totalCount)> GetCustomerPaymentsAsync(
            Guid customerId, int page = 1, int pageSize = 20)
        {
            var query = _context.CustomerPayments
                .Where(p => p.CustomerId == customerId);

            var totalCount = await query.CountAsync();

            var payments = await query
                .OrderByDescending(p => p.PaymentDate)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Include(p => p.PaymentAllocations)
                .ToListAsync();

            return (payments, totalCount);
        }

        /// <summary>
        /// Get unallocated payments (customer deposits/credits)
        /// </summary>
        public async Task<List<CustomerPayment>> GetUnallocatedPaymentsAsync(Guid? customerId = null)
        {
            var query = _context.CustomerPayments
                .Where(p => p.UnallocatedAmount > 0);

            if (customerId.HasValue)
            {
                query = query.Where(p => p.CustomerId == customerId.Value);
            }

            return await query
                .OrderBy(p => p.PaymentDate)
                .ToListAsync();
        }

        /// <summary>
        /// Reverse/void a payment (creates reversal entries)
        /// </summary>
        public async Task<bool> ReversePaymentAsync(Guid paymentId, string reason)
        {
            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var payment = await _context.CustomerPayments
                    .Include(p => p.PaymentAllocations)
                        .ThenInclude(pa => pa.Invoice)
                    .FirstOrDefaultAsync(p => p.Id == paymentId);

                if (payment == null)
                    throw new ArgumentException("Payment not found");

                if (payment.Status == "CANCELLED")
                    throw new InvalidOperationException("Payment is already cancelled");

                // Reverse all allocations
                foreach (var allocation in payment.PaymentAllocations)
                {
                    var invoice = allocation.Invoice;
                    invoice.AmountPaid -= allocation.AmountAllocated;
                    invoice.OutstandingBalance += allocation.AmountAllocated;
                    
                    // Update invoice status
                    if (invoice.AmountPaid <= 0)
                        invoice.Status = "SENT";
                    else if (invoice.OutstandingBalance > 0)
                        invoice.Status = "PARTIALLY_PAID";

                    invoice.UpdatedAt = DateTime.UtcNow;
                }

                // Update payment status
                payment.Status = "CANCELLED";
                payment.UpdatedAt = DateTime.UtcNow;
                payment.Notes = $"{payment.Notes}\n[CANCELLED: {reason}]";

                // Create reversal accounting entry
                if (payment.LedgerTransactionId.HasValue)
                {
                    await _ledgerPostingService.ReverseTransactionAsync(
                        payment.LedgerTransactionId.Value, $"Payment reversal - {reason}");
                }

                // Update customer account
                await UpdateCustomerAccountForPaymentReversalAsync(payment);

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                _logger.LogInformation("Reversed payment {PaymentNumber}, reason: {Reason}",
                    payment.PaymentNumber, reason);

                return true;
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Failed to reverse payment {PaymentId}", paymentId);
                throw;
            }
        }

        private async Task<string> GeneratePaymentNumberAsync()
        {
            var year = DateTime.UtcNow.Year;
            var prefix = $"PMT-{year}-";

            var lastPayment = await _context.CustomerPayments
                .Where(p => p.PaymentNumber.StartsWith(prefix))
                .OrderByDescending(p => p.PaymentNumber)
                .FirstOrDefaultAsync();

            int nextNumber = 1;
            if (lastPayment != null)
            {
                var lastNumberStr = lastPayment.PaymentNumber.Substring(prefix.Length);
                if (int.TryParse(lastNumberStr, out int lastNumber))
                {
                    nextNumber = lastNumber + 1;
                }
            }

            return $"{prefix}{nextNumber:D5}";
        }

        private async Task UpdateCustomerAccountForPaymentAsync(Guid customerId, string customerName, CustomerPayment payment)
        {
            var customerAccount = await _context.CustomerAccounts
                .FirstOrDefaultAsync(ca => ca.CustomerId == customerId);

            if (customerAccount == null)
            {
                customerAccount = new CustomerAccount
                {
                    CustomerId = customerId,
                    CustomerName = customerName,
                    IsActive = true
                };
                _context.CustomerAccounts.Add(customerAccount);
            }

            // Reduce outstanding receivables by allocated amount
            customerAccount.OutstandingReceivables -= payment.AmountAllocated;
            
            // Add unallocated amount as credit balance (customer deposit)
            if (payment.UnallocatedAmount > 0)
            {
                customerAccount.CreditBalance += payment.UnallocatedAmount;
            }

            customerAccount.LastTransactionDate = DateTime.UtcNow;
            customerAccount.UpdatedAt = DateTime.UtcNow;
        }

        private async Task UpdateCustomerAccountForPaymentReversalAsync(CustomerPayment payment)
        {
            var customerAccount = await _context.CustomerAccounts
                .FirstOrDefaultAsync(ca => ca.CustomerId == payment.CustomerId);

            if (customerAccount != null)
            {
                // Restore outstanding receivables
                customerAccount.OutstandingReceivables += payment.AmountAllocated;
                
                // Remove credit balance if any
                customerAccount.CreditBalance -= payment.UnallocatedAmount;

                customerAccount.UpdatedAt = DateTime.UtcNow;
            }
        }
    }

    // Supporting classes
    public class PaymentAllocationRequest
    {
        public Guid InvoiceId { get; set; }
        public decimal Amount { get; set; }
        public string? Notes { get; set; }
    }
}