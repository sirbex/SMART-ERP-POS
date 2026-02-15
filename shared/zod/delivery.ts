/**
 * Delivery Tracking System - Zod Validation Schemas
 * Phase 2: Complete delivery management validation
 */

import { z } from 'zod';

// ====================================================
// ENUM SCHEMAS
// ====================================================

export const DeliveryStatusSchema = z.enum([
  'PENDING',
  'ASSIGNED',
  'IN_TRANSIT',
  'DELIVERED',
  'FAILED',
  'CANCELLED'
]);

export const ItemConditionSchema = z.enum([
  'GOOD',
  'DAMAGED',
  'MISSING',
  'PARTIAL'
]);

export const RouteStatusSchema = z.enum([
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED'
]);

export const ProofTypeSchema = z.enum([
  'SIGNATURE',
  'PHOTO',
  'ID_VERIFICATION',
  'SMS_CONFIRMATION'
]);

// ====================================================
// CORE DELIVERY SCHEMAS
// ====================================================

export const DeliveryOrderSchema = z.object({
  id: z.string().uuid(),
  deliveryNumber: z.string().regex(/^DEL-\d{4}-\d{4}$/, 'Delivery number must follow DEL-YYYY-NNNN format'),
  trackingNumber: z.string().min(1).max(100).optional(),

  // Related entities
  saleId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  customerName: z.string().optional(),

  // Delivery details
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  expectedDeliveryTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/, 'Time must be HH:MM:SS').optional(),
  actualDeliveryTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/, 'Time must be HH:MM:SS').optional(),
  deliveryAddress: z.string().min(5).max(1000),
  deliveryContactName: z.string().max(255).optional(),
  deliveryContactPhone: z.string().max(50).optional(),
  specialInstructions: z.string().max(2000).optional(),

  // Status
  status: DeliveryStatusSchema,

  // Driver assignment
  assignedDriverId: z.string().uuid().optional(),
  assignedDriverName: z.string().optional(),
  assignedAt: z.string().datetime().optional(),

  // Tracking
  estimatedDistanceKm: z.number().nonnegative().optional(),
  actualDistanceKm: z.number().nonnegative().optional(),

  // Financial
  deliveryFee: z.number().nonnegative().default(0),
  fuelCost: z.number().nonnegative().optional(),
  totalCost: z.number().nonnegative().optional(),

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),

  // Audit
  createdById: z.string().uuid().optional(),
  createdByName: z.string().optional(),
  updatedById: z.string().uuid().optional(),
  updatedByName: z.string().optional(),
}).strict();

export const DeliveryItemSchema = z.object({
  id: z.string().uuid(),
  deliveryOrderId: z.string().uuid(),

  // Product information
  productId: z.string().uuid().optional(),
  productName: z.string().min(1).max(255),
  productCode: z.string().max(100).optional(),

  // Quantity tracking
  quantityRequested: z.number().positive(),
  quantityDelivered: z.number().nonnegative().default(0),
  unitOfMeasure: z.string().max(50).optional(),

  // Batch tracking
  batchId: z.string().uuid().optional(),
  batchNumber: z.string().max(100).optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),

  // Condition
  conditionOnDelivery: ItemConditionSchema.default('GOOD'),
  damageNotes: z.string().max(1000).optional(),

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict().refine(
  (data) => data.quantityDelivered <= data.quantityRequested,
  {
    message: "Delivered quantity cannot exceed requested quantity",
    path: ["quantityDelivered"],
  }
);

export const DeliveryStatusHistorySchema = z.object({
  id: z.string().uuid(),
  deliveryOrderId: z.string().uuid(),

  // Status change
  oldStatus: DeliveryStatusSchema.optional(),
  newStatus: DeliveryStatusSchema,
  statusDate: z.string().datetime(),

  // Location
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  locationName: z.string().max(255).optional(),

  // Notes
  notes: z.string().max(2000).optional(),
  photoUrl: z.string().url().max(500).optional(),

  // User
  changedById: z.string().uuid().optional(),
  changedByName: z.string().optional(),

  // Timestamps
  createdAt: z.string().datetime(),
}).strict();

export const DeliveryRouteSchema = z.object({
  id: z.string().uuid(),
  routeName: z.string().min(1).max(255),

  // Driver and vehicle
  driverId: z.string().uuid().optional(),
  driverName: z.string().optional(),
  vehicleId: z.string().max(100).optional(),
  vehiclePlateNumber: z.string().max(50).optional(),

  // Route details
  routeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  plannedStartTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/, 'Time must be HH:MM:SS').optional(),
  actualStartTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/, 'Time must be HH:MM:SS').optional(),
  plannedEndTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/, 'Time must be HH:MM:SS').optional(),
  actualEndTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/, 'Time must be HH:MM:SS').optional(),

  // Optimization
  totalDistanceKm: z.number().nonnegative().optional(),
  totalFuelCost: z.number().nonnegative().optional(),
  routeEfficiencyScore: z.number().min(0).max(100).optional(),

  // Status
  status: RouteStatusSchema.default('PLANNED'),

  // Metrics
  totalDeliveries: z.number().nonnegative().optional(),
  completedDeliveries: z.number().nonnegative().optional(),
  failedDeliveries: z.number().nonnegative().optional(),

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  createdById: z.string().uuid().optional(),
  createdByName: z.string().optional(),
}).strict();

export const DeliveryProofSchema = z.object({
  id: z.string().uuid(),
  deliveryOrderId: z.string().uuid(),

  // Proof details
  proofType: ProofTypeSchema,
  proofData: z.string().optional(), // Base64 or URL
  recipientName: z.string().max(255).optional(),
  recipientRelationship: z.string().max(100).optional(),

  // Verification
  verifiedAt: z.string().datetime(),
  verifiedById: z.string().uuid().optional(),
  verifiedByName: z.string().optional(),

  // Timestamps
  createdAt: z.string().datetime(),
}).strict();

// ====================================================
// API REQUEST SCHEMAS
// ====================================================

export const CreateDeliveryOrderRequestSchema = z.object({
  saleId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
  customerId: z.string().uuid(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  expectedDeliveryTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/, 'Time must be HH:MM:SS').optional(),
  deliveryAddress: z.string().min(5).max(1000),
  deliveryContactName: z.string().max(255).optional(),
  deliveryContactPhone: z.string().max(50).optional(),
  specialInstructions: z.string().max(2000).optional(),
  deliveryFee: z.number().nonnegative().default(0),
  items: z.array(z.object({
    productId: z.string().uuid().optional(),
    productName: z.string().min(1).max(255),
    productCode: z.string().max(100).optional(),
    quantityRequested: z.number().positive(),
    unitOfMeasure: z.string().max(50).optional(),
    batchId: z.string().uuid().optional(),
  })).min(1, 'At least one item is required'),
}).strict();

export const UpdateDeliveryOrderRequestSchema = z.object({
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  expectedDeliveryTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/, 'Time must be HH:MM:SS').optional(),
  deliveryAddress: z.string().min(5).max(1000).optional(),
  deliveryContactName: z.string().max(255).optional(),
  deliveryContactPhone: z.string().max(50).optional(),
  specialInstructions: z.string().max(2000).optional(),
  deliveryFee: z.number().nonnegative().optional(),
  assignedDriverId: z.string().uuid().optional(),
}).strict();

export const UpdateDeliveryStatusRequestSchema = z.object({
  status: DeliveryStatusSchema,
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  locationName: z.string().max(255).optional(),
  notes: z.string().max(2000).optional(),
  actualDeliveryTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/, 'Time must be HH:MM:SS').optional(),
}).strict();

export const CreateDeliveryRouteRequestSchema = z.object({
  routeName: z.string().min(1).max(255),
  driverId: z.string().uuid().optional(),
  vehicleId: z.string().max(100).optional(),
  vehiclePlateNumber: z.string().max(50).optional(),
  routeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  plannedStartTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/, 'Time must be HH:MM:SS').optional(),
  plannedEndTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/, 'Time must be HH:MM:SS').optional(),
  deliveryOrderIds: z.array(z.string().uuid()).min(1, 'At least one delivery order is required'),
}).strict();

export const UpdateDeliveryItemRequestSchema = z.object({
  quantityDelivered: z.number().nonnegative(),
  conditionOnDelivery: ItemConditionSchema,
  damageNotes: z.string().max(1000).optional(),
}).strict();

export const AddDeliveryProofRequestSchema = z.object({
  proofType: ProofTypeSchema,
  proofData: z.string().optional(),
  recipientName: z.string().max(255).optional(),
  recipientRelationship: z.string().max(100).optional(),
}).strict();

// ====================================================
// QUERY PARAMETER SCHEMAS
// ====================================================

export const DeliveryOrderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: DeliveryStatusSchema.optional(),
  customerId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  deliveryDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  deliveryDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().max(255).optional(), // Search in delivery number, tracking number, customer name
  sortBy: z.enum(['deliveryDate', 'deliveryNumber', 'status', 'createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).strict();

export const DeliveryRouteQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: RouteStatusSchema.optional(),
  driverId: z.string().uuid().optional(),
  routeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  routeDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  routeDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().max(255).optional(),
  sortBy: z.enum(['routeDate', 'routeName', 'status', 'createdAt']).default('routeDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).strict();

// ====================================================
// TYPE INFERENCE
// ====================================================

export type DeliveryOrder = z.infer<typeof DeliveryOrderSchema>;
export type DeliveryItem = z.infer<typeof DeliveryItemSchema>;
export type DeliveryStatusHistory = z.infer<typeof DeliveryStatusHistorySchema>;
export type DeliveryRoute = z.infer<typeof DeliveryRouteSchema>;
export type DeliveryProof = z.infer<typeof DeliveryProofSchema>;

export type CreateDeliveryOrderRequest = z.infer<typeof CreateDeliveryOrderRequestSchema>;
export type UpdateDeliveryOrderRequest = z.infer<typeof UpdateDeliveryOrderRequestSchema>;
export type UpdateDeliveryStatusRequest = z.infer<typeof UpdateDeliveryStatusRequestSchema>;
export type CreateDeliveryRouteRequest = z.infer<typeof CreateDeliveryRouteRequestSchema>;
export type UpdateDeliveryItemRequest = z.infer<typeof UpdateDeliveryItemRequestSchema>;
export type AddDeliveryProofRequest = z.infer<typeof AddDeliveryProofRequestSchema>;

export type DeliveryOrderQuery = z.infer<typeof DeliveryOrderQuerySchema>;
export type DeliveryRouteQuery = z.infer<typeof DeliveryRouteQuerySchema>;

// ====================================================
// UTILITY VALIDATION FUNCTIONS
// ====================================================

/**
 * Validate delivery order creation data
 */
export function validateCreateDeliveryOrder(data: unknown): CreateDeliveryOrderRequest {
  return CreateDeliveryOrderRequestSchema.parse(data);
}

/**
 * Validate delivery status update data
 */
export function validateDeliveryStatusUpdate(data: unknown): UpdateDeliveryStatusRequest {
  return UpdateDeliveryStatusRequestSchema.parse(data);
}

/**
 * Validate delivery route creation data
 */
export function validateCreateDeliveryRoute(data: unknown): CreateDeliveryRouteRequest {
  return CreateDeliveryRouteRequestSchema.parse(data);
}

/**
 * Validate delivery query parameters
 */
export function validateDeliveryOrderQuery(data: unknown): DeliveryOrderQuery {
  return DeliveryOrderQuerySchema.parse(data);
}