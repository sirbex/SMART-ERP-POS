import { z } from 'zod';

/**
 * Product Type Enum
 * - inventory: Track stock levels, create stock movements
 * - consumable: Track stock but treat as expense (not capitalized)
 * - service: No stock tracking, revenue recognition only
 */
export const ProductTypeEnum = z.enum(['inventory', 'consumable', 'service']);

export type ProductType = z.infer<typeof ProductTypeEnum>;

/**
 * Base Product Schema (shared between frontend and backend)
 */
export const ProductSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(255),
    description: z.string().nullable().optional(),
    productType: ProductTypeEnum.default('inventory'),
    isService: z.boolean().optional(), // Computed field
    incomeAccountId: z.string().uuid().nullable().optional(),
    barcode: z.string().nullable().optional(),
    sku: z.string().nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    basePrice: z.number().nonnegative(),
    costPrice: z.number().nonnegative(),
    taxable: z.boolean().default(true),
    taxRate: z.number().min(0).max(100).default(0),
    active: z.boolean().default(true),
    trackExpiry: z.boolean().default(false),
    reorderLevel: z.number().nonnegative().nullable().optional(),
    createdAt: z.string().or(z.date()),
    updatedAt: z.string().or(z.date()),
}).strict();

/**
 * Create Product Input Schema
 */
export const CreateProductSchema = ProductSchema.omit({
    id: true,
    isService: true,
    createdAt: true,
    updatedAt: true,
});

/**
 * Update Product Input Schema
 */
export const UpdateProductSchema = CreateProductSchema.partial();

/**
 * Product Type Validation Helper
 */
export const validateProductType = (type: string): type is ProductType => {
    return ProductTypeEnum.safeParse(type).success;
};

export type Product = z.infer<typeof ProductSchema>;
export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;
