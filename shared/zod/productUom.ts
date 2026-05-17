import { z } from 'zod';

export const ProductUomSchema = z.object({
  id: z.string().uuid().optional(),
  productId: z.string().uuid(),
  uomId: z.string().uuid(),
  conversionFactor: z.number().min(1),
  barcode: z.string().max(100).optional().nullable(),
  isDefault: z.boolean().optional().default(false),
  priceOverride: z.number().optional().nullable(),
  costOverride: z.number().optional().nullable(),
}).strict();

// Schema for updating a product UoM - uomId is optional to allow changing the UoM type
export const ProductUomUpdateSchema = z.object({
  uomId: z.string().uuid().optional(),
  conversionFactor: z.number().min(1).optional(),
  barcode: z.string().max(100).optional().nullable(),
  isDefault: z.boolean().optional(),
  priceOverride: z.number().optional().nullable(),
  costOverride: z.number().optional().nullable(),
});

export type ProductUom = z.infer<typeof ProductUomSchema>;
export type ProductUomUpdate = z.infer<typeof ProductUomUpdateSchema>;
