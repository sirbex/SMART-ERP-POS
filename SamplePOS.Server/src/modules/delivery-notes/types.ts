// Delivery Note Types
// Wholesale delivery notes from quotations (SAP-style DN)
// Flow: Quotation → DN (DRAFT) → Pick (PICKED) → Goods Issue (POSTED) → Invoice

export type DeliveryNoteStatus = 'DRAFT' | 'PICKED' | 'POSTED';

export interface DeliveryNote {
  id: string;
  deliveryNoteNumber: string;
  quotationId: string;
  customerId: string;
  customerName: string | null;
  status: DeliveryNoteStatus;
  deliveryDate: string;
  warehouseNotes: string | null;
  deliveryAddress: string | null;
  driverName: string | null;
  vehicleNumber: string | null;
  totalAmount: number;
  postedAt: string | null;
  postedById: string | null;
  pickedAt: string | null;
  pickedById: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryNoteLine {
  id: string;
  deliveryNoteId: string;
  quotationItemId: string;
  productId: string;
  batchId: string | null;
  uomId: string | null;
  uomName: string | null;
  quantityDelivered: number;
  unitPrice: number;
  lineTotal: number;
  unitCost: number | null;
  description: string | null;
  conversionFactor: number | null;
  baseUomName: string | null;
  createdAt: string;
}

export interface DeliveryNoteWithLines extends DeliveryNote {
  lines: DeliveryNoteLine[];
  quotationNumber?: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
}

export interface CreateDeliveryNoteData {
  quotationId: string;
  deliveryDate?: string;
  warehouseNotes?: string;
  deliveryAddress?: string;
  driverName?: string;
  vehicleNumber?: string;
  lines: CreateDeliveryNoteLineData[];
  createdById?: string;
}

export interface CreateDeliveryNoteLineData {
  quotationItemId: string;
  productId: string;
  batchId?: string | null;
  uomId?: string | null;
  uomName?: string | null;
  quantityDelivered: number;
  unitPrice: number;
  unitCost?: number | null;
  description?: string;
}
