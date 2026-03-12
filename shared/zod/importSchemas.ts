/**
 * Shared Zod Schemas - CSV Import
 * Validation for import job creation and column mapping.
 */

import { z } from 'zod';

// ── Entity & Strategy enums ────────────────────────────────

export const ImportEntityTypeEnum = z.enum(['PRODUCT', 'CUSTOMER', 'SUPPLIER']);
export type ImportEntityType = z.infer<typeof ImportEntityTypeEnum>;

export const DuplicateStrategyEnum = z.enum(['SKIP', 'UPDATE', 'FAIL']);
export type DuplicateStrategy = z.infer<typeof DuplicateStrategyEnum>;

export const ImportJobStatusEnum = z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED']);
export type ImportJobStatus = z.infer<typeof ImportJobStatusEnum>;

export const ImportErrorTypeEnum = z.enum(['VALIDATION', 'DUPLICATE', 'DATABASE']);
export type ImportErrorType = z.infer<typeof ImportErrorTypeEnum>;

// ── Upload request validation ──────────────────────────────

export const ImportUploadSchema = z.object({
  entityType: ImportEntityTypeEnum,
  duplicateStrategy: DuplicateStrategyEnum.default('SKIP'),
});

export type ImportUploadInput = z.infer<typeof ImportUploadSchema>;

// ── Import Job (DB row normalized to camelCase) ────────────

export interface ImportJob {
  id: string;
  jobNumber: string;
  entityType: ImportEntityType;
  fileName: string;
  fileSizeBytes: number;
  duplicateStrategy: DuplicateStrategy;
  status: ImportJobStatus;
  rowsTotal: number;
  rowsProcessed: number;
  rowsImported: number;
  rowsSkipped: number;
  rowsFailed: number;
  errorSummary: string | null;
  startedAt: string | null;
  completedAt: string | null;
  userId: string;
  createdAt: string;
}

// ── Import Job Error (DB row normalized to camelCase) ──────

export interface ImportJobError {
  id: string;
  importJobId: string;
  rowNumber: number;
  rawData: Record<string, string> | null;
  errorMessage: string;
  errorType: ImportErrorType;
  createdAt: string;
}

// ── CSV column → entity field mapping ──────────────────────
// These define which CSV header names map to which entity fields.
// The worker uses these to transform raw CSV rows into typed objects.

export const PRODUCT_CSV_FIELD_MAP: Record<string, string> = {
  'name': 'name',
  'product name': 'name',
  'product_name': 'name',
  'sku': 'sku',
  'product code': 'sku',
  'product_code': 'sku',
  'barcode': 'barcode',
  'bar code': 'barcode',
  'description': 'description',
  'category': 'category',
  'generic name': 'genericName',
  'generic_name': 'genericName',
  'unit of measure': 'unitOfMeasure',
  'unit_of_measure': 'unitOfMeasure',
  'uom': 'unitOfMeasure',
  'unit': 'unitOfMeasure',
  'cost price': 'costPrice',
  'cost_price': 'costPrice',
  'cost': 'costPrice',
  'selling price': 'sellingPrice',
  'selling_price': 'sellingPrice',
  'price': 'sellingPrice',
  'taxable': 'isTaxable',
  'is_taxable': 'isTaxable',
  'tax rate': 'taxRate',
  'tax_rate': 'taxRate',
  'quantity': 'quantityOnHand',
  'quantity on hand': 'quantityOnHand',
  'quantity_on_hand': 'quantityOnHand',
  'qty': 'quantityOnHand',
  'stock': 'quantityOnHand',
  'reorder level': 'reorderLevel',
  'reorder_level': 'reorderLevel',
  'track expiry': 'trackExpiry',
  'track_expiry': 'trackExpiry',
  'conversion factor': 'conversionFactor',
  'conversion_factor': 'conversionFactor',
  'costing method': 'costingMethod',
  'costing_method': 'costingMethod',
  'pricing formula': 'pricingFormula',
  'pricing_formula': 'pricingFormula',
  'auto update price': 'autoUpdatePrice',
  'auto_update_price': 'autoUpdatePrice',
  'min days before expiry': 'minDaysBeforeExpirySale',
  'min_days_before_expiry_sale': 'minDaysBeforeExpirySale',
  'active': 'isActive',
  'is_active': 'isActive',
  'batch number': 'batchNumber',
  'batch_number': 'batchNumber',
  'batch': 'batchNumber',
  'lot number': 'batchNumber',
  'lot_number': 'batchNumber',
  'lot': 'batchNumber',
  'expiry date': 'expiryDate',
  'expiry_date': 'expiryDate',
  'expiration date': 'expiryDate',
  'expiration_date': 'expiryDate',
  'expiry': 'expiryDate',
  'exp date': 'expiryDate',
  'best before': 'expiryDate',
};

export const CUSTOMER_CSV_FIELD_MAP: Record<string, string> = {
  'name': 'name',
  'customer name': 'name',
  'customer_name': 'name',
  'email': 'email',
  'email address': 'email',
  'phone': 'phone',
  'phone number': 'phone',
  'phone_number': 'phone',
  'telephone': 'phone',
  'address': 'address',
  'credit limit': 'creditLimit',
  'credit_limit': 'creditLimit',
};

export const SUPPLIER_CSV_FIELD_MAP: Record<string, string> = {
  'name': 'name',
  'supplier name': 'name',
  'supplier_name': 'name',
  'company name': 'name',
  'company_name': 'name',
  'contact person': 'contactPerson',
  'contact_person': 'contactPerson',
  'contact name': 'contactPerson',
  'contact_name': 'contactPerson',
  'email': 'email',
  'phone': 'phone',
  'telephone': 'phone',
  'address': 'address',
  'payment terms': 'paymentTerms',
  'payment_terms': 'paymentTerms',
  'tax id': 'taxId',
  'tax_id': 'taxId',
  'tin': 'taxId',
  'credit limit': 'creditLimit',
  'credit_limit': 'creditLimit',
  'notes': 'notes',
};

/**
 * Returns the CSV field map for a given entity type.
 */
export function getFieldMapForEntity(entityType: ImportEntityType): Record<string, string> {
  switch (entityType) {
    case 'PRODUCT': return PRODUCT_CSV_FIELD_MAP;
    case 'CUSTOMER': return CUSTOMER_CSV_FIELD_MAP;
    case 'SUPPLIER': return SUPPLIER_CSV_FIELD_MAP;
  }
}

// ── Curated template headers ───────────────────────────────
// Explicit, stable-ordered, user-friendly headers for CSV template downloads.
// Required fields are listed first. Every header must exist as a key in the
// corresponding field map above (case-insensitive match by the worker).

export const PRODUCT_TEMPLATE_HEADERS = [
  'SKU', 'Name', 'Barcode', 'Description', 'Category', 'Generic Name',
  'Unit of Measure',
  'Cost Price', 'Selling Price', 'Quantity On Hand', 'Batch Number', 'Expiry Date',
  'Taxable', 'Tax Rate', 'Costing Method',
  'Pricing Formula', 'Auto Update Price', 'Reorder Level', 'Track Expiry',
  'Min Days Before Expiry', 'Conversion Factor', 'Active',
] as const;

export const CUSTOMER_TEMPLATE_HEADERS = [
  'Name', 'Email', 'Phone', 'Address', 'Credit Limit',
] as const;

export const SUPPLIER_TEMPLATE_HEADERS = [
  'Name', 'Contact Person', 'Email', 'Phone', 'Address',
  'Payment Terms', 'Credit Limit', 'Tax Id', 'Notes',
] as const;

/**
 * Returns the curated template headers for a given entity type.
 */
export function getTemplateHeaders(entityType: ImportEntityType): readonly string[] {
  switch (entityType) {
    case 'PRODUCT': return PRODUCT_TEMPLATE_HEADERS;
    case 'CUSTOMER': return CUSTOMER_TEMPLATE_HEADERS;
    case 'SUPPLIER': return SUPPLIER_TEMPLATE_HEADERS;
  }
}
