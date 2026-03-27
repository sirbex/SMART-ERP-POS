/**
 * Audit Service Layer
 * Created: November 23, 2025
 * Purpose: Business logic for audit trail system
 * 
 * CRITICAL RULES:
 * - Business logic ONLY - no direct database queries
 * - Call repository layer for data access
 * - Graceful degradation - audit failures should NOT break transactions
 * - Calculate diffs automatically for UPDATE actions
 * - Enrich audit entries with context
 */

import { Pool, PoolClient } from 'pg';
import {
  AuditLog,
  CreateAuditEntry,
  AuditLogQuery,
  AuditContext,
  UserSession,
  CreateSession,
  EndSession,
  FailedTransaction,
  RecordFailedTransaction,
  ChangesDiff,
} from '../../../../shared/types/audit.js';
import * as auditRepo from './auditRepository.js';

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Calculate diff between old and new values
 */
function calculateChanges(oldValues: Record<string, unknown>, newValues: Record<string, unknown>): ChangesDiff {
  const changes: ChangesDiff = {};

  // Check all keys from both objects
  const allKeys = new Set([...Object.keys(oldValues || {}), ...Object.keys(newValues || {})]);

  for (const key of allKeys) {
    const oldVal = oldValues?.[key];
    const newVal = newValues?.[key];

    // Skip if values are identical
    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) {
      continue;
    }

    changes[key] = {
      old: oldVal,
      new: newVal,
    };
  }

  return changes;
}

/**
 * Safely log audit entry - never throws
 * If audit logging fails, log error but don't break the operation
 */
async function safeLogAudit(
  pool: Pool | PoolClient,
  data: CreateAuditEntry
): Promise<AuditLog | null> {
  try {
    return await auditRepo.createAuditEntry(pool, data);
  } catch (error) {
    // Log to console but don't throw
    console.error('⚠️ Audit logging failed (non-fatal):', error);
    console.error('Failed audit data:', data);
    return null;
  }
}

// =====================================================
// GENERIC AUDIT LOGGING
// =====================================================

/**
 * Generic audit action logging
 */
export async function logAction(
  pool: Pool | PoolClient,
  data: Omit<CreateAuditEntry, 'changes' | 'userId' | 'userName' | 'userRole' | 'sessionId' | 'ipAddress' | 'userAgent' | 'requestId'>,
  context: AuditContext
): Promise<AuditLog | null> {
  // Calculate changes if both old and new values provided
  let changes: ChangesDiff | undefined;
  if (data.oldValues && data.newValues) {
    changes = calculateChanges(data.oldValues, data.newValues);
  }

  // Merge context with data
  const auditEntry: CreateAuditEntry = {
    ...data,
    changes,
    userId: context.userId,
    userName: context.userName,
    userRole: context.userRole,
    sessionId: context.sessionId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    requestId: context.requestId,
  };

  return await safeLogAudit(pool, auditEntry);
}

// =====================================================
// SALE-SPECIFIC AUDIT FUNCTIONS
// =====================================================

/**
 * Log sale creation
 */
export async function logSaleCreated(
  pool: Pool,
  saleId: string,
  saleNumber: string,
  saleData: Record<string, unknown>,
  context: AuditContext
): Promise<AuditLog | null> {
  return await logAction(
    pool,
    {
      entityType: 'SALE',
      entityId: saleId,
      entityNumber: saleNumber,
      action: 'CREATE',
      actionDetails: `Sale ${saleNumber} created with ${(saleData.itemCount as number) || 0} items, total ${saleData.totalAmount as number}`,
      newValues: saleData,
      severity: 'INFO',
      category: 'FINANCIAL',
      tags: ['sale', 'create', 'pos'],
    },
    context
  );
}

/**
 * Log sale void/cancellation
 */
export async function logSaleVoided(
  pool: Pool,
  saleId: string,
  saleNumber: string,
  reason: string,
  originalSaleData: Record<string, unknown>,
  context: AuditContext
): Promise<AuditLog | null> {
  return await logAction(
    pool,
    {
      entityType: 'SALE',
      entityId: saleId,
      entityNumber: saleNumber,
      action: 'VOID',
      actionDetails: `Sale ${saleNumber} voided. Reason: ${reason}`,
      oldValues: originalSaleData,
      newValues: { ...originalSaleData, status: 'VOIDED', voidReason: reason },
      severity: 'WARNING',
      category: 'FINANCIAL',
      tags: ['sale', 'void', 'correction'],
      notes: reason,
    },
    context
  );
}

/**
 * Log sale update/modification
 */
export async function logSaleUpdated(
  pool: Pool,
  saleId: string,
  saleNumber: string,
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  context: AuditContext
): Promise<AuditLog | null> {
  return await logAction(
    pool,
    {
      entityType: 'SALE',
      entityId: saleId,
      entityNumber: saleNumber,
      action: 'UPDATE',
      actionDetails: `Sale ${saleNumber} updated`,
      oldValues: oldData,
      newValues: newData,
      severity: 'INFO',
      category: 'FINANCIAL',
      tags: ['sale', 'update'],
    },
    context
  );
}

// =====================================================
// PURCHASE ORDER AUDIT FUNCTIONS
// =====================================================

/**
 * Log purchase order creation
 */
export async function logPurchaseOrderCreated(
  pool: Pool,
  poId: string,
  poNumber: string,
  poData: Record<string, unknown>,
  context: AuditContext
): Promise<AuditLog | null> {
  return await logAction(
    pool,
    {
      entityType: 'PURCHASE_ORDER',
      entityId: poId,
      entityNumber: poNumber,
      action: 'CREATE',
      actionDetails: `Purchase Order ${poNumber} created with ${(poData.itemCount as number) || 0} items, total ${poData.totalAmount as number}`,
      newValues: poData,
      severity: 'INFO',
      category: 'FINANCIAL',
      tags: ['purchase-order', 'create', 'procurement'],
    },
    context
  );
}

/**
 * Log purchase order status change
 */
export async function logPurchaseOrderStatusChanged(
  pool: Pool,
  poId: string,
  poNumber: string,
  oldStatus: string,
  newStatus: string,
  context: AuditContext
): Promise<AuditLog | null> {
  return await logAction(
    pool,
    {
      entityType: 'PURCHASE_ORDER',
      entityId: poId,
      entityNumber: poNumber,
      action: 'STATUS_CHANGE',
      actionDetails: `Purchase Order ${poNumber} status changed from ${oldStatus} to ${newStatus}`,
      oldValues: { status: oldStatus },
      newValues: { status: newStatus },
      severity: 'INFO',
      category: 'FINANCIAL',
      tags: ['purchase-order', 'status-change', 'procurement'],
    },
    context
  );
}

// =====================================================
// GOODS RECEIPT AUDIT FUNCTIONS
// =====================================================

/**
 * Log goods receipt creation
 */
export async function logGoodsReceiptCreated(
  pool: Pool,
  grId: string,
  grNumber: string,
  grData: Record<string, unknown>,
  context: AuditContext
): Promise<AuditLog | null> {
  return await logAction(
    pool,
    {
      entityType: 'GOODS_RECEIPT',
      entityId: grId,
      entityNumber: grNumber,
      action: 'CREATE',
      actionDetails: `Goods Receipt ${grNumber} created with ${(grData.itemCount as number) || 0} items, total ${grData.totalAmount as number}`,
      newValues: grData,
      severity: 'INFO',
      category: 'INVENTORY',
      tags: ['goods-receipt', 'create', 'receiving'],
    },
    context
  );
}

/**
 * Log goods receipt finalized (stock added)
 */
export async function logGoodsReceiptFinalized(
  pool: Pool,
  grId: string,
  grNumber: string,
  grData: Record<string, unknown>,
  context: AuditContext
): Promise<AuditLog | null> {
  return await logAction(
    pool,
    {
      entityType: 'GOODS_RECEIPT',
      entityId: grId,
      entityNumber: grNumber,
      action: 'FINALIZE',
      actionDetails: `Goods Receipt ${grNumber} finalized - ${(grData.itemCount as number) || 0} items added to inventory`,
      newValues: grData,
      severity: 'INFO',
      category: 'INVENTORY',
      tags: ['goods-receipt', 'finalize', 'stock-in'],
    },
    context
  );
}

// =====================================================
// CUSTOMER AUDIT FUNCTIONS
// =====================================================

/**
 * Log customer created
 */
export async function logCustomerCreated(
  pool: Pool,
  customerId: string,
  customerData: Record<string, unknown>,
  context: AuditContext
): Promise<AuditLog | null> {
  return await logAction(
    pool,
    {
      entityType: 'CUSTOMER',
      entityId: customerId,
      entityNumber: customerData.customerNumber as string,
      action: 'CREATE',
      actionDetails: `Customer ${customerData.name as string} created`,
      newValues: customerData,
      severity: 'INFO',
      category: 'MASTER_DATA',
      tags: ['customer', 'create'],
    },
    context
  );
}

/**
 * Log customer updated
 */
export async function logCustomerUpdated(
  pool: Pool,
  customerId: string,
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  context: AuditContext
): Promise<AuditLog | null> {
  return await logAction(
    pool,
    {
      entityType: 'CUSTOMER',
      entityId: customerId,
      entityNumber: newData.customerNumber as string,
      action: 'UPDATE',
      actionDetails: `Customer ${newData.name as string} updated`,
      oldValues: oldData,
      newValues: newData,
      severity: 'INFO',
      category: 'MASTER_DATA',
      tags: ['customer', 'update'],
    },
    context
  );
}

// =====================================================
// PRODUCT AUDIT FUNCTIONS
// =====================================================

/**
 * Log product created
 */
export async function logProductCreated(
  pool: Pool,
  productId: string,
  productData: Record<string, unknown>,
  context: AuditContext
): Promise<AuditLog | null> {
  return await logAction(
    pool,
    {
      entityType: 'PRODUCT',
      entityId: productId,
      entityNumber: (productData.sku || productData.productCode) as string,
      action: 'CREATE',
      actionDetails: `Product ${productData.name as string} created (SKU: ${(productData.sku || productData.productCode) as string})`,
      newValues: productData,
      severity: 'INFO',
      category: 'MASTER_DATA',
      tags: ['product', 'create'],
    },
    context
  );
}

/**
 * Log product updated
 */
export async function logProductUpdated(
  pool: Pool,
  productId: string,
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  context: AuditContext
): Promise<AuditLog | null> {
  return await logAction(
    pool,
    {
      entityType: 'PRODUCT',
      entityId: productId,
      entityNumber: (newData.sku || newData.productCode) as string,
      action: 'UPDATE',
      actionDetails: `Product ${newData.name as string} updated`,
      oldValues: oldData,
      newValues: newData,
      severity: 'INFO',
      category: 'MASTER_DATA',
      tags: ['product', 'update'],
    },
    context
  );
}

// =====================================================
// SUPPLIER AUDIT FUNCTIONS
// =====================================================

/**
 * Log supplier created
 */
export async function logSupplierCreated(
  pool: Pool,
  supplierId: string,
  supplierData: Record<string, unknown>,
  context: AuditContext
): Promise<AuditLog | null> {
  return await logAction(
    pool,
    {
      entityType: 'SUPPLIER',
      entityId: supplierId,
      entityNumber: supplierData.supplierCode as string,
      action: 'CREATE',
      actionDetails: `Supplier ${supplierData.name as string} created`,
      newValues: supplierData,
      severity: 'INFO',
      category: 'MASTER_DATA',
      tags: ['supplier', 'create'],
    },
    context
  );
}

// =====================================================
// PAYMENT-SPECIFIC AUDIT FUNCTIONS
// =====================================================

/**
 * Log payment recorded
 */
export async function logPaymentRecorded(
  pool: Pool | PoolClient,
  paymentId: string,
  paymentData: Record<string, unknown>,
  context: AuditContext
): Promise<AuditLog | null> {
  return await logAction(
    pool,
    {
      entityType: 'PAYMENT',
      entityId: paymentId,
      action: 'CREATE',
      actionDetails: `Payment recorded: ${paymentData.paymentMethod as string} ${paymentData.amount as number}`,
      newValues: paymentData,
      severity: 'INFO',
      category: 'FINANCIAL',
      tags: ['payment', 'create'],
      referenceNumber: paymentData.referenceNumber as string,
    },
    context
  );
}

/**
 * Log payment refund
 */
export async function logPaymentRefunded(
  pool: Pool,
  paymentId: string,
  refundData: Record<string, unknown>,
  originalPaymentData: Record<string, unknown>,
  context: AuditContext
): Promise<AuditLog | null> {
  return await logAction(
    pool,
    {
      entityType: 'PAYMENT',
      entityId: paymentId,
      action: 'REFUND',
      actionDetails: `Payment refunded: ${refundData.refundMethod as string} ${refundData.refundAmount as number}`,
      oldValues: originalPaymentData,
      newValues: refundData,
      severity: 'WARNING',
      category: 'FINANCIAL',
      tags: ['payment', 'refund'],
      notes: refundData.reason as string,
    },
    context
  );
}

// =====================================================
// INVOICE-SPECIFIC AUDIT FUNCTIONS
// =====================================================

/**
 * Log invoice creation
 */
export async function logInvoiceCreated(
  pool: Pool,
  invoiceId: string,
  invoiceNumber: string,
  invoiceData: Record<string, unknown>,
  context: AuditContext
): Promise<AuditLog | null> {
  return await logAction(
    pool,
    {
      entityType: 'INVOICE',
      entityId: invoiceId,
      entityNumber: invoiceNumber,
      action: 'CREATE',
      actionDetails: `Invoice ${invoiceNumber} created for customer ${invoiceData.customerName as string}`,
      newValues: invoiceData,
      severity: 'INFO',
      category: 'FINANCIAL',
      tags: ['invoice', 'create', 'credit'],
    },
    context
  );
}

/**
 * Log invoice payment
 */
export async function logInvoicePayment(
  pool: Pool,
  invoiceId: string,
  invoiceNumber: string,
  paymentData: Record<string, unknown>,
  context: AuditContext
): Promise<AuditLog | null> {
  return await logAction(
    pool,
    {
      entityType: 'INVOICE',
      entityId: invoiceId,
      entityNumber: invoiceNumber,
      action: 'UPDATE',
      actionDetails: `Payment ${paymentData.amount as number} applied to invoice ${invoiceNumber}`,
      newValues: paymentData,
      severity: 'INFO',
      category: 'FINANCIAL',
      tags: ['invoice', 'payment'],
    },
    context
  );
}

// =====================================================
// INVENTORY-SPECIFIC AUDIT FUNCTIONS
// =====================================================

/**
 * Log inventory adjustment
 */
export async function logInventoryAdjustment(
  pool: Pool,
  adjustmentId: string,
  adjustmentNumber: string,
  adjustmentData: Record<string, unknown>,
  context: AuditContext
): Promise<AuditLog | null> {
  return await logAction(
    pool,
    {
      entityType: 'INVENTORY_ADJUSTMENT',
      entityId: adjustmentId,
      entityNumber: adjustmentNumber,
      action: 'ADJUST_INVENTORY',
      actionDetails: `Inventory adjusted: ${adjustmentData.reason as string}`,
      newValues: adjustmentData,
      severity: 'WARNING',
      category: 'INVENTORY',
      tags: ['inventory', 'adjustment'],
      notes: adjustmentData.notes as string,
    },
    context
  );
}

/**
 * Log product price change
 */
export async function logPriceChange(
  pool: Pool,
  productId: string,
  productName: string,
  oldPrice: number,
  newPrice: number,
  context: AuditContext
): Promise<AuditLog | null> {
  return await logAction(
    pool,
    {
      entityType: 'PRODUCT',
      entityId: productId,
      action: 'PRICE_CHANGE',
      actionDetails: `Price changed for ${productName}: ${oldPrice} → ${newPrice}`,
      oldValues: { price: oldPrice },
      newValues: { price: newPrice },
      severity: 'INFO',
      category: 'INVENTORY',
      tags: ['product', 'price', 'change'],
    },
    context
  );
}

// =====================================================
// USER/AUTH-SPECIFIC AUDIT FUNCTIONS
// =====================================================

/**
 * Log user login (creates session)
 */
export async function logUserLogin(
  pool: Pool,
  userId: string,
  userName: string,
  userRole: string,
  context: Partial<AuditContext>
): Promise<UserSession> {
  // Create session
  const session = await auditRepo.createUserSession(pool, {
    userId,
    userName,
    userRole,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    deviceType: 'POS_TERMINAL', // Can be parameterized
  });

  // Log audit entry
  await safeLogAudit(pool, {
    entityType: 'USER',
    entityId: userId,
    action: 'LOGIN',
    actionDetails: `User ${userName} logged in`,
    userId,
    userName,
    userRole,
    sessionId: session.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    severity: 'INFO',
    category: 'ACCESS',
    tags: ['user', 'login', 'auth'],
  });

  return session;
}

/**
 * Log user logout (ends session)
 */
export async function logUserLogout(
  pool: Pool,
  sessionId: string,
  reason: 'MANUAL' | 'TIMEOUT' | 'FORCED' = 'MANUAL',
  context: AuditContext
): Promise<UserSession | null> {
  // Get session to log details
  const session = await auditRepo.getSessionById(pool, sessionId);
  if (!session) {
    // Session not found - log audit entry anyway with generic details
    await safeLogAudit(pool, {
      entityType: 'USER',
      entityId: context.userId,
      action: 'LOGOUT',
      actionDetails: `User logout attempted (${reason}) - session not found`,
      userId: context.userId,
      userName: context.userName,
      userRole: context.userRole,
      sessionId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      severity: 'WARNING',
      category: 'ACCESS',
      tags: ['user', 'logout', 'auth', 'session-not-found'],
      notes: `Session ${sessionId} not found in database`,
    });
    return null;
  }

  // End session
  const endedSession = await auditRepo.endUserSession(pool, {
    sessionId,
    logoutReason: reason,
  });

  // Log audit entry
  await safeLogAudit(pool, {
    entityType: 'USER',
    entityId: session.userId,
    action: 'LOGOUT',
    actionDetails: `User ${session.userName} logged out (${reason})`,
    userId: context.userId,
    userName: context.userName,
    userRole: context.userRole,
    sessionId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    severity: 'INFO',
    category: 'ACCESS',
    tags: ['user', 'logout', 'auth'],
  });

  return endedSession;
}

/**
 * Log failed login attempt
 */
export async function logLoginFailed(
  pool: Pool,
  username: string,
  reason: string,
  context: Partial<AuditContext>
): Promise<AuditLog | null> {
  return await safeLogAudit(pool, {
    entityType: 'USER',
    action: 'LOGIN_FAILED',
    actionDetails: `Failed login attempt for user ${username}: ${reason}`,
    userId: '00000000-0000-0000-0000-000000000000', // System/unknown user UUID
    userName: username,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    severity: 'WARNING',
    category: 'SECURITY',
    tags: ['user', 'login', 'failed', 'security'],
    notes: reason,
  });
}

// =====================================================
// DISCOUNT AUDIT FUNCTIONS
// =====================================================

/**
 * Log discount application
 */
export async function logDiscountApplied(
  pool: Pool,
  discountId: string,
  saleId: string,
  saleNumber: string,
  discountData: {
    discountType: string;
    discountAmount: number;
    originalAmount: number;
    finalAmount: number;
    reason: string;
    requiresApproval: boolean;
  },
  context: AuditContext
): Promise<AuditLog | null> {
  const discountPercent = ((discountData.discountAmount / discountData.originalAmount) * 100).toFixed(2);

  return await logAction(
    pool,
    {
      entityType: 'DISCOUNT',
      entityId: discountId,
      action: 'CREATE',
      actionDetails: `Discount applied to ${saleNumber}: ${discountPercent}% (${discountData.discountAmount.toFixed(2)})`,
      newValues: {
        saleId,
        saleNumber,
        discountType: discountData.discountType,
        discountAmount: discountData.discountAmount,
        originalAmount: discountData.originalAmount,
        finalAmount: discountData.finalAmount,
        reason: discountData.reason,
        requiresApproval: discountData.requiresApproval,
      },
      severity: discountData.requiresApproval ? 'WARNING' : 'INFO',
      category: 'FINANCIAL',
      tags: ['discount', 'apply', discountData.requiresApproval ? 'requires-approval' : 'auto-approved'],
      referenceNumber: saleNumber,
      notes: discountData.reason,
    },
    context
  );
}

/**
 * Log discount approval
 */
export async function logDiscountApproved(
  pool: Pool,
  authorizationId: string,
  discountData: {
    saleId: string;
    saleNumber: string;
    discountAmount: number;
    requestedBy: string;
    approvedBy: string;
  },
  context: AuditContext
): Promise<AuditLog | null> {
  return await logAction(
    pool,
    {
      entityType: 'DISCOUNT',
      entityId: authorizationId,
      action: 'APPROVE',
      actionDetails: `Discount approved for ${discountData.saleNumber}: ${discountData.discountAmount.toFixed(2)}`,
      newValues: {
        saleId: discountData.saleId,
        saleNumber: discountData.saleNumber,
        discountAmount: discountData.discountAmount,
        requestedBy: discountData.requestedBy,
        approvedBy: discountData.approvedBy,
        approvedAt: new Date().toISOString(),
      },
      severity: 'INFO',
      category: 'FINANCIAL',
      tags: ['discount', 'approve', 'authorization'],
      referenceNumber: discountData.saleNumber,
      notes: `Approved by ${context.userName}`,
    },
    context
  );
}

/**
 * Log discount rejection
 */
export async function logDiscountRejected(
  pool: Pool,
  authorizationId: string,
  discountData: {
    saleId: string;
    saleNumber: string;
    discountAmount: number;
    requestedBy: string;
    reason: string;
  },
  context: AuditContext
): Promise<AuditLog | null> {
  return await logAction(
    pool,
    {
      entityType: 'DISCOUNT',
      entityId: authorizationId,
      action: 'REJECT',
      actionDetails: `Discount rejected for ${discountData.saleNumber}`,
      newValues: {
        saleId: discountData.saleId,
        saleNumber: discountData.saleNumber,
        discountAmount: discountData.discountAmount,
        requestedBy: discountData.requestedBy,
        rejectedBy: context.userName,
        rejectedAt: new Date().toISOString(),
        reason: discountData.reason,
      },
      severity: 'WARNING',
      category: 'FINANCIAL',
      tags: ['discount', 'reject', 'authorization'],
      referenceNumber: discountData.saleNumber,
      notes: discountData.reason,
    },
    context
  );
}

// =====================================================
// PRICE OVERRIDE AUDIT FUNCTIONS
// =====================================================

/**
 * Log price override
 */
export async function logPriceOverride(
  pool: Pool,
  productId: string,
  productName: string,
  uomName: string,
  priceData: {
    originalPrice: number;
    overridePrice: number;
    reason: string;
    saleId?: string;
    saleNumber?: string;
  },
  context: AuditContext
): Promise<AuditLog | null> {
  const priceChange = priceData.overridePrice - priceData.originalPrice;
  const priceChangePercent = ((priceChange / priceData.originalPrice) * 100).toFixed(2);

  return await logAction(
    pool,
    {
      entityType: 'PRODUCT',
      entityId: productId,
      action: 'PRICE_OVERRIDE',
      actionDetails: `Price override for ${productName} (${uomName}): ${priceData.originalPrice.toFixed(2)} → ${priceData.overridePrice.toFixed(2)} (${priceChangePercent}%)`,
      oldValues: {
        price: priceData.originalPrice,
        productName,
        uomName,
      },
      newValues: {
        price: priceData.overridePrice,
        productName,
        uomName,
        reason: priceData.reason,
        saleId: priceData.saleId,
        saleNumber: priceData.saleNumber,
      },
      severity: Math.abs(parseFloat(priceChangePercent)) > 20 ? 'WARNING' : 'INFO',
      category: 'FINANCIAL',
      tags: ['price', 'override', 'product'],
      referenceNumber: priceData.saleNumber,
      notes: priceData.reason,
    },
    context
  );
}

/**
 * Log permanent UOM price override
 */
export async function logUomPriceOverride(
  pool: Pool,
  productId: string,
  uomId: string,
  priceData: {
    productName: string;
    uomName: string;
    calculatedPrice: number;
    overridePrice: number | null;
    reason?: string;
  },
  context: AuditContext
): Promise<AuditLog | null> {
  const action = priceData.overridePrice === null ? 'REMOVE' : 'CREATE';
  const actionDetails = priceData.overridePrice === null
    ? `Price override removed for ${priceData.productName} (${priceData.uomName})`
    : `Permanent price override set for ${priceData.productName} (${priceData.uomName}): ${priceData.calculatedPrice.toFixed(2)} → ${priceData.overridePrice.toFixed(2)}`;

  return await logAction(
    pool,
    {
      entityType: 'PRODUCT',
      entityId: productId,
      action,
      actionDetails,
      oldValues: priceData.overridePrice === null ? { priceOverride: priceData.calculatedPrice } : { calculatedPrice: priceData.calculatedPrice },
      newValues: {
        priceOverride: priceData.overridePrice,
        productName: priceData.productName,
        uomName: priceData.uomName,
        uomId,
      },
      severity: 'INFO',
      category: 'INVENTORY',
      tags: ['price', 'override', 'uom', 'product'],
      notes: priceData.reason,
    },
    context
  );
}

// =====================================================
// CASH DRAWER AUDIT FUNCTIONS
// =====================================================

/**
 * Log cash drawer open event
 */
export async function logCashDrawerOpened(
  pool: Pool,
  reason: string,
  saleNumber: string | null,
  context: AuditContext
): Promise<AuditLog | null> {
  return await logAction(
    pool,
    {
      entityType: 'SYSTEM',
      action: 'OPEN_DRAWER',
      actionDetails: `Cash drawer opened. Reason: ${reason}`,
      severity: 'INFO',
      category: 'FINANCIAL',
      tags: ['cash-drawer', 'open'],
      referenceNumber: saleNumber || undefined,
      notes: reason,
    },
    context
  );
}

/**
 * Log shift close
 */
export async function logShiftClosed(
  pool: Pool,
  shiftData: Record<string, unknown>,
  context: AuditContext
): Promise<AuditLog | null> {
  return await logAction(
    pool,
    {
      entityType: 'SYSTEM',
      action: 'CLOSE_SHIFT',
      actionDetails: `Shift closed by ${context.userName}`,
      newValues: shiftData,
      severity: 'INFO',
      category: 'FINANCIAL',
      tags: ['shift', 'close', 'reconciliation'],
    },
    context
  );
}

// =====================================================
// FAILED TRANSACTION LOGGING
// =====================================================

/**
 * Record a failed transaction attempt
 */
export async function recordFailedTransaction(
  pool: Pool,
  data: RecordFailedTransaction,
  context: Partial<AuditContext>
): Promise<FailedTransaction | null> {
  try {
    return await auditRepo.recordFailedTransaction(pool, {
      ...data,
      userId: context.userId,
      userName: context.userName,
      sessionId: context.sessionId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
    });
  } catch (error) {
    console.error('⚠️ Failed to record failed transaction (ironic):', error);
    return null;
  }
}

// =====================================================
// QUERY FUNCTIONS
// =====================================================

/**
 * Get audit logs with filters
 */
export async function getAuditLogs(
  pool: Pool,
  filters: AuditLogQuery
): Promise<{ data: AuditLog[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const { data, total } = await auditRepo.getAuditLogs(pool, filters);

  const page = filters.page || 1;
  const limit = filters.limit || 50;
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  };
}

/**
 * Get audit trail for a specific entity
 */
export async function getEntityAuditTrail(
  pool: Pool,
  entityType: string,
  entityIdentifier: string
): Promise<AuditLog[]> {
  // Try UUID first
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(entityIdentifier);

  if (isUuid) {
    return await auditRepo.getEntityAuditTrail(pool, entityType, entityIdentifier);
  } else {
    // Try business identifier (SALE-2025-0001, INV-00123, etc.)
    return await auditRepo.getEntityAuditTrailByNumber(pool, entityIdentifier);
  }
}

/**
 * Get active user sessions
 */
export async function getActiveSessions(pool: Pool): Promise<UserSession[]> {
  return await auditRepo.getActiveSessions(pool);
}

/**
 * Get user's session history
 */
export async function getUserSessions(
  pool: Pool,
  userId: string,
  limit: number = 10
): Promise<UserSession[]> {
  return await auditRepo.getUserSessions(pool, userId, limit);
}

/**
 * Get failed transaction summary
 */
export async function getFailedTransactionSummary(
  pool: Pool,
  days: number = 30
) {
  return await auditRepo.getFailedTransactionSummary(pool, days);
}

/**
 * Force logout idle sessions (run periodically)
 */
export async function forceLogoutIdleSessions(
  pool: Pool,
  idleMinutes: number = 15
): Promise<number> {
  return await auditRepo.forceLogoutIdleSessions(pool, idleMinutes);
}
