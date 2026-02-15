/**
 * Delivery Tracking System Types
 * Phase 2: Complete delivery management and tracking
 * 
 * CRITICAL: Dual-ID Architecture
 * - id: UUID for database relations (internal)
 * - deliveryNumber: DEL-YYYY-NNNN for business operations (display)
 * - trackingNumber: TRK-YYYY-DDD-NNNNN for customer tracking
 */

// ====================================================
// CORE DELIVERY TYPES
// ====================================================

export type DeliveryStatus =
  | 'PENDING'      // Created, awaiting assignment
  | 'ASSIGNED'     // Driver assigned, awaiting pickup
  | 'IN_TRANSIT'   // On route to destination
  | 'DELIVERED'    // Successfully delivered
  | 'FAILED'       // Delivery attempt failed
  | 'CANCELLED';   // Delivery cancelled

export type ItemCondition =
  | 'GOOD'         // Item delivered in perfect condition
  | 'DAMAGED'      // Item has damage
  | 'MISSING'      // Item not found/delivered
  | 'PARTIAL';     // Partial quantity delivered

export type RouteStatus =
  | 'PLANNED'      // Route created, not started
  | 'IN_PROGRESS'  // Route in execution
  | 'COMPLETED'    // All deliveries finished
  | 'CANCELLED';   // Route cancelled

export type ProofType =
  | 'SIGNATURE'    // Digital signature capture
  | 'PHOTO'        // Photo of delivery
  | 'ID_VERIFICATION' // ID verification photo
  | 'SMS_CONFIRMATION'; // SMS confirmation code

// ====================================================
// MAIN DELIVERY ORDER INTERFACE
// ====================================================

export interface DeliveryOrder {
  // Dual ID System
  id: string; // UUID - Primary key (keep internal)
  deliveryNumber: string; // DEL-2025-0001 - Business ID (display)
  trackingNumber?: string; // TRK-2025-334-12345 - Customer tracking (optional)

  // Related entities
  saleId?: string; // UUID
  invoiceId?: string; // UUID
  customerId?: string; // UUID (optional)
  customerName?: string; // Display name

  // Delivery details
  deliveryDate: string; // YYYY-MM-DD
  expectedDeliveryTime?: string; // HH:MM:SS
  actualDeliveryTime?: string; // HH:MM:SS
  deliveryAddress: string;
  deliveryContactName?: string;
  deliveryContactPhone?: string;
  specialInstructions?: string;

  // Status tracking
  status: DeliveryStatus;

  // Driver assignment
  assignedDriverId?: string; // UUID
  assignedDriverName?: string; // Display name
  assignedAt?: string; // ISO 8601 timestamp

  // Tracking information
  estimatedDistanceKm?: number;
  actualDistanceKm?: number;

  // Financial
  deliveryFee: number;
  fuelCost?: number;
  totalCost?: number;

  // Items being delivered
  items?: DeliveryItem[];

  // Proof of delivery
  proofs?: DeliveryProof[];

  // Route assignment
  routeId?: string;
  routeName?: string;
  deliverySequence?: number;

  // Timestamps
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  completedAt?: string; // ISO 8601

  // Audit
  createdById?: string;
  createdByName?: string;
  updatedById?: string;
  updatedByName?: string;
}

// ====================================================
// DELIVERY ITEM INTERFACE
// ====================================================

export interface DeliveryItem {
  id: string;
  deliveryOrderId: string;

  // Product information
  productId?: string;
  productName: string;
  productCode?: string;

  // Quantity tracking
  quantityRequested: number;
  quantityDelivered: number;
  unitOfMeasure?: string;

  // Batch tracking (FEFO compliance)
  batchId?: string;
  batchNumber?: string;
  expiryDate?: string; // YYYY-MM-DD

  // Item condition
  conditionOnDelivery: ItemCondition;
  damageNotes?: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

// ====================================================
// DELIVERY STATUS HISTORY
// ====================================================

export interface DeliveryStatusHistory {
  id: string;
  deliveryOrderId: string;

  // Status change details
  oldStatus?: DeliveryStatus;
  newStatus: DeliveryStatus;
  statusDate: string; // ISO 8601

  // Location tracking
  latitude?: number;
  longitude?: number;
  locationName?: string;

  // Notes and context
  notes?: string;
  photoUrl?: string;

  // User who made the change
  changedById?: string;
  changedByName?: string;

  // Timestamps
  createdAt: string;
}

// ====================================================
// DELIVERY ROUTES
// ====================================================

export interface DeliveryRoute {
  id: string;
  routeName: string;

  // Driver and vehicle
  driverId?: string;
  driverName?: string;
  vehicleId?: string;
  vehiclePlateNumber?: string;

  // Route details
  routeDate: string; // YYYY-MM-DD
  plannedStartTime?: string; // HH:MM:SS
  actualStartTime?: string; // HH:MM:SS
  plannedEndTime?: string; // HH:MM:SS
  actualEndTime?: string; // HH:MM:SS

  // Route optimization
  totalDistanceKm?: number;
  totalFuelCost?: number;
  routeEfficiencyScore?: number; // 0-100

  // Status
  status: RouteStatus;

  // Deliveries on this route
  deliveries?: RouteDelivery[];

  // Metrics
  totalDeliveries?: number;
  completedDeliveries?: number;
  failedDeliveries?: number;

  // Timestamps
  createdAt: string;
  updatedAt: string;
  createdById?: string;
  createdByName?: string;
}

// ====================================================
// ROUTE DELIVERY ASSIGNMENT
// ====================================================

export interface RouteDelivery {
  id: string;
  routeId: string;
  deliveryOrderId: string;

  // Sequence in route
  deliverySequence: number;
  estimatedArrivalTime?: string; // HH:MM:SS
  actualArrivalTime?: string; // HH:MM:SS

  // Related delivery order (populated)
  deliveryOrder?: DeliveryOrder;

  // Timestamps
  createdAt: string;
}

// ====================================================
// DELIVERY PROOF
// ====================================================

export interface DeliveryProof {
  id: string;
  deliveryOrderId: string;

  // Proof details
  proofType: ProofType;
  proofData?: string; // Base64 encoded data or URL
  recipientName?: string;
  recipientRelationship?: string; // CUSTOMER, EMPLOYEE, NEIGHBOR

  // Verification
  verifiedAt: string; // ISO 8601
  verifiedById?: string;
  verifiedByName?: string;

  // Timestamps
  createdAt: string;
}

// ====================================================
// DATABASE ROW TYPES (snake_case)
// ====================================================

export interface DeliveryOrderDbRow {
  id: string;
  delivery_number: string;
  tracking_number: string;
  sale_id?: string;
  invoice_id?: string;
  customer_id: string;
  customer_name?: string;
  delivery_date: string;
  expected_delivery_time?: string;
  actual_delivery_time?: string;
  delivery_address: string;
  delivery_contact_name?: string;
  delivery_contact_phone?: string;
  special_instructions?: string;
  status: string;
  assigned_driver_id?: string;
  assigned_driver_name?: string;
  assigned_at?: string;
  estimated_distance_km?: string;
  actual_distance_km?: string;
  delivery_fee: string;
  fuel_cost?: string;
  total_cost?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  created_by_id?: string;
  created_by_name?: string;
  updated_by_id?: string;
  updated_by_name?: string;
}

export interface DeliveryItemDbRow {
  id: string;
  delivery_order_id: string;
  product_id?: string;
  product_name: string;
  product_code?: string;
  quantity_requested: string;
  quantity_delivered: string;
  unit_of_measure?: string;
  batch_id?: string;
  batch_number?: string;
  expiry_date?: string;
  condition_on_delivery: string;
  damage_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface DeliveryRouteDbRow {
  id: string;
  route_name: string;
  driver_id?: string;
  driver_name?: string;
  vehicle_id?: string;
  vehicle_plate_number?: string;
  route_date: string;
  planned_start_time?: string;
  actual_start_time?: string;
  planned_end_time?: string;
  actual_end_time?: string;
  total_distance_km?: string;
  total_fuel_cost?: string;
  route_efficiency_score?: string;
  status: string;
  created_at: string;
  updated_at: string;
  created_by_id?: string;
  created_by_name?: string;
}

// ====================================================
// API REQUEST/RESPONSE TYPES
// ====================================================

export interface CreateDeliveryOrderRequest {
  saleId?: string;
  invoiceId?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  deliveryDate: string;
  expectedDeliveryTime?: string;
  deliveryAddress: string;
  deliveryContactName?: string;
  deliveryContactPhone?: string;
  specialInstructions?: string;
  deliveryFee?: number;
  items: {
    productId?: string;
    productName: string;
    productCode?: string;
    quantityRequested: number;
    unitOfMeasure?: string;
    batchId?: string;
  }[];
}

export interface UpdateDeliveryStatusRequest {
  status: DeliveryStatus;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  notes?: string;
  actualDeliveryTime?: string;
}

export interface CreateDeliveryRouteRequest {
  routeName: string;
  driverId?: string;
  vehicleId?: string;
  vehiclePlateNumber?: string;
  routeDate: string;
  plannedStartTime?: string;
  plannedEndTime?: string;
  deliveryOrderIds: string[];
}

export interface AddDeliveryProofRequest {
  proofType: ProofType;
  proofData?: string;
  recipientName?: string;
  recipientRelationship?: string;
}

// ====================================================
// CONVERSION UTILITIES
// ====================================================

export function normalizeDeliveryOrder(dbRow: DeliveryOrderDbRow): DeliveryOrder {
  return {
    id: dbRow.id,
    deliveryNumber: dbRow.delivery_number,
    trackingNumber: dbRow.tracking_number,
    saleId: dbRow.sale_id,
    invoiceId: dbRow.invoice_id,
    customerId: dbRow.customer_id,
    customerName: dbRow.customer_name,
    deliveryDate: dbRow.delivery_date,
    expectedDeliveryTime: dbRow.expected_delivery_time,
    actualDeliveryTime: dbRow.actual_delivery_time,
    deliveryAddress: dbRow.delivery_address,
    deliveryContactName: dbRow.delivery_contact_name,
    deliveryContactPhone: dbRow.delivery_contact_phone,
    specialInstructions: dbRow.special_instructions,
    status: dbRow.status as DeliveryStatus,
    assignedDriverId: dbRow.assigned_driver_id,
    assignedDriverName: dbRow.assigned_driver_name,
    assignedAt: dbRow.assigned_at,
    estimatedDistanceKm: dbRow.estimated_distance_km ? parseFloat(dbRow.estimated_distance_km) : undefined,
    actualDistanceKm: dbRow.actual_distance_km ? parseFloat(dbRow.actual_distance_km) : undefined,
    deliveryFee: parseFloat(dbRow.delivery_fee || '0'),
    fuelCost: dbRow.fuel_cost ? parseFloat(dbRow.fuel_cost) : undefined,
    totalCost: dbRow.total_cost ? parseFloat(dbRow.total_cost) : undefined,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    completedAt: dbRow.completed_at,
    createdById: dbRow.created_by_id,
    createdByName: dbRow.created_by_name,
    updatedById: dbRow.updated_by_id,
    updatedByName: dbRow.updated_by_name,
  };
}

export function normalizeDeliveryItem(dbRow: DeliveryItemDbRow): DeliveryItem {
  return {
    id: dbRow.id,
    deliveryOrderId: dbRow.delivery_order_id,
    productId: dbRow.product_id,
    productName: dbRow.product_name,
    productCode: dbRow.product_code,
    quantityRequested: parseFloat(dbRow.quantity_requested),
    quantityDelivered: parseFloat(dbRow.quantity_delivered),
    unitOfMeasure: dbRow.unit_of_measure,
    batchId: dbRow.batch_id,
    batchNumber: dbRow.batch_number,
    expiryDate: dbRow.expiry_date,
    conditionOnDelivery: dbRow.condition_on_delivery as ItemCondition,
    damageNotes: dbRow.damage_notes,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
  };
}

export function normalizeDeliveryRoute(dbRow: DeliveryRouteDbRow): DeliveryRoute {
  return {
    id: dbRow.id,
    routeName: dbRow.route_name,
    driverId: dbRow.driver_id,
    driverName: dbRow.driver_name,
    vehicleId: dbRow.vehicle_id,
    vehiclePlateNumber: dbRow.vehicle_plate_number,
    routeDate: dbRow.route_date,
    plannedStartTime: dbRow.planned_start_time,
    actualStartTime: dbRow.actual_start_time,
    plannedEndTime: dbRow.planned_end_time,
    actualEndTime: dbRow.actual_end_time,
    totalDistanceKm: dbRow.total_distance_km ? parseFloat(dbRow.total_distance_km) : undefined,
    totalFuelCost: dbRow.total_fuel_cost ? parseFloat(dbRow.total_fuel_cost) : undefined,
    routeEfficiencyScore: dbRow.route_efficiency_score ? parseFloat(dbRow.route_efficiency_score) : undefined,
    status: dbRow.status as RouteStatus,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at,
    createdById: dbRow.created_by_id,
    createdByName: dbRow.created_by_name,
  };
}

// ====================================================
// QUERY INTERFACES
// ====================================================

export interface DeliveryOrderQuery {
  page?: number;
  limit?: number;
  sortBy?: 'deliveryDate' | 'deliveryNumber' | 'status' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  status?: DeliveryStatus;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  customerId?: string;
  driverId?: string;
  deliveryDate?: string;
  deliveryDateFrom?: string;
  deliveryDateTo?: string;
}

export interface DeliveryRouteQuery {
  page?: number;
  limit?: number;
  sortBy?: 'routeDate' | 'routeName' | 'status' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  status?: RouteStatus;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  driverId?: string;
  routeDate?: string;
  routeDateFrom?: string;
  routeDateTo?: string;
}