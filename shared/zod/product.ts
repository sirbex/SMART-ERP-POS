import { z } from 'zod';

// Enums
export const UnitOfMeasureEnum = z.enum(['PIECE', 'BOX', 'CARTON', 'KG', 'LITER', 'METER']);
export const CostingMethodEnum = z.enum(['FIFO', 'AVCO', 'STANDARD']);
export type CostingMethod = z.infer<typeof CostingMethodEnum>;

// Core product fields used for create/edit from UI
export const ProductCoreObject = z.object({
  name: z.string().min(1, 'Product name is required').max(255),
  sku: z.string().min(1, 'SKU is required').max(255),
  barcode: z.string().trim().min(1).max(255).optional().or(z.literal('')).transform(v => v === '' ? undefined : v),
  description: z.string().trim().min(1).max(2000).optional().or(z.literal('')).transform(v => v === '' ? undefined : v),
  category: z.string().trim().min(1).max(255).optional().or(z.literal('')).transform(v => v === '' ? undefined : v),
  unitOfMeasure: UnitOfMeasureEnum.default('PIECE'),
  conversionFactor: z.number().positive().finite().default(1),
  costPrice: z.number().min(0, 'Cost price must be >= 0').finite().default(0),
  sellingPrice: z.number().min(0, 'Selling price must be >= 0').finite().default(0),
  costingMethod: CostingMethodEnum,
  isTaxable: z.boolean().default(false),
  taxRate: z.number().min(0).max(100).default(0),
  pricingFormula: z.string().trim().min(1).max(255).optional().or(z.literal('')).transform(v => v === '' ? undefined : v),
  autoUpdatePrice: z.boolean().default(false),
  reorderLevel: z.number().min(0).finite().default(0),
  trackExpiry: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const pricingRefinement = (data: any, ctx: z.RefinementCtx) => {
  // BR-PRC-001: Selling must exceed or at least equal cost
  if (
    typeof data.sellingPrice === 'number' &&
    typeof data.costPrice === 'number' &&
    data.sellingPrice < data.costPrice
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['sellingPrice'],
      message: 'Selling price must be greater than or equal to cost price',
    });
  }

  // Tax validation: if isTaxable = true, taxRate must be > 0
  if (data.isTaxable === true && (!data.taxRate || data.taxRate <= 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['taxRate'],
      message: 'Tax rate must be greater than 0 when product is taxable',
    });
  }

  // If isTaxable = false, ignore taxRate (can be 0 or any value)
};

// Create/Update schemas
export const ProductCreateSchema = ProductCoreObject.superRefine(pricingRefinement);
export const ProductUpdateSchema = ProductCoreObject
  .partial()
  .extend({ id: z.string().uuid().optional() })
  .superRefine(pricingRefinement);

// Back-compat named exports (if other code expects these names)
export const CreateProductSchema = ProductCreateSchema;
export const UpdateProductSchema = ProductUpdateSchema;

// Optional full Product schema (can be extended later)
export const ProductSchema = z.object({
  id: z.string().uuid().optional(),
  productNumber: z.string().optional(), // Human-readable ID (PROD-0001)
  name: z.string(),
  sku: z.string(),
  barcode: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  unitOfMeasure: UnitOfMeasureEnum,
  conversionFactor: z.number(),
  costPrice: z.number(),
  sellingPrice: z.number(),
  costingMethod: CostingMethodEnum,
  isTaxable: z.boolean(),
  taxRate: z.number(),
  pricingFormula: z.string().optional(),
  autoUpdatePrice: z.boolean(),
  quantityOnHand: z.number().optional(),
  reorderLevel: z.number(),
  trackExpiry: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).strict();

export type ProductCreateInput = z.infer<typeof ProductCreateSchema>;
export type ProductUpdateInput = z.infer<typeof ProductUpdateSchema>;
export type Product = z.infer<typeof ProductSchema>;

// Back-compat type aliases expected by existing server modules
export type CreateProduct = ProductCreateInput;
export type UpdateProduct = ProductUpdateInput;
