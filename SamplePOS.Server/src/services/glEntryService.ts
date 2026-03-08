/**
 * General Ledger Entry Service
 * 
 * Provides business logic for creating GL entries from business transactions.
 * Implements proper double-entry bookkeeping for all transaction types.
 * 
 * ARCHITECTURE:
 * - Uses AccountingCore for all ledger operations (single source of truth)
 * - Translates business events to journal entries
 * - Handles idempotency via deterministic keys
 * 
 * ACCOUNTING PRINCIPLES IMPLEMENTED:
 * - Double-entry: Every transaction creates balanced debit/credit entries
 * - Idempotency: Prevents duplicate entries for the same transaction
 * - Audit trail: All entries are immutable with full reference tracking
 * - Immutability: Posted entries cannot be modified
 * - Period locking: Respects closed accounting periods
 * 
 * STANDARD ACCOUNT CODES (as per chart of accounts):
 * - 1010: Cash
 * - 1020: Credit Card Receipts
 * - 1200: Accounts Receivable
 * - 1300: Inventory
 * - 2100: Accounts Payable
 * - 4000: Sales Revenue
 * - 5000: Cost of Goods Sold
 */

import { AccountingCore, JournalLine, AccountingError } from './accountingCore.js';
import { Money } from '../utils/money.js';
import logger from '../utils/logger.js';
import { SYSTEM_USER_ID } from '../utils/constants.js';

// =============================================================================
// ACCOUNT CODE CONSTANTS
// =============================================================================

export const AccountCodes = {
  // Assets
  CASH: '1010',
  CREDIT_CARD_RECEIPTS: '1020',
  CHECKING_ACCOUNT: '1030',
  ACCOUNTS_RECEIVABLE: '1200',
  INVENTORY: '1300',

  // Liabilities
  ACCOUNTS_PAYABLE: '2100',
  CUSTOMER_DEPOSITS: '2200',
  TAX_PAYABLE: '2300',

  // Equity
  OWNERS_EQUITY: '3000',

  // Revenue - These may need to be added to chart of accounts
  SALES_REVENUE: '4000',
  SERVICE_REVENUE: '4100',
  OTHER_INCOME: '4200',

  // Cost of Goods Sold
  COGS: '5000',

  // Revenue - Delivery
  DELIVERY_REVENUE: '4500',

  // Operating Expenses
  SALARIES: '6000',
  RENT: '6100',
  UTILITIES: '6200',
  MARKETING: '6300',
  OFFICE_SUPPLIES: '6400',
  DEPRECIATION: '6500',
  INSURANCE: '6600',
  DELIVERY_EXPENSE: '6750',
  GENERAL_EXPENSE: '6900'
};

// =============================================================================
// SALE JOURNAL ENTRIES
// =============================================================================

export interface SaleData {
  saleId: string;
  saleNumber: string;
  saleDate: string;
  totalAmount: number;
  costAmount: number;
  paymentMethod: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'CREDIT' | 'DEPOSIT';
  amountPaid?: number;  // Amount actually paid (for partial payment tracking)
  taxAmount?: number;   // Tax amount (posted to Tax Payable liability)
  customerId?: string;
  customerName?: string;
  // NEW: Line items for proper revenue/cost classification
  saleItems?: SaleItemData[];
}

export interface SaleItemData {
  productType: 'inventory' | 'consumable' | 'service';
  totalPrice: number;
  unitCost: number;
  quantity: number;
  incomeAccountId?: string;  // UUID of revenue account (4000 or 4100)
}

/**
 * Record a completed sale in the general ledger
 * 
 * Journal entries for a MIXED sale (inventory + service):
 *   DR Cash (1010)                    totalAmount (tax-inclusive)
 *   CR Sales Revenue (4000)           inventoryRevenue (pre-tax)
 *   CR Service Revenue (4100)         serviceRevenue (pre-tax)
 *   CR Tax Payable (2300)             taxAmount
 *   
 *   DR Cost of Goods Sold (5000)      inventoryCost (service items excluded)
 *   CR Inventory (1300)               inventoryCost (service items excluded)
 * 
 * Journal entries for a cash sale (inventory only):
 *   DR Cash (1010)              totalAmount (tax-inclusive)
 *   CR Sales Revenue (4000)     subtotal (pre-tax)
 *   CR Tax Payable (2300)       taxAmount
 *   
 *   DR Cost of Goods Sold (5000) costAmount
 *   CR Inventory (1300)          costAmount
 * 
 * Journal entries for a credit sale:
 *   DR Accounts Receivable (1200) totalAmount (tax-inclusive)
 *   CR Sales Revenue (4000)       inventoryRevenue (pre-tax)
 *   CR Service Revenue (4100)     serviceRevenue (pre-tax)
 *   CR Tax Payable (2300)         taxAmount
 *   
 *   DR Cost of Goods Sold (5000)  inventoryCost
 *   CR Inventory (1300)           inventoryCost
 */
export async function recordSaleToGL(sale: SaleData): Promise<void> {
  try {
    // Calculate amounts for proper GL posting using Money utility (decimal-safe)
    // For credit sales with partial payment, only AR should reflect unpaid portion
    const totalAmount = Money.parseDb(sale.totalAmount);
    const amountPaid = Money.parseDb(sale.amountPaid ?? sale.totalAmount); // Default to full payment if not specified
    const unpaidAmount = Money.subtract(totalAmount, amountPaid);

    // NEW: Calculate revenue and cost split by product type using Decimal-safe Money utility
    let grossInventoryRevenue = Money.zero();
    let grossServiceRevenue = Money.zero();
    let inventoryCost = Money.zero();
    // Net revenue after discount allocation (initialized, will be set in either branch)
    let inventoryRevenue = Money.zero();
    let serviceRevenue = Money.zero();

    if (sale.saleItems && sale.saleItems.length > 0) {
      // Use sale items for accurate revenue/cost classification
      for (const item of sale.saleItems) {
        if (item.productType === 'service') {
          grossServiceRevenue = Money.add(grossServiceRevenue, item.totalPrice);
          // Service items have no cost (no COGS entry)
        } else {
          // Inventory and consumable items
          grossInventoryRevenue = Money.add(grossInventoryRevenue, item.totalPrice);
          inventoryCost = Money.add(inventoryCost, Money.lineTotal(item.quantity, item.unitCost));
        }
      }

      // ============================================================
      // CRITICAL: DISCOUNT ALLOCATION TO REVENUE ACCOUNTS
      // ============================================================
      // Problem: Line totals are PRE-discount, but we debit POST-discount amount
      // Fix: Calculate discount and allocate proportionally to revenue accounts
      // This ensures DR = CR (balanced GL entry)
      // ============================================================
      const grossTotal = Money.add(grossInventoryRevenue, grossServiceRevenue);
      const discountAmount = Money.subtract(grossTotal, sale.totalAmount);

      // Net revenue after proportional discount allocation
      inventoryRevenue = grossInventoryRevenue;
      serviceRevenue = grossServiceRevenue;

      if (discountAmount.greaterThan(0.01) && grossTotal.greaterThan(0)) {
        // Proportionally allocate discount to each revenue type
        const discountRatio = Money.divide(discountAmount, grossTotal);
        const inventoryDiscount = Money.multiply(grossInventoryRevenue, discountRatio);
        const serviceDiscount = Money.multiply(grossServiceRevenue, discountRatio);

        inventoryRevenue = Money.round(Money.subtract(grossInventoryRevenue, inventoryDiscount));
        serviceRevenue = Money.round(Money.subtract(grossServiceRevenue, serviceDiscount));

        logger.info('Discount allocated to revenue accounts', {
          saleNumber: sale.saleNumber,
          grossTotal,
          discountAmount,
          discountRatio,
          grossInventoryRevenue,
          grossServiceRevenue,
          netInventoryRevenue: inventoryRevenue,
          netServiceRevenue: serviceRevenue,
          netTotal: Money.add(inventoryRevenue, serviceRevenue),
          expectedTotal: sale.totalAmount,
        });
      }

      logger.info('Sale revenue breakdown', {
        saleNumber: sale.saleNumber,
        inventoryRevenue,
        serviceRevenue,
        inventoryCost,
        totalRevenue: Money.add(inventoryRevenue, serviceRevenue)
      });
    } else {
      // Fallback: No item-level data, treat all as inventory revenue
      // (backward compatible with existing sales)
      inventoryRevenue = Money.parseDb(sale.totalAmount);
      serviceRevenue = Money.zero();
      inventoryCost = Money.parseDb(sale.costAmount);

      logger.warn('Sale without item-level data - treating all as inventory', {
        saleNumber: sale.saleNumber,
        totalAmount: sale.totalAmount
      });
    }

    // Convert Decimal values to numbers at the boundary for JournalLine interface
    const invRevenueNum = inventoryRevenue.toNumber();
    const svcRevenueNum = serviceRevenue.toNumber();
    const invCostNum = inventoryCost.toNumber();

    // Create ledger entries for revenue recognition and COGS
    const ledgerLines: JournalLine[] = [];

    // DEPOSIT sales: DR Accounts Receivable, CR Revenue
    // The deposit application trigger handles: DR Customer Deposits, CR AR
    // Net effect on AR = 0 (debit from sale, credit from deposit application)
    if (sale.paymentMethod === 'DEPOSIT') {
      logger.info('DEPOSIT sale - debiting AR (cleared by deposit application)', {
        saleNumber: sale.saleNumber,
        totalAmount: sale.totalAmount
      });
      // Debit AR - this gets cleared by the deposit application
      ledgerLines.push({
        accountCode: AccountCodes.ACCOUNTS_RECEIVABLE,
        description: `DEPOSIT sale - A/R pending deposit application`,
        debitAmount: sale.totalAmount,
        creditAmount: 0
      });

      // Credit Revenue - split by product type
      if (invRevenueNum > 0) {
        ledgerLines.push({
          accountCode: AccountCodes.SALES_REVENUE,
          description: `Inventory sales revenue for ${sale.saleNumber}`,
          debitAmount: 0,
          creditAmount: invRevenueNum
        });
      }

      if (svcRevenueNum > 0) {
        ledgerLines.push({
          accountCode: AccountCodes.SERVICE_REVENUE,
          description: `Service revenue for ${sale.saleNumber}`,
          debitAmount: 0,
          creditAmount: svcRevenueNum
        });
      }
    } else if (sale.paymentMethod === 'CREDIT') {
      // CREDIT SALE LOGIC:
      // - If partial payment: DR Cash (paid), DR AR (unpaid), CR Revenue (total)
      // - If no payment: DR AR (total), CR Revenue (total)
      // - If full payment: DR Cash (total), CR Revenue (total) - shouldn't be CREDIT method

      if (amountPaid.gt(0)) {
        // Debit Cash for amount actually paid
        ledgerLines.push({
          accountCode: AccountCodes.CASH,
          description: `Partial payment received for ${sale.saleNumber}`,
          debitAmount: amountPaid.toNumber(),
          creditAmount: 0
        });
      }

      if (unpaidAmount.gt(0)) {
        // Debit AR only for the unpaid portion
        ledgerLines.push({
          accountCode: AccountCodes.ACCOUNTS_RECEIVABLE,
          description: `Credit sale to ${sale.customerName || 'customer'} - ${sale.saleNumber}`,
          debitAmount: unpaidAmount.toNumber(),
          creditAmount: 0
        });
      }

      // Credit Revenue - split by product type
      if (invRevenueNum > 0) {
        ledgerLines.push({
          accountCode: AccountCodes.SALES_REVENUE,
          description: `Inventory sales revenue for ${sale.saleNumber}`,
          debitAmount: 0,
          creditAmount: invRevenueNum
        });
      }

      if (svcRevenueNum > 0) {
        ledgerLines.push({
          accountCode: AccountCodes.SERVICE_REVENUE,
          description: `Service revenue for ${sale.saleNumber}`,
          debitAmount: 0,
          creditAmount: svcRevenueNum
        });
      }

      logger.info('Credit sale GL entry created', {
        saleNumber: sale.saleNumber,
        totalAmount: sale.totalAmount,
        amountPaid: amountPaid.toNumber(),
        arAmount: unpaidAmount.toNumber()
      });
    } else {
      // CASH, CARD, MOBILE_MONEY - Full payment sales
      // BUG FIX: These should NEVER post to AR
      let debitAccountCode: string;
      let paymentDescription: string;

      switch (sale.paymentMethod) {
        case 'CASH':
          debitAccountCode = AccountCodes.CASH;
          paymentDescription = 'Cash payment received';
          break;
        case 'CARD':
          debitAccountCode = AccountCodes.CREDIT_CARD_RECEIPTS;
          paymentDescription = 'Credit card payment received';
          break;
        case 'MOBILE_MONEY':
          debitAccountCode = AccountCodes.CASH; // Treat as cash equivalent
          paymentDescription = 'Mobile money payment received';
          break;
        default:
          debitAccountCode = AccountCodes.CASH;
          paymentDescription = 'Cash payment received';
          break;
      }

      // Debit payment account (Cash/Card/Mobile Money)
      ledgerLines.push({
        accountCode: debitAccountCode,
        description: `${paymentDescription} for ${sale.saleNumber}`,
        debitAmount: sale.totalAmount,
        creditAmount: 0
      });

      // Credit Revenue - split by product type
      if (invRevenueNum > 0) {
        ledgerLines.push({
          accountCode: AccountCodes.SALES_REVENUE,
          description: `Inventory sales revenue for ${sale.saleNumber}`,
          debitAmount: 0,
          creditAmount: invRevenueNum
        });
      }

      if (svcRevenueNum > 0) {
        ledgerLines.push({
          accountCode: AccountCodes.SERVICE_REVENUE,
          description: `Service revenue for ${sale.saleNumber}`,
          debitAmount: 0,
          creditAmount: svcRevenueNum
        });
      }
    }

    // CREDIT: Tax Payable (Account 2300) - Tax collected on sale
    // Tax is the difference between tax-inclusive total_amount and pre-tax revenue
    const taxAmount = sale.taxAmount ?? 0;
    if (taxAmount > 0) {
      ledgerLines.push({
        accountCode: AccountCodes.TAX_PAYABLE,
        description: `Tax collected on sale ${sale.saleNumber}`,
        debitAmount: 0,
        creditAmount: taxAmount
      });
    }

    // Record inventory cost (excludes service items)
    if (invCostNum > 0) {
      ledgerLines.push(
        {
          accountCode: AccountCodes.COGS,
          description: `Cost of goods sold for ${sale.saleNumber}`,
          debitAmount: invCostNum,
          creditAmount: 0
        },
        {
          accountCode: AccountCodes.INVENTORY,
          description: `Inventory reduction for ${sale.saleNumber}`,
          debitAmount: 0,
          creditAmount: invCostNum
        }
      );

      logger.info('COGS entry created (service items excluded)', {
        saleNumber: sale.saleNumber,
        inventoryCost: invCostNum,
        originalCostAmount: sale.costAmount
      });
    }

    // Use AccountingCore for audit-safe, idempotent journal entry creation
    await AccountingCore.createJournalEntry({
      entryDate: sale.saleDate,
      description: `Sale: ${sale.saleNumber}`,
      referenceType: 'SALE',
      referenceId: sale.saleId,
      referenceNumber: sale.saleNumber,
      lines: ledgerLines,
      userId: SYSTEM_USER_ID,
      idempotencyKey: `SALE-${sale.saleId}`  // Deterministic key prevents duplicates
    });

    logger.info('Recorded sale to GL', {
      saleId: sale.saleId,
      saleNumber: sale.saleNumber,
      totalAmount: sale.totalAmount,
      costAmount: sale.costAmount
    });
  } catch (error: unknown) {
    logger.error('Failed to record sale to GL', { error, sale });
    // CRITICAL: GL failure MUST throw to prevent sales without accounting entries
    // A sale without GL entries breaks double-entry accounting integrity
    throw new Error(`GL posting failed for sale ${sale.saleNumber}: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

// =============================================================================
// CUSTOMER PAYMENT JOURNAL ENTRIES
// =============================================================================

export interface CustomerPaymentData {
  paymentId: string;
  paymentNumber: string;
  paymentDate: string;
  amount: number;
  paymentMethod: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER';
  customerId: string;
  customerName: string;
  /**
   * BUG FIX: Only credit AR if payment is actually reducing customer balance
   * Set to true when:
   * - Payment is allocated to a specific invoice, OR
   * - Payment reduces customer's outstanding balance
   * Set to false when:
   * - Payment is unallocated/on-account (should credit Unearned Revenue or Customer Prepayment)
   */
  reducesAR?: boolean;
  /**
   * Optional invoice reference for allocated payments
   */
  invoiceNumber?: string;
}

/**
 * Record a customer payment in the general ledger
 * 
 * BUG FIX: Only credit AR when payment actually reduces customer balance
 * 
 * Journal entry for payment on account (reducesAR = true):
 *   DR Cash (1010)                amount
 *   CR Accounts Receivable (1200) amount
 * 
 * Journal entry for unallocated payment (reducesAR = false):
 *   DR Cash (1010)                amount
 *   CR Customer Deposits (2200)   amount  (liability - customer prepayment)
 */
export async function recordCustomerPaymentToGL(payment: CustomerPaymentData): Promise<void> {
  try {
    // Determine debit account based on payment method
    let debitAccountCode: string;
    switch (payment.paymentMethod) {
      case 'CASH':
        debitAccountCode = AccountCodes.CASH;
        break;
      case 'CARD':
        debitAccountCode = AccountCodes.CREDIT_CARD_RECEIPTS;
        break;
      case 'BANK_TRANSFER':
        debitAccountCode = AccountCodes.CHECKING_ACCOUNT;
        break;
      default:
        debitAccountCode = AccountCodes.CASH;
    }

    // Determine credit account based on whether payment reduces AR
    // Default to true for backward compatibility (existing calls assume AR reduction)
    const reducesAR = payment.reducesAR !== false;
    const creditAccountCode = reducesAR
      ? AccountCodes.ACCOUNTS_RECEIVABLE
      : AccountCodes.CUSTOMER_DEPOSITS;

    const creditDescription = reducesAR
      ? `Reduce A/R for ${payment.customerName}${payment.invoiceNumber ? ` - ${payment.invoiceNumber}` : ''}`
      : `Customer prepayment from ${payment.customerName}`;

    // Use AccountingCore for audit-safe, idempotent journal entry creation
    await AccountingCore.createJournalEntry({
      entryDate: payment.paymentDate,
      description: `Customer payment from ${payment.customerName}: ${payment.paymentNumber}`,
      referenceType: 'CUSTOMER_PAYMENT',
      referenceId: payment.paymentId,
      referenceNumber: payment.paymentNumber,
      lines: [
        {
          accountCode: debitAccountCode,
          description: `Payment received from ${payment.customerName}`,
          debitAmount: payment.amount,
          creditAmount: 0,
          entityType: 'customer',
          entityId: payment.customerId
        },
        {
          accountCode: creditAccountCode,
          description: creditDescription,
          debitAmount: 0,
          creditAmount: payment.amount,
          entityType: 'customer',
          entityId: payment.customerId
        }
      ],
      userId: SYSTEM_USER_ID,
      idempotencyKey: `CUSTOMER_PAYMENT-${payment.paymentId}`
    });

    logger.info('Recorded customer payment to GL', {
      paymentId: payment.paymentId,
      amount: payment.amount,
      customerId: payment.customerId,
      reducesAR,
      creditAccount: creditAccountCode
    });
  } catch (error: unknown) {
    logger.error('Failed to record customer payment to GL', { error, payment });
    // CRITICAL: GL failure MUST throw to prevent payments without AR adjustment
    throw new Error(`GL posting failed for customer payment ${payment.paymentNumber}: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

// =============================================================================
// EXPENSE JOURNAL ENTRIES
// =============================================================================

export interface ExpenseData {
  expenseId: string;
  expenseNumber: string;
  expenseDate: string;
  amount: number;
  categoryCode: string; // Maps to expense account code
  categoryName: string;
  description: string;
  paymentMethod: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'PETTY_CASH';
  supplierId?: string;
  supplierName?: string;
}

/**
 * Record a paid expense in the general ledger
 * 
 * Journal entry for expense:
 *   DR Expense Account (6xxx) amount
 *   CR Cash (1010)            amount
 */
export async function recordExpenseToGL(expense: ExpenseData): Promise<void> {
  try {
    // Map category to expense account code
    const expenseAccountCode = mapExpenseCategoryToAccount(expense.categoryCode);

    // Determine credit account based on payment method
    let creditAccountCode: string;
    switch (expense.paymentMethod) {
      case 'CASH':
      case 'PETTY_CASH':
        creditAccountCode = AccountCodes.CASH;
        break;
      case 'CARD':
        creditAccountCode = AccountCodes.CHECKING_ACCOUNT;
        break;
      case 'BANK_TRANSFER':
        creditAccountCode = AccountCodes.CHECKING_ACCOUNT;
        break;
      default:
        creditAccountCode = AccountCodes.CASH;
    }

    // Use AccountingCore for audit-safe, idempotent journal entry creation
    await AccountingCore.createJournalEntry({
      entryDate: expense.expenseDate,
      description: `Expense: ${expense.description || expense.categoryName}`,
      referenceType: 'EXPENSE',
      referenceId: expense.expenseId,
      referenceNumber: expense.expenseNumber,
      lines: [
        {
          accountCode: expenseAccountCode,
          description: `${expense.categoryName}: ${expense.description}`,
          debitAmount: expense.amount,
          creditAmount: 0
        },
        {
          accountCode: creditAccountCode,
          description: `Payment for ${expense.expenseNumber}`,
          debitAmount: 0,
          creditAmount: expense.amount
        }
      ],
      userId: SYSTEM_USER_ID,
      idempotencyKey: `EXPENSE-${expense.expenseId}`
    });

    logger.info('Recorded expense to GL', {
      expenseId: expense.expenseId,
      amount: expense.amount,
      category: expense.categoryName
    });
  } catch (error: unknown) {
    logger.error('Failed to record expense to GL', { error, expense });
    // CRITICAL: GL failure MUST throw to prevent expenses without accounting entries
    throw new Error(`GL posting failed for expense ${expense.expenseNumber}: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

/**
 * Map expense category to GL account code
 * 
 * Uses database mapping from expense_categories.account_id -> accounts.AccountCode
 * Falls back to hardcoded mappings if database lookup fails
 */
function mapExpenseCategoryToAccount(categoryCode: string): string {
  // Primary mappings based on expense_categories linked to accounts
  const categoryMappings: Record<string, string> = {
    // From expense_categories table
    'OFFICE': AccountCodes.OFFICE_SUPPLIES,      // 6400
    'TRAVEL': '6800',                             // Travel & Entertainment
    'MEALS': '6800',                              // Travel & Entertainment
    'FUEL': '6800',                               // Travel & Entertainment
    'UTILITIES': AccountCodes.UTILITIES,          // 6200
    'SALARIES': AccountCodes.SALARIES,            // 6000
    'RENT': AccountCodes.RENT,                    // 6100
    'MARKETING': AccountCodes.MARKETING,          // 6300
    'INSURANCE': AccountCodes.INSURANCE,          // 6600
    'PROFESSIONAL': '6700',                       // Professional Fees
    'MAINTENANCE': AccountCodes.GENERAL_EXPENSE,  // 6900
    'EQUIPMENT': AccountCodes.GENERAL_EXPENSE,    // 6900
    'SOFTWARE': AccountCodes.GENERAL_EXPENSE,     // 6900
    // Legacy mappings
    'OFFICE_SUPPLIES': AccountCodes.OFFICE_SUPPLIES,
    'GENERAL': AccountCodes.GENERAL_EXPENSE
  };

  // Try exact match first, then uppercase
  const code = categoryCode.toUpperCase().replace(/[^A-Z]/g, '_');
  return categoryMappings[code] || categoryMappings[categoryCode] || AccountCodes.GENERAL_EXPENSE;
}

// =============================================================================
// PURCHASE / GOODS RECEIPT JOURNAL ENTRIES
// =============================================================================

export interface GoodsReceiptData {
  grId: string;
  grNumber: string;
  grDate: string;
  totalAmount: number;
  supplierId: string;
  supplierName: string;
  poNumber?: string;
}

/**
 * Record goods receipt in the general ledger
 * 
 * Journal entry for receiving inventory:
 *   DR Inventory (1300)        totalAmount
 *   CR Accounts Payable (2100) totalAmount
 */
export async function recordGoodsReceiptToGL(gr: GoodsReceiptData): Promise<void> {
  try {
    // Use AccountingCore for audit-safe, idempotent journal entry creation
    await AccountingCore.createJournalEntry({
      entryDate: gr.grDate,
      description: `Goods Receipt: ${gr.grNumber} from ${gr.supplierName}`,
      referenceType: 'GOODS_RECEIPT',
      referenceId: gr.grId,
      referenceNumber: gr.grNumber,
      lines: [
        {
          accountCode: AccountCodes.INVENTORY,
          description: `Inventory received: ${gr.grNumber}`,
          debitAmount: gr.totalAmount,
          creditAmount: 0,
          entityType: 'supplier',
          entityId: gr.supplierId
        },
        {
          accountCode: AccountCodes.ACCOUNTS_PAYABLE,
          description: `Payable to ${gr.supplierName}`,
          debitAmount: 0,
          creditAmount: gr.totalAmount,
          entityType: 'supplier',
          entityId: gr.supplierId
        }
      ],
      userId: SYSTEM_USER_ID,
      idempotencyKey: `GOODS_RECEIPT-${gr.grId}`
    });

    logger.info('Recorded goods receipt to GL', {
      grId: gr.grId,
      grNumber: gr.grNumber,
      amount: gr.totalAmount
    });
  } catch (error: unknown) {
    logger.error('Failed to record goods receipt to GL', { error, gr });
    // CRITICAL: GL failure MUST throw to prevent GR without inventory/AP entries
    throw new Error(`GL posting failed for goods receipt ${gr.grNumber}: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

// =============================================================================
// SUPPLIER PAYMENT JOURNAL ENTRIES
// =============================================================================

export interface SupplierPaymentData {
  paymentId: string;
  paymentNumber: string;
  paymentDate: string;
  amount: number;
  paymentMethod: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CHECK';
  supplierId: string;
  supplierName: string;
}

/**
 * Record supplier payment in the general ledger
 * 
 * Journal entry for paying supplier:
 *   DR Accounts Payable (2100) amount
 *   CR Cash/Bank (1010/1030)   amount
 */
export async function recordSupplierPaymentToGL(payment: SupplierPaymentData): Promise<void> {
  try {
    // Determine credit account based on payment method
    let creditAccountCode: string;
    switch (payment.paymentMethod) {
      case 'CASH':
        creditAccountCode = AccountCodes.CASH;
        break;
      case 'BANK_TRANSFER':
      case 'CHECK':
        creditAccountCode = AccountCodes.CHECKING_ACCOUNT;
        break;
      case 'CARD':
        creditAccountCode = AccountCodes.CHECKING_ACCOUNT;
        break;
      default:
        creditAccountCode = AccountCodes.CASH;
    }

    // Use AccountingCore for audit-safe, idempotent journal entry creation
    await AccountingCore.createJournalEntry({
      entryDate: payment.paymentDate,
      description: `Payment to supplier: ${payment.supplierName}`,
      referenceType: 'SUPPLIER_PAYMENT',
      referenceId: payment.paymentId,
      referenceNumber: payment.paymentNumber,
      lines: [
        {
          accountCode: AccountCodes.ACCOUNTS_PAYABLE,
          description: `Reduce payable to ${payment.supplierName}`,
          debitAmount: payment.amount,
          creditAmount: 0,
          entityType: 'supplier',
          entityId: payment.supplierId
        },
        {
          accountCode: creditAccountCode,
          description: `Payment: ${payment.paymentNumber}`,
          debitAmount: 0,
          creditAmount: payment.amount
        }
      ],
      userId: SYSTEM_USER_ID,
      idempotencyKey: `SUPPLIER_PAYMENT-${payment.paymentId}`
    });

    logger.info('Recorded supplier payment to GL', {
      paymentId: payment.paymentId,
      amount: payment.amount,
      supplierId: payment.supplierId
    });
  } catch (error: unknown) {
    logger.error('Failed to record supplier payment to GL', { error, payment });
    // CRITICAL: GL failure MUST throw to prevent payments without AP adjustment
    throw new Error(`GL posting failed for supplier payment ${payment.paymentNumber}: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

// =============================================================================
// STOCK ADJUSTMENT JOURNAL ENTRIES
// =============================================================================

export interface StockAdjustmentData {
  adjustmentId: string;
  adjustmentNumber: string;
  adjustmentDate: string;
  adjustmentType: 'INCREASE' | 'DECREASE' | 'WRITE_OFF' | 'RECOUNT';
  totalValue: number;
  reason: string;
}

/**
 * Record stock adjustment in the general ledger
 * 
 * For INCREASE (found stock):
 *   DR Inventory (1300)
 *   CR Stock Adjustment Income (other income)
 * 
 * For DECREASE/WRITE_OFF (lost/damaged):
 *   DR Stock Adjustment Expense
 *   CR Inventory (1300)
 */
export async function recordStockAdjustmentToGL(adjustment: StockAdjustmentData): Promise<void> {
  try {
    let lines: JournalLine[];
    if (adjustment.adjustmentType === 'INCREASE') {
      lines = [
        {
          accountCode: AccountCodes.INVENTORY,
          description: `Stock increase: ${adjustment.reason}`,
          debitAmount: adjustment.totalValue,
          creditAmount: 0
        },
        {
          accountCode: AccountCodes.OTHER_INCOME,
          description: `Stock adjustment income: ${adjustment.adjustmentNumber}`,
          debitAmount: 0,
          creditAmount: adjustment.totalValue
        }
      ];
    } else {
      // DECREASE, WRITE_OFF, RECOUNT (reduction)
      lines = [
        {
          accountCode: AccountCodes.GENERAL_EXPENSE,
          description: `Stock ${adjustment.adjustmentType.toLowerCase()}: ${adjustment.reason}`,
          debitAmount: adjustment.totalValue,
          creditAmount: 0
        },
        {
          accountCode: AccountCodes.INVENTORY,
          description: `Inventory reduction: ${adjustment.adjustmentNumber}`,
          debitAmount: 0,
          creditAmount: adjustment.totalValue
        }
      ];
    }

    // Use AccountingCore for audit-safe, idempotent journal entry creation
    await AccountingCore.createJournalEntry({
      entryDate: adjustment.adjustmentDate,
      description: `Stock Adjustment: ${adjustment.adjustmentNumber} - ${adjustment.reason}`,
      referenceType: 'STOCK_ADJUSTMENT',
      referenceId: adjustment.adjustmentId,
      referenceNumber: adjustment.adjustmentNumber,
      lines,
      userId: SYSTEM_USER_ID,
      idempotencyKey: `STOCK_ADJUSTMENT-${adjustment.adjustmentId}`
    });

    logger.info('Recorded stock adjustment to GL', {
      adjustmentId: adjustment.adjustmentId,
      type: adjustment.adjustmentType,
      value: adjustment.totalValue
    });
  } catch (error: unknown) {
    logger.error('Failed to record stock adjustment to GL', { error, adjustment });
    // CRITICAL: GL failure MUST throw to prevent inventory changes without GL entries
    throw new Error(`GL posting failed for stock adjustment ${adjustment.adjustmentNumber}: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

// =============================================================================
// DELIVERY JOURNAL ENTRIES
// =============================================================================

export interface DeliveryChargeData {
  deliveryId: string;
  deliveryNumber: string;
  deliveryDate: string;
  customerId: string;
  deliveryFee: number;
}

export interface DeliveryCompletedData {
  deliveryId: string;
  deliveryNumber: string;
  completedAt: string;
  totalCost: number;
}

/**
 * Record delivery charge as revenue in the general ledger
 * 
 * When a delivery order is created with a fee, we recognise income:
 *   DR Accounts Receivable (1200) deliveryFee
 *   CR Delivery Revenue    (4400) deliveryFee
 */
export async function recordDeliveryChargeToGL(data: DeliveryChargeData): Promise<void> {
  try {
    if (data.deliveryFee <= 0) {
      logger.debug('Skipping delivery charge GL posting (fee is zero)', { deliveryId: data.deliveryId });
      return;
    }

    await AccountingCore.createJournalEntry({
      entryDate: data.deliveryDate,
      description: `Delivery charge: ${data.deliveryNumber}`,
      referenceType: 'DELIVERY_CHARGE',
      referenceId: data.deliveryId,
      referenceNumber: data.deliveryNumber,
      lines: [
        {
          accountCode: AccountCodes.ACCOUNTS_RECEIVABLE,
          description: `A/R for delivery ${data.deliveryNumber}`,
          debitAmount: data.deliveryFee,
          creditAmount: 0,
          entityType: 'customer',
          entityId: data.customerId
        },
        {
          accountCode: AccountCodes.DELIVERY_REVENUE,
          description: `Delivery revenue: ${data.deliveryNumber}`,
          debitAmount: 0,
          creditAmount: data.deliveryFee
        }
      ],
      userId: SYSTEM_USER_ID,
      idempotencyKey: `DELIVERY_CHARGE-${data.deliveryId}`
    });

    logger.info('Recorded delivery charge to GL', {
      deliveryId: data.deliveryId,
      deliveryNumber: data.deliveryNumber,
      deliveryFee: data.deliveryFee
    });
  } catch (error: unknown) {
    logger.error('Failed to record delivery charge to GL', { error, data });
    throw new Error(`GL posting failed for delivery charge ${data.deliveryNumber}: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

/**
 * Record delivery completion costs in the general ledger
 * 
 * When a delivery is completed, we recognise the costs incurred:
 *   DR Delivery Expense (6850) totalCost
 *   CR Cash             (1010) totalCost
 */
export async function recordDeliveryCompletedToGL(data: DeliveryCompletedData): Promise<void> {
  try {
    if (data.totalCost <= 0) {
      logger.debug('Skipping delivery cost GL posting (cost is zero)', { deliveryId: data.deliveryId });
      return;
    }

    const entryDate = data.completedAt.split('T')[0]; // DATE only from ISO timestamp

    await AccountingCore.createJournalEntry({
      entryDate,
      description: `Delivery costs: ${data.deliveryNumber}`,
      referenceType: 'DELIVERY_COST',
      referenceId: data.deliveryId,
      referenceNumber: data.deliveryNumber,
      lines: [
        {
          accountCode: AccountCodes.DELIVERY_EXPENSE,
          description: `Delivery expense: ${data.deliveryNumber}`,
          debitAmount: data.totalCost,
          creditAmount: 0
        },
        {
          accountCode: AccountCodes.CASH,
          description: `Cash paid for delivery ${data.deliveryNumber}`,
          debitAmount: 0,
          creditAmount: data.totalCost
        }
      ],
      userId: SYSTEM_USER_ID,
      idempotencyKey: `DELIVERY_COST-${data.deliveryId}`
    });

    logger.info('Recorded delivery cost to GL', {
      deliveryId: data.deliveryId,
      deliveryNumber: data.deliveryNumber,
      totalCost: data.totalCost
    });
  } catch (error: unknown) {
    logger.error('Failed to record delivery cost to GL', { error, data });
    throw new Error(`GL posting failed for delivery cost ${data.deliveryNumber}: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

export default {
  AccountCodes,
  recordSaleToGL,
  recordCustomerPaymentToGL,
  recordExpenseToGL,
  recordGoodsReceiptToGL,
  recordSupplierPaymentToGL,
  recordStockAdjustmentToGL,
  recordDeliveryChargeToGL,
  recordDeliveryCompletedToGL
};
