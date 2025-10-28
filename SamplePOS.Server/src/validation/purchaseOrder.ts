/**
 * Purchase Order Validation Schemas
 * 
 * Zod validation schemas for Purchase Order creation and updates.
 * Ensures data integrity, business rules, and type safety.
 */

import { z } from 'zod';

/**
 * Purchase Order Status Enum
 */
export const POStatusEnum = z.enum([
  'DRAFT',
  'PENDING',
  'PARTIAL',
  'COMPLETED',
  'CANCELLED'
]);

/**
 * Purchase Order Item Schema
 * Used when creating/updating a purchase order
 */
export const PurchaseOrderItemSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  
  orderedQuantity: z
    .number()
    .positive('Ordered quantity must be positive')
    .finite('Ordered quantity must be a finite number'),
  
  unitPrice: z
    .number()
    .nonnegative('Unit price cannot be negative')
    .finite('Unit price must be a finite number'),
  
  notes: z
    .string()
    .max(500, 'Item notes cannot exceed 500 characters')
    .optional()
    .nullable()
});

/**
 * Create Purchase Order Schema
 * Used for POST /api/purchase-orders
 */
export const CreatePurchaseOrderSchema = z.object({
  supplierId: z
    .string()
    .cuid('Supplier ID must be a valid CUID'),

  orderDate: z
    .string()
    .datetime('Order date must be a valid ISO datetime')
    .optional()
    .nullable(),


  expectedDeliveryDate: z
    .string()
    .datetime('Expected delivery date must be a valid ISO datetime')
    .optional()
    .nullable(),
  
  paymentTerms: z
    .string()
    .max(200, 'Payment terms cannot exceed 200 characters')
    .optional()
    .nullable(),
  
  notes: z
    .string()
    .max(1000, 'Notes cannot exceed 1000 characters')
    .optional()
    .nullable(),
  
  items: z
    .array(PurchaseOrderItemSchema)
    .min(1, 'Purchase order must contain at least one item')
    .max(500, 'Purchase order cannot exceed 500 items')
});

/**
 * Update Purchase Order Schema
 * Used for PUT /api/purchase-orders/:id
 * Only allows updates when status is DRAFT
 */
export const UpdatePurchaseOrderSchema = z.object({
  supplierId: z
    .string()
    .cuid('Supplier ID must be a valid CUID')
    .optional(),
  
  expectedDeliveryDate: z
    .string()
    .datetime('Expected delivery date must be a valid ISO datetime')
    .optional()
    .nullable(),
  
  paymentTerms: z
    .string()
    .max(200, 'Payment terms cannot exceed 200 characters')
    .optional()
    .nullable(),
  
  notes: z
    .string()
    .max(1000, 'Notes cannot exceed 1000 characters')
    .optional()
    .nullable(),
  
  items: z
    .array(PurchaseOrderItemSchema)
    .min(1, 'Purchase order must contain at least one item')
    .max(500, 'Purchase order cannot exceed 500 items')
    .optional()
});

/**
 * Purchase Order Query Filters Schema
 * Used for GET /api/purchase-orders
 */
export const PurchaseOrderFiltersSchema = z.object({
  status: POStatusEnum.optional(),
  
  supplierId: z
    .string()
    .cuid('Supplier ID must be a valid CUID')
    .optional(),
  
  startDate: z
    .string()
    .datetime('Start date must be a valid ISO datetime')
    .optional(),
  
  endDate: z
    .string()
    .datetime('End date must be a valid ISO datetime')
    .optional(),
  
  page: z
    .number()
    .int('Page must be an integer')
    .positive('Page must be positive')
    .optional()
    .default(1),
  
  limit: z
    .number()
    .int('Limit must be an integer')
    .positive('Limit must be positive')
    .max(100, 'Limit cannot exceed 100')
    .optional()
    .default(20)
});

/**
 * Send Purchase Order Schema
 * Used for POST /api/purchase-orders/:id/send
 * Transitions status from DRAFT to PENDING
 */
export const SendPurchaseOrderSchema = z.object({
  sentDate: z
    .string()
    .datetime('Sent date must be a valid ISO datetime')
    .optional()
    .default(() => new Date().toISOString())
});

/**
 * Type exports for TypeScript
 */
export type CreatePurchaseOrderInput = z.infer<typeof CreatePurchaseOrderSchema>;
export type UpdatePurchaseOrderInput = z.infer<typeof UpdatePurchaseOrderSchema>;
export type PurchaseOrderItemInput = z.infer<typeof PurchaseOrderItemSchema>;
export type PurchaseOrderFilters = z.infer<typeof PurchaseOrderFiltersSchema>;
export type POStatus = z.infer<typeof POStatusEnum>;

