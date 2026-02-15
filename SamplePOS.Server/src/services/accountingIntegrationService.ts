/**
 * Accounting Integration Service
 * 
 * @deprecated C# integration has been removed. Use AccountingCore directly.
 * 
 * This service is maintained for backward compatibility only.
 * All new code should use AccountingCore for journal entries.
 * 
 * MIGRATION GUIDE:
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * OLD (C# Integration):
 *   await accountingIntegration.recordSaleFinalized({ saleId, totalAmount, ... });
 * 
 * NEW (AccountingCore):
 *   await AccountingCore.createJournalEntry({
 *     entryDate: saleDate,
 *     description: 'Sale',
 *     referenceType: 'SALE',
 *     referenceId: saleId,
 *     referenceNumber: saleNumber,
 *     lines: [...],
 *     userId: userId,
 *     idempotencyKey: `SALE-${saleId}`
 *   });
 * 
 * OR use glEntryService convenience methods:
 *   await recordSaleToGL({ saleId, saleNumber, saleDate, totalAmount, costAmount, ... });
 * 
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import { AccountingCore } from './accountingCore.js';
import * as glEntryService from './glEntryService.js';
import logger from '../utils/logger.js';
import { SYSTEM_USER_ID } from '../utils/constants.js';

/**
 * @deprecated Use AccountingCore.createJournalEntry() or glEntryService methods
 */
export class AccountingIntegrationService {
  constructor() {
    logger.info('Accounting Integration Service initialized');
  }

  /**
   * @deprecated Use glEntryService.recordSaleToGL() instead
   */
  async recordInvoiceCreated(data: {
    invoiceId: string;
    amount: number;
    customerId: string;
    invoiceNumber: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      // Redirect to AccountingCore
      await AccountingCore.createJournalEntry({
        entryDate: new Date().toISOString().split('T')[0],
        description: `Invoice created: ${data.invoiceNumber}`,
        referenceType: 'INVOICE',
        referenceId: data.invoiceId,
        referenceNumber: data.invoiceNumber,
        lines: [
          {
            accountCode: '1200', // Accounts Receivable
            description: `A/R for invoice ${data.invoiceNumber}`,
            debitAmount: data.amount,
            creditAmount: 0,
            entityType: 'customer',
            entityId: data.customerId
          },
          {
            accountCode: '4000', // Sales Revenue
            description: `Revenue for invoice ${data.invoiceNumber}`,
            debitAmount: 0,
            creditAmount: data.amount
          }
        ],
        userId: SYSTEM_USER_ID,
        idempotencyKey: `INVOICE-${data.invoiceId}`
      });
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to record invoice', { error: error.message, invoiceId: data.invoiceId });
      return { success: false, error: error.message };
    }
  }

  /**
   * @deprecated Use glEntryService.recordCustomerPaymentToGL() instead
   */
  async recordPaymentProcessed(data: {
    paymentId: string;
    amount: number;
    customerId: string;
    paymentMethod: string;
    reference: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      await glEntryService.recordCustomerPaymentToGL({
        paymentId: data.paymentId,
        paymentNumber: data.reference,
        paymentDate: new Date().toISOString().split('T')[0],
        amount: data.amount,
        paymentMethod: data.paymentMethod as 'CASH' | 'CARD' | 'MOBILE_MONEY' | 'BANK_TRANSFER',
        customerId: data.customerId,
        customerName: 'Customer',
        reducesAR: true
      });
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to record payment', { error: error.message, paymentId: data.paymentId });
      return { success: false, error: error.message };
    }
  }

  /**
   * @deprecated Use glEntryService.recordSaleToGL() instead
   */
  async recordSaleFinalized(data: {
    saleId: string;
    totalAmount: number;
    cogsAmount: number;
    customerId: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      await glEntryService.recordSaleToGL({
        saleId: data.saleId,
        saleNumber: `SALE-${data.saleId.substring(0, 8)}`,
        saleDate: new Date().toISOString().split('T')[0],
        totalAmount: data.totalAmount,
        costAmount: data.cogsAmount,
        paymentMethod: 'CASH',
        customerId: data.customerId
      });
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to record sale', { error: error.message, saleId: data.saleId });
      return { success: false, error: error.message };
    }
  }

  /**
   * @deprecated Use glEntryService.recordGoodsReceiptToGL() instead
   */
  async recordGoodsReceived(data: {
    grId: string;
    grNumber: string;
    supplierId: string;
    totalAmount: number;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      await glEntryService.recordGoodsReceiptToGL({
        grId: data.grId,
        grNumber: data.grNumber,
        grDate: new Date().toISOString().split('T')[0],
        totalAmount: data.totalAmount,
        supplierId: data.supplierId,
        supplierName: 'Supplier'
      });
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to record goods receipt', { error: error.message, grId: data.grId });
      return { success: false, error: error.message };
    }
  }

  /**
   * @deprecated Use glEntryService.recordSupplierPaymentToGL() instead
   */
  async recordSupplierPayment(data: {
    paymentId: string;
    amount: number;
    supplierId: string;
    paymentMethod: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      await glEntryService.recordSupplierPaymentToGL({
        paymentId: data.paymentId,
        paymentNumber: `PAY-${data.paymentId.substring(0, 8)}`,
        paymentDate: new Date().toISOString().split('T')[0],
        amount: data.amount,
        paymentMethod: data.paymentMethod as 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CHECK',
        supplierId: data.supplierId,
        supplierName: 'Supplier'
      });
      return { success: true };
    } catch (error: any) {
      logger.error('Failed to record supplier payment', { error: error.message, paymentId: data.paymentId });
      return { success: false, error: error.message };
    }
  }

  /**
   * Health check - always returns healthy (no external dependencies)
   */
  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    return {
      healthy: true,
      message: 'Accounting service is Node.js native'
    };
  }

  /**
   * Record delivery charge in accounting
   * @deprecated Delivery accounting not yet implemented - stub method
   */
  async recordDeliveryCharge(data: {
    deliveryId: string;
    deliveryNumber: string;
    customerId: string;
    deliveryFee: number;
    fuelCost: number;
    deliveryDate: string;
  }): Promise<{ success: boolean; error?: string }> {
    // TODO: Implement delivery fee GL posting when delivery revenue tracking is required
    // For now, delivery fees are tracked in the delivery table but not posted to GL
    logger.debug('Delivery charge recording skipped (not yet implemented)', {
      deliveryId: data.deliveryId,
      deliveryFee: data.deliveryFee
    });
    return { success: true };
  }

  /**
   * Record delivery completion costs in accounting
   * @deprecated Delivery accounting not yet implemented - stub method
   */
  async recordDeliveryCompleted(data: {
    deliveryId: string;
    deliveryNumber: string;
    completedAt: string;
    actualCosts: {
      fuelCost: number;
      totalCost: number;
    };
  }): Promise<{ success: boolean; error?: string }> {
    // TODO: Implement delivery cost GL posting when delivery cost tracking is required
    // For now, delivery costs are tracked in the delivery table but not posted to GL
    logger.debug('Delivery completion recording skipped (not yet implemented)', {
      deliveryId: data.deliveryId,
      actualCosts: data.actualCosts
    });
    return { success: true };
  }
}

// Export singleton instance for backward compatibility
export const accountingIntegration = new AccountingIntegrationService();
// Alias for existing import statements
export const accountingIntegrationService = accountingIntegration;
export default AccountingIntegrationService;
