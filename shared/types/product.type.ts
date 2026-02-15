/**
 * Product Type Definitions
 * Matches database schema and Zod validation
 */

export type ProductType = 'inventory' | 'consumable' | 'service';

/**
 * Product Interface
 * Complete type definition for product entities
 */
export interface Product {
    id: string; // UUID
    name: string;
    description?: string | null;
    productType: ProductType;
    isService?: boolean; // Computed: true when productType === 'service'
    incomeAccountId?: string | null; // UUID - for service revenue
    barcode?: string | null;
    sku?: string | null;
    categoryId?: string | null; // UUID
    basePrice: number;
    costPrice: number;
    taxable: boolean;
    taxRate: number; // 0-100 percentage
    active: boolean;
    trackExpiry: boolean;
    reorderLevel?: number | null;
    createdAt: string; // ISO 8601
    updatedAt: string; // ISO 8601
}

/**
 * Database Row Type (snake_case from PostgreSQL)
 */
export interface ProductDbRow {
    id: string;
    name: string;
    description?: string | null;
    product_type: string; // 'inventory' | 'consumable' | 'service'
    is_service?: boolean; // Computed column
    income_account_id?: string | null;
    barcode?: string | null;
    sku?: string | null;
    category_id?: string | null;
    base_price: string; // PostgreSQL numeric returns as string
    cost_price: string;
    taxable: boolean;
    tax_rate: string;
    active: boolean;
    track_expiry: boolean;
    reorder_level?: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Create Product Input
 */
export interface CreateProductInput {
    name: string;
    description?: string | null;
    productType?: ProductType;
    incomeAccountId?: string | null;
    barcode?: string | null;
    sku?: string | null;
    categoryId?: string | null;
    basePrice: number;
    costPrice: number;
    taxable?: boolean;
    taxRate?: number;
    active?: boolean;
    trackExpiry?: boolean;
    reorderLevel?: number | null;
}

/**
 * Update Product Input
 */
export interface UpdateProductInput extends Partial<CreateProductInput> { }

/**
 * Normalize database row to camelCase Product
 */
export function normalizeProduct(dbRow: ProductDbRow): Product {
    return {
        id: dbRow.id,
        name: dbRow.name,
        description: dbRow.description,
        productType: dbRow.product_type as ProductType,
        isService: dbRow.is_service,
        incomeAccountId: dbRow.income_account_id,
        barcode: dbRow.barcode,
        sku: dbRow.sku,
        categoryId: dbRow.category_id,
        basePrice: parseFloat(dbRow.base_price || '0'),
        costPrice: parseFloat(dbRow.cost_price || '0'),
        taxable: dbRow.taxable,
        taxRate: parseFloat(dbRow.tax_rate || '0'),
        active: dbRow.active,
        trackExpiry: dbRow.track_expiry,
        reorderLevel: dbRow.reorder_level ? parseFloat(dbRow.reorder_level) : null,
        createdAt: dbRow.created_at,
        updatedAt: dbRow.updated_at,
    };
}
