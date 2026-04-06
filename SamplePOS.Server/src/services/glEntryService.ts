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

import type pg from 'pg';
import { AccountingCore, JournalLine, AccountingError } from './accountingCore.js';
import { pool as globalPool } from '../db/pool.js';
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
  OPENING_BALANCE_EQUITY: '3050',

  // Revenue - These may need to be added to chart of accounts
  SALES_REVENUE: '4000',
  SERVICE_REVENUE: '4100',
  OTHER_INCOME: '4200',

  // Cost of Goods Sold
  COGS: '5000',

  // Revenue - Delivery
  DELIVERY_REVENUE: '4500',

  // Revenue - Stock Overages
  STOCK_OVERAGE_INCOME: '4110',

  // Operating Expenses
  SALARIES: '6000',
  RENT: '6100',
  UTILITIES: '6200',
  MARKETING: '6300',
  OFFICE_SUPPLIES: '6400',
  DEPRECIATION: '6500',
  INSURANCE: '6600',
  DELIVERY_EXPENSE: '6750',
  GENERAL_EXPENSE: '6900',

  // Inventory Loss Expenses
  SHRINKAGE: '5110',
  DAMAGE: '5120',
  EXPIRY: '5130',

  // Returns & Allowances
  SALES_RETURNS: '4010',
  PURCHASE_RETURNS: '5010',
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
export async function recordSaleToGL(sale: SaleData, pool?: pg.Pool): Promise<void> {
  try {
    // Calculate amounts for proper GL posting using Money utility (decimal-safe)
    // For credit sales with partial payment, only AR should reflect unpaid portion
    const totalAmount = Money.parseDb(sale.totalAmount);
    const amountPaid = Money.parseDb(sale.amountPaid ?? 0); // Default to zero if not specified (safest for AR calculation)
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
    }, pool);

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
export async function recordCustomerPaymentToGL(payment: CustomerPaymentData, pool?: pg.Pool): Promise<void> {
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
    }, pool);

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
export async function recordExpenseToGL(expense: ExpenseData, pool?: pg.Pool): Promise<void> {
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
    }, pool);

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
export async function recordGoodsReceiptToGL(
  gr: GoodsReceiptData,
  pool?: pg.Pool,
  txClient?: pg.PoolClient,
): Promise<void> {
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
    }, pool, txClient);

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
// RETURN GRN (SUPPLIER RETURN) JOURNAL ENTRIES
// =============================================================================
// SAP pattern: Goods return to supplier reverses the original GR posting.
// DR Accounts Payable (2100) — reduce what we owe (we returned the goods)
// CR Inventory (1300) — reduce inventory value (goods left the warehouse)
//
// This is the inverse of recordGoodsReceiptToGL(). Without this entry,
// inventory_batches would decrease but GL account 1300 would remain
// unchanged — a guaranteed GL-vs-subledger discrepancy.
// =============================================================================

export interface ReturnGrnGLData {
  returnGrnId: string;
  returnGrnNumber: string;
  returnDate: string;
  totalAmount: number;
  supplierId: string;
  supplierName: string;
  originalGrNumber?: string;
}

export async function recordReturnGrnToGL(
  data: ReturnGrnGLData,
  pool?: pg.Pool,
  txClient?: pg.PoolClient,
): Promise<void> {
  try {
    await AccountingCore.createJournalEntry({
      entryDate: data.returnDate,
      description: `Return to Supplier: ${data.returnGrnNumber} (${data.supplierName})${data.originalGrNumber ? ` — orig GR ${data.originalGrNumber}` : ''}`,
      referenceType: 'RETURN_GRN',
      referenceId: data.returnGrnId,
      referenceNumber: data.returnGrnNumber,
      lines: [
        {
          accountCode: AccountCodes.ACCOUNTS_PAYABLE,
          description: `Reduce payable — returned goods: ${data.returnGrnNumber}`,
          debitAmount: data.totalAmount,
          creditAmount: 0,
          entityType: 'supplier',
          entityId: data.supplierId,
        },
        {
          accountCode: AccountCodes.INVENTORY,
          description: `Inventory returned to supplier: ${data.returnGrnNumber}`,
          debitAmount: 0,
          creditAmount: data.totalAmount,
          entityType: 'supplier',
          entityId: data.supplierId,
        },
      ],
      userId: SYSTEM_USER_ID,
      idempotencyKey: `RETURN_GRN-${data.returnGrnId}`,
    }, pool, txClient);

    logger.info('Recorded return GRN to GL', {
      returnGrnId: data.returnGrnId,
      returnGrnNumber: data.returnGrnNumber,
      amount: data.totalAmount,
    });
  } catch (error: unknown) {
    logger.error('Failed to record return GRN to GL', { error, data });
    throw new Error(`GL posting failed for return GRN ${data.returnGrnNumber}: ${error instanceof Error ? error.message : String(error)}`);
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
export async function recordSupplierPaymentToGL(payment: SupplierPaymentData, pool?: pg.Pool): Promise<void> {
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
    }, pool);

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
export async function recordStockAdjustmentToGL(adjustment: StockAdjustmentData, pool?: pg.Pool): Promise<void> {
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
    }, pool);

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
 *   CR Delivery Revenue    (4500) deliveryFee
 */
export async function recordDeliveryChargeToGL(data: DeliveryChargeData, pool?: pg.Pool): Promise<void> {
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
    }, pool);

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
 *   DR Delivery Expense (6750) totalCost
 *   CR Cash             (1010) totalCost
 */
export async function recordDeliveryCompletedToGL(data: DeliveryCompletedData, pool?: pg.Pool): Promise<void> {
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
    }, pool);

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

// =============================================================================
// DELIVERY NOTE INVOICE JOURNAL ENTRIES (DR AR / CR Revenue)
// =============================================================================

export interface DeliveryNoteInvoiceData {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  deliveryNoteNumber: string;
  customerId: string;
  customerName: string;
}

/**
 * Record a delivery note invoice in the GL.
 * DR Accounts Receivable (1200) / CR Sales Revenue (4000)
 */
export async function recordDeliveryNoteInvoiceToGL(
  data: DeliveryNoteInvoiceData,
  pool?: pg.Pool,
): Promise<void> {
  try {
    if (data.totalAmount <= 0) {
      logger.debug('Skipping DN invoice GL posting (zero or negative amount)', {
        invoiceNumber: data.invoiceNumber,
      });
      return;
    }

    const lines: JournalLine[] = [
      {
        accountCode: AccountCodes.ACCOUNTS_RECEIVABLE,
        description: `AR: DN Invoice ${data.invoiceNumber} from ${data.deliveryNoteNumber}`,
        debitAmount: data.totalAmount,
        creditAmount: 0,
        entityType: 'customer',
        entityId: data.customerId,
      },
      {
        accountCode: AccountCodes.SALES_REVENUE,
        description: `Revenue: DN Invoice ${data.invoiceNumber} from ${data.deliveryNoteNumber}`,
        debitAmount: 0,
        creditAmount: data.totalAmount,
      },
    ];

    await AccountingCore.createJournalEntry({
      entryDate: data.invoiceDate,
      description: `DN Invoice ${data.invoiceNumber} from ${data.deliveryNoteNumber} — ${data.customerName}`,
      referenceType: 'DELIVERY_NOTE_INVOICE',
      referenceId: data.invoiceId,
      referenceNumber: data.invoiceNumber,
      lines,
      userId: SYSTEM_USER_ID,
      idempotencyKey: `DN_INVOICE-${data.invoiceId}`,
    }, pool);

    logger.info('Recorded DN invoice to GL', {
      invoiceId: data.invoiceId,
      invoiceNumber: data.invoiceNumber,
      totalAmount: data.totalAmount,
    });
  } catch (error: unknown) {
    logger.error('Failed to record DN invoice to GL', { error, data });
    throw new Error(`GL posting failed for DN invoice ${data.invoiceNumber}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// =============================================================================
// SALE VOID (REVERSAL) JOURNAL ENTRIES
// =============================================================================

export interface SaleVoidData {
  saleId: string;
  saleNumber: string;
  voidDate: string;
  voidReason: string;
}

/**
 * Reverse a completed sale's GL entries when the sale is voided.
 *
 * Uses AccountingCore.reverseTransaction() which creates an exact mirror entry
 * (swaps debits/credits) and marks the original as REVERSED.
 */
export async function recordSaleVoidToGL(data: SaleVoidData, pool?: pg.Pool): Promise<void> {
  try {
    // Find the original SALE transaction
    const dbPool = pool || globalPool;
    const existing = await dbPool.query(
      `SELECT "Id" FROM ledger_transactions
       WHERE "ReferenceType" = 'SALE' AND "ReferenceId" = $1
         AND "IsReversed" = FALSE
       LIMIT 1`,
      [data.saleId]
    );

    if (existing.rows.length === 0) {
      logger.warn('No GL transaction found for voided sale — nothing to reverse', {
        saleId: data.saleId,
        saleNumber: data.saleNumber,
      });
      return; // No GL entry to reverse (sale may never have been posted)
    }

    const originalTransactionId = existing.rows[0].Id;

    await AccountingCore.reverseTransaction({
      originalTransactionId,
      reversalDate: data.voidDate,
      reason: `VOID: Sale ${data.saleNumber} — ${data.voidReason}`,
      userId: SYSTEM_USER_ID,
      idempotencyKey: `SALE_VOID-${data.saleId}`,
    }, pool);

    logger.info('Recorded sale void reversal to GL', {
      saleId: data.saleId,
      saleNumber: data.saleNumber,
      originalTransactionId,
    });
  } catch (error: unknown) {
    if (error instanceof AccountingError && error.code === 'ALREADY_REVERSED') {
      logger.info('Sale GL already reversed (idempotent)', { saleId: data.saleId });
      return;
    }
    logger.error('Failed to record sale void to GL', { error, data });
    throw new Error(`GL reversal failed for voided sale ${data.saleNumber}: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

// =============================================================================
// SALE REFUND (PARTIAL/FULL REVERSAL) JOURNAL ENTRIES
// =============================================================================

export interface SaleRefundData {
  refundId: string;
  refundNumber: string;
  saleId: string;
  saleNumber: string;
  refundDate: string;
  reason: string;
  totalAmount: number;  // Revenue to reverse
  totalCost: number;    // COGS to reverse
  paymentMethod: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'CREDIT' | 'DEPOSIT';
  customerId?: string;
}

/**
 * Record a sale refund in the general ledger.
 *
 * For a FULL refund this uses AccountingCore.reverseTransaction() (same as void).
 * For a PARTIAL refund we create a new journal entry with proportional amounts:
 *   DR Revenue (4000)            refundAmount  (reverse revenue)
 *   CR Cash / AR (1010/1200)     refundAmount  (pay back customer)
 *   DR Inventory (1300)          costAmount    (restore inventory asset)
 *   CR COGS (5000)               costAmount    (reverse cost of goods)
 *
 * @returns The GL transaction ID if created, undefined if no GL entry was needed
 */
export async function recordSaleRefundToGL(
  data: SaleRefundData,
  pool?: pg.Pool
): Promise<string | undefined> {
  try {
    const dbPool = pool || globalPool;

    // Find ALL non-reversed SALE transactions for this sale
    const existing = await dbPool.query(
      `SELECT "Id" FROM ledger_transactions
       WHERE "ReferenceType" = 'SALE' AND "ReferenceId" = $1
         AND "IsReversed" = FALSE
       LIMIT 1`,
      [data.saleId]
    );

    if (existing.rows.length === 0) {
      logger.warn('No GL transaction found for refunded sale — creating standalone refund entry', {
        saleId: data.saleId,
        saleNumber: data.saleNumber,
        refundNumber: data.refundNumber,
      });
      // Fall through to create a standalone refund entry below
    }

    // Determine credit account (where money goes back to customer)
    let creditAccountCode: string;
    switch (data.paymentMethod) {
      case 'CREDIT':
        creditAccountCode = AccountCodes.ACCOUNTS_RECEIVABLE; // 1200
        break;
      case 'CARD':
        creditAccountCode = AccountCodes.CREDIT_CARD_RECEIPTS || '1040';
        break;
      default:
        creditAccountCode = AccountCodes.CASH; // 1010
    }

    // Build journal entries for the refund
    const entries: Array<{
      accountCode: string;
      debitAmount: number;
      creditAmount: number;
      description: string;
    }> = [];

    // 1. DR Revenue — reverse the revenue
    if (data.totalAmount > 0) {
      entries.push({
        accountCode: AccountCodes.SALES_REVENUE, // 4000
        debitAmount: data.totalAmount,
        creditAmount: 0,
        description: `Refund ${data.refundNumber}: Revenue reversal for ${data.saleNumber}`,
      });

      // 2. CR Cash/AR — pay back customer
      entries.push({
        accountCode: creditAccountCode,
        debitAmount: 0,
        creditAmount: data.totalAmount,
        description: `Refund ${data.refundNumber}: ${data.paymentMethod} refund for ${data.saleNumber}`,
      });
    }

    // 3. DR Inventory — restore inventory asset
    if (data.totalCost > 0) {
      entries.push({
        accountCode: AccountCodes.INVENTORY, // 1300
        debitAmount: data.totalCost,
        creditAmount: 0,
        description: `Refund ${data.refundNumber}: Inventory restored for ${data.saleNumber}`,
      });

      // 4. CR COGS — reverse cost of goods sold
      entries.push({
        accountCode: AccountCodes.COGS, // 5000
        debitAmount: 0,
        creditAmount: data.totalCost,
        description: `Refund ${data.refundNumber}: COGS reversal for ${data.saleNumber}`,
      });
    }

    if (entries.length === 0) {
      logger.warn('No GL entries to create for refund (zero amounts)', {
        refundId: data.refundId,
        refundNumber: data.refundNumber,
      });
      return undefined;
    }

    // Post via AccountingCore for proper double-entry validation
    const journalResult = await AccountingCore.createJournalEntry({
      entryDate: data.refundDate,
      description: `REFUND: ${data.refundNumber} for Sale ${data.saleNumber} — ${data.reason}`,
      referenceType: 'SALE_REFUND',
      referenceId: data.refundId,
      referenceNumber: data.refundNumber,
      lines: entries.map((e) => ({
        accountCode: e.accountCode,
        debitAmount: e.debitAmount,
        creditAmount: e.creditAmount,
        description: e.description,
      })),
      userId: SYSTEM_USER_ID,
      idempotencyKey: `SALE_REFUND-${data.refundId}`,
    }, pool);

    logger.info('Recorded sale refund to GL', {
      refundId: data.refundId,
      refundNumber: data.refundNumber,
      saleId: data.saleId,
      saleNumber: data.saleNumber,
      transactionId: journalResult.transactionId,
      totalAmount: data.totalAmount,
      totalCost: data.totalCost,
    });

    return journalResult.transactionId;
  } catch (error: unknown) {
    if (error instanceof AccountingError && error.code === 'DUPLICATE_IDEMPOTENCY_KEY') {
      logger.info('Sale refund GL already posted (idempotent)', { refundId: data.refundId });
      return undefined;
    }
    logger.error('Failed to record sale refund to GL', { error, data });
    throw new Error(
      `GL posting failed for refund ${data.refundNumber}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// =============================================================================
// CUSTOMER DEPOSIT JOURNAL ENTRIES
// =============================================================================

export interface CustomerDepositData {
  depositId: string;
  depositNumber: string;
  depositDate: string;
  amount: number;
  paymentMethod: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER';
  customerId: string;
  customerName: string;
}

/**
 * Record a customer deposit in the general ledger
 *
 * Journal entry:
 *   DR Cash / Bank (1010/1030)  amount
 *   CR Customer Deposits (2200) amount   (liability until applied to sale)
 */
export async function recordCustomerDepositToGL(deposit: CustomerDepositData, pool?: pg.Pool): Promise<void> {
  try {
    let debitAccountCode: string;
    switch (deposit.paymentMethod) {
      case 'BANK_TRANSFER':
        debitAccountCode = AccountCodes.CHECKING_ACCOUNT;
        break;
      case 'CARD':
        debitAccountCode = AccountCodes.CREDIT_CARD_RECEIPTS;
        break;
      default:
        debitAccountCode = AccountCodes.CASH;
    }

    await AccountingCore.createJournalEntry({
      entryDate: deposit.depositDate,
      description: `Customer Deposit: ${deposit.customerName} — ${deposit.depositNumber}`,
      referenceType: 'CUSTOMER_DEPOSIT',
      referenceId: deposit.depositId,
      referenceNumber: deposit.depositNumber,
      lines: [
        {
          accountCode: debitAccountCode,
          description: `Deposit received — ${deposit.depositNumber}`,
          debitAmount: deposit.amount,
          creditAmount: 0,
          entityType: 'customer',
          entityId: deposit.customerId,
        },
        {
          accountCode: AccountCodes.CUSTOMER_DEPOSITS,
          description: `Customer deposit liability — ${deposit.depositNumber}`,
          debitAmount: 0,
          creditAmount: deposit.amount,
          entityType: 'customer',
          entityId: deposit.customerId,
        },
      ],
      userId: SYSTEM_USER_ID,
      idempotencyKey: `CUSTOMER_DEPOSIT-${deposit.depositId}`,
    }, pool);

    logger.info('Recorded customer deposit to GL', {
      depositId: deposit.depositId,
      amount: deposit.amount,
      customerId: deposit.customerId,
    });
  } catch (error: unknown) {
    logger.error('Failed to record customer deposit to GL', { error, deposit });
    throw new Error(`GL posting failed for customer deposit ${deposit.depositNumber}: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

// =============================================================================
// CUSTOMER INVOICE JOURNAL ENTRIES
// =============================================================================

export interface CustomerInvoiceData {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalAmount: number;
  customerId: string;
  customerName: string;
}

/**
 * Record a customer invoice in the general ledger
 *
 * Journal entry (when invoice is issued / transitions from Draft):
 *   DR Accounts Receivable (1200) totalAmount
 *   CR Sales Revenue (4000)       totalAmount
 */
export async function recordCustomerInvoiceToGL(invoice: CustomerInvoiceData, pool?: pg.Pool): Promise<void> {
  try {
    await AccountingCore.createJournalEntry({
      entryDate: invoice.invoiceDate,
      description: `Customer Invoice: ${invoice.invoiceNumber}`,
      referenceType: 'INVOICE',
      referenceId: invoice.invoiceId,
      referenceNumber: invoice.invoiceNumber,
      lines: [
        {
          accountCode: AccountCodes.ACCOUNTS_RECEIVABLE,
          description: `Invoice ${invoice.invoiceNumber} — ${invoice.customerName}`,
          debitAmount: invoice.totalAmount,
          creditAmount: 0,
          entityType: 'customer',
          entityId: invoice.customerId,
        },
        {
          accountCode: AccountCodes.SALES_REVENUE,
          description: `Revenue — Invoice ${invoice.invoiceNumber}`,
          debitAmount: 0,
          creditAmount: invoice.totalAmount,
          entityType: 'customer',
          entityId: invoice.customerId,
        },
      ],
      userId: SYSTEM_USER_ID,
      idempotencyKey: `INVOICE-${invoice.invoiceId}`,
    }, pool);

    logger.info('Recorded customer invoice to GL', {
      invoiceId: invoice.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: invoice.totalAmount,
    });
  } catch (error: unknown) {
    logger.error('Failed to record customer invoice to GL', { error, invoice });
    throw new Error(`GL posting failed for invoice ${invoice.invoiceNumber}: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

// =============================================================================
// INVOICE PAYMENT JOURNAL ENTRIES
// =============================================================================

export interface InvoicePaymentData {
  paymentId: string;
  receiptNumber: string;
  paymentDate: string;
  amount: number;
  paymentMethod: 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CREDIT' | 'DEPOSIT';
  invoiceId: string;
  invoiceNumber: string;
}

/**
 * Record an invoice payment in the general ledger
 *
 * Journal entry:
 *   DR Cash / Bank (1010/1030)    amount
 *   CR Accounts Receivable (1200) amount
 *
 * DEPOSIT payments are skipped (already posted via deposit lifecycle).
 */
export async function recordInvoicePaymentToGL(payment: InvoicePaymentData, pool?: pg.Pool): Promise<void> {
  try {
    // Deposit payments: money already received via deposit, no Cash DR needed
    if (payment.paymentMethod === 'DEPOSIT') {
      logger.info('Invoice payment via DEPOSIT — skipping GL (deposit already posted)', {
        receiptNumber: payment.receiptNumber,
      });
      return;
    }

    let debitAccountCode: string;
    switch (payment.paymentMethod) {
      case 'BANK_TRANSFER':
        debitAccountCode = AccountCodes.CHECKING_ACCOUNT;
        break;
      case 'CARD':
        debitAccountCode = AccountCodes.CREDIT_CARD_RECEIPTS;
        break;
      case 'CREDIT':
      case 'CASH':
      default:
        debitAccountCode = AccountCodes.CASH;
    }

    await AccountingCore.createJournalEntry({
      entryDate: payment.paymentDate,
      description: `Invoice Payment: ${payment.receiptNumber} for ${payment.invoiceNumber}`,
      referenceType: 'INVOICE_PAYMENT',
      referenceId: payment.paymentId,
      referenceNumber: payment.receiptNumber,
      lines: [
        {
          accountCode: debitAccountCode,
          description: `Cash received — ${payment.receiptNumber}`,
          debitAmount: payment.amount,
          creditAmount: 0,
        },
        {
          accountCode: AccountCodes.ACCOUNTS_RECEIVABLE,
          description: `AR reduced — ${payment.receiptNumber}`,
          debitAmount: 0,
          creditAmount: payment.amount,
        },
      ],
      userId: SYSTEM_USER_ID,
      idempotencyKey: `INVOICE_PAYMENT-${payment.paymentId}`,
    }, pool);

    logger.info('Recorded invoice payment to GL', {
      paymentId: payment.paymentId,
      receiptNumber: payment.receiptNumber,
      amount: payment.amount,
    });
  } catch (error: unknown) {
    logger.error('Failed to record invoice payment to GL', { error, payment });
    throw new Error(`GL posting failed for invoice payment ${payment.receiptNumber}: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

// =============================================================================
// STOCK MOVEMENT JOURNAL ENTRIES (ADJUSTMENTS, DAMAGE, EXPIRY)
// =============================================================================

export interface StockMovementData {
  movementId: string;
  movementNumber: string;
  movementDate: string;
  movementType: 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'DAMAGE' | 'EXPIRY';
  movementValue: number;     // quantity * unit_cost
  productName?: string;
}

/**
 * Record a manual stock movement in the general ledger.
 * Only called for ADJUSTMENT_IN/OUT, DAMAGE, EXPIRY — NOT for SALE or GOODS_RECEIPT
 * (those have their own posting functions).
 *
 * ADJUSTMENT_OUT / DAMAGE / EXPIRY (loss):
 *   DR Shrinkage/Damage/Expiry (5110/5120/5130)  value
 *   CR Inventory (1300)                           value
 *
 * ADJUSTMENT_IN (found stock):
 *   DR Inventory (1300)                           value
 *   CR Stock Overage Income (4110)                value
 */
export async function recordStockMovementToGL(movement: StockMovementData, pool?: pg.Pool): Promise<void> {
  try {
    if (movement.movementValue <= 0) {
      logger.debug('Skipping stock movement GL posting (zero value)', {
        movementNumber: movement.movementNumber,
      });
      return;
    }

    const description = `Stock ${movement.movementType}: ${movement.productName ?? 'Unknown'} — ${movement.movementNumber}`;
    let lines: JournalLine[];

    if (movement.movementType === 'ADJUSTMENT_IN') {
      lines = [
        {
          accountCode: AccountCodes.INVENTORY,
          description: `Inventory increase: ${movement.movementNumber}`,
          debitAmount: movement.movementValue,
          creditAmount: 0,
        },
        {
          accountCode: AccountCodes.STOCK_OVERAGE_INCOME,
          description: `Stock overage: ${movement.movementNumber}`,
          debitAmount: 0,
          creditAmount: movement.movementValue,
        },
      ];
    } else {
      // ADJUSTMENT_OUT, DAMAGE, EXPIRY — loss entries
      let expenseAccountCode: string;
      switch (movement.movementType) {
        case 'DAMAGE':
          expenseAccountCode = AccountCodes.DAMAGE;
          break;
        case 'EXPIRY':
          expenseAccountCode = AccountCodes.EXPIRY;
          break;
        default:
          expenseAccountCode = AccountCodes.SHRINKAGE;
      }

      lines = [
        {
          accountCode: expenseAccountCode,
          description,
          debitAmount: movement.movementValue,
          creditAmount: 0,
        },
        {
          accountCode: AccountCodes.INVENTORY,
          description: `Inventory reduction: ${movement.movementNumber}`,
          debitAmount: 0,
          creditAmount: movement.movementValue,
        },
      ];
    }

    await AccountingCore.createJournalEntry({
      entryDate: movement.movementDate,
      description,
      referenceType: 'STOCK_MOVEMENT',
      referenceId: movement.movementId,
      referenceNumber: movement.movementNumber,
      lines,
      userId: SYSTEM_USER_ID,
      idempotencyKey: `STOCK_MOVEMENT-${movement.movementId}`,
    }, pool);

    logger.info('Recorded stock movement to GL', {
      movementId: movement.movementId,
      type: movement.movementType,
      value: movement.movementValue,
    });
  } catch (error: unknown) {
    logger.error('Failed to record stock movement to GL', { error, movement });
    throw new Error(`GL posting failed for stock movement ${movement.movementNumber}: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

// =============================================================================
// OPENING STOCK / BULK IMPORT JOURNAL ENTRIES
// =============================================================================

export interface OpeningStockData {
  movementId: string;
  movementNumber: string;
  movementDate: string;
  movementValue: number;     // quantity * unit_cost
  productId: string;         // for idempotency key (product-scoped, not movement-scoped)
  batchNumber: string;       // for idempotency key (product+batch = stable key across re-imports)
  productName?: string;
}

/**
 * Record opening stock (from bulk CSV import) in the general ledger.
 *
 * Per SAP/Odoo/Tally/QuickBooks best practices, opening stock credits EQUITY
 * (not revenue). This prevents imported quantities from inflating P&L.
 *
 *   DR Inventory (1300)              value
 *   CR Opening Balance Equity (3050) value
 *
 * This function is ONLY for bulk imports / opening balance stock.
 * For found-stock adjustments (physical count surplus), use recordStockMovementToGL
 * which correctly credits Stock Overage Income (4110).
 */
export async function recordOpeningStockToGL(data: OpeningStockData, pool?: pg.Pool): Promise<void> {
  try {
    if (data.movementValue === 0) {
      logger.debug('Skipping opening stock GL posting (zero value)', {
        movementNumber: data.movementNumber,
      });
      return;
    }

    const absValue = Math.abs(data.movementValue);
    const isReversal = data.movementValue < 0;

    const description = isReversal
      ? `Opening stock reversal: ${data.productName ?? 'Unknown'} — ${data.movementNumber}`
      : `Opening stock import: ${data.productName ?? 'Unknown'} — ${data.movementNumber}`;

    // Positive value: DR Inventory / CR Opening Balance Equity (stock increase)
    // Negative value: DR Opening Balance Equity / CR Inventory (stock decrease/revaluation)
    const lines: JournalLine[] = isReversal
      ? [
        {
          accountCode: AccountCodes.OPENING_BALANCE_EQUITY,
          description: `Opening balance equity reversal: ${data.movementNumber}`,
          debitAmount: absValue,
          creditAmount: 0,
        },
        {
          accountCode: AccountCodes.INVENTORY,
          description: `Inventory decrease (import correction): ${data.movementNumber}`,
          debitAmount: 0,
          creditAmount: absValue,
        },
      ]
      : [
        {
          accountCode: AccountCodes.INVENTORY,
          description: `Inventory increase (import): ${data.movementNumber}`,
          debitAmount: absValue,
          creditAmount: 0,
        },
        {
          accountCode: AccountCodes.OPENING_BALANCE_EQUITY,
          description: `Opening balance equity: ${data.movementNumber}`,
          debitAmount: 0,
          creditAmount: absValue,
        },
      ];

    await AccountingCore.createJournalEntry({
      entryDate: data.movementDate,
      description,
      referenceType: 'OPENING_STOCK',
      referenceId: data.movementId,
      referenceNumber: data.movementNumber,
      lines,
      userId: SYSTEM_USER_ID,
      idempotencyKey: `OPENING_STOCK-${data.productId}-${data.batchNumber}`,
    }, pool);

    logger.info('Recorded opening stock to GL', {
      movementId: data.movementId,
      value: data.movementValue,
    });
  } catch (error: unknown) {
    logger.error('Failed to record opening stock to GL', { error, data });
    throw new Error(`GL posting failed for opening stock ${data.movementNumber}: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

// =============================================================================
// EXPENSE APPROVAL JOURNAL ENTRIES (UNPAID EXPENSE → AP)
// =============================================================================

export interface ExpenseApprovalData {
  expenseId: string;
  expenseNumber: string;
  expenseDate: string;
  amount: number;
  categoryCode: string;   // Maps to GL expense account via mapExpenseCategoryToAccount
  description: string;
  isPaidAtApproval: boolean;
  paymentAccountId?: string;
}

/**
 * Record expense approval in the general ledger.
 *
 * If paid at approval time:
 *   DR Expense (6xxx)  amount
 *   CR Cash (1010)     amount
 *
 * If unpaid at approval time:
 *   DR Expense (6xxx)       amount
 *   CR Accounts Payable (2100) amount
 */
export async function recordExpenseApprovalToGL(expense: ExpenseApprovalData, pool?: pg.Pool): Promise<void> {
  try {
    const expenseAccountCode = mapExpenseCategoryToAccount(expense.categoryCode);
    const creditAccountCode = expense.isPaidAtApproval
      ? AccountCodes.CASH
      : AccountCodes.ACCOUNTS_PAYABLE;

    await AccountingCore.createJournalEntry({
      entryDate: expense.expenseDate,
      description: `Expense: ${expense.description || expense.expenseNumber}`,
      referenceType: 'EXPENSE',
      referenceId: expense.expenseId,
      referenceNumber: expense.expenseNumber,
      lines: [
        {
          accountCode: expenseAccountCode,
          description: `Expense: ${expense.description || expense.expenseNumber}`,
          debitAmount: expense.amount,
          creditAmount: 0,
        },
        {
          accountCode: creditAccountCode,
          description: `Expense recognition: ${expense.expenseNumber}`,
          debitAmount: 0,
          creditAmount: expense.amount,
        },
      ],
      userId: SYSTEM_USER_ID,
      idempotencyKey: `EXPENSE-${expense.expenseId}`,
    }, pool);

    logger.info('Recorded expense approval to GL', {
      expenseId: expense.expenseId,
      expenseNumber: expense.expenseNumber,
      amount: expense.amount,
      isPaid: expense.isPaidAtApproval,
    });
  } catch (error: unknown) {
    logger.error('Failed to record expense approval to GL', { error, expense });
    throw new Error(`GL posting failed for expense ${expense.expenseNumber}: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

// =============================================================================
// EXPENSE PAYMENT JOURNAL ENTRIES (CLEAR AP ON PAYMENT)
// =============================================================================

export interface ExpensePaymentData {
  expenseId: string;
  expenseNumber: string;
  paymentDate: string;
  amount: number;
  paymentAccountCode?: string;  // Cash/bank account code (defaults to 1010)
}

/**
 * Record expense payment clearing AP in the general ledger.
 * Called when an already-approved (unpaid) expense is paid.
 *
 * Journal entry:
 *   DR Accounts Payable (2100) amount
 *   CR Cash / Bank (1010/1030) amount
 */
export async function recordExpensePaymentToGL(payment: ExpensePaymentData, pool?: pg.Pool): Promise<void> {
  try {
    const creditAccountCode = payment.paymentAccountCode || AccountCodes.CASH;

    await AccountingCore.createJournalEntry({
      entryDate: payment.paymentDate,
      description: `Payment for expense: ${payment.expenseNumber}`,
      referenceType: 'EXPENSE_PAYMENT',
      referenceId: payment.expenseId,
      referenceNumber: payment.expenseNumber,
      lines: [
        {
          accountCode: AccountCodes.ACCOUNTS_PAYABLE,
          description: `Clear AP for expense: ${payment.expenseNumber}`,
          debitAmount: payment.amount,
          creditAmount: 0,
        },
        {
          accountCode: creditAccountCode,
          description: `Payment for expense: ${payment.expenseNumber}`,
          debitAmount: 0,
          creditAmount: payment.amount,
        },
      ],
      userId: SYSTEM_USER_ID,
      idempotencyKey: `EXPENSE_PAYMENT-${payment.expenseId}`,
    }, pool);

    logger.info('Recorded expense payment to GL', {
      expenseId: payment.expenseId,
      expenseNumber: payment.expenseNumber,
      amount: payment.amount,
    });
  } catch (error: unknown) {
    logger.error('Failed to record expense payment to GL', { error, payment });
    throw new Error(`GL posting failed for expense payment ${payment.expenseNumber}: ${(error instanceof Error ? error.message : String(error))}`);
  }
}

// =============================================================================
// CREDIT NOTE / DEBIT NOTE JOURNAL ENTRIES
// =============================================================================

export interface CreditNoteGLData {
  noteId: string;
  noteNumber: string;
  noteDate: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  customerId?: string;
  customerName?: string;
  supplierId?: string;
  supplierName?: string;
}

/**
 * Customer Credit Note GL posting.
 * Reverses the original invoice impact on AR and revenue.
 *
 * DR  Sales Returns & Allowances (4010) — subtotal
 * DR  Tax Payable / Output VAT (2300) — tax
 * CR  Accounts Receivable (1200) — total
 */
export async function recordCustomerCreditNoteToGL(
  data: CreditNoteGLData,
  pool: pg.Pool = globalPool,
): Promise<void> {
  try {
    const lines: JournalLine[] = [];

    if (data.subtotal > 0) {
      lines.push({
        accountCode: AccountCodes.SALES_RETURNS,
        description: `Credit note ${data.noteNumber} - sales return`,
        debitAmount: data.subtotal,
        creditAmount: 0,
      });
    }

    if (data.taxAmount > 0) {
      lines.push({
        accountCode: AccountCodes.TAX_PAYABLE,
        description: `Credit note ${data.noteNumber} - output VAT reversal`,
        debitAmount: data.taxAmount,
        creditAmount: 0,
      });
    }

    lines.push({
      accountCode: AccountCodes.ACCOUNTS_RECEIVABLE,
      description: `Credit note ${data.noteNumber} - reduce AR`,
      debitAmount: 0,
      creditAmount: data.totalAmount,
      entityType: 'customer',
      entityId: data.customerId,
    });

    await AccountingCore.createJournalEntry({
      entryDate: data.noteDate,
      description: `Customer credit note ${data.noteNumber}${data.customerName ? ` for ${data.customerName}` : ''}`,
      referenceType: 'CREDIT_NOTE',
      referenceId: data.noteId,
      referenceNumber: data.noteNumber,
      lines,
      userId: SYSTEM_USER_ID,
      idempotencyKey: `CREDIT_NOTE-${data.noteId}`,
    }, pool);

    logger.info('Recorded customer credit note to GL', {
      noteId: data.noteId,
      noteNumber: data.noteNumber,
      totalAmount: data.totalAmount,
    });
  } catch (error: unknown) {
    logger.error('Failed to record customer credit note to GL', { error, data });
    throw new Error(`GL posting failed for credit note ${data.noteNumber}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Customer Debit Note GL posting.
 * Adds additional charges to a customer's AR balance.
 *
 * DR  Accounts Receivable (1200) — total
 * CR  Sales Revenue (4000) — subtotal
 * CR  Tax Payable / Output VAT (2300) — tax
 */
export async function recordCustomerDebitNoteToGL(
  data: CreditNoteGLData,
  pool: pg.Pool = globalPool,
): Promise<void> {
  try {
    const lines: JournalLine[] = [];

    lines.push({
      accountCode: AccountCodes.ACCOUNTS_RECEIVABLE,
      description: `Debit note ${data.noteNumber} - increase AR`,
      debitAmount: data.totalAmount,
      creditAmount: 0,
      entityType: 'customer',
      entityId: data.customerId,
    });

    if (data.subtotal > 0) {
      lines.push({
        accountCode: AccountCodes.SALES_REVENUE,
        description: `Debit note ${data.noteNumber} - additional revenue`,
        debitAmount: 0,
        creditAmount: data.subtotal,
      });
    }

    if (data.taxAmount > 0) {
      lines.push({
        accountCode: AccountCodes.TAX_PAYABLE,
        description: `Debit note ${data.noteNumber} - output VAT`,
        debitAmount: 0,
        creditAmount: data.taxAmount,
      });
    }

    await AccountingCore.createJournalEntry({
      entryDate: data.noteDate,
      description: `Customer debit note ${data.noteNumber}${data.customerName ? ` for ${data.customerName}` : ''}`,
      referenceType: 'DEBIT_NOTE',
      referenceId: data.noteId,
      referenceNumber: data.noteNumber,
      lines,
      userId: SYSTEM_USER_ID,
      idempotencyKey: `DEBIT_NOTE-${data.noteId}`,
    }, pool);

    logger.info('Recorded customer debit note to GL', {
      noteId: data.noteId,
      noteNumber: data.noteNumber,
      totalAmount: data.totalAmount,
    });
  } catch (error: unknown) {
    logger.error('Failed to record customer debit note to GL', { error, data });
    throw new Error(`GL posting failed for debit note ${data.noteNumber}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Supplier Credit Note GL posting.
 * Supplier has issued a credit — reduces our AP liability.
 *
 * DR  Accounts Payable (2100) — total (we owe less)
 * CR  Purchase Returns & Allowances (5010) — subtotal
 * CR  Tax Payable / Input VAT (2300) — tax
 */
export async function recordSupplierCreditNoteToGL(
  data: CreditNoteGLData,
  pool: pg.Pool = globalPool,
): Promise<void> {
  try {
    const lines: JournalLine[] = [];

    lines.push({
      accountCode: AccountCodes.ACCOUNTS_PAYABLE,
      description: `Supplier credit note ${data.noteNumber} - reduce AP`,
      debitAmount: data.totalAmount,
      creditAmount: 0,
      entityType: 'supplier',
      entityId: data.supplierId,
    });

    if (data.subtotal > 0) {
      lines.push({
        accountCode: AccountCodes.PURCHASE_RETURNS,
        description: `Supplier credit note ${data.noteNumber} - purchase return`,
        debitAmount: 0,
        creditAmount: data.subtotal,
      });
    }

    if (data.taxAmount > 0) {
      lines.push({
        accountCode: AccountCodes.TAX_PAYABLE,
        description: `Supplier credit note ${data.noteNumber} - input VAT reversal`,
        debitAmount: 0,
        creditAmount: data.taxAmount,
      });
    }

    await AccountingCore.createJournalEntry({
      entryDate: data.noteDate,
      description: `Supplier credit note ${data.noteNumber}${data.supplierName ? ` from ${data.supplierName}` : ''}`,
      referenceType: 'SUPPLIER_CREDIT_NOTE',
      referenceId: data.noteId,
      referenceNumber: data.noteNumber,
      lines,
      userId: SYSTEM_USER_ID,
      idempotencyKey: `SUPPLIER_CREDIT_NOTE-${data.noteId}`,
    }, pool);

    logger.info('Recorded supplier credit note to GL', {
      noteId: data.noteId,
      noteNumber: data.noteNumber,
      totalAmount: data.totalAmount,
    });
  } catch (error: unknown) {
    logger.error('Failed to record supplier credit note to GL', { error, data });
    throw new Error(`GL posting failed for supplier credit note ${data.noteNumber}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Supplier Debit Note GL posting.
 * We charge the supplier more — increases our AP obligation.
 *
 * DR  COGS (5000) — additional cost (not Inventory, since we cannot
 *     identify which specific batches/cost layers to revalue)
 * DR  Tax Payable / Input VAT (2300) — tax
 * CR  Accounts Payable (2100) — total
 *
 * NOTE: To properly debit Inventory (1300), the system would need
 * to revalue specific inventory_batches and cost_layers. Until that
 * feature is built, COGS absorbs the cost to prevent GL-vs-batch drift.
 */
export async function recordSupplierDebitNoteToGL(
  data: CreditNoteGLData,
  pool: pg.Pool = globalPool,
): Promise<void> {
  try {
    const lines: JournalLine[] = [];

    if (data.subtotal > 0) {
      lines.push({
        accountCode: AccountCodes.COGS,
        description: `Supplier debit note ${data.noteNumber} - additional cost`,
        debitAmount: data.subtotal,
        creditAmount: 0,
      });
    }

    if (data.taxAmount > 0) {
      lines.push({
        accountCode: AccountCodes.TAX_PAYABLE,
        description: `Supplier debit note ${data.noteNumber} - input VAT`,
        debitAmount: data.taxAmount,
        creditAmount: 0,
      });
    }

    lines.push({
      accountCode: AccountCodes.ACCOUNTS_PAYABLE,
      description: `Supplier debit note ${data.noteNumber} - increase AP`,
      debitAmount: 0,
      creditAmount: data.totalAmount,
      entityType: 'supplier',
      entityId: data.supplierId,
    });

    await AccountingCore.createJournalEntry({
      entryDate: data.noteDate,
      description: `Supplier debit note ${data.noteNumber}${data.supplierName ? ` from ${data.supplierName}` : ''}`,
      referenceType: 'SUPPLIER_DEBIT_NOTE',
      referenceId: data.noteId,
      referenceNumber: data.noteNumber,
      lines,
      userId: SYSTEM_USER_ID,
      idempotencyKey: `SUPPLIER_DEBIT_NOTE-${data.noteId}`,
    }, pool);

    logger.info('Recorded supplier debit note to GL', {
      noteId: data.noteId,
      noteNumber: data.noteNumber,
      totalAmount: data.totalAmount,
    });
  } catch (error: unknown) {
    logger.error('Failed to record supplier debit note to GL', { error, data });
    throw new Error(`GL posting failed for supplier debit note ${data.noteNumber}: ${error instanceof Error ? error.message : String(error)}`);
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
  recordDeliveryCompletedToGL,
  recordSaleVoidToGL,
  recordCustomerDepositToGL,
  recordCustomerInvoiceToGL,
  recordInvoicePaymentToGL,
  recordStockMovementToGL,
  recordExpenseApprovalToGL,
  recordExpensePaymentToGL,
  recordCustomerCreditNoteToGL,
  recordCustomerDebitNoteToGL,
  recordSupplierCreditNoteToGL,
  recordSupplierDebitNoteToGL,
};
