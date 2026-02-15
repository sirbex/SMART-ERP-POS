import { z } from 'zod';

export const ProductUomSchema = z.object({
  id: z.string().uuid().optional(),
  productId: z.string().uuid(),
  uomId: z.string().uuid(),
  conversionFactor: z.number().min(0.000001),
  barcode: z.string().max(100).optional().nullable(),
  isDefault: z.boolean().optional().default(false),
  priceOverride: z.number().optional().nullable(),
  costOverride: z.number().optional().nullable(),
}).strict();

// Schema for updating a product UoM - doesn't require productId/uomId since they're in URL params
export const ProductUomUpdateSchema = z.object({
  conversionFactor: z.number().min(0.000001).optional(),
  barcode: z.string().max(100).optional().nullable(),
  isDefault: z.boolean().optional(),
  priceOverride: z.number().optional().nullable(),
  costOverride: z.number().optional().nullable(),
});

export type ProductUom = z.infer<typeof ProductUomSchema>;
export type ProductUomUpdate = z.infer<typeof ProductUomUpdateSchema>;
